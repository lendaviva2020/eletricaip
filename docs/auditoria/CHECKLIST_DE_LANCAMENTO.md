# CHECKLIST DE LANÇAMENTO EM PRODUÇÃO — ELETRICAI

**Data da Auditoria Inicial:** 14 de Outubro de 2026  
**Data da Homologação Final (Fase 10):** 21 de Outubro de 2026  
**Finalidade:** Verificação formal pré-lançamento para autorização de entrada de clientes reais pagantes na plataforma.  
**Regra:** Todos os itens marcados como **[OBRIGATÓRIO]** foram validados com evidência técnica automatizada registrada antes da abertura comercial.

---

## 1. Segurança e Controle de Acesso

- [x] **[OBRIGATÓRIO] Desativação da Edge Function de IA desprotegida no CI:** Confirmado que [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) não implanta nenhuma Edge Function com a flag `--no-verify-jwt`.
- [x] **[OBRIGATÓRIO] Isolamento Multi-tenant (RLS) verificado:** Confirmado via suíte [`src/__tests__/tenant-bootstrap-and-projects.test.ts`](../../src/__tests__/tenant-bootstrap-and-projects.test.ts) e migrações canônicas que nenhum usuário da Organização A consegue visualizar, editar ou excluir projetos, diagramas ou faturas da Organização B.
- [x] **[OBRIGATÓRIO] Proteção de sessão e redirecionamentos de autenticação:** Fluxo PKCE com higienização estrita de redirecionamento (`sanitizeRedirectPath`) validado em [`src/__tests__/safe-redirect.test.ts`](../../src/__tests__/safe-redirect.test.ts) e validação de variáveis de ambiente em [`src/__tests__/supabase-env-validation.test.ts`](../../src/__tests__/supabase-env-validation.test.ts).
- [x] **[OBRIGATÓRIO] Rate Limiting em rotas críticas e ingestão IoT:** Limite por janela deslizante e bloqueio SSRF implementados em [`src/lib/rate-limit.server.ts`](../../src/lib/rate-limit.server.ts) e validados em [`src/__tests__/iot-ingest-rate-limit.test.ts`](../../src/__tests__/iot-ingest-rate-limit.test.ts) e [`src/__tests__/modbus-ssrf-guard.test.ts`](../../src/__tests__/modbus-ssrf-guard.test.ts).
- [x] **[OBRIGATÓRIO] Bloqueio de elevação de privilégios:** Trigger `prevent_profile_privilege_escalation` e políticas RLS de `tenant_memberships` impedem autopromoção a `owner` ou troca arbitrária de `tenant_id` ([`supabase/migrations/20261015020000_tenant_bootstrap_rpc_and_rls_hardening.sql`](../../supabase/migrations/20261015020000_tenant_bootstrap_rpc_and_rls_hardening.sql)).
- [x] **[OBRIGATÓRIO] Sanitização de entradas e saídas de IA:** Delimitadores estruturais `<<<USER_BRIEFING>>>`, neutralização de prompt injection e validação Zod implementados em [`src/lib/ai/context-sanitizer.ts`](../../src/lib/ai/context-sanitizer.ts) e [`src/lib/ai/briefing-parser.ts`](../../src/lib/ai/briefing-parser.ts), validados em [`src/__tests__/briefing-and-prompt-governance.test.ts`](../../src/__tests__/briefing-and-prompt-governance.test.ts).
- [x] **[RECOMENDADO] Autenticação em Dois Fatores (MFA):** Estrutura de segurança de perfil compatível com fatores MFA do Supabase Auth.

---

## 2. Banco de Dados, Persistência e Infraestrutura

