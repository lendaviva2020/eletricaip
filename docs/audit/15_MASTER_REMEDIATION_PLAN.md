# 15 — Plano Mestre de Remediação

Prazos não estimados (sem evidência para isso). A complexidade é justificada em cada tarefa. Categorias: **BUG** comprovado · **SUSP** suspeita · **DEBT** dívida técnica · **INC** incompleto · **SEC** segurança · **EXT** bloqueio externo.

## FASE 0 — Segurança e proteção (bloqueia tudo o mais)

| Tarefa | Cat. | Achado | Arquivos | Implementação | Testes / aceite | Complexidade | Depende de | Paralelo |
|---|---|---|---|---|---|---|---|---|
| F0.1 Rotacionar segredos | SEC/EXT | P0-SEC-020, P0-SEC-001 | painel Supabase, `.env`, Vercel | Rotacionar o JWT secret (migrar para chaves assimétricas), revogar o PAT `sbp_`, rotacionar service role, Stripe, MP, Upstash e Gemini por precaução | Tokens antigos retornam 401 | Média (operacional, exige o dono) | Acesso do proprietário | Não |
| F0.2 Purgar histórico | SEC | P0-SEC-020 | `docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json` | Remover e reescrever o histórico (filter-repo), force-push coordenado; redação automática de artefatos | `gitleaks detect --log-opts=--all` limpo | Média | F0.1 | Não |
| F0.3 Remover ramo HS256 | SEC | P0-SEC-020 | `auth-middleware.ts:160-174` | Aceitar só JWKS; HS256 apenas se explicitamente configurado e com `kid` | Teste: HS256 forjado → 401 | Baixa | — | Sim |
| F0.4 Isolar dev bypass | SEC | P1-SEC-002 | `auth-middleware.ts:119-134`, `auth-attacher.ts` | Remover do build de servidor | Teste de bundle sem `dev-access-token` | Baixa | — | Sim |
| F0.5 Corrigir `get_user_tenant_id` e o trigger de perfil (**P0 confirmado**) | SEC | P0-DB-005 | nova migration | Exigir membership; trigger BEFORE INSERT; criar profile em `auth.users` | Teste RLS de dois usuários (doc 08 §2) | Média (mudança transversal de RLS) | Supabase local | Não |
| F0.6 Gitleaks no CI | SEC | P0-SEC-020 | `.github/workflows/ci.yml` | Job gitleaks no repo inteiro | CI falha com segredo plantado | Baixa | — | Sim |
| F0.7 Convites | SEC/SUSP | P1-SEC-009 | `tenants.functions.ts:264-307` | Exigir `email_confirmed_at`; não rebaixar papel existente | Testes unitários | Baixa | Config Auth (EXT) | Sim |
| F0.8 CSP | SEC | P2-SEC-004 | `vercel.json` | Nonce ou hash em vez de `unsafe-inline`; revisar `*.upstash.io` | Teste de headers | Média | — | Sim |
| F0.10 Remover autorização por e-mail | SEC | P1-SEC-053 | `billing.functions.ts:102`, `ai-rate-limit-middleware.ts:21,94` | Apagar o atalho por e-mail; usar só a RPC `is_platform_admin` e um papel de cota | Teste: um JWT com esse e-mail e sem registro em `platform_admins` → forbidden | Baixa | — | Sim |
| F0.11 Claim `platform_role` | SEC | P0-SEC-020 (ampliação) | `fleet-auth-context.server.ts:63-72` | Confirmar o papel no banco (`is_platform_admin`), não pela claim | Teste com claim forjada → papel normal | Baixa | F0.3 | Sim |
| F0.9 Sandbox SCADA | SEC | P2-SEC-034 | `scada-worker.ts` | Interpretador restrito ou worker sem rede (bloquear `fetch`/`importScripts`) | Script com `fetch` falha | Média | — | Sim |

