# DATABASE INVENTORY — ELETRICAI INDUSTRIAL OS

Este documento apresenta a matriz completa do schema canônico do banco de dados PostgreSQL do ElétricAi no Supabase, mapeando todas as tabelas requeridas pelo código, sua finalidade, chaves, políticas RLS e status de sincronização remoto.

---

## 1. Resumo Executivo da Auditoria de Schema

- **Ambiente Remoto:** Supabase Project Ref `rvaaxvdimggztjxoktvy` (Região `sa-east-1`, Postgres 17).
- **Tabelas Encontradas no Banco Remoto:** 17 tabelas.
- **Tabelas Canônicas Requeridas pela Aplicação:** 55 tabelas.
- **Divergência Crítica:** As tabelas vitais de autenticação, multi-tenancy, projetos, diagramas, versões, IoT, telemetria e faturamento (`profiles`, `tenants`, `tenant_memberships`, `projects`, `diagrams`, `project_versions`, `invoices`, `subscriptions`, `tag_samples`, etc.) **NÃO EXISTEM** no banco remoto.
- **Causa Raiz Identificada:** As migrations locais pararam de ser sincronizadas com o banco remoto após a migration `20261012120000_complete_missing_tables`. As migrations subsequentes criadas localmente para consolidar o DDL ainda não foram aprovadas para execução remota.

---

## 2. Matriz Canônica de Tabelas