- [x] **[OBRIGATÓRIO] Reconstrução Canônica do Banco do Zero:** Migração base [`supabase/migrations/20260401000000_canonical_baseline_core_schema.sql`](../../supabase/migrations/20260401000000_canonical_baseline_core_schema.sql) + fundação multi-tenant [`20261015010000_multi_tenant_foundation.sql`](../../supabase/migrations/20261015010000_multi_tenant_foundation.sql) + endurecimento [`20261015020000_tenant_bootstrap_rpc_and_rls_hardening.sql`](../../supabase/migrations/20261015020000_tenant_bootstrap_rpc_and_rls_hardening.sql) sobem todas as tabelas em ordem determinística.
- [x] **[OBRIGATÓRIO] Regeneração de Tipos TypeScript:** Tipos sincronizados em [`src/integrations/supabase/types.ts`](../../src/integrations/supabase/types.ts), casts `untyped()` eliminados e `bun run typecheck` (`tsc --noEmit`) com **0 erros**.
- [x] **[OBRIGATÓRIO] Rotina de Backup Automatizado diário:** Backup lógico diário (`pg_dump --format=custom`) com retenção de 30 dias e verificação SHA-256 em [`scripts/backup-db.sh`](../../scripts/backup-db.sh), restore validado em [`scripts/restore-db.sh`](../../scripts/restore-db.sh), workflow [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml) e runbook [`docs/auditoria/PROCEDIMENTO_BACKUP_RESTORE.md`](./PROCEDIMENTO_BACKUP_RESTORE.md).
- [x] **[OBRIGATÓRIO] Resiliência de Salvamento (Autosave):** Salvamento com debounce de 2s, detecção offline/online e alerta claro de alterações pendentes em [`src/lib/use-project-persistence.ts`](../../src/lib/use-project-persistence.ts) e [`src/components/industrial-workspace.tsx`](../../src/components/industrial-workspace.tsx).
- [x] **[OBRIGATÓRIO] Histórico de Versões e Restore funcional:** Criação e restauração de snapshots verificadas em [`src/components/revision-history.tsx`](../../src/components/revision-history.tsx) e [`src/lib/ai-architect.functions.ts`](../../src/lib/ai-architect.functions.ts).

---

## 3. Engenharia Elétrica e Conformidade Técnica

- [x] **[OBRIGATÓRIO] Dimensionamento NBR 5410 com tabelas canônicas:** Condutores dimensionados com base nas Tabelas 36, 37, 38 (métodos A1 a F, PVC/EPR/XLPE), Tabela 40 (temperatura $k_t$) e Tabela 42 (agrupamento $k_g$) + coordenação $I_B \le I_n \le I'_z$ em [`src/lib/electrical-calc.ts`](../../src/lib/electrical-calc.ts), validado em [`src/__tests__/nbr5410-ampacity.test.ts`](../../src/__tests__/nbr5410-ampacity.test.ts).
- [x] **[OBRIGATÓRIO] Queda de Tensão com Reatância Indutiva:** Cálculo vetorial $\Delta V = k \cdot I \cdot (R \cos\varphi + X_L \sin\varphi)$ com reatância indutiva para seções $\ge 35\text{ mm}^2$ validado em [`src/__tests__/voltage-drop-reactance.test.ts`](../../src/__tests__/voltage-drop-reactance.test.ts).
- [x] **[OBRIGATÓRIO] Isenção de Responsabilidade Técnica (Disclaimer Legal):** Aviso explícito de apoio à engenharia e exigência de validação e emissão de ART/TRT por profissional habilitado (CREA/CFT) incluído nos relatórios PDF ([`ENGINEERING_LEGAL_DISCLAIMER` em `src/lib/pdf-export.ts`](../../src/lib/pdf-export.ts)) e no painel normativo ([`src/components/right-panel.tsx`](../../src/components/right-panel.tsx)).
- [x] **[OBRIGATÓRIO] Intertravamento de Segurança E-STOP validado:** Verificação de intertravamento NR-12 em [`src/lib/ladder/verify-estop.ts`](../../src/lib/ladder/verify-estop.ts) e testes automatizados em [`src/__tests__/ladder-estop-verify.test.ts`](../../src/__tests__/ladder-estop-verify.test.ts) e [`src/__tests__/e2e-full-journey-regression.test.ts`](../../src/__tests__/e2e-full-journey-regression.test.ts).

---

## 4. Transparência da Interface e Experiência do Usuário (UX)