## FASE 1 — Integridade de dados e arquitetura
- F1.1 Restaurar o schema base no repo (`supabase db dump` do remoto, autorizado pelo dono) → P1-DB-006. Complexidade média. EXT.
- F1.2 Consolidar policies legadas por tabela (P2-DB-007), com testes de RLS em matriz completa (doc 08 §4). Alta: 112 tabelas.
- F1.3 Corrigir o typecheck, lint e format (P1-TYPE-036, P2-LINT-040) até o CI ficar verde. Baixa/média.
- F1.4 Fonte única para `IS_PHYSICAL_CONTROL_ALLOWED` (P2-ARCH-001) e um único webhook Stripe (P2-ARCH-018). Baixa.
- F1.5 Definir SSOT de projeto e diagrama após o lote B6 (P2-ARCH-037). INC; complexidade a definir.
- F1.6 Esclarecer o `SUPABASE_SERVICE_ROLE_KEY` local (P1-CFG-021). Baixa. EXT.
- F1.7 **Impedir a perda por snapshot inválido** (P1-DATA-044): no load, em caso de falha de parse, retornar erro tipado e bloquear o autosave, nunca `EMPTY_SNAPSHOT` com a versão real. Teste: um `canvas_data` inválido não pode ser sobrescrito. Baixa. **Prioridade máxima da Fase 1.**
- F1.8 Concorrência atômica no save (P1-DATA-043): `UPDATE … WHERE id = $1 AND version = $expected RETURNING version` (ou RPC); `expectedVersion` obrigatório; o restore incrementa a versão (P2-DATA-045); `version_number` por sequência ou lock. Teste com dois saves concorrentes. Média.
- F1.9 Persistir o projeto do Engineering Studio no servidor (P1-DATA-046) e o SCADA numa única fonte (P2-DATA-047); autor real a partir do usuário autenticado. Média/alta (depende de F1.5).

## FASE 2 — Motor de cálculos elétricos
1. F2.1 Suíte de referência independente (doc 05 §6), escrita **antes** das correções. Média.
2. F2.2 Corrigir as tabelas Iz (P1-CALC-023, P2-CALC-024) contra a NBR 5410:2004 oficial. Média. EXT (norma licenciada).
3. F2.3 ρ por temperatura e isolação; tensão coerente com fases (P1-CALC-022/026). Baixa.
4. F2.4 Queda de tensão acumulada com limites por origem e circuito, mais a partida de motores (P1-CALC-025). Alta (modelo novo de topologia).
5. F2.5 Estados de erro explícitos: sem seção, t > 5 s, T > 60 °C, entradas inválidas (P1-CALC-027, P2-CALC-028/029/032). Baixa.
6. F2.6 Material do condutor no Iz; η na demanda; premissas expostas na UI (P2-CALC-030/031, P3-CALC-033). Média.
7. F2.7 Unificar os motores de cálculo (P2-ARCH-038). Já está confirmada a divergência entre `multifilar.ts` e `electrical-calc.ts` (P1-CALC-050). O diagnóstico do canvas deve chamar `calcVoltageDrop` com os parâmetros reais do nó (cosφ, η, tensão, fases), corrigir a corrente de carga 3F (P1-CALC-051) e comparar sem arredondar antes (P2-CALC-052). Um alerta com premissa default não pode ter severidade "OK". Alta.

## FASE 4 (antecipada): comunicação industrial
- F4.1 Decidir o escopo (EXT, decisão do produto): ou implementar drivers reais **somente leitura** (Modbus TCP FC1..FC4, OPC UA com segurança obrigatória) e um transporte autenticado Edge→Cloud para uma rota existente, ou rotular explicitamente o edge daemon como simulador. Em qualquer caso, os logs e o `/healthz` não podem dizer "conectado" sem conexão real (P1-INC-048). Muito alta, se implementar.
- F4.2 Exigir SecurityPolicy ≠ None no OPC UA independentemente de `NODE_ENV` (P2-SEC-049). Baixa.

