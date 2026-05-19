## Objetivo
Tornar o módulo de **Configurações** completo (5 páginas novas funcionais) e transformar a **Área do Cliente** num CRUD real persistido no Supabase, com busca, filtros e página de detalhe.

---

## 1. Settings — novas páginas

Criar 5 rotas filhas com formulários reais (persistência via `profiles` / `tenant_memberships` existentes ou Zustand quando puramente local de UI):

| Rota | Conteúdo |
|---|---|
| `/settings/profile` | Nome, avatar (upload Supabase Storage), telefone, cargo, idioma. Lê/grava em `profiles` via server functions. |
| `/settings/notifications` | Toggles por canal (email, in-app, push) e por evento (alarme crítico, falha de protocolo, novo membro). Persistido em `profiles.notification_prefs` (jsonb novo) ou Zustand+localStorage se evitar migration. |
| `/settings/security` | Trocar senha (`supabase.auth.updateUser`), sessões ativas, 2FA (placeholder com toggle real do enrollment), audit log recente lido de `audit_logs`. |
| `/settings/integrations` | Configuração avançada dos protocolos já listados (Modbus host/port, OPC-UA endpoint, MQTT broker/credenciais) — usa secrets do Supabase + tabela nova `integration_configs` por tenant. |
| `/settings/appearance` | Tema (claro/escuro/sistema), densidade, idioma, cor de destaque. Zustand persistido. |

Cards de Settings atualizados em `src/routes/settings.tsx` apontando para todas as rotas (já tem 3, faltam 5). Toggles de protocolo/normas continuam funcionando.

---

## 2. Área do Cliente — CRUD com Supabase

### Banco (1 migration)
Tabela nova `clients` por tenant + RLS por membership:

```text
clients
  id, tenant_id, name, sector, contact_name, email, phone,
  cnpj, address, website, logo_url, status (active|prospect|inactive),
  sla_pct, notes, created_by, created_at, updated_at
```

RLS:
- SELECT: membros do tenant
- INSERT/UPDATE/DELETE: roles `owner | admin | engineer` do tenant

Trigger `update_updated_at_column` (função já existe).

Tabela de junção opcional `client_projects` (client_id, project_id) — ou simplesmente coluna `projects.client_id`. **Decisão**: adicionar `client_id uuid` em `projects` (nullable) — mais simples, sem nova tabela.

### Server functions (`src/lib/clients.functions.ts`)
- `listClients({ search, sector, status })`
- `getClient({ id })` + projetos vinculados
- `createClient(payload)`
- `updateClient(id, payload)`
- `deleteClient(id)`
- `linkProjectToClient({ clientId, projectId })`

Todas com `requireSupabaseAuth`.

### UI
- `/clients` (refatorada): toolbar com busca, filtro por setor, filtro por status, botão **Novo cliente** abrindo `Dialog` com formulário. Grid de cards (igual visual atual) com menu de ações (Editar / Excluir / Ver detalhe). Estado vazio quando lista vazia.
- `/clients/$clientId` (nova): página de detalhe — header com logo, infos de contato, KPIs (nº projetos, SLA), aba "Projetos vinculados", aba "Notas", botão Editar.

### Hooks
- `useClients()` com TanStack Query: `useQuery(['clients', filters])`.
- Mutations com `invalidateQueries`.

---

## 3. Detalhes técnicos

- Form validação com `zod` (já no projeto) + `react-hook-form`.
- Upload de logo em bucket `client-logos` (público) — incluído na migration.
- Reaproveitar `Dialog`, `Input`, `Select`, `Textarea`, `Card` shadcn.
- Página de cliente usa Route param `$clientId` e loader gated no `_authenticated` (criar se não existir, ou fazer fetch no componente via `useQuery`).
- Segurança: nunca expor service role; todas as escritas via server fn com middleware.

---

## 4. Entregáveis

1. Migration: tabela `clients` + bucket `client-logos` + coluna `projects.client_id` + RLS.
2. `src/lib/clients.functions.ts` (6 server fns).
3. Refator `src/routes/clients.tsx` + nova `src/routes/clients.$clientId.tsx`.
4. `src/components/clients/client-form-dialog.tsx`, `client-card.tsx`.
5. 5 rotas novas em Settings + atualização dos cards na home de Settings.
6. `src/lib/appearance-store.ts`, `src/lib/notifications-store.ts` (Zustand) quando aplicável.

---

## Fora de escopo
- Importar clientes de CSV
- Integração CRM externa
- Faturamento por cliente
