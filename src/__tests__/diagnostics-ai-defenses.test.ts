import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AiFixRequestSchema, type FixProposal } from "@/lib/diagnostics/contract";
import { executeAiChoiceWithDefense } from "@/lib/diagnostics/ai-fix.functions";

const sampleProposal: FixProposal = {
  id: "fix:NBR5410:w1:10mm2",
  resolvesDiagnosticIds: ["NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:w1"],
  operations: [{ op: "set-conductor-section", conductorId: "w1", sectionMm2: 10 }],
  metrics: [
    {
      elementId: "w1",
      metric: "voltage_drop_pct",
      before: 5.2,
      after: 2.1,
      unit: "%",
      limit: 4.0,
      marginRatioBefore: 1.3,
      marginRatioAfter: 0.525,
    },
  ],
  sideEffects: ["Conferir eletroduto"],
  verifiedChecks: ["queda_de_tensao", "ampacidade_iz"],
  unavailableChecks: [],
  rationalePt: "Aumento determinístico para 10 mm² para atender o limite de 4.0% da NBR 5410.",
  isApplicable: true,
};

describe("Edge Function / Defesas de IA (Fase 6)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("aciona fallback determinístico gracioso quando chave de API não está presente", async () => {
    const result = await executeAiChoiceWithDefense([], [sampleProposal]);

    expect(result.fallbackUsed).toBe(true);
    expect(result.chosenProposalId).toBe("fix:NBR5410:w1:10mm2");
    expect(result.rationalePt).toContain("NBR 5410");
  });

  it("descarta e faz fallback seguro se a IA tentar alucinar um proposalId inexistente", async () => {
    // Mock do fetch retornando ID que não existe na lista de propostas
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                chosenProposalId: "fix:inventado:999mm2",
                rationalePt: "Eu inventei esse ID.",
              }),
            },
          },
        ],
      }),
    });

    // Simula chave de ambiente presente
    const originalEnv = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "dummy-key";

    try {
      const result = await executeAiChoiceWithDefense([], [sampleProposal]);

      expect(result.fallbackUsed).toBe(true);
      // O ID inventado foi rejeitado e substituído pelo ID legítimo do motor
      expect(result.chosenProposalId).toBe("fix:NBR5410:w1:10mm2");
      expect(result.chosenProposalId).not.toBe("fix:inventado:999mm2");
    } finally {
      process.env.DEEPSEEK_API_KEY = originalEnv;
    }
  });

  it("recupera graciosamente quando a IA retorna JSON quebrado", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Este não é um JSON válido { broken" } }],
      }),
    });

    const originalEnv = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "dummy-key";

    try {
      const result = await executeAiChoiceWithDefense([], [sampleProposal]);
      expect(result.fallbackUsed).toBe(true);
      expect(result.chosenProposalId).toBe("fix:NBR5410:w1:10mm2");
    } finally {
      process.env.DEEPSEEK_API_KEY = originalEnv;
    }
  });

  it("valida schema estrito com Zod e rejeita campos extras (.strict())", () => {
    const validPayload = {
      projectId: "a0000000-0000-0000-0000-000000000001",
      idempotencyKey: "idem-key-1234567890",
      diagnostics: [
        {
          id: "diag:1",
          ruleId: "rule:1",
          severity: "error",
          elementIds: ["w1"],
          measured: { value: 5.2, unit: "%" },
          limit: { value: 4.0, unit: "%" },
          marginRatio: 1.3,
          assumptions: [],
          reference: {
            standard: "NBR 5410",
            clause: "6.2.7",
            reviewStatus: "reviewed",
          },
          context: {},
        },
      ],
      proposals: [sampleProposal],
    };

    expect(() => AiFixRequestSchema.parse(validPayload)).not.toThrow();

    // Payload com campo desconhecido/não permitido (ex: prompt injection ou campo arbitrário)
    const payloadWithInjectedField = {
      ...validPayload,
      malicious_field: "DROP TABLE users;",
    };

    expect(() => AiFixRequestSchema.parse(payloadWithInjectedField)).toThrow();
  });

  it("rejeita requisição quando projectId não é um UUID válido", () => {
    const invalidPayload = {
      projectId: "nao-eh-uuid",
      idempotencyKey: "idem-key-1234567890",
      diagnostics: [],
      proposals: [sampleProposal],
    };

    expect(() => AiFixRequestSchema.parse(invalidPayload)).toThrow();
  });
});
