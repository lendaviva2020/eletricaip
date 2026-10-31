// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response, and
// provides real-time client/server exception tracking (Sentry-compatible) with
// strict prior masking of tokens, passwords, API keys, and connection strings.

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
}

export interface CapturedErrorEvent {
  eventId: string;
  timestamp: string;
  environment: string;
  runtime: "client" | "server";
  level: "error" | "fatal" | "warning";
  name: string;
  message: string;
  stack?: string;
  frames: StackFrame[];
  context: Record<string, unknown>;
}

export type ErrorTelemetryTransport = (
  event: CapturedErrorEvent,
  sentryPayload: Record<string, unknown>,
) => void | Promise<void>;

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;
const MAX_RING_BUFFER_SIZE = 100;
const capturedEventsBuffer: CapturedErrorEvent[] = [];
let customTransport: ErrorTelemetryTransport | null = null;

const SENSITIVE_KEY_REGEX =
  /password|senha|passwd|pwd|secret|token|api[-_]?key|authorization|cookie|session|private[-_]?key|credit[-_]?card|cvv|stripe[-_]?signature/i;

/**
 * Masks tokens, JWTs, API keys, passwords, and database URI credentials inside free-form strings
 * (such as error messages, URLs, and stack traces).
 */
export function maskSensitiveString(input: string): string {
  if (!input) return input;

  let scrubbed = input;

  // 1. Database / Broker connection URIs (postgres://user:pass@host, redis://:pass@host, etc.)
  scrubbed = scrubbed.replace(
    /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?):\/\/[^:\s/@]*:)([^@\s]+)(@)/gi,
    "$1[REDACTED_PASSWORD]$3",
  );

  // 2. Authorization Bearer / Basic tokens
  scrubbed = scrubbed.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, "$1 [REDACTED_TOKEN]");

  // 3. JSON Web Tokens (eyJ...header.payload.signature)
  scrubbed = scrubbed.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_JWT]",
  );

  // 4. Google / Gemini API keys (AIza...)
  scrubbed = scrubbed.replace(/\bAIza[0-9A-Za-z_-]{25,}\b/g, "[REDACTED_API_KEY]");

  // 5. Stripe secret/webhook/restricted keys (sk_live_..., sk_test_..., whsec_..., rk_live_...)
  scrubbed = scrubbed.replace(
    /\b(?:sk|rk|whsec)_(?:live|test)_[0-9A-Za-z]{12,}\b/g,
    "[REDACTED_STRIPE_KEY]",
  );
  scrubbed = scrubbed.replace(/\bwhsec_[0-9A-Za-z]{16,}\b/g, "[REDACTED_STRIPE_KEY]");

  // 6. Supabase service_role / secret keys (sbp_... or sb_secret_...)
  scrubbed = scrubbed.replace(
    /\b(?:sbp|sb_secret|sb_publishable)_[0-9A-Za-z_-]{12,}\b/g,
    "[REDACTED_SUPABASE_KEY]",
  );

  // 7. Key-value pairs in query strings, JSON snippets, headers, or log lines
  // (skips values already replaced by specific redaction tags above)
  scrubbed = scrubbed.replace(
    /((?:password|senha|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api_key|apikey|x-api-key|authorization)\s*(?:=|:)\s*["']?)(?!\[REDACTED|(?:Bearer|Basic)\s+\[REDACTED)([^"'\s&,;}\]]+)(["']?)/gi,
    "$1[REDACTED]$3",
  );

  return scrubbed;
}

/**
 * Recursively scrubs an arbitrary value (object, array, primitive, Error) to ensure
 * no passwords, tokens, or secrets leak into telemetry payloads.
 */
export function maskSensitiveData<T = unknown>(
  value: T,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return maskSensitiveString(value) as unknown as T;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth > 8) {
    return "[MAX_DEPTH]" as unknown as T;
  }

  if (seen.has(value as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item, seen, depth + 1)) as unknown as T;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskSensitiveString(value.message),
      stack: value.stack ? maskSensitiveString(value.stack) : undefined,
    } as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = maskSensitiveData(val, seen, depth + 1);
    }
  }
  return result as unknown as T;
}

/**
 * Parses V8 / SpiderMonkey / JavaScriptCore stack trace strings into structured frames.
 */
export function parseStackFrames(stack?: string): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  const lines = stack.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // V8 format: "at funcName (filename:line:col)" or "at filename:line:col"
    const v8Match = /^at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?$/.exec(line);
    if (v8Match) {
      frames.push({
        function: maskSensitiveString(v8Match[1] || "<anonymous>"),
        filename: maskSensitiveString(v8Match[2] || "<unknown>"),
        lineno: Number.parseInt(v8Match[3], 10),
        colno: Number.parseInt(v8Match[4], 10),
      });
      continue;
    }

    // Firefox / Safari format: "funcName@filename:line:col"
    const geckoMatch = /^(.*?)@(.+?):(\d+):(\d+)$/.exec(line);
    if (geckoMatch) {
      frames.push({
        function: maskSensitiveString(geckoMatch[1] || "<anonymous>"),
        filename: maskSensitiveString(geckoMatch[2] || "<unknown>"),
        lineno: Number.parseInt(geckoMatch[3], 10),
        colno: Number.parseInt(geckoMatch[4], 10),
      });
    }
  }

  return frames;
}