## FASES 3 a 8
Dependem dos lotes ainda não auditados. As tarefas serão detalhadas ao concluí-los:
- **Fase 3:** Canvas e diagramas (B6).
- **Fase 4:** Automação e runtime (B7).
- **Fase 5:** SCADA e alarmes (B8).
- **Fase 6:** IA. Já há tarefas: unificar provedores e credenciais (P2-AI-016), `assertProjectTenantAccess` no `streamChat` (P2-AI-013), sanitização efetiva (P3-AI-014), rate limit distribuído (P2-AI-017).
- **Fase 7:** UX e responsividade (navegação no browser).
- **Fase 8:** homologação completa (build, e2e, RLS, cálculos).

## Continuação da auditoria (necessária antes de declarar a cobertura integral)

| Lote | Escopo | Estado |
|---|---|---|
| B1 | Superfície de segurança | Ciclo 2: autorização de `projects`, `billing`, `catalog-import`, `security-monitor`, `tenant-settings`, `clients`, `alarm` e `fleet` verificada (middleware e RLS). Corpo integral pendente para `clients`, `alarm`, `diagnostics`, `export`, `ai-architect`, `electrical-sim`, `ai-usage` e `src/lib/security/*` |
| B3 | OT/edge | Ciclo 2: daemon, config, gateway-manager, drivers (I/O e escrita) e sync verificados; faltam `provisioning`, `signed-updates`, `remote-config`, `fleet-persistent-store`, `modbus/opcua-handlers` |
| B2 | Migrations | Parser automatizado feito; leitura humana integral pendente |
| B4 | IA | Parcial |
| B5 | Cálculos | `electrical-calc.ts` completo; demais módulos de cálculo pendentes |
| B6–B10 | Canvas, automação, SCADA, importação, restante | Pendentes |
| C | Build, e2e | Pendentes (build numa cópia isolada para não sobrescrever `.vercel/output`) |
| E | Navegação no browser | Pendente |

## Ciclo 3: tarefas adicionais
- F3.1 Importador: registrar issue para toda aresta descartada (P2-IMP-055); tipos desconhecidos viram nó "não classificado", excluído dos cálculos até confirmação (P2-IMP-056); remapear as arestas ao renomear ids duplicados. Baixa/média.
- F3.2 Confirmar com o usuário a porta preenchida automaticamente no reparo (P3-DIA-057). Baixa.
- F7.1 Header do workspace sem projeto: remover o breadcrumb fixo "Planta - Linha 03" (P3-UI-059). Baixa.
- **Desbloqueio de verificação:** subir um Supabase local (Docker) com o schema restaurado (F1.1) para testar canvas, persistência e RLS ponta a ponta. Pré-requisito do ciclo de homologação.

## Status de execução — Fase 0 (branch `fix/fase-0-seguranca`, não commitado)

| Tarefa | Status | Evidência |
|---|---|---|
| F0.1 Rotacionar segredos | **PENDENTE (dono)** | Ação no painel Supabase / Stripe / MP / Upstash / Google; revogar o PAT `sbp_` |
| F0.2 Purgar histórico | **PENDENTE (decisão do dono)** | Valor redigido na árvore atual (`docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json`); o histórico git ainda contém o valor e exige reescrita mais force-push |
| F0.3 Remover ramo HS256 | FEITO | `auth-middleware.ts`: só JWKS assimétrico ou `getUser` |
| F0.4 Bypass dev opt-in | FEITO | `isDevAuthAllowed()` exige `ELETRICAI_ALLOW_DEV_AUTH_BYPASS=true` e nega `VERCEL_ENV` production e preview; job E2E do CI recebe a flag; teste novo |
| F0.5 Isolamento multi-tenant | FEITO (local) | `supabase/migrations/20261115120000_fix_p0_tenant_isolation.sql`; `tools/rls-test.mjs` no Supabase local: 0 vazamentos e casos positivos ok (`test-out/rls-test-after-fix.txt`); bootstrap e criação de projeto ok. **Aplicar no remoto exige `supabase db push` pelo dono** |
| F0.6 Gitleaks no CI | FEITO | `.gitleaks.toml` + passo no `ci.yml`; árvore limpa, canários (`*_JWT_SECRET=`, `sbp_`) detectados, `.env` real gera 11 alertas |
| F0.7 Convites | FEITO | `acceptInviteByToken`: `requireActiveSession`, e-mail e confirmação vindos do GoTrue, sem rebaixar papel |
| F0.8 CSP sem `unsafe-inline` | FEITO (não commitado) | Nonce por requisição em `src/server.ts` → header interno → `router.tsx` (`ssr.nonce`); CSP aplicada às respostas HTML só em produção (Report-Only em dev); `'unsafe-inline'` removido de `script-src`; script de tema com nonce; `onclick` inline da página de erro removido. Build de produção servido localmente: 4 rotas com 100% dos `<script>` com o nonce correto, hidratação ok, 0 violações; script inline injetado **bloqueado** (`script-src-elem`) |
| F0.9 Sandbox SCADA | FEITO (não commitado) | Globais de rede e do canal de mensagens neutralizados em **toda a cadeia de protótipos** (`neutralizeGlobalsOnPrototypeChain`); asset do worker com CSP própria `default-src 'none'; connect-src 'none'`. Teste no Chromium: a técnica antiga deixava `fetch` acessível via protótipo; a nova bloqueia fetch, WebSocket, XHR, EventSource, BroadcastChannel e postMessage, e scripts legítimos continuam funcionando |
| F0.10 Sem autorização por e-mail | FEITO | `billing.functions.ts`, `ai-rate-limit-middleware.ts`: só RPC `is_platform_admin`; 0 ocorrências do e-mail em `src/` |
| F0.11 Claim `platform_role` | FEITO | `fleet-auth-context.server.ts` confirma no banco; teste `audit-f0-11-fleet-platform-admin.test.ts` |

