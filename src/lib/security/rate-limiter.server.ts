// Upstash Redis-backed rate limiter with circuit breaker (server-only).
//
// The .server.ts extension guarantees this module never reaches the client
// bundle (TanStack import-protection).
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

type LimiterKey = "ai" | "api" | "auth" | "iot";

// Configuração por limiter: crítico = fail-closed, não-crítico = fail-open com fallback
const LIMITER_CONFIG: Record<
  LimiterKey,
  {
    limiter: ReturnType<typeof Ratelimit.slidingWindow>;
    prefix: string;
    critical: boolean; // true = fail-closed (nega quando bypassed)
    fallback?: { windowMs: number; max: number }; // para limiters não-críticos
  }
> = {
  ai: {
    limiter: Ratelimit.slidingWindow(10, "10 s"),
    prefix: "eletricai:rl:ai",
    critical: true, // AI: custo direto, fail-closed
  },
  api: {
    limiter: Ratelimit.slidingWindow(60, "60 s"),
    prefix: "eletricai:rl:api",
    critical: false, // API geral: fail-open com fallback local
    fallback: { windowMs: 60_000, max: 60 },
  },
  auth: {
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "eletricai:rl:auth",
    critical: false, // Auth: fail-open com fallback local (evita lockout legítimo)
    fallback: { windowMs: 15 * 60_000, max: 5 },
  },
  iot: {
    limiter: Ratelimit.slidingWindow(120, "60 s"),
    prefix: "eletricai:rl:iot",
    critical: true, // IoT: escrita de telemetria, fail-closed
  },
};

const _cache: Partial<Record<LimiterKey, Ratelimit>> = {};

function buildLimiter(key: LimiterKey): Ratelimit | null {
  if (_cache[key]) return _cache[key]!;
  const redis = getRedis();
  if (!redis) return null;
  const cfg = LIMITER_CONFIG[key];
  const rl = new Ratelimit({ redis, limiter: cfg.limiter, analytics: true, prefix: cfg.prefix });
  _cache[key] = rl;
  return rl;
}

// ---- Circuit breaker (per-instance) ----
const BREAKER_THRESHOLD = 3; // consecutive Upstash errors → open
const BREAKER_OPEN_MS = 30_000; // stay open 30s before half-open retry

interface BreakerState {
  failures: number;
  openedAt: number; // 0 = closed
}
const _breaker: BreakerState = { failures: 0, openedAt: 0 };

export function getRateLimiterBreaker(): {
  state: "closed" | "open" | "half-open";
  failures: number;
  openedAt: number;
  msUntilRetry: number;
} {
  if (_breaker.openedAt === 0) {
    return { state: "closed", failures: _breaker.failures, openedAt: 0, msUntilRetry: 0 };
  }
  const elapsed = Date.now() - _breaker.openedAt;
  if (elapsed >= BREAKER_OPEN_MS) {
    return {
      state: "half-open",
      failures: _breaker.failures,
      openedAt: _breaker.openedAt,
      msUntilRetry: 0,
    };
  }
  return {
    state: "open",
    failures: _breaker.failures,
    openedAt: _breaker.openedAt,
    msUntilRetry: BREAKER_OPEN_MS - elapsed,
  };
}

function breakerIsOpen(): boolean {
  if (_breaker.openedAt === 0) return false;
  if (Date.now() - _breaker.openedAt >= BREAKER_OPEN_MS) return false; // half-open: try again
  return true;
}
function breakerOnSuccess() {
  _breaker.failures = 0;
  _breaker.openedAt = 0;
}
function breakerOnFailure() {
  _breaker.failures += 1;
  if (_breaker.failures >= BREAKER_THRESHOLD) {
    _breaker.openedAt = Date.now();
  }
}

// ---- Bypass tracking for alerting ----
// Tracks when a critical limiter has been bypassed continuously
interface BypassTracker {
  since: number; // timestamp when bypass started, 0 = not bypassed
  count: number; // consecutive bypassed calls
}
const _bypassTrackers: Partial<Record<LimiterKey, BypassTracker>> = {};