export interface ParsedSentryDsn {
  endpointUrl: string;
  publicKey: string;
  projectId: string;
  host: string;
}

export function parseSentryDsn(dsn?: string): ParsedSentryDsn | null {
  if (!dsn || typeof dsn !== "string") return null;
  try {
    const url = new URL(dsn.trim());
    const publicKey = url.username;
    const pathParts = url.pathname.split("/").filter(Boolean);
    const projectId = pathParts[pathParts.length - 1];
    if (!publicKey || !projectId) return null;

    const basePath = pathParts.slice(0, -1).join("/");
    const prefix = basePath ? `/${basePath}` : "";
    const endpointUrl = `${url.protocol}//${url.host}${prefix}/api/${projectId}/store/?sentry_version=7&sentry_key=${encodeURIComponent(publicKey)}&sentry_client=eletricai-tracker/1.0`;

    return {
      endpointUrl,
      publicKey,
      projectId,
      host: url.host,
    };
  } catch {
    return null;
  }
}

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function detectEnvironment(): string {
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV) {
      return process.env.NODE_ENV;
    }
    if (
      typeof import.meta !== "undefined" &&
      (import.meta as { env?: { MODE?: string } }).env?.MODE
    ) {
      return (import.meta as { env: { MODE: string } }).env.MODE;
    }
  } catch {
    // ignore
  }
  return "production";
}

function resolveConfiguredDsn(): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      if (process.env.SENTRY_DSN) return process.env.SENTRY_DSN;
      if (process.env.VITE_SENTRY_DSN) return process.env.VITE_SENTRY_DSN;
    }
    if (typeof import.meta !== "undefined") {
      const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
      if (metaEnv?.VITE_SENTRY_DSN) return metaEnv.VITE_SENTRY_DSN;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function buildSentryStorePayload(event: CapturedErrorEvent): Record<string, unknown> {
  return {
    event_id: event.eventId,
    timestamp: event.timestamp,
    platform: "javascript",
    level: event.level,
    environment: event.environment,
    tags: {
      runtime: event.runtime,
      source: typeof event.context.source === "string" ? event.context.source : "runtime",
    },
    exception: {
      values: [
        {
          type: event.name,
          value: event.message,
          stacktrace: {
            frames: [...event.frames].reverse(),
          },
        },
      ],
    },
    extra: event.context,
  };
}

function dispatchTelemetry(event: CapturedErrorEvent) {
  const sentryPayload = buildSentryStorePayload(event);

  if (customTransport) {
    try {
      void customTransport(event, sentryPayload);
    } catch {
      // Never let telemetry transport errors crash the host application
    }
    return;
  }

  const dsn = resolveConfiguredDsn();
  const parsedDsn = parseSentryDsn(dsn);
  if (!parsedDsn || typeof fetch !== "function") return;

  try {
    void fetch(parsedDsn.endpointUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sentryPayload),
      keepalive: true,
    }).catch(() => {
      // Ignore network errors when sending error telemetry
    });
  } catch {
    // Ignore synchronous fetch errors
  }
}

/**
 * Captures an exception on client or server, scrubs all sensitive tokens/passwords
 * from message, stack trace, and metadata, stores it in the diagnostic buffer, and
 * dispatches it to the configured Sentry DSN or telemetry transport.
 */
export function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
  level: "error" | "fatal" | "warning" = "error",
): CapturedErrorEvent {
  lastCapturedError = { error, at: Date.now() };

  const isErrorInstance = error instanceof Error;
  const rawName = isErrorInstance ? error.name || "Error" : "NonErrorException";
  const rawMessage = isErrorInstance
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(maskSensitiveData(error));
  const rawStack = isErrorInstance ? error.stack : new Error(String(rawMessage)).stack;

  const maskedMessage = maskSensitiveString(rawMessage || "Unknown runtime error");
  const maskedStack = rawStack ? maskSensitiveString(rawStack) : undefined;
  const frames = parseStackFrames(maskedStack);
  const maskedContext = maskSensitiveData(context);

  const runtime: "client" | "server" =
    typeof window !== "undefined" && typeof window.document !== "undefined" ? "client" : "server";

  const event: CapturedErrorEvent = {
    eventId: generateEventId(),
    timestamp: new Date().toISOString(),
    environment: detectEnvironment(),
    runtime,
    level,
    name: maskSensitiveString(rawName),
    message: maskedMessage,
    stack: maskedStack,
    frames,
    context: maskedContext,
  };

  capturedEventsBuffer.push(event);
  if (capturedEventsBuffer.length > MAX_RING_BUFFER_SIZE) {
    capturedEventsBuffer.shift();
  }

  dispatchTelemetry(event);
  return event;
}

export function getCapturedErrorEvents(): ReadonlyArray<CapturedErrorEvent> {
  return [...capturedEventsBuffer];
}

export function clearCapturedErrorEvents(): void {
  capturedEventsBuffer.length = 0;
}

export function setErrorTelemetryTransport(transport: ErrorTelemetryTransport | null): void {
  customTransport = transport;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? event;
    captureException(err, {
      source: "globalThis.error",
      filename: (event as ErrorEvent).filename,
      lineno: (event as ErrorEvent).lineno,
      colno: (event as ErrorEvent).colno,
    });
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    captureException((event as PromiseRejectionEvent).reason, {
      source: "globalThis.unhandledrejection",
    });
  });
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
