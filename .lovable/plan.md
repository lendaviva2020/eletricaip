
## Escopo

Quatro frentes a entregar nesta iteração. A frente da IA é a maior — proponho um MVP funcional agora e marcos seguintes.

---

### 1. Auth — proteção de rotas e "Esqueci minha senha"

**Já existe** `AuthGate` em `src/routes/__root.tsx` que redireciona qualquer rota não pública para `/login`. Vou:

- Auditar a lista `PUBLIC_PATHS` e garantir que `/workspace`, `/projects`, `/analytics`, `/clients`, `/ai`, `/settings`, `/dashboard`, `/onboarding` exigem sessão.
- Trocar redirect lazy (`useEffect`) por `beforeLoad` no padrão TanStack `_authenticated` para evitar flash de conteúdo (opcional, mantenho o AuthGate atual se for menos invasivo).
- Criar `/forgot-password` (form de email → `supabase.auth.resetPasswordForEmail` com `redirectTo: ${origin}/reset-password`).
- Criar `/reset-password` (detecta `type=recovery` no hash, form de nova senha → `supabase.auth.updateUser({ password })`).
- Adicionar link "Esqueci minha senha" em `/login`.

### 2. Onboarding pós-login

Novo fluxo em `/onboarding`:

- Após login bem-sucedido, se o usuário não tem projetos na tabela `projects` (filtrada por `tenant_id`), redireciona para `/onboarding`.
- Tela com duas opções: **selecionar projeto existente** (lista) ou **criar novo** (nome, cliente, tipo).
- Ao confirmar, persiste `currentProjectId` em `localStorage` + `project-store` e navega para `/workspace`.
- Hook `useCurrentProject()` para todo o app.

### 3. Sidebar

Já contém Dashboard, Projetos, Industrial Workspace, IA Industrial, Analytics, Clientes, Configurações. Vou:

- Reordenar conforme pedido (Projetos → Workspace → IA → Analytics → Clientes).
- Destacar "IA Industrial" como item principal (badge "CORE").
- Adicionar indicador do projeto ativo no rodapé da sidebar.

### 4. IA Industrial — motor central (MVP nesta iteração)

Esta é a maior frente. Proposta de MVP agora e roadmap incremental.

**MVP nesta entrega:**

- **Edge Function `ai-industrial-architect`** (Lovable AI Gateway, modelo `google/gemini-2.5-pro` para reasoning pesado) que recebe um prompt em linguagem natural ("15 motores parafuso 500CV amônia, 20 condensadores com 2 motores cada") e devolve via tool calling um JSON estruturado:
  ```
  { transformer, ccm, motors[], condensers[], cables[], protections[], nodes[], edges[], rationale, calculations }
  ```
- **Web search opcional** dentro da edge function (tool `web_search` via gateway) quando o prompt pedir referências externas ("pesquise na web…").
- **Cálculos em memória**: corrente nominal por motor (P/(√3·V·cosφ·η)), soma de demanda, queda de tensão, dimensionamento de condutor por capacidade, escolha de disjuntor por curva, FS do transformador. Tudo em `src/lib/electrical-calc.ts` (puro TS, validável).
- **Aplicar resultado no projeto**: o JSON retornado é despejado direto no `project-store` (nodes + edges) e aparece simultaneamente em Unifilar, Ladder, FBD, SCADA e Twin (sincronização já existente).
- **Escolha do usuário**: após geração, modal "Visualizar como: Unifilar / Ladder / Ambos".
- **Painel lateral de componentes** no canvas (já existe parcialmente em `_industrial-node`): vou expandir com paleta arrastável categorizada — Power (transformador, disjuntor, contator, inversor), Mech (motor, bomba, válvula, esteira, condensador), Inst (PT100, pressão, vazão, nível), Safety (E-STOP, cortina), Comm (PLC, OPC-UA, Modbus). Drag-and-drop para o canvas já está ligado.
- **Chat IA contextual** em `/ai`: passa snapshot do projeto atual para a edge function, permite "analise erros", "otimize consumo", "adicione redundância" — IA responde editando o store via tool calls (`add_node`, `add_edge`, `update_param`, `remove_node`).

**Fora deste MVP (próximos marcos, peço confirmação antes):**

- Geração de PLC code IEC 61131-3 (ST/IL) exportável.
- Simulação física do Digital Twin com motor de física.
- Validação automática contra NBR 5410 / NR-10 com base de conhecimento (RAG sobre `normative_chunks` que já existe no schema).
- Manutenção preditiva com séries temporais reais.

---

### Banco de dados

Mudanças mínimas — uso tabelas que já existem (`projects`, `simulation_tags`, `ai_conversations`, `ai_messages`). Apenas garanto policies de leitura/escrita por `tenant_id` via `get_user_tenant_id()` (já existe).

### Arquivos principais a criar/editar

- `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`
- `src/routes/onboarding.tsx`
- `src/lib/current-project.ts` (hook + store)
- `src/lib/electrical-calc.ts` (cálculos puros)
- `src/components/component-palette.tsx` (paleta arrastável expandida)
- `supabase/functions/ai-industrial-architect/index.ts`
- `src/lib/ai-architect-client.ts` (chama edge fn, aplica resultado no store)
- Editar: `src/routes/__root.tsx`, `src/routes/login.tsx`, `src/routes/ai.tsx`, `src/components/app-sidebar.tsx`, `src/components/industrial-workspace.tsx`

### Pré-requisitos do usuário

1. **No Supabase Dashboard → Authentication → URL Configuration**: adicionar `https://id-preview--85619baf-31cc-4353-8b05-f9173122588d.lovable.app/reset-password` em "Redirect URLs". Sem isso o reset de senha não funciona.
2. Lovable AI Gateway já tem `LOVABLE_API_KEY` provisionado — sem ação necessária.

---

Posso começar pelo bloco 1+2+3 (auth, onboarding, forgot password, sidebar — entrega rápida, alto valor) e na sequência o bloco 4 (IA arquiteto). Confirma este plano?
