// AI Patch generator — boundary IA→app validado com Zod.
// Retorna AiDiagramPatch já parseado; cliente aplica via dispatch(buildAiPatchCommand).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import { AiDiagramPatchSchema, type AiDiagramPatch } from "@/lib/diagram/schema";
import { buildPatchJsonSchema } from "@/lib/diagram/zod-to-json-schema";

const InputSchema = z.object({
  prompt: z.string().min(1).max(8000),
  doc: z.unknown().optional(),
});

type PatchOk = { ok: true; patch: AiDiagramPatch; tokensUsed: number };
type PatchErr = { ok: false; error: { code: string; message: string } };

const SYSTEM = `Você é o EletricAI Architect. Devolva SEMPRE um patch JSON via tool-call "emit_patch".

REGRAS:
- IDs estáveis: prefixo "n_" para nós e "e_" para edges. NÃO repita IDs já existentes no doc.
- sheet: "unifilar" (padrão), "multifilar" ou "ladder".
- position: { x, y } em pixels, 0..2000, espaçamento >= 120 px.
- kind aceitos: breaker, rcd, contactor, relay, fuse, disconnector, transformer, psu, vfd, softstarter, busbar, ccm, motor, load, lamp, socket, pt100, pressure, flow, level, encoder, estop, lightcurtain, ground, neutral, terminal.
- edge.kind: power | signal | pipe | ground.
- params DEVE conter "kind" igual ao node.kind, com campos exigidos:
  • breaker: in_A (number), curve ("B"|"C"|"D"), poles (1..4)
  • rcd: in_A, sensitivity_mA (default 30), poles (2..4)
  • contactor: in_A, coil_V
  • motor: power_kW, voltage_V, startMethod ("DOL"|"SOFT"|"VFD")
  • transformer: kVA, primary_V, secondary_V
  • socket: current_A, voltage_V
  • load/lamp: power_W, voltage_V
- Aplique NBR 5410: incluir RCD (DR) em circuitos de tomada, aterramento PE em cargas, disjuntor a montante.
- rationale: curto em PT-BR citando as normas tocadas.

EXEMPLO de patch mínimo válido:
{
  "rationale": "Adicionado disjuntor 25A curva C conforme NBR 5410 §6.3.4.",
  "addNodes": [{
    "id": "n_dj1", "sheet": "unifilar", "position": {"x": 200, "y": 200},
    "label": "DJ-01 25A", "rotation": 0,
    "params": { "kind": "breaker", "in_A": 25, "curve": "C", "poles": 1 }
  }],
  "addEdges": [], "removeNodeIds": [], "removeEdgeIds": [], "updateNodes": []
}`;

// JSON Schema gerado automaticamente a partir de AiDiagramPatchSchema (Zod).
// Fonte única da verdade: src/lib/diagram/schema.ts.
// Se adicionar campos ao Zod, o schema plano será atualizado via buildPatchJsonSchema().
const PATCH_JSON_SCHEMA = buildPatchJsonSchema();

async function callDeepseek(apiKey: string, userMsg: string, fixHint?: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: SYSTEM + (fixHint ? `\n\nCORREÇÃO NECESSÁRIA: ${fixHint}` : ""),
          },
          { role: "user", content: userMsg },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_patch",
              description: "Devolve o patch para mutar o DiagramDoc.",
              parameters: PATCH_JSON_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_patch" } },
        temperature: 0.2,
      }),
    });
    return resp;
  } finally {
    clearTimeout(timeout);
  }
}

// Projeta o doc para um resumo enxuto (evita estourar payload).
function summarizeDoc(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const d = doc as { nodes?: Record<string, any>; edges?: Record<string, any> };
  const nodes = Object.values(d.nodes ?? {})
    .slice(0, 80)
    .map((n: any) => ({
      id: n.id,
      kind: n.params?.kind,
      label: n.label,
      sheet: n.sheet,
    }));
  const edges = Object.values(d.edges ?? {})
    .slice(0, 120)
    .map((e: any) => ({ id: e.id, s: e.source, t: e.target, k: e.kind }));
  return JSON.stringify({ nodes, edges }).slice(0, 6000);
}

export const generateDiagramPatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PatchOk | PatchErr> => {
    const { supabase } = context;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
      return {
        ok: false,
        error: {
          code: "MISSING_KEY",
          message: "DEEPSEEK_API_KEY ausente nos secrets do servidor.",
        },
      };

    const { error: gateErr } = await supabase.rpc("consume_ai_credits", {
      p_operation: "generate_panel",
    });
    if (gateErr) {
      const msg = gateErr.message || "";
      if (msg.includes("insufficient_credits"))
        return {
          ok: false,
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: "Créditos de IA insuficientes neste mês.",
          },
        };
      console.error("[generateDiagramPatch] consume_ai_credits failed:", gateErr);
      return { ok: false, error: { code: "BAD_RESPONSE", message: "Falha ao debitar créditos." } };
    }

    const docSummary = summarizeDoc(data.doc);
    const userMsg = docSummary
      ? `Pedido: ${data.prompt}\n\nResumo do diagrama atual (use para evitar IDs duplicados):\n${docSummary}`
      : `Pedido: ${data.prompt}`;

    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await callDeepseek(apiKey, userMsg, attempt > 0 ? lastErr : undefined);
        if (resp.status === 401)
          return {
            ok: false,
            error: { code: "AUTH_401", message: "Chave DeepSeek inválida ou revogada." },
          };
        if (resp.status === 429) {
          lastErr = "rate_limit";
          continue;
        }
        if (resp.status === 402)
          return {
            ok: false,
            error: { code: "NO_CREDITS_402", message: "Créditos DeepSeek esgotados." },
          };
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          console.error(`[generateDiagramPatch] HTTP ${resp.status}:`, txt.slice(0, 300));
          lastErr = `HTTP ${resp.status}`;
          continue;
        }
        const json = await resp.json();
        const call = json?.choices?.[0]?.message?.tool_calls?.[0];
        const tokensUsed = Number(json?.usage?.total_tokens) || 0;
        if (!call?.function?.arguments) {
          lastErr = "tool_call ausente";
          console.warn("[generateDiagramPatch] no tool_call:", JSON.stringify(json).slice(0, 300));
          continue;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(call.function.arguments);
        } catch {
          lastErr = "JSON malformado";
          continue;
        }
        const parsed = AiDiagramPatchSchema.safeParse(raw);
        if (parsed.success) return { ok: true, patch: parsed.data, tokensUsed };
        lastErr = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
          .join("; ");
        console.warn(`[generateDiagramPatch] attempt ${attempt + 1} validation failed:`, lastErr);
      } catch (e) {
        const isAbort = (e as Error)?.name === "AbortError";
        lastErr = isAbort ? "timeout 60s" : (e as Error).message;
        console.error(`[generateDiagramPatch] attempt ${attempt + 1} threw:`, lastErr);
        if (isAbort) continue;
      }
    }

    return {
      ok: false,
      error: {
        code: "SCHEMA_VALIDATION_FAILED",
        message: `IA não conseguiu produzir patch válido após 3 tentativas. Último erro: ${lastErr}`,
      },
    };
  });