| # | Nome Canônico | Módulo / Domínio | Finalidade | Chave Primária | Relações (FKs) | RLS Ativo | Status Remoto | Ação Necessária |
|---|---------------|------------------|------------|----------------|----------------|-----------|---------------|-----------------|
| 1 | `profiles` | Identidade | Perfil público e vínculo ao tenant ativo | `id` (UUID → auth.users) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 2 | `tenants` | Multi-Tenancy | Organizações industriais isoladas | `id` (UUID) | - | Sim | **Ausente** | Criar DDL + RLS |
| 3 | `tenant_memberships` | Multi-Tenancy | Associação de usuários aos tenants com papéis | `(user_id, tenant_id)` | `user_id`, `tenant_id` | Sim | **Ausente** | Criar DDL + RLS |
| 4 | `invites` | Multi-Tenancy | Convites para novos engenheiros/operadores | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 5 | `tenant_settings` | Multi-Tenancy | Configurações de protocolos e segurança | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Presente** | Validar colunas |
| 6 | `platform_admins` | Segurança | Lista de administradores da plataforma | `user_id` (UUID) | `user_id` → `profiles` | Sim | **Presente** | Preservar |
| 7 | `projects` | Projetos | Plantas elétricas e projetos de engenharia | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 8 | `diagrams` | Editores | Diagramas unifilares e multifilares | `id` (UUID) | `project_id` → `projects` | Sim | **Ausente** | Criar DDL + RLS |
| 9 | `project_versions` | Projetos | Snapshots e histórico de revisões | `id` (UUID) | `project_id` → `projects` | Sim | **Ausente** | Criar DDL + RLS |
| 10 | `project_bom_items` | Projetos | Lista de materiais (BOM) exportável | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar colunas |
| 11 | `components_catalog` | Biblioteca | Catálogo técnico de dispositivos elétricos | `id` (UUID) | - | Sim | **Ausente** | Criar DDL + RLS |
| 12 | `custom_components` | Biblioteca | Componentes criados pelo usuário | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 13 | `system_templates` | Projetos | Modelos padronizados de plantas industriais | `id` (UUID) | - | Sim | **Ausente** | Criar DDL + RLS |
| 14 | `unifilar_ladder_mapping` | Automação | Vínculo entre unifilar e lógica Ladder | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar RLS |
| 15 | `electrical_simulation_results` | Engenharia | Resultados de curto-circuito, fluxo e arc-flash | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar RLS |
| 16 | `test_scenarios` | Automação | Cenários de validação lógica de CLP | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar RLS |
| 17 | `test_scenario_runs` | Automação | Execução e histórico de testes de CLP | `id` (UUID) | `scenario_id` → `test_scenarios` | Sim | **Presente** | Validar RLS |
| 18 | `user_function_block_templates` | Automação | Blocos FBD IEC 61131-3 personalizados | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 19 | `api_keys` | IoT / SCADA | Chaves com hash SHA-256 para ingestão de dados | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 20 | `iot_devices` | IoT / SCADA | Equipamentos físicos cadastrados (PLCs, RTUs) | `id` (UUID) | `project_id` → `projects` | Sim | **Ausente** | Criar DDL + RLS |
| 21 | `tag_samples` | IoT / SCADA | Telemetria histórica agregada de variáveis industriais | `id` (UUID) | `project_id` → `projects` | Sim | **Ausente** | Criar DDL + RLS |
| 22 | `iot_alerts` | SCADA | Alarmes de processo padrão ISA-18.2 | `id` (UUID) | `tenant_id`, `project_id` | Sim | **Ausente** | Criar DDL + RLS |
| 23 | `iot_command_log` | SCADA | Auditoria de comandos enviados aos atuadores | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 24 | `twin_hotspots` | Digital Twin | Sensores 3D vinculados a tags no modelo | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar RLS |
| 25 | `ai_credit_costs` | SaaS / IA | Custos em créditos por operação de IA | `operation` (Text) | - | Sim | **Presente** | Preservar |
| 26 | `ai_usage_events` | SaaS / IA | Registro de consumo de tokens e créditos | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Presente** | Validar RLS |
| 27 | `ai_rate_limit_configs` | SaaS / IA | Limites de RPM e cotas de requisição de IA | `tenant_id` (UUID) | `tenant_id` → `tenants` | Sim | **Presente** | Preservar |
| 29 | `ai_status_events` | IA | Monitoramento de latência e saúde de provedores | `id` (UUID) | - | Sim | **Presente** | Preservar |
| 30 | `ai_electrical_config` | IA | Parâmetros de engenharia para prompts de IA | `tenant_id` (UUID) | `tenant_id` → `tenants` | Sim | **Presente** | Validar RLS |
| 31 | `voltai_feedback_votes` | IA | Avaliações de precisão de circuitos gerados | `id` (UUID) | `user_id` → `profiles` | Sim | **Ausente** | Criar DDL + RLS |
| 32 | `invoices` | Faturamento | Faturas e recibos de pagamento | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS Estrito |
| 33 | `subscriptions` | Faturamento | Assinaturas de workspace (Stripe/MercadoPago) | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS Estrito |
| 34 | `user_subscriptions` | Faturamento | Vínculo individual de planos de usuário | `id` (UUID) | `user_id` → `profiles` | Sim | **Ausente** | Criar DDL + RLS |
| 35 | `usage_records` | Faturamento | Agregação mensal de uso de recursos industriais | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 36 | `plan_limits` | Faturamento | Limites técnicos por plano SaaS | `plan` (Text) | - | Sim | **Ausente** | Criar DDL + RLS |
| 37 | `subscription_audit_log` | Faturamento | Auditoria de upgrades e cancelamentos | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Ausente** | Criar DDL + RLS |
| 38 | `deletion_requests` | LGPD | Solicitações de exclusão de dados (Art. 18 LGPD) | `id` (UUID) | `user_id` → `profiles` | Sim | **Presente** | Validar RLS |
| 39 | `notifications` | Plataforma | Avisos, menções e alertas do sistema | `id` (UUID) | `user_id` → `profiles` | Sim | **Presente** | Validar RLS |
| 40 | `clients` | Plataforma | Clientes finais vinculados aos projetos elétricos | `id` (UUID) | `tenant_id` → `tenants` | Sim | **Presente** | Validar RLS |
| 41 | `runtime_logs` | Automação | Logs de execução de scripts de SCADA em sandbox | `id` (UUID) | `project_id` → `projects` | Sim | **Presente** | Validar RLS |

---

## 3. Estruturas Auxiliares, Funções SQL e RPCs

- `public.get_user_tenant_id()`: Retorna o tenant ativo do usuário autenticado a partir de `profiles`.
- `public.get_user_role(target_tenant_id uuid)`: Retorna o papel (`owner`, `admin`, `engineer`, `operator`, `viewer`) na tabela `tenant_memberships`.
- `public.is_platform_admin()`: Checa se o `auth.uid()` consta em `platform_admins`.
- `public.consume_ai_credits(amount int, op text, model text)`: Debita créditos e registra evento atômico em `ai_usage_events`.
- Triggers `update_updated_at_column()` em todas as tabelas mutáveis.
