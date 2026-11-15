# 08 — Supabase e Isolamento Multi-Tenant

Método: parser estático (`tools/rls.mjs`) que percorre as 71 migrations em ordem e reconstrói, por tabela, CREATE, DROP, ENABLE RLS e o estado final das policies. Depois, leitura manual das funções e policies críticas.
Limitações: DO-blocks com `EXECUTE format()` só são capturados parcialmente; **o schema base não está no repositório** (11 migrations `remote_history_placeholder`), então o estado real do banco remoto é NOT_VERIFIED. Nenhum teste de RLS foi executado: a execução foi offline por decisão do usuário, e com Docker disponível é possível rodar um Supabase local num próximo ciclo.

## 1. Visão geral do modelo reconstruído

- 112 tabelas vivas detectadas; 38 funções, das quais 34 são `SECURITY DEFINER`. Todas as DEFINER detectadas declaram `search_path`.
- Tabelas de frota e edge (`fleet_*`, `gateway_certificates`, `provisioning_tokens`, `remote_configs`, `ota_*`, `edge_ingested_dedup`) têm RLS habilitada via loop dinâmico em `20261111180000` (linhas 154-200) e `20261112120000` (linhas 70-100). Tabelas de webhook e ledger: RLS + `REVOKE ALL` de anon/authenticated.
- `ota_signing_keys`: `GRANT SELECT TO authenticated` com RLS e sem policy, logo nada é legível (coerente).
- Leitura pública intencional (`USING (true)`): `plan_limits`, `blog_categories`, `electrical_components`, catálogos, `normative_*` (authenticated), `system_templates`, `ai_credit_costs`.

## 2. P1-DB-005 — o isolamento depende de `profiles.tenant_id`

```
get_user_tenant_id()  (20261014201000_core_tables_ddl.sql:1068-1085, SECURITY DEFINER)
  SELECT tenant_id FROM profiles WHERE id = auth.uid()   -- sem checar tenant_memberships
  fallback: primeira membership
```

Policies que dependem só dela (amostra do estado final): `projects` SELECT ("Tenant members can view projects", "Members can view tenant projects"), `tenants` SELECT, `profiles` SELECT (mesmo tenant), `tag_samples` SELECT, `tenant_memberships` SELECT, `invites` (junto com `get_user_role()`).

Proteções existentes:
- O trigger `profiles_prevent_escalation` (`20261015210000:66-106`) é **BEFORE UPDATE**: em UPDATE, desfaz a troca de `tenant_id` se não houver membership.
- **Lacuna:** a policy `"Users can insert own profile"` (`core_tables_ddl.sql:1151-1154`) só exige `id = auth.uid()`, e não há trigger BEFORE INSERT. Se o profile do usuário ainda não existir (a criação é lazy pela RPC `bootstrap_personal_tenant_if_missing`, chamada pelo cliente em `src/hooks/use-auth.tsx:177`), um usuário recém-criado pode inserir `profiles {id: self, tenant_id: <tenant alvo>}` direto via PostgREST. A partir daí `get_user_tenant_id()` devolve o tenant alvo, e ele passa a **ler projetos, tenant, perfis e tag samples desse tenant**. A escrita fica limitada porque `get_user_role()` exige membership.
- Pré-condições: conhecer o UUID do tenant alvo e o profile não ter sido criado antes por um trigger `handle_new_user` no `auth.users`. Esse trigger é referenciado em `20260515131608:146`, mas sua definição não está no repo (NOT_VERIFIED).

**Reprodução proposta (Supabase local):** criar o usuário A com tenant TA; criar o usuário B sem chamar o bootstrap; como B, `POST /rest/v1/profiles {id: B, tenant_id: TA}`; como B, `GET /rest/v1/projects` deve retornar zero linhas. **Correção:** em `get_user_tenant_id()`, exigir `EXISTS (membership)`; criar trigger BEFORE INSERT com a mesma regra do UPDATE; mover a criação de profile para trigger `AFTER INSERT ON auth.users`.

## 3. Outros achados

