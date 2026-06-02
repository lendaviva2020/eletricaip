// Prompt-injection defense — sanitizes free-form text and structured context
// before it is concatenated into the LLM message. Removes known jailbreak
// patterns and bounds size/depth to keep the model focused on the briefing.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?(your|previous)/gi,
  /you\s+are\s+now\s+a/gi,
  /act\s+as\s+(?:a|an)\s+/gi,
  /system\s*:\s*/gi,
  /\[\s*INST\s*\]/gi,
  /<\s*\|im_(?:start|end)\|\s*>/gi,
  /<\s*\/?\s*system\s*>/gi,
];

const MAX_STRING_LENGTH = 300;
const MAX_CONTEXT_CHARS = 8000;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_ENTRIES = 30;

export function sanitizePromptText(value: string, maxLen = 32000): string {
  let out = value.slice(0, maxLen);
  for (const pattern of INJECTION_PATTERNS) {
    out = out.replace(pattern, "[FILTERED]");
  }
  return out;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[nested_too_deep]";

  if (typeof value === "string") {
    return sanitizePromptText(value, MAX_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([k, v]) => [k, sanitizeValue(v, depth + 1)]),
    );
  }
  return value;
}

export function sanitizeProjectContext(context: Record<string, unknown> | unknown): string {
  const sanitized = sanitizeValue(context);
  const serialized = JSON.stringify(sanitized);
  return serialized.slice(0, MAX_CONTEXT_CHARS);
}
