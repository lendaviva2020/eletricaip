// Per-instance metrics for AI rate-limit decisions. Worker-local (resets on
// cold start), but enough to power a live diagnostics panel.
export interface AiUserCounters {
  upstashAllowed: number;
  upstashBlocked: number;
  fallbackAllowed: number;
  fallbackBlocked: number;
  breakerOpenSkipped: number;
  quotaBlocked: number;
  lastAt: number;
  lastSource: string;
}

interface AiMetricsState {
  totals: {
    upstashAllowed: number;
    upstashBlocked: number;
    fallbackAllowed: number;
    fallbackBlocked: number;
    breakerOpenSkipped: number;
    quotaBlocked: number;
    unconfigured: number;
    upstashError: number;
  };
  perUser: Map<string, AiUserCounters>;
}

const _state: AiMetricsState = {
  totals: {
    upstashAllowed: 0,
    upstashBlocked: 0,
    fallbackAllowed: 0,
    fallbackBlocked: 0,
    breakerOpenSkipped: 0,
    quotaBlocked: 0,
    unconfigured: 0,
    upstashError: 0,
  },
  perUser: new Map(),
};

function bumpUser(userId: string, patch: Partial<AiUserCounters>) {
  const cur = _state.perUser.get(userId) ?? {
    upstashAllowed: 0,
    upstashBlocked: 0,
    fallbackAllowed: 0,
    fallbackBlocked: 0,
    breakerOpenSkipped: 0,
    quotaBlocked: 0,
    lastAt: 0,
    lastSource: "",
  };
  _state.perUser.set(userId, {
    ...cur,
    ...patch,
    upstashAllowed: cur.upstashAllowed + (patch.upstashAllowed ?? 0),
    upstashBlocked: cur.upstashBlocked + (patch.upstashBlocked ?? 0),
    fallbackAllowed: cur.fallbackAllowed + (patch.fallbackAllowed ?? 0),
    fallbackBlocked: cur.fallbackBlocked + (patch.fallbackBlocked ?? 0),
    breakerOpenSkipped: cur.breakerOpenSkipped + (patch.breakerOpenSkipped ?? 0),
    quotaBlocked: cur.quotaBlocked + (patch.quotaBlocked ?? 0),
    lastAt: patch.lastAt ?? cur.lastAt,
    lastSource: patch.lastSource ?? cur.lastSource,
  });
}

export function recordAiDecision(
  userId: string,
  source: "upstash" | "unconfigured" | "breaker-open" | "upstash-error",
  allowed: boolean,
  kind: "burst" | "quota",
) {
  const now = Date.now();
  if (kind === "quota") {
    if (!allowed) {
      _state.totals.quotaBlocked += 1;
      bumpUser(userId, { quotaBlocked: 1, lastAt: now, lastSource: "quota" });
    }
    return;
  }
  if (source === "upstash") {
    if (allowed) _state.totals.upstashAllowed += 1;
    else _state.totals.upstashBlocked += 1;
    bumpUser(userId, {
      upstashAllowed: allowed ? 1 : 0,
      upstashBlocked: allowed ? 0 : 1,
      lastAt: now,
      lastSource: source,
    });
    return;
  }
  // Fallback path (unconfigured / breaker-open / upstash-error)
  if (source === "unconfigured") _state.totals.unconfigured += 1;
  if (source === "breaker-open") _state.totals.breakerOpenSkipped += 1;
  if (source === "upstash-error") _state.totals.upstashError += 1;
  if (allowed) _state.totals.fallbackAllowed += 1;
  else _state.totals.fallbackBlocked += 1;
  bumpUser(userId, {
    fallbackAllowed: allowed ? 1 : 0,
    fallbackBlocked: allowed ? 0 : 1,
    lastAt: now,
    lastSource: source,
  });
}

export function snapshotAiMetrics() {
  const top = [..._state.perUser.entries()]
    .map(([userId, c]) => ({ userId, ...c }))
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 20);
  return { totals: { ..._state.totals }, topUsers: top };
}

export function resetAiMetrics() {
  _state.totals = {
    upstashAllowed: 0,
    upstashBlocked: 0,
    fallbackAllowed: 0,
    fallbackBlocked: 0,
    breakerOpenSkipped: 0,
    quotaBlocked: 0,
    unconfigured: 0,
    upstashError: 0,
  };
  _state.perUser.clear();
}
