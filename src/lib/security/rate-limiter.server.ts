// Upstash Redis-backed rate limiter (server-only).
// Replaces the in-memory burst window so limits hold across Worker instances.
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

type LimiterKey = "ai" | "api" | "auth";

const _cache: Partial<Record<LimiterKey, Ratelimit>> = {};

function buildLimiter(key: LimiterKey): Ratelimit | null {
  if (_cache[key]) return _cache[key]!;
  const redis = getRedis();
  if (!redis) return null;
  const config: Record<LimiterKey, { limiter: ReturnType<typeof Ratelimit.slidingWindow>; prefix: string }> = {
    ai: {
      limiter: Ratelimit.slidingWindow(10, "10 s"),
      prefix: "eletricai:rl:ai",
    },
    api: {
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      prefix: "eletricai:rl:api",
    },
    auth: {
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "eletricai:rl:auth",
    },
  };
  const cfg = config[key];
  const rl = new Ratelimit({
    redis,
    limiter: cfg.limiter,
    analytics: true,
    prefix: cfg.prefix,
  });
  _cache[key] = rl;
  return rl;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
  /** True when Upstash is not configured — caller should fall back to in-memory. */
  bypassed: boolean;
}

export async function checkRateLimit(
  key: LimiterKey,
  identifier: string,
): Promise<RateLimitResult> {
  const rl = buildLimiter(key);
  if (!rl) {
    return { allowed: true, retryAfterSeconds: 0, remaining: -1, limit: -1, bypassed: true };
  }
  try {
    const { success, reset, remaining, limit } = await rl.limit(identifier);
    return {
      allowed: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      remaining,
      limit,
      bypassed: false,
    };
  } catch (err) {
    // Fail-open on Upstash errors — surface for ops but don't block legitimate traffic.
    console.error("[rate-limiter] Upstash error:", err);
    return { allowed: true, retryAfterSeconds: 0, remaining: -1, limit: -1, bypassed: true };
  }
}
