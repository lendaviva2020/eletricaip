# 09 — IA e Memória

Lido: `ai-chat.functions.ts` (linhas 287-562 e estrutura), `engineering-tools.server.ts` (linhas 613-940 e registro de ferramentas), grep das Edge Functions de IA. **Não lido:** `ai-gateway.server.ts`, `provider-registry.server.ts`, `memory.server.ts`, `credential-security.server.ts`, `gemini-client.server.ts`, `ai-architect.functions.ts`, componentes de chat.

## 1. Arquitetura real

- **Servidor:** `streamChat` / `sendEngineeringAgentMessage` → `gatewayStreamChat` / `gatewayExecute` (AI Gateway com registro de provedores: gemini, deepseek, openai, anthropic, ollama, openai-compatible, segundo o tipo exibido no erro TS de `ai-chat.functions.ts:542`).
- **Edge Functions:** `ai-electrical-generator` e `ai-industrial-architect` usam Gemini (`GEMINI_API_KEY`); `ai-fix-diagnostics` usa **DeepSeek** (`DEEPSEEK_API_KEY`, linha 198). O banner do editor (`editor-ai-config-banner.tsx`) trata `LOVABLE_API_KEY`. São três convenções distintas de credencial (P2-AI-016).
- **Credencial local:** há uma `GEMINI_API_KEY` com aparência de real no `.env`, o que **contradiz** a informação de que não há chave configurada. Secrets das Edge Functions e da Vercel: NOT_VERIFIED. Nenhuma chamada a provedor foi feita (offline).

## 2. Memória (item 15 dos problemas conhecidos)

- `streamChat` grava a mensagem do usuário (`ai_messages`) e chama `loadProjectAiMemoryContext(supabase, userId, {conversationId, projectId, recentLimit: 24})`. Os `recentTurns` e o `summaryBlock` **são enviados ao modelo** como `messages` + system prompt (linhas 344-392). Ou seja, o histórico persistido realmente participa da chamada; não é só exibição na interface.
- O isolamento depende da RLS de `ai_conversations`/`ai_messages` (`20261114120000`: dono da conversa e acesso ao projeto, ou platform admin).
- A persistência depois de fechar e reabrir: NOT_VERIFIED (exige login, bloqueado offline).

## 3. Ferramentas (tool calling)

- 18 ferramentas declaradas (`ENGINEERING_TOOL_DECLARATIONS`), cada uma com schema zod (`TOOL_SCHEMAS`). Executor `executeAuthorizedEngineeringTool(toolName, rawArgs)`.
- As ferramentas são **funções puras** sobre o `doc` enviado pelo cliente: não gravam no banco nem falam com hardware. O resultado volta ao cliente, que decide aplicar. Isso limita o impacto de prompt injection.
- O executor **não recebe** contexto de usuário ou tenant. Se no futuro uma ferramenta passar a persistir dados, isso vira lacuna de autorização (risco arquitetural).
- A barreira física é uma denylist de chaves de argumento (`writePhysicalPlc`, `mode: "PHYSICAL"` etc., linhas 627-664). É cosmética, porque nenhuma ferramenta tem capacidade física.

## 4. Achados

| ID | Sev. | Achado |
|---|---|---|
| P2-AI-013 | P2 | `streamChat` não chama `assertProjectTenantAccess` (o agente chama); `projectContext` vem do cliente sem validação e é injetado no system prompt |
| P3-AI-014 | P3 | A sanitização (`sanitizePromptText(…, 2000)`) é contornada: o prompt bruto (até 32.000 caracteres) é gravado e reenviado via histórico |
| P3-AI-015 | P3 | Ids de nós e arestas vindos do modelo viram chaves de objeto (`doc.nodes[n.id]`); validar o formato do id |
| P2-AI-016 | P2 | Três provedores e três variáveis de credencial sem fonte única |
| P2-AI-017 | P2 | Rate limit da Edge Function em memória por isolate |
| P1-TYPE-036 | P1 | 25 erros TS no fluxo de IA (doc 11): os retornos das server functions de chat são tipados como `{}`/`unknown` nos consumidores (`chat.tsx`, `canvas-ai-chat.tsx`, `settings.ai-status.tsx`), o que esconde contratos quebrados |

## 5. "Corrigir com IA" (item 16)

Fluxo identificado: `supabase/functions/ai-fix-diagnostics` (JWT obrigatório, acesso ao projeto via `created_by`/membership, consumo de créditos via RPC) e `src/lib/diagnostics/ai-fix.functions.ts`, `draft-orchestrator.ts`, `crypto-hash.ts`, `contract.ts`. Leitura pendente: NOT_VERIFIED se o patch é validado (recalculado ou verificado) antes de aplicar.
