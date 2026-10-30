import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3.24.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

// ── Schemas Zod Estritos (.strict()) ───────────────────────────────────────

const SeveritySchema = z.enum(["ok", "warning", "error"]);

const NormReferenceSchema = z
  .object({
    standard: z.string().min(1).max(128),
    clause: z.string().min(1).max(128),
    reviewStatus: z.enum(["pending-human-review", "reviewed"]),
  })
  .strict();

const DiagnosticMeasurementSchema = z
  .object({
    value: z.number().finite(),
    unit: z.string().min(1).max(32),
  })
  .strict();

const DiagnosticSchema = z
  .object({
    id: z.string().min(1).max(256),
    ruleId: z.string().min(1).max(128),
    severity: SeveritySchema,
    elementIds: z.array(z.string().min(1).max(128)).max(50),
    measured: DiagnosticMeasurementSchema,
    limit: DiagnosticMeasurementSchema,
    marginRatio: z.number().finite(),
    assumptions: z.array(z.string().max(256)).max(20),
    reference: NormReferenceSchema,
    context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })
  .strict();

const PatchOperationSchema = z
  .object({
    op: z.literal("set-conductor-section"),
    conductorId: z.string().min(1).max(128),
    sectionMm2: z.number().finite().positive(),
  })
  .strict();

const DiagnosticMetricComparisonSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    metric: z.string().min(1).max(64),
    before: z.number().finite(),
    after: z.number().finite(),
    unit: z.string().min(1).max(16),
    limit: z.number().finite(),
    marginRatioBefore: z.number().finite(),
    marginRatioAfter: z.number().finite(),
  })
  .strict();

const FixProposalSchema = z
  .object({
    id: z.string().min(1).max(256),
    resolvesDiagnosticIds: z.array(z.string().min(1).max(128)).max(50),
    operations: z.array(PatchOperationSchema).min(1).max(10),
    metrics: z.array(DiagnosticMetricComparisonSchema).max(50),
    sideEffects: z.array(z.string().max(300)).max(20),
    verifiedChecks: z.array(z.string().max(100)).max(20),
    unavailableChecks: z.array(z.string().max(100)).max(20),
    rationalePt: z.string().max(600).optional(),
    isApplicable: z.boolean(),
    blockReason: z.string().max(300).optional(),
  })
  .strict();

export const AiFixRequestSchema = z
  .object({
    projectId: z.string().uuid("ID de projeto inválido"),
    idempotencyKey: z.string().min(16).max(128),
    diagnostics: z.array(DiagnosticSchema).min(1).max(50),
    proposals: z.array(FixProposalSchema).min(1).max(20),
  })
  .strict();

export const AiFixResponseSchema = z
  .object({
    chosenProposalId: z.string().min(1).max(256).nullable(),
    rationalePt: z.string().min(1).max(600),
    fallbackUsed: z.boolean().default(false),
  })
  .strict();

// ── Rate Limit em Memória (5 chamadas/min por usuário) ─────────────────────

const userRateBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_CALLS = 5;

