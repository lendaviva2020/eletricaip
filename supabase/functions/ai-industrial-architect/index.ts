// AI Industrial Architect — DeepSeek-powered with key validation, friendly errors and web fallback hint.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  Vary: "Origin",
};

// Verify the caller's Supabase JWT. Returns user id + an authed client (RLS as user) or null.
async function requireUser(
  req: Request,
): Promise<{ userId: string; supabase: ReturnType<typeof createClient> } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !ANON) return null;
  const supabase = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return { userId: data.user.id, supabase };
}

function createAdminClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- Startup key validation -------------------------------------------------
function validateKeyFormat(k: string | undefined): { ok: boolean; reason?: string } {
  if (!k) return { ok: false, reason: "DEEPSEEK_API_KEY ausente nos secrets" };
  if (k.length < 20) return { ok: false, reason: "DEEPSEEK_API_KEY parece truncada (<20 chars)" };
  if (!/^sk-[A-Za-z0-9_-]+$/.test(k)) {
    return { ok: false, reason: "DEEPSEEK_API_KEY com formato inesperado (esperado: sk-…)" };
  }
  return { ok: true };
}
const STARTUP_KEY = Deno.env.get("DEEPSEEK_API_KEY");
const STARTUP_VALIDATION = validateKeyFormat(STARTUP_KEY);
if (!STARTUP_VALIDATION.ok) {
  console.error(`[ai-industrial-architect] STARTUP WARN: ${STARTUP_VALIDATION.reason}`);
} else {
  console.log(`[ai-industrial-architect] DEEPSEEK_API_KEY OK (len=${STARTUP_KEY!.length})`);
}

// --- Prompt-injection sanitization (mirrors src/lib/ai/context-sanitizer.ts) -------
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
function sanitizePromptText(value: string, maxLen = 32000): string {
  let out = value.slice(0, maxLen);
  for (const p of INJECTION_PATTERNS) out = out.replace(p, "[FILTERED]");
  return out;
}
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[nested_too_deep]";
  if (typeof value === "string") return sanitizePromptText(value, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((i) => sanitizeValue(i, depth + 1));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([k, v]) => [k, sanitizeValue(v, depth + 1)]),
    );
  }
  return value;
}
function sanitizeProjectContext(ctx: unknown): string {
  return JSON.stringify(sanitizeValue(ctx)).slice(0, MAX_CONTEXT_CHARS);
}


const SYSTEM = `Você é o "EletricAI Architect", um engenheiro elétrico industrial sênior brasileiro.
Projete um SISTEMA ELÉTRICO COMPLETO seguindo NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3.
- Use as tabelas canônicas da NBR 5410 (Tabela 36/37 ampacidade, queda de tensão, fator de agrupamento).
- Se tiver dúvida sobre dimensionamento, ESCOLHA o cabo/disjuntor MAIORES (lado da segurança).
- Inclua sempre: DR (RCD), aterramento PE, E-STOP por máquina (NR-12), proteções, contatores, fontes 24V, instrumentação.
- Topologia: nodes (id, kind, label, params, position) e edges (source→target, kind: power|signal|pipe).
- Explique decisões em "rationale" curto e técnico em PT-BR citando normas.
KINDS: breaker, contactor, relay, transformer, vfd, softstarter, psu, busbar, ccm, motor, conveyor, screw, valve, pump, tank, reactor, cylinder, pt100, pressure, flow, level, estop, lightcurtain, encoder.
CATEGORIES: power | mech | inst | logic.
POSIÇÕES: trafo no topo, barramento, CCM, motores em colunas. x: 60..1200, y: 40..900, espaçamento ≥ 160 px.`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    rationale: { type: "string" },
    transformer: {
      type: "object",
      properties: {
        kVA: { type: "number" },
        primary_kV: { type: "number" },
        secondary_V: { type: "number" },
      },
      required: ["kVA", "primary_kV", "secondary_V"],
    },
    ccm: {
      type: "object",
      properties: { columns: { type: "number" }, cells: { type: "number" } },
      required: ["columns", "cells"],
    },
    motors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          power_kW: { type: "number" },
          voltage_V: { type: "number" },
          startMethod: { type: "string", enum: ["DOL", "SOFT", "VFD"] },
          role: { type: "string" },
        },
        required: ["id", "power_kW"],
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          category: { type: "string", enum: ["power", "mech", "inst", "logic"] },
          label: { type: "string" },
          params: { type: "object", additionalProperties: true },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
          },
        },
        required: ["id", "kind", "category", "label", "position"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          kind: { type: "string", enum: ["power", "signal", "pipe"] },
        },
        required: ["source", "target", "kind"],
      },
    },
  },
  required: ["title", "rationale", "transformer", "ccm", "motors", "nodes", "edges"],
};

const TOOL = {
  type: "function",
  function: {
    name: "design_industrial_system",
    description: "Devolve o sistema elétrico industrial completo estruturado.",
    parameters: SCHEMA,
  },
};

// Standard error codes consumed by the client.
type ErrCode =
  | "MISSING_KEY"
  | "INVALID_KEY_FORMAT"
  | "AUTH_401"
  | "RATE_LIMIT_429"
  | "NO_CREDITS_402"
  | "UPSTREAM_5XX"
  | "BAD_RESPONSE"
  | "BAD_INPUT";

