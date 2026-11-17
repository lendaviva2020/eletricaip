import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectProviderIntent,
  switchConfirmation,
  whichProviderAnswer,
} from "@/lib/ai/provider-switch";

describe("troca de IA conversando no chat", () => {
  it("reconhece pedidos curtos e explícitos", () => {
    expect(detectProviderIntent("usa o gemini")).toEqual({ kind: "switch", provider: "gemini" });
    expect(detectProviderIntent("Troca pra DeepSeek!")).toEqual({
      kind: "switch",
      provider: "deepseek",
    });
    expect(detectProviderIntent("quero falar com o Gemini")).toEqual({
      kind: "switch",
      provider: "gemini",
    });
    expect(detectProviderIntent("qual IA você está usando?")).toEqual({ kind: "which" });
  });

  it("não troca em perguntas de engenharia que só citam o nome", () => {
    expect(
      detectProviderIntent(
        "compare o deepseek e o gemini para dimensionar o cabo do motor de 15 kW em 380 V",
      ),
    ).toBeNull();
    expect(detectProviderIntent("dimensione o disjuntor do motor M1")).toBeNull();
    expect(detectProviderIntent("use deepseek e gemini juntos")).toBeNull();
  });

  it("respostas claras sobre o provedor ativo e indisponível", () => {
    expect(switchConfirmation("gemini", ["deepseek", "gemini"])).toMatch(/Google Gemini/);
    expect(switchConfirmation("deepseek", ["gemini"])).toMatch(/não está disponível/);
    expect(whichProviderAnswer("deepseek", ["gemini"])).toMatch(/Google Gemini/);
  });
});

describe("camada de provedor: DeepSeek padrão com queda para o Gemini", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sem chave DeepSeek, só o Gemini fica disponível (app não para)", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.GEMINI_API_KEY = "AIza" + "x".repeat(35);
    const mod = await import("@/lib/ai/ai-provider.server");
    expect(mod.availableProviders()).toEqual(["gemini"]);
    expect(mod.providerOrder("deepseek")).toEqual(["gemini"]);
  });

  it("com as duas chaves, a preferência do usuário vem primeiro", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-" + "a".repeat(32);
    process.env.GEMINI_API_KEY = "AIza" + "x".repeat(35);
    const mod = await import("@/lib/ai/ai-provider.server");
    expect(mod.providerOrder(null)).toEqual(["deepseek", "gemini"]);
    expect(mod.providerOrder("gemini")).toEqual(["gemini", "deepseek"]);
  });

  it("DeepSeek em JSON: pede JSON no prompt e lê o uso de tokens", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-" + "a".repeat(32);
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        response_format: { type: string };
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.response_format.type).toBe("json_object");
      expect(body.messages[0].content).toMatch(/JSON/);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { total_tokens: 42 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("@/lib/ai/ai-provider.server");
    const res = await mod.generateJson({
      task: "fast",
      system: "sistema",
      turns: [{ role: "user", content: "oi" }],
      jsonSchema: { type: "object" },
    });
    expect(res).toMatchObject({ text: '{"ok":true}', tokensUsed: 42, provider: "deepseek" });
  });

  it("erro de autenticação na DeepSeek sem Gemini vira erro claro, sem citar variável de ambiente", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-" + "a".repeat(32);
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("@/lib/ai/ai-provider.server");
    await expect(
      mod.generateJson({
        task: "fast",
        system: "s",
        turns: [{ role: "user", content: "x" }],
        jsonSchema: {},
      }),
    ).rejects.toMatchObject({ detail: { code: "AUTH_401" } });
    try {
      await mod.generateJson({ task: "fast", system: "s", turns: [], jsonSchema: {} });
    } catch (e) {
      expect(String((e as Error).message)).not.toMatch(/API_KEY/);
    }
  });

  it("streaming da DeepSeek: lê SSE até [DONE]", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-" + "a".repeat(32);
    delete process.env.GEMINI_API_KEY;
    const sse =
      'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":", engenheiro"}}]}\n\n' +
      'data: {"choices":[],"usage":{"total_tokens":12}}\n\n' +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sse, { status: 200 })),
    );
    const mod = await import("@/lib/ai/ai-provider.server");
    const parts: string[] = [];
    let tokens = 0;
    for await (const part of mod.streamText({
      system: "s",
      turns: [{ role: "user", content: "oi" }],
    })) {
      if (part.type === "delta") parts.push(part.text);
      if (part.type === "usage") tokens = part.tokens;
    }
    expect(parts.join("")).toBe("Olá, engenheiro");
    expect(tokens).toBe(12);
  });
});
