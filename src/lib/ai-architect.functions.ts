// AI Architect server functions — runs in TanStack server runtime.
// RAG: augments the prompt with top normative_chunks before calling DeepSeek.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const InputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  context: z.unknown().optional(),
});

type ArchitectError = {
  ok: false;
  error: { code: string; message: string; used?: number; max?: number; plan?: string };
};
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type ArchitectOk = {
  ok: true;
  system: JsonValue;
  provider: "deepseek";
  tokensUsed: number;
  ragHits: number;
  credits?: {
    cost?: number;
    used?: number;
    remaining?: number;
    plan?: string;
    unlimited?: boolean;
  };
};

// Lightweight RAG: pull top normative_chunks matching keywords from the prompt.
// Avoids embedding generation cost; uses ILIKE on chunk_text. Caller is auth'd
// so RLS on normative_chunks applies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNormativeContext(
  supabase: any,
  prompt: string,
): Promise<{ chunks: Array<{ category: string; text: string }>; hits: number }> {
  const stop = new Set([
    "para",
    "com",
    "uma",
    "como",
    "que",
    "the",
    "and",
    "for",
    "with",
    "this",
    "esse",
    "esta",
    "este",
    "essa",
    "isso",
    "pelo",
    "pela",
    "dos",
    "das",
    "por",
    "uma",
    "ser",
    "são",
    "tem",
    "tenho",
    "preciso",
    "quero",
  ]);
  const tokens = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !stop.has(t))
    .slice(0, 6);
  if (tokens.length === 0) return { chunks: [], hits: 0 };

  const orFilter = tokens.map((t) => `chunk_text.ilike.%${t}%`).join(",");
  const { data, error } = await supabase
    .from("normative_chunks")
    .select("category,chunk_text")
    .or(orFilter)
    .limit(5);
  if (error) {
    console.warn("[RAG] normative_chunks query failed:", error.message);
    return { chunks: [], hits: 0 };
  }
  const chunks = (
    (data ?? []) as Array<{ category: string | null; chunk_text: string | null }>
  ).map((r) => ({
    category: r.category ?? "geral",
    text: (r.chunk_text ?? "").slice(0, 800),
  }));
  return { chunks, hits: chunks.length };
}

export const generateArchitecture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ArchitectOk | ArchitectError> => {
    const { supabase } = context;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: "MISSING_KEY",
          message: "DEEPSEEK_API_KEY ausente nos secrets do servidor.",
        },
      };
    }
    if (!/^sk-[A-Za-z0-9_-]+$/.test(apiKey) || apiKey.length < 20) {
      return {
        ok: false,
        error: { code: "INVALID_KEY_FORMAT", message: "DEEPSEEK_API_KEY com formato inesperado." },
      };
    }

    // Atomic credit gate: deduct BEFORE calling provider.
    const { data: gate, error: gateErr } = await supabase.rpc("consume_ai_credits", {
      p_operation: "generate_panel",
    });
    if (gateErr) {
      const msg = gateErr.message || "";
      if (msg.includes("insufficient_credits")) {
        return {
          ok: false,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message:
              "Créditos de IA insuficientes neste mês. Faça upgrade ou aguarde o próximo ciclo.",
          },
        };
      }
      console.error("consume_ai_credits failed:", gateErr);
      return {
        ok: false,
        error: { code: "BAD_RESPONSE", message: "Não foi possível debitar créditos de IA." },
      };
    }
    const gateInfo = (gate ?? {}) as {
      cost?: number;
      used?: number;
      remaining?: number;
      plan?: string;
      unlimited?: boolean;
    };

    // RAG: retrieve normative context.
    const rag = await fetchNormativeContext(supabase, data.prompt);
    const ragBlock = rag.chunks.length
      ? `\n\nContexto normativo (trechos relevantes):\n${rag.chunks.map((c, i) => `[${i + 1}] (${c.category}) ${c.text}`).join("\n\n")}`
      : "";

    let contextStr: string | undefined;
    if (data.context !== undefined) {
      try {
        contextStr = JSON.stringify(data.context);
      } catch {
        return { ok: false, error: { code: "BAD_INPUT", message: "Contexto inválido." } };
      }
      if (contextStr.length > 20000) {
        return { ok: false, error: { code: "BAD_INPUT", message: "Contexto muito grande." } };
      }
    }

    const userMsg = `Briefing:\n${data.prompt}${ragBlock}${contextStr ? `\n\nContexto atual do projeto (JSON):\n${contextStr.slice(0, 8000)}` : ""}`;

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

    if (resp.status === 401)
      return {
        ok: false,
        error: { code: "AUTH_401", message: "Chave de IA inválida ou revogada." },
      };
    if (resp.status === 429)
      return {
        ok: false,
        error: {
          code: "RATE_LIMIT_429",
          message: "Muitas requisições à IA. Aguarde alguns segundos.",
        },
      };
    if (resp.status === 402)
      return {
        ok: false,
        error: { code: "NO_CREDITS_402", message: "Créditos da conta DeepSeek esgotados." },
      };
    if (resp.status >= 500) {
      const t = await resp.text();
      console.error("DeepSeek 5xx:", resp.status, t);
      return {
        ok: false,
        error: { code: "UPSTREAM_5XX", message: "Serviço DeepSeek temporariamente indisponível." },
      };
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("DeepSeek erro:", resp.status, t);
      return {
        ok: false,
        error: { code: "BAD_RESPONSE", message: `Resposta inesperada (${resp.status}).` },
      };
    }

    const json = await resp.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      console.error("DeepSeek bad response:", JSON.stringify(json).slice(0, 500));
      return {
        ok: false,
        error: { code: "BAD_RESPONSE", message: "A IA não devolveu estrutura válida." },
      };
    }
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (e) {
      console.error("JSON parse:", e);
      return {
        ok: false,
        error: { code: "BAD_RESPONSE", message: "JSON inválido devolvido pela IA." },
      };
    }

    const tokensUsed = Number(json?.usage?.total_tokens) || 0;
    return {
      ok: true,
      system: parsed,
      provider: "deepseek",
      tokensUsed,
      ragHits: rag.hits,
      credits: gateInfo,
    };
  });

export const getAiCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_ai_credits_remaining");
    if (error) return { ok: false as const, error: error.message };
    const row = (Array.isArray(data) ? data[0] : data) as {
      plan: string;
      max_credits: number;
      used: number;
      remaining: number;
      unlimited: boolean;
    } | null;
    return {
      ok: true as const,
      ...(row ?? { plan: "free", max_credits: 10, used: 0, remaining: 10, unlimited: false }),
    };
  });

export const pingArchitect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.DEEPSEEK_API_KEY;
    const keyConfigured = !!key;
    const keyFormatValid = !!key && /^sk-[A-Za-z0-9_-]+$/.test(key) && key.length >= 20;
    let pingOk = false;
    let pingStatus: number | undefined;
    let pingError: string | undefined;
    if (keyFormatValid) {
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
    return {
      ok: keyFormatValid && pingOk,
      keyConfigured,
      keyFormatValid,
      pingOk,
      pingStatus,
      pingError,
      provider: "deepseek" as const,
      model: "deepseek-chat",
      checkedAt: new Date().toISOString(),
    };
  });