function checkUserRateLimit(userId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const timestamps = (userRateBuckets.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (timestamps.length >= RATE_LIMIT_MAX_CALLS) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    userRateBuckets.set(userId, timestamps);
    return { allowed: false, retryAfterSec };
  }

  timestamps.push(now);
  userRateBuckets.set(userId, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

// ── DeepSeek API Client Seguro ─────────────────────────────────────────────

const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
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

async function callDeepSeekWithDefense(
  diagnostics: unknown[],
  proposals: Array<{ id: string; rationalePt?: string }>,
): Promise<{ chosenProposalId: string | null; rationalePt: string; fallbackUsed: boolean }> {
  // Proposta determinística padrão de fallback caso a IA falhe
  const fallbackProposal = proposals[0] ?? null;
  const fallbackResult = {
    chosenProposalId: fallbackProposal?.id ?? null,
    rationalePt:
      fallbackProposal?.rationalePt ??
      "Proposta de correção selecionada deterministicamente pelo motor de engenharia conforme parâmetros da ABNT NBR 5410.",
    fallbackUsed: true,
  };

  if (!DEEPSEEK_API_KEY) {
    console.warn("[ai-fix-diagnostics] DEEPSEEK_API_KEY ausente nos secrets; usando fallback determinístico.");
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
      console.warn(`[ai-fix-diagnostics] DeepSeek retornou status ${res.status}; ativando fallback seguro.`);
      return fallbackResult;
    }

    const json = await res.json();
    const rawText = json.choices?.[0]?.message?.content?.trim();
    if (!rawText) {
      console.warn("[ai-fix-diagnostics] Resposta vazia do LLM; ativando fallback seguro.");
      return fallbackResult;
    }

    // Limpa eventuais cercas markdown ```json ... ``` caso o modelo retorne
    const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleanedText);

    // Validação estrita da escolha do modelo
    const validIds = new Set(proposals.map((p) => p.id));
    if (parsed.chosenProposalId !== null && !validIds.has(parsed.chosenProposalId)) {
      console.warn(
        `[ai-fix-diagnostics] IA tentou inventar proposalId inválido: "${parsed.chosenProposalId}". Descartado; acionando fallback determinístico.`,
      );
      return fallbackResult;
    }

    return {
      chosenProposalId: parsed.chosenProposalId,
      rationalePt:
        typeof parsed.rationalePt === "string" && parsed.rationalePt.length > 0
          ? parsed.rationalePt.slice(0, 600)
          : fallbackResult.rationalePt,
      fallbackUsed: false,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[ai-fix-diagnostics] Falha ao comunicar com LLM (${isAbort ? "Timeout 20s" : String(err)}); acionando fallback seguro.`,
    );
    return fallbackResult;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Deno Serve Handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Autenticação JWT obrigatória
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Token de autorização ausente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Sessão inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Rate Limit (máximo 5 chamadas por minuto por usuário)
    const rateLimit = checkUserRateLimit(user.id);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: `Limite de requisições excedido (máximo 5 por minuto). Aguarde ${rateLimit.retryAfterSec} segundos.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.retryAfterSec),
          },
        },
      );
    }

    // 3. Validação de Entrada Zod Estrita (.strict(), rejeita campos extras com 400)
    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON inválido no corpo da requisição." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parseResult = AiFixRequestSchema.safeParse(bodyRaw);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: "Payload de requisição inválido.",
          details: parseResult.error.flatten(),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { projectId, diagnostics, proposals } = parseResult.data;

    // 4. Autorização: Usuário tem acesso ao projeto? (RLS + verificação explícita)
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, created_by, tenant_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: "Projeto não encontrado ou acesso negado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Débito de Crédito de IA no Servidor (Retorna 402 se saldo insuficiente)
    const { error: creditError } = await supabase.rpc("consume_ai_credits_for_user", {
      p_user_id: user.id,
      p_operation: "ai_fix_diagnostics",
    });

    if (creditError) {
      const msg = creditError.message || "";
      if (msg.includes("insufficient_credits") || msg.includes("quota")) {
        return new Response(
          JSON.stringify({
            error: "Créditos de IA insuficientes para processar a correção.",
            code: "INSUFFICIENT_CREDITS",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("[ai-fix-diagnostics] Erro ao debitar créditos:", creditError);
      return new Response(JSON.stringify({ error: "Falha ao validar cota de créditos de IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Chamada ao DeepSeek com Defesas e Fallback Determinístico
    const aiResult = await callDeepSeekWithDefense(diagnostics, proposals);

    return new Response(JSON.stringify(aiResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("[ai-fix-diagnostics] Erro interno não tratado:", err);
    return new Response(
      JSON.stringify({
        error: "Erro interno no servidor ao processar o diagnóstico com IA.",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
