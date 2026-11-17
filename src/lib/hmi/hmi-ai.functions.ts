/**
 * IA que escreve o CÓDIGO da tela HMI (linguagem `hmi-dsl`).
 *
 * O usuário descreve a planta ("quero uma moega, rosca para o cozinhador,
 * prensa, tanque de óleo e caldeira") e a IA devolve o código. O servidor
 * valida com o MESMO parser do editor; se houver erro, pede UMA correção com
 * a lista de erros. Nada é aplicado sem o usuário ver e confirmar.
 * Custa créditos do plano (operação `generate_panel`) e respeita os limites.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import { AiProviderError, availableProviders, generateJson } from "@/lib/ai/ai-provider.server";
import { loadUserAiProvider } from "@/lib/ai-preference.functions";
import { BRIEFING_SECURITY_DIRECTIVE, wrapUserBriefing } from "@/lib/ai/context-sanitizer";
import { EQUIPMENT_LIBRARY, MEDIA } from "./process-library";
import { HMI_CODE_MAX_CHARS, hmiLanguageReference, parseHmiCode } from "./hmi-dsl";
import type { HmiIssue } from "./hmi-model";

const OutputSchema = z.object({
  code: z.string().min(1).max(HMI_CODE_MAX_CHARS),
  resumo: z.string().max(2000).default(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", description: "Código completo da tela na linguagem HMI." },
    resumo: { type: "string", description: "O que foi montado, em uma ou duas frases." },
  },
  required: ["code", "resumo"],
};

function catalogForPrompt(): string {
  return EQUIPMENT_LIBRARY.map(
    (d) =>
      `${d.type} (${d.label}; ${d.w}x${d.h}): portas ${d.ports
        .map((p) => `${p.id}[${p.dir}:${p.media.join("/")}]`)
        .join(", ")}${d.ops.length ? `; operações ${d.ops.join(",")}` : ""}`,
  ).join("\n");
}

function systemPrompt(): string {
  return [
    "Você monta telas de supervisão (HMI) de processos industriais escrevendo CÓDIGO numa linguagem própria.",
    "Responda SOMENTE em JSON com as chaves `code` e `resumo`.",
    "",
    "LINGUAGEM:",
    hmiLanguageReference(),
    "",
    "REGRAS:",
    "- Use SOMENTE os tipos e portas do catálogo abaixo; ligue SAÍDA (out) em ENTRADA (in); o meio deve ser aceito pelas duas portas.",
    "- IDs curtos com o prefixo do tipo e número (ex.: RT1, B2, TQ1). Rótulos em português.",
    "- Layout legível: fluxo da esquerda para a direita, cerca de 260 px entre equipamentos na horizontal e 220 px entre linhas; coordenadas inteiras >= 0.",
    "- Inclua motores/painel e ligações de energia apenas se o usuário pedir parte elétrica.",
    "- Não invente valores de processo (vazão, temperatura); a tela só desenha e simula liga/desliga.",
    `- Meios válidos: ${MEDIA.join(", ")}.`,
    "- Se receber o código atual, devolva o código COMPLETO já alterado (não só o trecho).",
    "",
    "CATÁLOGO (tipo (nome; tamanho): portas id[sentido:meios]):",
    catalogForPrompt(),
    "",
    BRIEFING_SECURITY_DIRECTIVE,
  ].join("\n");
}

export type HmiAiResult =
  { ok: true; code: string; summary: string; issues: HmiIssue[] } | { ok: false; error: string };

export const generateHmiCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        currentCode: z.string().max(HMI_CODE_MAX_CHARS).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HmiAiResult> => {
    const { supabase } = context;
    if (availableProviders().length === 0) {
      return { ok: false, error: "IA temporariamente indisponível." };
    }
    const { error: gateErr } = await supabase.rpc("consume_ai_credits", {
      p_operation: "generate_panel",
    });
    if (gateErr) {
      if ((gateErr.message || "").includes("insufficient_credits")) {
        return { ok: false, error: "Créditos de IA do plano esgotados neste mês." };
      }
      console.error("[hmi-ai] créditos:", gateErr.code);
      return { ok: false, error: "Não foi possível debitar os créditos de IA." };
    }

    const preferred = await loadUserAiProvider(supabase, context.userId);
    const request = data.currentCode
      ? `Código atual da tela:\n${data.currentCode}\n\nAlteração pedida:\n${wrapUserBriefing(data.prompt, 4000)}`
      : wrapUserBriefing(data.prompt, 4000);

    const turns: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: request },
    ];
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await generateJson({
          task: "fast",
          system: systemPrompt(),
          turns,
          jsonSchema: JSON_SCHEMA,
          preferred,
          temperature: 0.2,
        });
        let raw: unknown;
        try {
          raw = JSON.parse(res.text);
        } catch {
          raw = null;
        }
        const out = OutputSchema.safeParse(raw);
        if (!out.success) {
          turns.push({ role: "assistant", content: res.text.slice(0, 4000) });
          turns.push({ role: "user", content: "Responda apenas JSON com `code` e `resumo`." });
          continue;
        }
        const parsed = parseHmiCode(out.data.code);
        const errors = parsed.issues.filter((i) => i.level === "error");
        if (parsed.doc && errors.length === 0) {
          return { ok: true, code: out.data.code, summary: out.data.resumo, issues: parsed.issues };
        }
        turns.push({ role: "assistant", content: res.text.slice(0, HMI_CODE_MAX_CHARS) });
        turns.push({
          role: "user",
          content: `O código tem erros. Corrija e devolva o código completo:\n${errors
            .slice(0, 15)
            .map((e) => `${e.line ? `linha ${e.line}: ` : ""}${e.message}`)
            .join("\n")}`,
        });
      }
      return {
        ok: false,
        error: "A IA não conseguiu gerar um código válido. Tente descrever de outro jeito.",
      };
    } catch (err) {
      if (err instanceof AiProviderError) return { ok: false, error: err.detail.message };
      console.error("[hmi-ai] falha:", err instanceof Error ? err.message : err);
      return { ok: false, error: "Falha ao falar com a IA." };
    }
  });