// Threshold for alerting: bypassed continuously for this many seconds
const BYPASS_ALERT_THRESHOLD_MS = 60_000; // 1 minute
const BYPASS_ALERT_INTERVAL_MS = 30_000; // re-alert every 30s while bypassed

function recordBypass(key: LimiterKey, source: RateLimitResult["source"]): void {
  const now = Date.now();
  const tracker = _bypassTrackers[key] ?? { since: 0, count: 0 };

  if (tracker.since === 0) {
    tracker.since = now;
  }
  tracker.count += 1;

  // Alert on first bypass after threshold, then at intervals
  const duration = now - tracker.since;
  const shouldAlert =
    duration >= BYPASS_ALERT_THRESHOLD_MS &&
    (tracker.count === 1 || duration % BYPASS_ALERT_INTERVAL_MS < 1000); // rough interval check

  if (shouldAlert) {
    // Structured log for external monitoring (Datadog, Sentry, CloudWatch, etc.)
    console.warn(
      JSON.stringify({
        level: "WARN",
        component: "rate-limiter",
        event: "bypass_alert",
        limiter: key,
        source,
        bypassedSince: new Date(tracker.since).toISOString(),
        bypassDurationMs: duration,
        consecutiveBypasses: tracker.count,
        message: `Rate limiter "${key}" has been bypassed (${source}) for ${Math.round(duration / 1000)}s — fail-${LIMITER_CONFIG[key].critical ? "closed" : "open"} mode active`,
      }),
    );
  }

  _bypassTrackers[key] = tracker;
}

function recordSuccess(key: LimiterKey): void {
  const tracker = _bypassTrackers[key];
  if (tracker && tracker.since !== 0) {
    // Log recovery
    console.info(
      JSON.stringify({
        level: "INFO",
        component: "rate-limiter",
        event: "bypass_recovered",
        limiter: key,
        wasBypassedForMs: Date.now() - tracker.since,
        message: `Rate limiter "${key}" recovered after ${Math.round((Date.now() - tracker.since) / 1000)}s bypass`,
      }),
    );
    _bypassTrackers[key] = { since: 0, count: 0 };
  }
}

// ---- Per-instance fallback buckets for non-critical limiters ----
const _localFallbackBuckets = new Map<string, Map<string, number[]>>(); // key -> (identifier -> timestamps[])

function localFallbackAllow(
  key: LimiterKey,
  identifier: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const keyBuckets = _localFallbackBuckets.get(key) ?? new Map();
  const arr = (keyBuckets.get(identifier) ?? []).filter((t: number) => now - t < windowMs);

  if (arr.length >= max) {
    const retry = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    keyBuckets.set(identifier, arr);
    _localFallbackBuckets.set(key, keyBuckets);
    return { allowed: false, retryAfterSeconds: retry };
  }
  arr.push(now);
  keyBuckets.set(identifier, arr);
  _localFallbackBuckets.set(key, keyBuckets);
  return { allowed: true, retryAfterSeconds: 0 };
}

// Cleanup old entries periodically (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, buckets] of _localFallbackBuckets.entries()) {
    const cfg = LIMITER_CONFIG[key as LimiterKey];
    if (!cfg.fallback) continue;
    const windowMs = cfg.fallback.windowMs;
    for (const [identifier, timestamps] of buckets.entries()) {
      const filtered = timestamps.filter((t) => now - t < windowMs);
      if (filtered.length === 0) {
        buckets.delete(identifier);
      } else {
        buckets.set(identifier, filtered);
      }
    }
  }
}, 10 * 60_000);

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
  /** True when Upstash is not configured / breaker open / errored — caller falls back. */
  bypassed: boolean;
  source: "upstash" | "unconfigured" | "breaker-open" | "upstash-error" | "local-fallback";
  /** For critical limiters: true means request was denied due to bypass (fail-closed) */
  failClosed?: boolean;
}

