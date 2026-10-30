/**
 * Server Function do TanStack Start para Diagnósticos Corretivos com IA (Fase 6).
 *
 * Princípios de Engenharia e Defesas:
 * 1. O motor determinístico decide; a IA apenas escolhe entre propostas já validadas pelo motor.
 * 2. Autenticação obrigatória (requireSupabaseAuth) — rejeita anônimos com 401.
 * 3. Rate limit e quota mensal aplicados estritamente no servidor (requireAiQuota, requireBurstLimit).
 * 4. Débito de crédito realizado no backend via RPC consume_ai_credits — 402 se insuficiente.
 * 5. Validação de schema Zod estrito (.strict()) — 400 se campos desconhecidos.
 * 6. Autorização multi-tenant — 403 se o usuário não tiver permissão no projeto.
 * 7. Chamada ao DeepSeek com timeout de 20s e fallback gracioso determinístico.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireAiQuota,
  requireBurstLimit,
} from "@/integrations/supabase/ai-rate-limit-middleware";
import {
  AiFixRequestSchema,
  AiFixResponseSchema,
  type FixProposal,
} from "./contract";

export interface AiFixClientResult {
  readonly ok: boolean;
  readonly chosenProposalId: string | null;
  readonly rationalePt: string;
  readonly fallbackUsed: boolean;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const LLM_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = `Você é o Assistente Técnico Especialista em Normas Elétricas Industriais do ElétricAi.
Sua única responsabilidade é selecionar a proposta mais adequada e explicar a justificativa em português claro, técnico e sóbrio.

REGRAS INVIOLÁVEIS DE SEGURANÇA:
1. O motor determinístico de engenharia já calculou as opções válidas. Você NUNCA deve inventar valores numéricos, nunca criar operações novas e nunca tentar alterar seções ou parâmetros de cabos.
2. Seu resultado "chosenProposalId" DEVE SER ESTRITAMENTE IGUAL a um dos IDs fornecidos na lista de propostas, ou "null" caso nenhuma proposta atenda com segurança.
3. Não cite itens de norma de memória. Cite EXCLUSIVAMENTE a norma e a cláusula informadas nos dados fornecidos.
4. Responda ESTRITAMENTE em formato JSON com o seguinte formato, sem formatação markdown ou blocos de código adicionais:
{
  "chosenProposalId": "id-exato-da-proposta" | null,
  "rationalePt": "Justificativa técnica em português de até 600 caracteres."
}`;

export async function executeAiChoiceWithDefense(
  diagnostics: unknown[],
  proposals: readonly FixProposal[],
): Promise<{ chosenProposalId: string | null; rationalePt: string; fallbackUsed: boolean }> {
  // Proposta padrão determinística caso a IA falhe
  const firstApplicable = proposals.find((p) => p.isApplicable) ?? proposals[0] ?? null;
  const fallbackResult = {
    chosenProposalId: firstApplicable?.id ?? null,
    rationalePt:
      firstApplicable?.rationalePt ??
      "Proposta de correção selecionada deterministicamente pelo motor de engenharia conforme parâmetros da ABNT NBR 5410.",
    fallbackUsed: true,
  };

  if (!DEEPSEEK_API_KEY) {
    return fallbackResult;
  }

  const promptContent = `
<diagnosticos>
${JSON.stringify(diagnostics, null, 2)}
</diagnosticos>

<propostas>
${JSON.stringify(proposals, null, 2)}
</propostas>

Selecione a melhor proposta para resolver os diagnósticos e gere a justificativa em conformidade com as regras estritas.
`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const res = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: promptContent },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[ai-fix-diagnostics] DeepSeek HTTP ${res.status}; ativando fallback seguro.`);
      return fallbackResult;
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = json.choices?.[0]?.message?.content?.trim();
    if (!rawText) {
      return fallbackResult;
    }

    const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleanedText) as { chosenProposalId?: string | null; rationalePt?: string };

    const validIds = new Set(proposals.map((p) => p.id));
    if (parsed.chosenProposalId !== null && parsed.chosenProposalId !== undefined && !validIds.has(parsed.chosenProposalId)) {
      console.warn(
        `[ai-fix-diagnostics] IA tentou inventar proposalId inválido: "${parsed.chosenProposalId}". Descartado; acionando fallback determinístico.`,
      );
      return fallbackResult;
    }

    return {
      chosenProposalId: parsed.chosenProposalId ?? null,
      rationalePt:
        typeof parsed.rationalePt === "string" && parsed.rationalePt.length > 0
          ? parsed.rationalePt.slice(0, 600)
          : fallbackResult.rationalePt,
      fallbackUsed: false,
    };
  } catch (err: unknown) {
    console.warn("[ai-fix-diagnostics] Exceção na chamada LLM; ativando fallback seguro:", err);
    return fallbackResult;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const requestAiFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAiQuota, requireBurstLimit])
  .inputValidator((input) => AiFixRequestSchema.parse(input))
  .handler(async ({ data, context }): Promise<AiFixClientResult> => {
    const { supabase, userId } = context;

    // 1. Autorização: Usuário tem acesso ao projeto? (RLS + verificação explícita)
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, created_by, tenant_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (projectError || !project) {
      throw new Response(
        JSON.stringify({ error: "Projeto não encontrado ou acesso negado." }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }

    // 2. Débito de créditos de IA no servidor
    const { error: creditError } = await supabase.rpc("consume_ai_credits_for_user", {
      p_user_id: userId,
      p_operation: "ai_fix_diagnostics",
    });

    if (creditError) {
      const msg = creditError.message || "";
      if (msg.includes("insufficient_credits") || msg.includes("quota")) {
        throw new Response(
          JSON.stringify({
            error: "Créditos de IA insuficientes para processar a correção.",
            code: "INSUFFICIENT_CREDITS",
          }),
          { status: 402, headers: { "content-type": "application/json" } },
        );
      }
      console.error("[requestAiFix] Erro ao debitar créditos:", creditError);
      throw new Response(
        JSON.stringify({ error: "Falha ao validar cota de créditos de IA." }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    // 3. Execução com defesas
    const result = await executeAiChoiceWithDefense(data.diagnostics, data.proposals);

    return {
      ok: true,
      chosenProposalId: result.chosenProposalId,
      rationalePt: result.rationalePt,
      fallbackUsed: result.fallbackUsed,
    };
  });
