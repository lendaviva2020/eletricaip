## Análise completa do aplicativo

**EletricAI Industrial OS** — Plataforma de engenharia industrial (TanStack Start + Supabase + DeepSeek). Núcleo:

- **Frontend**: TanStack Router (`src/routes/`), Zustand stores (`project-store`, `voltai/store`, `editor/store`, `diagram/store`), canvases (Unifilar, Ladder, FBD, SCADA, Twin, WebGL/PixiJS).
- **Camada de diagrama nova (Zod-first)**: `src/lib/diagram/{schema,model,commands,history,store}.ts` + renderer WebGL em `render/{stage,symbols}.ts` + componente `webgl-canvas.tsx`. Possui Undo/Redo via Command Pattern.
- **IA — 2 server functions paralelas**:
  1. `generateArchitecture` (`ai-architect.functions.ts`) — modo legado, devolve sistema completo com RAG de `normative_chunks`.
  2. `generateDiagramPatch` (`diagram/ai.functions.ts`) — novo, devolve patch validado por `AiDiagramPatchSchema` (Zod) e aplica via `applyAiPatch` no store.
- **Middlewares**: `requireSupabaseAuth` (Bearer + getUser), `requireAiQuota` (RPC `get_ai_credits_remaining`), `requireBurstLimit` (in-memory 20/min). `attachSupabaseAuth` global já registrado em `src/start.ts`.
- **Chat**: `CanvasAiChat` no workspace, com toggle Patch IA / Legado.

## Causas dos erros (verificadas)

1. **CRASH no render do chat — falta importar `Button`**. `canvas-ai-chat.tsx:387` usa `<Button>` no bloco `m.hasPatch`, mas o componente não está nos imports (linhas 1-25). Sempre que a IA termina com sucesso e o card de patch tenta renderizar, o React lança `Button is not defined`, mostrando tela em branco / erro genérico e o usuário entende como "IA não respondeu".

2. **JSON Schema inválido para tool-calling**. `generateDiagramPatch` faz `zodToJsonSchema(AiDiagramPatchSchema)` em cima de `DiagramNodeSchema` que contém `z.discriminatedUnion` + `z.record`. O resultado tem `$defs`/`$ref` aninhados e `additionalProperties` rígido que o validador da DeepSeek rejeita; cai em loop de 2 tentativas e retorna `SCHEMA_VALIDATION_FAILED`.

3. **Sem fallback amigável quando usuário anônimo abre o canvas**. `requireSupabaseAuth` lança 401 (sem JSON-envelope), o catch do chat só mostra `e.message` cru.

4. **Doc grande no payload**. `diagramDoc` inteiro vai no body sem cap — em projetos médios estoura limite e dispara erro de transporte do serverFn.

5. **Mensagem de erro do middleware em formato `Response` HTML**: `requireAiQuota` lança `Response` com JSON, mas o cliente (`useServerFn`) recebe como exceção genérica — código `PLAN_RATE_LIMIT_429` nunca é exibido com as instruções certas.

## Plano de correção

### 1. Corrigir crash do botão (root cause #1)
- Em `src/components/canvas-ai-chat.tsx`: adicionar `import { Button } from "@/components/ui/button"`.

### 2. JSON Schema enxuto e compatível para o patch (root cause #2)
- Em `src/lib/diagram/ai.functions.ts`:
  - Substituir `zodToJsonSchema(AiDiagramPatchSchema)` por um **schema JSON manual e plano** (sem `$ref`, sem discriminated unions): `addNodes/addEdges` como objetos genéricos com `id, sheet, position{x,y}, label, kind, params (object)`, etc. A validação rigorosa continua sendo feita server-side via `AiDiagramPatchSchema.safeParse` após receber a resposta.
  - Aumentar para 3 tentativas e injetar exemplos mínimos no system prompt.
  - Aumentar timeout (AbortController 60 s) e tratar `AbortError` como `UPSTREAM_TIMEOUT`.

### 3. Limitar e sanitizar o `doc` enviado
- Enviar apenas `{ nodes: ids+kinds+labels, edges: source/target/kind }` (resumo) — não o doc inteiro. Já existe `slice(0, 8000)`, mas vai aplicar projeção antes do `JSON.stringify` para reduzir custo e evitar campos não-serializáveis.

### 4. Tratamento amigável de 401 e 429 do middleware
- Em `canvas-ai-chat.tsx`:
  - No catch, detectar `Response`-like errors (status 401/429/503) e mapear para mensagens em PT-BR com link para `/login` (401) ou `/settings/billing` (429 plano excedido).
  - Mostrar badge "Sessão necessária" quando não autenticado, antes de tentar enviar.

### 5. Logs e diagnóstico
- Adicionar `console.error` no catch do server fn com `attempt`, `lastErr`, `tokensUsed` para que `server-function-logs` mostre causa raiz nas próximas tentativas.

### 6. Validação visual após o fix
- Abrir o chat no `/dashboard` workspace, enviar prompt curto ("Adicione um disjuntor 25A de tomada"), confirmar:
  - Patch aplicado no `WebglCanvas`;
  - Card de resultado renderiza sem crash;
  - Erro de cota mostra mensagem correta.

## Arquivos a modificar

- `src/components/canvas-ai-chat.tsx` — import `Button`, mapeamento de erros, projeção do `doc`.
- `src/lib/diagram/ai.functions.ts` — JSON schema manual, retries, timeout, logs.

## Fora do escopo desta correção (registrar para próximo loop)

- Migrar cota de IA do localStorage para `consume_ai_credits` (badge ainda lê localStorage).
- RLS pendentes (`comments`, `notifications`, `system_templates`, `realtime.messages`).
- Modbus error oracle (SSRF).
- Leaked Password Protection no Auth.