export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
): Promise<RateLimitResult> {
  const cfg = LIMITER_CONFIG[key];
  const rl = buildLimiter(key);

  // Upstash não configurado
  if (!rl) {
    if (cfg.critical) {
      // FAIL-CLOSED: nega a requisição
      recordBypass(key, "unconfigured");
      return {
        allowed: false,
        retryAfterSeconds: 60, // sugere retry em 1 min
        remaining: 0,
        limit: -1,
        bypassed: true,
        source: "unconfigured",
        failClosed: true,
      };
    }
    // FAIL-OPEN com fallback local
    recordBypass(key, "unconfigured");
    const fallback = cfg.fallback ?? { windowMs: 60_000, max: 60 };
    const local = localFallbackAllow(key, identifier, fallback.windowMs, fallback.max);
    return {
      allowed: local.allowed,
      retryAfterSeconds: local.retryAfterSeconds,
      remaining: local.allowed ? fallback.max - 1 : 0,
      limit: fallback.max,
      bypassed: true,
      source: local.allowed ? "local-fallback" : "unconfigured",
    };
  }

  // Circuit breaker aberto
  if (breakerIsOpen()) {
    if (cfg.critical) {
      recordBypass(key, "breaker-open");
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(getRateLimiterBreaker().msUntilRetry / 1000),
        remaining: 0,
        limit: -1,
        bypassed: true,
        source: "breaker-open",
        failClosed: true,
      };
    }
    recordBypass(key, "breaker-open");
    const fallback = cfg.fallback ?? { windowMs: 60_000, max: 60 };
    const local = localFallbackAllow(key, identifier, fallback.windowMs, fallback.max);
    return {
      allowed: local.allowed,
      retryAfterSeconds: local.retryAfterSeconds,
      remaining: local.allowed ? fallback.max - 1 : 0,
      limit: fallback.max,
      bypassed: true,
      source: local.allowed ? "local-fallback" : "breaker-open",
    };
  }

  try {
    const { success, reset, remaining, limit } = await rl.limit(identifier);
    breakerOnSuccess();
    recordSuccess(key);
    return {
      allowed: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      remaining,
      limit,
      bypassed: false,
      source: "upstash",
    };
  } catch (err) {
    breakerOnFailure();
    console.error("[rate-limiter] Upstash error (breaker tripping):", err);

    if (cfg.critical) {
      recordBypass(key, "upstash-error");
      return {
        allowed: false,
        retryAfterSeconds: 30,
        remaining: 0,
        limit: -1,
        bypassed: true,
        source: "upstash-error",
        failClosed: true,
      };
    }

    recordBypass(key, "upstash-error");
    const fallback = cfg.fallback ?? { windowMs: 60_000, max: 60 };
    const local = localFallbackAllow(key, identifier, fallback.windowMs, fallback.max);
    return {
      allowed: local.allowed,
      retryAfterSeconds: local.retryAfterSeconds,
      remaining: local.allowed ? fallback.max - 1 : 0,
      limit: fallback.max,
      bypassed: true,
      source: local.allowed ? "local-fallback" : "upstash-error",
    };
  }
}

// Exporta status de bypass para diagnóstico/monitoramento
export function getBypassStatus(): Record<
  LimiterKey,
  { bypassed: boolean; since: number | null; durationMs: number }
> {
  const now = Date.now();
  const result: Record<
    LimiterKey,
    { bypassed: boolean; since: number | null; durationMs: number }
  > = {
    ai: { bypassed: false, since: null, durationMs: 0 },
    api: { bypassed: false, since: null, durationMs: 0 },
    auth: { bypassed: false, since: null, durationMs: 0 },
    iot: { bypassed: false, since: null, durationMs: 0 },
  };

  for (const [key, tracker] of Object.entries(_bypassTrackers)) {
    const k = key as LimiterKey;
    result[k] = {
      bypassed: tracker.since !== 0,
      since: tracker.since !== 0 ? tracker.since : null,
      durationMs: tracker.since !== 0 ? now - tracker.since : 0,
    };
  }
  return result;
}