| ID | Sev. | Achado | Evidência |
|---|---|---|---|
| P1-DB-006 | P1 | Schema base ausente: o repositório não reconstrói o banco do zero, o que impede testes de RLS reprodutíveis e auditoria completa de tabelas originais | 11 arquivos `*_remote_history_placeholder.sql` |
| P2-DB-007 | P2 | Policies legadas e novas coexistem (permissivas combinam por OR): `projects` tem 8 policies de 3 migrations com papéis divergentes (`'admin'` × `'owner','admin'` × inclui `'operator','member'`). A semântica efetiva é sempre a mais permissiva | `rls_model.json` / migrations `20260906072900`, `20261014201000`, `20261111120000` |
| P2-DB-035 | P2 | Partições `tag_samples_YYYY_MM` recebem policies próprias; a criação de partições futuras depende da função `create_monthly_tag_samples_partition` + `apply_tag_samples_partition_rls` (não verificada) | `20260906072900` |
| INFO | — | `generate_bom_from_canvas_for_user` checa membership com papel `owner/admin/engineer` e só pode ser executada por `service_role` | `20260518183000:162-200,337-338` |
| INFO | — | `prevent_profile_privilege_escalation` também bloqueia troca de `role` e `id` em UPDATE por `authenticated`/`anon` | `20261015210000:75-94` |

## 4. Testes de RLS necessários (BLOCKED_BY_EXTERNAL_DEPENDENCY neste ciclo)

Matriz SELECT/INSERT/UPDATE/DELETE × {owner, admin, engineer, operator, viewer, não-membro, anon} para `projects`, `diagrams`, `project_bom_items`, `tenants`, `tenant_memberships`, `invites`, `profiles`, `ai_conversations`, `ai_messages`, `iot_*`, `tag_samples*`, `industrial_*`, `fleet_*`, `subscriptions`, `invoices`, mais o caso P1-DB-005 (INSERT de profile com tenant alheio). Ferramenta sugerida: `supabase start` + pgTAP ou um script Vitest com dois usuários.

## 5. Ciclo 4: testes reais em Supabase local (Docker)

**Ambiente:** Supabase CLI 2.120.0 + Docker 29.4.3, executado a partir de uma **cópia isolada** de `supabase/` no scratchpad (project_id `eletricai-audit-local`); o repositório não foi modificado. Serviços: Postgres, GoTrue e PostgREST (Kong). Usuários de teste `audit-{a,b,c}@example.test`, criados só no banco local.

**Migrations:** as **71 aplicaram sem erro** a partir de um banco vazio, porque `20261014201000_core_tables_ddl.sql` recria o schema base. P1-DB-006 fica **rebaixado para P2**: o banco local é reconstruível, mas a equivalência com o remoto continua NOT_VERIFIED, já que as 11 placeholders escondem o histórico real.

### P1-DB-005 → **P0-DB-005 CONFIRMADO: isolamento multi-tenant quebrado**

Saída de `tools/rls-test.mjs` (valores de id omitidos):

| Passo | Resultado |
|---|---|
| A cria tenant (bootstrap) e o projeto "Projeto Secreto A" | ok |
| B (outro tenant) lê projetos: baseline | 0 linhas de A |
| **B faz `UPDATE profiles SET tenant_id = <tenant A>` no próprio perfil** | **aceito** (o trigger não reverteu) |
| B lê projetos | **1 projeto de A vazado** |
| C (sem bootstrap, sem perfil) faz `INSERT profiles {id: C, tenant_id: <tenant A>}` | **aceito** |
| C lê projetos | **"Projeto Secreto A"** |
| C lê `tenants` de A / `profiles` de A | 1 linha / 3 perfis |
| C tenta `UPDATE projects` de A | 0 linhas (escrita bloqueada, porque `get_user_role()` exige membership) |

**Causa raiz (confirmada no banco):** `prevent_profile_privilege_escalation()` é `SECURITY DEFINER` com dono `postgres` (`pg_proc.prosecdef = t`). Dentro dela, `current_user` é `postgres` (medido com uma função de diagnóstico temporária, já removida). Por isso a condição `IF current_user IN ('authenticated','anon')` (`20261015210000:75`) **nunca é verdadeira** e o trigger não protege nada. Somado a `get_user_tenant_id()`, que confia em `profiles.tenant_id` sem checar membership, qualquer usuário autenticado lê projetos, tenant e perfis de **qualquer** tenant cujo UUID conheça.

**Correção:** (1) em `get_user_tenant_id()`, exigir `EXISTS (SELECT 1 FROM tenant_memberships WHERE user_id = auth.uid() AND tenant_id = p.tenant_id)`; (2) no trigger, usar `auth.role()`/`session_user` ou torná-lo `SECURITY INVOKER`, e cobrir `BEFORE INSERT OR UPDATE`; (3) restringir a policy de INSERT de `profiles` a `tenant_id IS NULL`. **Teste de aceite:** `tools/rls-test.mjs` deve resultar em 0 vazamentos nas três leituras.