function err(code: ErrCode, message: string, status = 200, extra: Record<string, unknown> = {}) {
  // Always 200 to the client (so non-2xx doesn't crash the page); client checks `ok`/`error`.
  return new Response(JSON.stringify({ ok: false, error: { code, message, ...extra } }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Health check -----------------------------------------------------------
// GET ?health=1 returns a status object the AI Status page consumes.
async function healthCheck(): Promise<Response> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  const v = validateKeyFormat(key);
  let pingOk = false;
  let pingStatus: number | undefined;
  let pingError: string | undefined;
  if (v.ok) {
    try {
      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      pingStatus = r.status;
      pingOk = r.ok;
      if (!r.ok) pingError = (await r.text()).slice(0, 200);
    } catch (e) {
      pingError = (e as Error).message;
    }
  }
  return new Response(
    JSON.stringify({
      ok: v.ok && pingOk,
      keyConfigured: !!key,
      keyFormatValid: v.ok,
      keyFormatReason: v.reason,
      pingOk,
      pingStatus,
      pingError,
      provider: "deepseek",
      model: "deepseek-chat",
      checkedAt: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require authenticated Supabase user for all calls (health + generation).
  // Prevents anonymous abuse of DeepSeek credits.
  const auth = await requireUser(req);
  if (!auth) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "AUTH_REQUIRED", message: "Sessão necessária. Faça login para usar a IA." },
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("health") === "1") return healthCheck();

  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const { prompt, context } = body as { prompt?: string; context?: unknown };
    if (!prompt || typeof prompt !== "string") return err("BAD_INPUT", "Prompt obrigatório.");
    if (prompt.length > 4000) {
      return err("BAD_INPUT", "Prompt muito longo (máx. 4 000 caracteres).");
    }
    let contextStr: string | undefined;
    if (context !== undefined) {
      try {
        contextStr = JSON.stringify(context);
      } catch {
        return err("BAD_INPUT", "Contexto inválido.");
      }
      if (contextStr.length > 20000) {
        return err("BAD_INPUT", "Contexto muito grande.");
      }
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    const v = validateKeyFormat(apiKey);
    if (!v.ok) return err(apiKey ? "INVALID_KEY_FORMAT" : "MISSING_KEY", v.reason!);

    // Server-side AI quota check (closes CLIENT_SIDE_AUTH finding).
    const { data: quota, error: quotaErr } = await admin.rpc("check_ai_quota_for_user", {
      p_user_id: auth.userId,
    });
    if (quotaErr) {
      console.error("check_ai_quota failed:", quotaErr);
      return err("BAD_RESPONSE", "Não foi possível verificar sua cota de IA. Tente novamente.");
    }
    const q = Array.isArray(quota) ? quota[0] : quota;
    if (q && q.allowed === false) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Cota mensal de IA do plano "${q.plan}" atingida (${q.used}/${q.max_tokens} tokens). Faça upgrade para continuar.`,
            used: q.used,
            max: q.max_tokens,
            plan: q.plan,
          },
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userMsg = contextStr
      ? `Briefing:\n${prompt}\n\nContexto atual do projeto (JSON):\n${contextStr.slice(0, 8000)}`
      : prompt;

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "design_industrial_system" } },
        temperature: 0.3,
      }),
    });

    if (resp.status === 401) {
      return err(
        "AUTH_401",
        "Chave de IA inválida ou revogada. Atualize DEEPSEEK_API_KEY no painel de secrets do Supabase e gere uma nova em platform.deepseek.com/api_keys.",
        200,
        { provider: "deepseek" },
      );
    }
    if (resp.status === 429)
      return err(
        "RATE_LIMIT_429",
        "Muitas requisições à IA. Aguarde alguns segundos e tente novamente.",
      );
    if (resp.status === 402)
      return err(
        "NO_CREDITS_402",
        "Créditos da conta DeepSeek esgotados. Adicione créditos em platform.deepseek.com.",
      );
    if (resp.status >= 500) {
      const t = await resp.text();
      console.error("DeepSeek 5xx:", resp.status, t);
      return err("UPSTREAM_5XX", "Serviço DeepSeek temporariamente indisponível. Tente novamente.");
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("DeepSeek erro:", resp.status, t);
      return err("BAD_RESPONSE", `Resposta inesperada (${resp.status}).`);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      console.error("DeepSeek bad response (no tool_call):", JSON.stringify(data).slice(0, 500));
      return err("BAD_RESPONSE", "A IA não devolveu estrutura válida. Tente novamente.");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (e) {
      console.error("DeepSeek JSON parse error:", e);
      return err("BAD_RESPONSE", "JSON inválido devolvido pela IA. Tente novamente.");
    }

    // Server-side usage tracking (best effort).
    const tokensUsed = Number(data?.usage?.total_tokens) || 0;
    if (tokensUsed > 0) {
      const { error: incErr } = await admin.rpc("increment_ai_tokens_for_user", {
        p_user_id: auth.userId,
        p_tokens: tokensUsed,
      });
      if (incErr) console.error("increment_ai_tokens failed:", incErr);
    }

    return new Response(
      JSON.stringify({ ok: true, system: parsed, provider: "deepseek", tokensUsed }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("ai-industrial-architect erro inesperado:", e);
    return err("BAD_RESPONSE", "Erro inesperado. Tente novamente.");
  }
});
