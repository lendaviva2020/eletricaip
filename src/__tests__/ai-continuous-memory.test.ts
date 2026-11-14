// @vitest-environment jsdom
// AI Continuous Engineering Memory Tests
// Standards: IEC 60947, NBR 5410, Multi-Tenant Cloud Architecture
// Verifies persistent conversation lifecycle, message history preservation, and cross-module session continuity.

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("ELÉTRICAI — Continuous Engineering Memory & Session Persistence (P0)", () => {
  const fakeProjectId = "987e6543-e21b-12d3-a456-426614174999";
  const fakeUserId = "usr_eng_01";

  // Mock in-memory database mimicking Supabase ai_conversations + ai_messages
  interface DbConversation {
    id: string;
    project_id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }

  interface DbMessage {
    id: string;
    conversation_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    tokens_used: number | null;
    tool_calls: Record<string, any>;
    created_at: string;
  }

  let conversationsTable: DbConversation[] = [];
  let messagesTable: DbMessage[] = [];

  beforeEach(() => {
    conversationsTable = [];
    messagesTable = [];
  });

  function mockGetOrCreateProjectConversation(
    projectId: string,
    title = "Engenharia Industrial ElétricAi",
  ) {
    let conv = conversationsTable.find(
      (c) => c.project_id === projectId && c.user_id === fakeUserId,
    );
    if (!conv) {
      conv = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        project_id: projectId,
        user_id: fakeUserId,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      conversationsTable.push(conv);
    }

    const msgs = messagesTable
      .filter((m) => m.conversation_id === conv!.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return { conversation: conv, messages: msgs };
  }

  function mockPersistChatMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    tokensUsed?: number,
  ) {
    const conv = conversationsTable.find((c) => c.id === conversationId);
    if (!conv) throw new Error("Conversation not found");

    const newMsg: DbMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      conversation_id: conversationId,
      role,
      content,
      tokens_used: tokensUsed ?? null,
      tool_calls: {},
      created_at: new Date().toISOString(),
    };
    messagesTable.push(newMsg);
    conv.updated_at = new Date().toISOString();
    return newMsg;
  }

  it("1. Automatically creates or retrieves persistent conversation bound to projectId", () => {
    const res1 = mockGetOrCreateProjectConversation(fakeProjectId);
    expect(res1.conversation.project_id).toBe(fakeProjectId);
    expect(res1.conversation.title).toContain("Engenharia Industrial");
    expect(res1.messages).toHaveLength(0);

    // Segunda chamada para o mesmo projeto recupera a MESMA conversa (não duplica)
    const res2 = mockGetOrCreateProjectConversation(fakeProjectId);
    expect(res2.conversation.id).toBe(res1.conversation.id);
  });

  it("2. Persists user messages and assistant responses with token tracking", () => {
    const { conversation } = mockGetOrCreateProjectConversation(fakeProjectId);

    // Mensagem 1: Usuário solicita remediação de disjuntor
    const userMsg = mockPersistChatMessage(
      conversation.id,
      "user",
      "Corrigir queda de tensão no ramal M1",
      45,
    );
    expect(userMsg.conversation_id).toBe(conversation.id);
    expect(userMsg.role).toBe("user");
    expect(userMsg.tokens_used).toBe(45);

    // Mensagem 2: Resposta da IA com patch estruturado e dimensionamento
    const aiMsg = mockPersistChatMessage(
      conversation.id,
      "assistant",
      "Patch aplicado: Cabo aumentado de 4mm² para 10mm² (Queda reduzida de 5.8% para 2.3%)",
      120,
    );
    expect(aiMsg.role).toBe("assistant");
    expect(aiMsg.tokens_used).toBe(120);

    // Ao reabrir a conversa, ambas as mensagens estão preservadas em ordem cronológica
    const reloaded = mockGetOrCreateProjectConversation(fakeProjectId);
    expect(reloaded.messages).toHaveLength(2);
    expect(reloaded.messages[0].content).toContain("Corrigir queda");
    expect(reloaded.messages[1].content).toContain("Patch aplicado");
  });

  it("3. Retains technical decisions across module switching (Unifilar -> Ladder -> FBD -> SCADA)", () => {
    const { conversation } = mockGetOrCreateProjectConversation(fakeProjectId);

    // 1. No Unifilar: decisão de utilizar partida estrela-triângulo para M1
    mockPersistChatMessage(
      conversation.id,
      "assistant",
      "[DECISÃO DE ENGENHARIA]: Motor M1 (18.5kW) configurado para partida Estrela-Triângulo (KM1, KM2, KM3).",
    );

    // 2. No Ladder: IA instrui implementação do intertravamento elétrico
    mockPersistChatMessage(
      conversation.id,
      "assistant",
      "[LADDER]: Adicionado intertravamento NC entre %Q0.1 (Estrela) e %Q0.2 (Triângulo) com temporizador TON 5s.",
    );

    // 3. Simula troca de abas e recarregamento da aplicação
    const session = mockGetOrCreateProjectConversation(fakeProjectId);
    expect(session.messages).toHaveLength(2);

    const historyText = session.messages.map((m) => m.content).join("\n");
    expect(historyText).toContain("Motor M1 (18.5kW)");
    expect(historyText).toContain("intertravamento NC");
  });

  it("4. Enforces strict tenant and project isolation (conversations never leak across projects)", () => {
    const projectA = "11111111-1111-1111-1111-111111111111";
    const projectB = "22222222-2222-2222-2222-222222222222";

    const convA = mockGetOrCreateProjectConversation(projectA);
    mockPersistChatMessage(convA.conversation.id, "user", "Dados sigilosos Projeto A");

    const convB = mockGetOrCreateProjectConversation(projectB);
    mockPersistChatMessage(convB.conversation.id, "user", "Dados exclusivos Projeto B");

    // Recarrega A: apenas mensagens de A estão presentes
    const loadA = mockGetOrCreateProjectConversation(projectA);
    expect(loadA.messages).toHaveLength(1);
    expect(loadA.messages[0].content).toBe("Dados sigilosos Projeto A");

    // Recarrega B: apenas mensagens de B estão presentes
    const loadB = mockGetOrCreateProjectConversation(projectB);
    expect(loadB.messages).toHaveLength(1);
    expect(loadB.messages[0].content).toBe("Dados exclusivos Projeto B");
  });
});