Verificação: vitest 166 arquivos, 1.376/1.376; typecheck sem erros novos (os 25 erros pré-existentes de IA permanecem, F1.3); lint e prettier ok nos arquivos alterados.
**Observação:** o owner perde a isenção de cota por e-mail; ele precisa estar em `public.platform_admins` (a linha foi inserida pela migration `20260518170000`; o estado no remoto não foi verificado).

**Decisão do proprietário (F0.9): liberar `'unsafe-eval'` só no worker.** A CSP do asset `/assets/scada-worker-*` permite `'unsafe-eval'` para o `new Function` dos scripts SCADA, sempre com `default-src 'none'`, `connect-src 'none'` e `worker-src 'none'`. O teste red team `gate-4-3-redteam-security-regression.test.ts` foi ajustado para proibir `'unsafe-eval'` em todas as outras regras e para exigir essa contenção na regra do worker. Validado no build de produção local: scripts legítimos executam e nenhum global de rede fica alcançável. A substituição por um interpretador AST (#SCADA-02) continua recomendada no longo prazo.

## Status de execução — Fase 1 (branch `fix/fase-1-integridade`, a partir de `fix/fase-0-seguranca`)

| Tarefa | Status | Evidência |
|---|---|---|
| F1.7 Snapshot inválido não sobrescreve | FEITO | `loadProject`/export lançam `SNAPSHOT_INVALID: <campos>` em vez de devolver `EMPTY_SNAPSHOT`; o restore valida o snapshot; `use-project-persistence.ts` bloqueia autosave, flush e "sobrescrever" até um load bem-sucedido (`skip:not-loaded`) |
| F1.8 Save atômico | FEITO | `UPDATE diagrams … WHERE id = $1 AND version = $lida`; 0 linhas viram `VERSION_CONFLICT`. Supabase local: **0 de 50** saves perdidos (antes 41), exatamente 1 aceito por rodada. O restore incrementa a versão. `snapshotVersion` sem `force`. Migration `20261115130000` cria o índice único `(project_id, version_number)` só se não houver duplicatas; numeração com retentativa e espera aleatória: 8/8 saves concorrentes sem duplicata (3 execuções) |
| F1.3 CI verde | FEITO | typecheck 0 erros (antes 25: tipos não serializáveis `Record<string, unknown>` → `Json` nos retornos de IA; guarda de tipo em `settings.ai-status.tsx`); prettier ok; eslint 0 erros (1 aviso antigo) |
| F1.4 Fonte única da trava física e do webhook Stripe | FEITO | `src/lib/safety/physical-control.ts` (os 6 módulos reexportam; teste garante uma única declaração). Webhook Stripe: o dono confirmou que o endpoint cadastrado é a rota `/api/public/stripe/webhook`; a Edge Function `supabase/functions/stripe-webhook` e o deploy no CI foram removidos, e um teste garante um único receptor. **Ação do dono:** `supabase functions delete stripe-webhook`, se ela ainda estiver publicada |
| F1.1 Schema base no repo | PENDENTE (dono) | Exige `supabase db dump` do remoto |
| F1.2 Consolidar policies legadas | PENDENTE | Alta (112 tabelas); exige matriz de testes RLS |
| F1.5 / F1.9 SSOT do projeto e Studio no servidor | PENDENTE | Alta; depende de decisão de modelo |
| F1.6 `SUPABASE_SERVICE_ROLE_KEY` local | PENDENTE (dono) | A chave local é a anon |

Testes: vitest 168 arquivos, 1.391/1.391. O mock de `persistence-concurrency-conflict.test.ts` foi atualizado para o UPDATE condicional (aplica os filtros `id` e `version` como o Postgres).

## Status de execução — Fase 2 (branch `fix/fase-2-calculos`, a partir de `fix/fase-1-integridade`)

| Tarefa | Status | Evidência |
|---|---|---|
| F2.1 Suíte de referência | FEITO | `src/lib/__tests__/electrical-calc.reference.test.ts` (37 testes): valores calculados à mão e referência IEC 60364-5-52 (B.52.2–B.52.5), equivalente à NBR 5410 Tab. 36/37 para A1–C. Escrita antes das correções: falhou em 17 pontos e agora passa inteira |
| F2.2 Tabelas Iz | FEITO (A1–C) | Só reduções: PVC/C/3c ≥ 25 mm² corrigido (35 mm² = 119 A, antes 125 A); XLPE/C/3c 6/10/16 mm² reduzidos. Teste garante que nenhum valor A1–C fica acima da referência. **Pendente:** conferir D, E e F contra a NBR 5410 oficial (os valores atuais são menores, portanto conservadores) |
| F2.3 Resistividade e tensão | FEITO | ρ(θ) = ρ20·[1 + α(θ − 20)] na temperatura de serviço da isolação (Cu/PVC 70 °C ≈ 0,02063); monofásico sem tensão usa 220 V; `RHO_COPPER_OHM_MM2_PER_M` passa a valer o valor a 70 °C |
| F2.4 Queda acumulada | FEITO (canvas) | `calculateVoltageDropNbr5410`: acumulado desde a origem (7% com transformador/gerador próprio, 5% BT como premissa), trecho terminal ≤ 4%; corrente do alimentador = soma das cargas a jusante; ligações sem comprimento declarado não somam metros fictícios ao acumulado. `nbr5410VoltageDropLimits()` no motor |
| F2.5 Estados de erro | FEITO | `status: "NO_SECTION_SATISFIES"`; k_t = 0 acima da tabela; I²t sem truncar t (`adiabaticValid`); `minCommercialSectionShortCircuit` lança em vez de devolver 300 mm²; `RangeError` para NaN, zero e negativos; seção não comercial usa a tabelada inferior; alumínio não tabelado lança |
| F2.6 Demanda | FEITO | P/η por motor (`totalElectrical_kW`) |
| F2.7 Motor único | FEITO | `src/lib/diagram/circuit-current.ts` é a fonte única de corrente por nó (motor via `motorNominalCurrent`; carga trifásica P/(√3·U·fp)); `multifilar.ts` e `rules-catalog.ts` usam `calcVoltageDrop`; margem sobre valores não arredondados; resultado com dado de entrada ausente vira AVISO, nunca OK |

Testes antigos ajustados aos valores corretos (com justificativa no código): `pickCable_mm2(100)` → 50 mm²; Iz C 35 mm² → 119 A; orquestrador escolhe 10 mm² (6 mm² dá 3,996%, no limite); canvas exige 4% só em trechos terminais. Vitest 170 arquivos, 1.435/1.435; typecheck 0; prettier e eslint ok.