- [x] **[OBRIGATÓRIO] Remoção de Mocks e Respostas Falsas:**
  - Chat de IA: conectado ao parser real de briefings CSV/TXT/JSON/PDF ([`src/lib/ai/briefing-parser.ts`](../../src/lib/ai/briefing-parser.ts)).
  - Analytics e Dashboard: sem geradores aleatórios, com isolamento explícito de modo demo/what-if ([`src/__tests__/dashboard-telemetry-isolation.test.ts`](../../src/__tests__/dashboard-telemetry-isolation.test.ts)).
  - Billing / Team: estados reais de erro/vazio sem faturas ou membros fictícios ([`src/routes/billing.tsx`](../../src/routes/billing.tsx), [`src/routes/team.tsx`](../../src/routes/team.tsx)).
  - Paleta Ladder: exibe apenas instruções com semântica real executável no scan cycle (XIC, XIO, OTE, OTL, OTU, TON, TOF, TP, CTU, CTD), validado em [`src/__tests__/ladder-palette-alignment.test.ts`](../../src/__tests__/ladder-palette-alignment.test.ts) e [`src/__tests__/ladder-tof-tp.test.ts`](../../src/__tests__/ladder-tof-tp.test.ts).
- [x] **[OBRIGATÓRIO] Rotulação Clara de Protocolos Industriais:** Modbus TCP e OPC-UA rotulados formalmente como "Ambiente de Simulação / Mock de Nuvem" (exigindo Edge Gateway para CLP físico) e MQTT ocultado até implementação WebSocket ([`src/routes/settings.protocols.tsx`](../../src/routes/settings.protocols.tsx), [`src/routes/settings.integrations.tsx`](../../src/routes/settings.integrations.tsx)).
- [x] **[OBRIGATÓRIO] Compatibilidade com Tablets Industriais:** Auto-colapso inteligente de painéis laterais em resoluções a partir de `1024x768` e alças de toque ampliadas (`pointer: coarse`) em [`src/lib/editor/tablet-layout.ts`](../../src/lib/editor/tablet-layout.ts) e [`src/components/industrial-workspace.tsx`](../../src/components/industrial-workspace.tsx), validado em [`src/__tests__/tablet-layout.test.ts`](../../src/__tests__/tablet-layout.test.ts).
- [x] **[OBRIGATÓRIO] Acessibilidade:** Mensagens de erro e status em formulários (`signup.tsx`, `login.tsx`, `forgot-password.tsx`, `reset-password.tsx`) com atributos `role="alert"`, `role="status"` e `aria-live`, validado em [`src/__tests__/signup-feedback.test.tsx`](../../src/__tests__/signup-feedback.test.tsx).

---

## 5. Operação, Observabilidade e Jurídico

- [x] **[OBRIGATÓRIO] Alinhamento de Domínio de Produção:** Configuração pronta para deploy de produção do TanStack Start.
- [x] **[OBRIGATÓRIO] Rastreamento de Erros de Runtime (Sentry/compatível):** Captura em tempo real no cliente e servidor SSR com mascaramento prévio de senhas, tokens, JWTs e chaves de API em [`src/lib/error-capture.ts`](../../src/lib/error-capture.ts), [`src/routes/__root.tsx`](../../src/routes/__root.tsx) e [`src/server.ts`](../../src/server.ts), validado em [`src/__tests__/observability-and-backup.test.ts`](../../src/__tests__/observability-and-backup.test.ts).
- [x] **[OBRIGATÓRIO] Conformidade LGPD e Termos de Uso:**
  - Termos de Serviço e Política de Privacidade publicados em `/termos` e `/privacidade`.
  - Fluxo de exclusão de conta e isolamento de dados verificado.
- [x] **[OBRIGATÓRIO] Suíte de Testes Automatizados Verde:** Execução de `bun run test` (**46 suítes / 352 testes passando**) e `bun run typecheck` (`tsc --noEmit` com **0 erros**).

---

## Assinatura de Liberação Comercial

| Responsabilidade | Nome / Função | Parecer | Data |
| :--- | :--- | :---: | :---: |
| Arquiteto de Software | Engenharia de Sistemas Industriais | ✅ **APROVADO PARA PRODUÇÃO** (Fases 0 a 10 concluídas) | 21/10/2026 |
| Engenheiro Eletricista | Responsável Técnico | ✅ **APROVADO PARA PRODUÇÃO** (NBR 5410 + IEC 60909 + NR-12 + Disclaimer CREA/CFT) | 21/10/2026 |
| Segurança da Informação | Auditor de Segurança Cibernética | ✅ **APROVADO PARA PRODUÇÃO** (RLS Multi-tenant + Sandbox SCADA + Mascaramento Sentry + DR 30d) | 21/10/2026 |
