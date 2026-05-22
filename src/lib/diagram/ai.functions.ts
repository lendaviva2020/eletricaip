// AI Patch generator — boundary IA→app validado com Zod.
// Retorna AiDiagramPatch já parseado; cliente aplica via dispatch(buildAiPatchCommand).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import { AiDiagramPatchSchema, type AiDiagramPatch } from "@/lib/diagram/schema";

const InputSchema = z.object({
  prompt: z.string().min(1).max(8000),
  doc: z.unknown().optional(),
});

type PatchOk = { ok: true; patch: AiDiagramPatch; tokensUsed: number };
type PatchErr = { ok: false; error: { code: string; message: string } };

const SYSTEM = `Você é o EletricAI Architect. Devolva SEMPRE um patch JSON válido conforme o schema.
Regras:
- IDs estáveis (prefixo n_ para nós, e_ para edges). NÃO repita IDs já existentes no doc.
- Posições no plano 0..2000 em x/y, espaçamento ≥ 120px.
- Aplique NBR 5410: incluir DR (rcd) em circuitos de tomada, aterramento PE em cargas, disjuntor a montante.
- "rationale" curto em PT-BR citando normas tocadas.`;

const JSON_SCHEMA = zodToJsonSchema(AiDiagramPatchSchema, { name: "AiDiagramPatch" });

async function callDeepseek(apiKey: string, userMsg: string, fixHint?: string) {
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM + (fixHint ? `\n\nCORREÇÃO NECESSÁRIA: ${fixHint}` : "") },
        { role: "user", content: userMsg },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "emit_patch",
            description: "Devolve o patch para mutar o DiagramDoc.",
            parameters: JSON_SCHEMA,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "emit_patch" } },
      temperature: 0.2,
    }),
  });
  return resp;
}

export const generateDiagramPatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PatchOk | PatchErr> => {
    const { supabase } = context;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
      return { ok: false, error: { code: "MISSING_KEY", message: "DEEPSEEK_API_KEY ausente." } };

    const { error: gateErr } = await supabase.rpc("consume_ai_credits", {
      p_operation: "generate_panel",
    });
    if (gateErr) {
      const msg = gateErr.message || "";
      if (msg.includes("insufficient_credits"))
        return {
          ok: false,
          error: { code: "INSUFFICIENT_CREDITS", message: "Créditos de IA insuficientes." },
        };
      return { ok: false, error: { code: "BAD_RESPONSE", message: "Falha ao debitar créditos." } };
    }

    const docStr = data.doc
      ? `\n\nDoc atual (use para evitar IDs duplicados):\n${JSON.stringify(data.doc).slice(0, 8000)}`
      : "";
    const userMsg = `Pedido: ${data.prompt}${docStr}`;

    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await callDeepseek(apiKey, userMsg, attempt > 0 ? lastErr : undefined);
      if (resp.status === 401)
        return { ok: false, error: { code: "AUTH_401", message: "Chave IA inválida." } };
      if (resp.status === 429)
        return { ok: false, error: { code: "RATE_LIMIT_429", message: "Limite IA atingido." } };
      if (!resp.ok) {
        lastErr = `HTTP ${resp.status}`;
        continue;
      }
      const json = await resp.json();
      const call = json?.choices?.[0]?.message?.tool_calls?.[0];
      const tokensUsed = Number(json?.usage?.total_tokens) || 0;
      if (!call?.function?.arguments) {
        lastErr = "Tool call ausente.";
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(call.function.arguments);
      } catch {
        lastErr = "JSON inválido.";
        continue;
      }
      const parsed = AiDiagramPatchSchema.safeParse(raw);
      if (parsed.success) return { ok: true, patch: parsed.data, tokensUsed };
      lastErr = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }

    return {
      ok: false,
      error: {
        code: "SCHEMA_VALIDATION_FAILED",
        message: `IA não conseguiu produzir patch válido após 2 tentativas: ${lastErr}`,
      },
    };
  });
