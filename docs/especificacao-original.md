# EletricAI — Especificação Completa de Engenharia para Desenvolvimento no Lovable

> **Documento de referência para engenheiros de software.**
> Siga as fases em ordem. Cada fase tem critérios de aceitação que devem ser atingidos antes de avançar.
> Plataforma-alvo: **Lovable** (React 18 + TypeScript + Vite + Supabase + TailwindCSS + shadcn/ui)

---

## SUMÁRIO

1. [Visão do Produto e Identidade](#1-visão-do-produto-e-identidade)
2. [Stack Tecnológico Definitivo](#2-stack-tecnológico-definitivo)
3. [Arquitetura do Sistema](#3-arquitetura-do-sistema)
4. [Schema do Banco de Dados (Supabase)](#4-schema-do-banco-de-dados-supabase)
5. [Design System e Identidade Visual](#5-design-system-e-identidade-visual)
6. [FASE 1 — Fundação e Autenticação](#fase-1--fundação-e-autenticação)
7. [FASE 2 — Dashboard e Gestão de Projetos](#fase-2--dashboard-e-gestão-de-projetos)
8. [FASE 3 — Editor: Módulo Unifilar](#fase-3--editor-módulo-unifilar)
9. [FASE 4 — Editor: Módulo Ladder](#fase-4--editor-módulo-ladder)
10. [FASE 5 — Editor: Módulo SCADA](#fase-5--editor-módulo-scada)
11. [FASE 6 — Assistente IA NexusMind](#fase-6--assistente-ia-nexusmind)
12. [FASE 7 — Simulação e Telemetria](#fase-7--simulação-e-telemetria)
13. [FASE 8 — Módulos FBD, Digital Twin e PLC](#fase-8--módulos-fbd-digital-twin-e-plc)
14. [FASE 9 — Planos, Pagamentos e Créditos de IA](#fase-9--planos-pagamentos-e-créditos-de-ia)
15. [FASE 10 — Exportação, Compartilhamento e Notificações](#fase-10--exportação-compartilhamento-e-notificações)
16. [Segurança — Checklist Invariante](#16-segurança--checklist-invariante)
17. [Testes e Qualidade](#17-testes-e-qualidade)
18. [Deploy e DevOps](#18-deploy-e-devops)
19. [Apêndice: Referências Técnicas e Normativas](#19-apêndice-referências-técnicas-e-normativas)
20. [PLANO DE CRESCIMENTO E EXPANSÃO TECNOLÓGICA (VISÃO FUTURA)](#20-plano-de-crescimento-e-expansão-tecnológica-visão-futura)

---

## 1. VISÃO DO PRODUTO E IDENTIDADE

### 1.1 Nome e Posicionamento
- **Nome do produto**: EletricAI Industrial OS
- **Tagline**: *"O Sistema Operacional Industrial com IA"*
- **Público-alvo primário**: Engenheiros eletricistas e de automação, técnicos industriais, estudantes de engenharia elétrica no Brasil
- **Diferencial**: Único Industrial OS em português com IA nativa especializada em normas ABNT/IEC, que unifica diagramas unifilares, Ladder, FBD, SCADA, Digital Twin e PLC numa única plataforma com simulação em tempo real.

### 1.2 Planos de Negócio

| Plano   | Preço/mês | Projetos | Créditos IA/mês | Tempo Real | Features Extras |
|---------|-----------|----------|-----------------|------------|-----------------|
| Free    | Grátis    | 3        | 10              | Não        | IA básica, PDF export, comunidade |
| Basic   | R$ 100    | 10       | 100             | Não        | IA padrão, PDF export, suporte email |
| Pro     | R$ 580    | Ilimitado| 250             | Sim        | IA avançada + Digital Twin, Realtime OPC-UA/Modbus, suporte prioritário |
| Premium | R$ 1.000  | Ilimitado| Ilimitado       | Sim        | Tudo do Pro + capacidade dedicada, SLA, integrações customizadas |

### 1.3 Custo de Créditos de IA por Operação

| Operação (operation key)          | Custo (créditos) | Descrição |
|-----------------------------------|-----------------|-----------|
| `generate_single_line`            | 1               | Geração de diagrama unifilar |
| `generate_panel`                  | 5               | Geração de painel elétrico completo |
| `generate_digital_twin`           | 10              | Geração de digital twin 3D |
| `analyze_safety`                  | 3               | Análise de segurança / NR-10 / NR-12 |
| `suggest_optimization`            | 2               | Sugestões de otimização |

> **Nota:** O Chat NexusMind usa um sistema de quota mensal (não custo por operação). Consumos são rastreados via tabela `usage_records` e função `check_ai_quota()`.

---

## 2. STACK TECNOLÓGICO DEFINITIVO

### 2.1 Frontend (TanStack Start)
```
- React 19 + TypeScript 5.8 (strict mode)
- Vite 7.x (build tool)
- TailwindCSS 4.x + shadcn/ui (componentes, New York style)
- TanStack Start — framework full-stack SSR
- TanStack Router v1 — roteamento file-based
- TanStack React Query v5 — server state, cache, mutations
- Zustand v5 — gerenciamento de estado global
- React Flow v11 — canvas de diagramas unifilar
- react-konva + Konva — canvas 2D para Digital Twin
- Three.js r184 + @react-three/fiber — módulo Digital Twin 3D
- Monaco Editor — editor de código SCADA/ST/Ladder
- Framer Motion — animações e micro-interações
- react-hook-form + Zod — validação de formulários
- date-fns — manipulação de datas
- Lucide React — ícones (consistentes, SVG)
- recharts — gráficos e analytics
- sonner — notificações toast
- jspdf — exportação PDF
- @monaco-editor/react — editor de código
- cmdk + vaul — componentes de comando/drawer
- Vitest — testes unitários
```

### 2.2 Backend (Supabase)
```
- Supabase Auth — autenticação (email/senha + Google OAuth)
- Supabase Database (PostgreSQL 15+) — dados principais
- Supabase Storage — arquivos (diagramas, PDFs, modelos 3D)
- Supabase Realtime — colaboração e simulação ao vivo
- Supabase Edge Functions (Deno) — lógica de IA, webhooks
- Row Level Security (RLS) — isolamento multi-tenant
- TanStack Server Functions — lógica de servidor (Cloudflare Workers)
```

### 2.3 Serviços Externos
```
- DeepSeek API — AI Engine (NexusMind + Industrial Architect)
- Stripe — pagamentos e assinaturas (via Edge Function + TanStack route)
- Mercado Pago — pagamentos alternativos (via TanStack route)
```

### 2.4 Estrutura de Pastas (TanStack Start)
```
src/
├── components/
│   ├── ui/                     # shadcn/ui primitives (60+ componentes)
│   ├── canvases/               # Todos os canvas de edição
│   │   ├── unifilar-canvas.tsx # Unifilar (VoltAI)
│   │   ├── ladder-canvas.tsx   # Ladder com rungs
│   │   ├── fbd-canvas.tsx      # Function Block Diagram
│   │   ├── scada-canvas.tsx    # SCADA/HMI
│   │   ├── twin-canvas.tsx     # Digital Twin 2D (Konva)
│   │   ├── twin-3d-viewer.tsx  # Digital Twin 3D (Three.js)
│   │   ├── plc-canvas.tsx      # PLC tag editor
│   │   ├── sim-canvas.tsx      # Simulação
│   │   ├── alarms-canvas.tsx   # Alarmes ISA-18.2
│   │   ├── konva-canvas.tsx    # Konva base canvas
│   │   ├── voltai-node.tsx     # Nó universal VoltAI
│   │   └── _industrial-node.tsx# Nó industrial genérico
│   ├── editor/
│   │   ├── left-sidebar-host.tsx    # Container sidebar esquerda
│   │   ├── right-property-panel.tsx # Painel de propriedades
│   │   ├── sidebars/               # Sidebars por módulo
│   │   │   ├── editor-unifilar-sidebar.tsx
│   │   │   ├── editor-ladder-sidebar.tsx
│   │   │   ├── editor-fbd-sidebar.tsx
│   │   │   ├── editor-scada-sidebar.tsx
│   │   │   ├── editor-plc-sidebar.tsx
│   │   │   ├── editor-sim-sidebar.tsx
│   │   │   ├── editor-twin-sidebar.tsx
│   │   │   └── sidebar-primitives.tsx
│   │   └── property-fields/
│   │       └── validated-param-field.tsx
│   ├── simulation/
│   │   └── watch-table.tsx     # Tabela de variáveis
│   ├── *.tsx top-level
│   │   ├── app-sidebar.tsx     # Sidebar de navegação
│   │   ├── topbar.tsx          # Barra superior
│   │   ├── bottom-panel.tsx    # Painel inferior
│   │   ├── mode-tabs.tsx       # Abas de módulos
│   │   ├── industrial-workspace.tsx # Workspace principal
│   │   ├── canvas-ai-chat.tsx  # Chat IA no editor
│   │   ├── runtime-status.tsx  # Status de runtime
│   │   ├── multiplayer-cursors.tsx # Cursores colaborativos
│   │   ├── revision-history.tsx # Histórico de versões
│   │   ├── share-modal.tsx     # Compartilhamento
│   │   ├── upgrade-modal.tsx   # Upgrade plano
│   │   ├── ai-credits-badge.tsx# Badge de créditos
│   │   ├── brand-bolt.tsx      # Logo
│   │   └── mobile-menu.tsx     # Menu mobile
├── routes/                     # Rotas file-based (TanStack Router)
│   ├── __root.tsx              # Layout raiz
│   ├── index.tsx               # Landing page
│   ├── login.tsx               # Login
│   ├── signup.tsx              # Cadastro
│   ├── forgot-password.tsx     # Esqueci senha
│   ├── reset-password.tsx      # Reset senha
│   ├── dashboard.tsx           # Dashboard
│   ├── workspace.tsx           # Editor industrial
│   ├── projects.tsx            # Lista de projetos
│   ├── catalog.tsx             # Catálogo de componentes
│   ├── chat.tsx                # Chat IA
│   ├── ai.tsx                  # NexusMind IA
│   ├── analytics.tsx           # Analytics
│   ├── realtime.tsx            # IoT/Realtime
│   ├── clients.tsx             # Clientes
│   ├── onboarding.tsx          # Onboarding
│   ├── settings.tsx            # Configurações (geral)
│   ├── settings.billing.tsx    # Faturamento
│   ├── settings.team.tsx       # Equipe
│   ├── settings.ai-status.tsx  # Status IA
│   ├── invite.$token.tsx       # Aceitar convite
│   ├── projects.$projectId.bom.tsx  # BOM do projeto
│   ├── projects.$projectId.export.tsx # Exportação
│   └── api/public/             # Webhooks públicos
│       ├── stripe.webhook.ts
│       ├── mp.webhook.ts
│       └── iot.ingest.ts
├── hooks/
│   ├── use-auth.tsx            # Autenticação (contexto)
│   ├── use-collab.ts           # Colaboração multiplayer
│   ├── use-mobile.tsx          # Detecção mobile
│   ├── use-notifications.ts    # Notificações
│   └── use-active-tenant.ts    # Tenant ativo
├── integrations/
│   └── supabase/
│       ├── client.ts           # Cliente Supabase configurado
│       ├── client.server.ts    # Cliente server-side
│       ├── types.ts            # Tipos gerados do banco
│       ├── env.ts              # Vars de ambiente
│       ├── auth-middleware.ts   # Middleware de auth para Server Functions
│       ├── auth-attacher.ts    # Attacher de sessão SSR
│       └── ai-rate-limit-middleware.ts # Rate limit IA
├── lib/
│   ├── utils.ts                # Utilitários gerais (cn, etc.)
│   ├── editor/
│   │   ├── store.ts            # Zustand: activeMode, tags, ladder/FBD data
│   │   └── property-schemas.ts # Schemas de propriedades
│   ├── voltai/                 # Motor de diagramas unifilares
│   │   ├── store.ts            # Zustand: componentes, edges, undo/redo
│   │   ├── component-definitions.ts # Definições de componentes IEC 60617
│   │   ├── symbols.ts          # Símbolos SVG
│   │   └── use-voltai-simulation.ts # Simulação VoltAI
│   ├── ladder/                 # Módulo Ladder (IEC 61131-3)
│   │   ├── types.ts            # Tipos Ladder
│   │   ├── definitions.ts      # Definições de elementos
│   │   ├── runtime.ts          # Runtime cíclico determinístico
│   │   └── compiler.ts         # Compilador para instruction list
│   ├── fbd/                    # Módulo FBD
│   │   ├── types.ts            # Tipos FBD
│   │   ├── runtime.ts          # Runtime determinístico
│   │   └── compiler.ts         # Compilador para ST
│   ├── plc/                    # Módulo PLC
│   │   ├── types.ts            # Tipos PLC
│   │   └── store.ts            # Zustand: variáveis, configuração
│   ├── simulation/
│   │   └── scada-engine.ts     # Engine SCADA com alarmes ISA-18.2
│   ├── project-store.ts        # Zustand: nós, edges, runtime industrial
│   ├── current-project.ts      # Projeto ativo (Zustand + localStorage)
│   ├── use-project-persistence.ts # Persistência com autosave
│   ├── projects.functions.ts   # Server functions CRUD projetos
│   ├── ai-architect-client.ts  # Client do AI Architect
│   ├── ai-architect.functions.ts # Server function: DeepSeek + RAG
│   ├── ai-chat.functions.ts    # Server function: Chat IA
│   ├── electrical-calc.ts      # Dimensionamento elétrico (NBR 5410)
│   ├── norm-validator.ts       # Validação normativa
│   ├── billing.functions.ts    # Server functions: assinaturas
│   ├── plans.ts                # Definições de planos
│   ├── catalog.functions.ts    # Server functions: catálogo
│   ├── bom.functions.ts        # Server functions: BOM
│   ├── export.functions.ts     # Server functions: exportação
│   ├── pdf-export.ts           # Geração PDF (jsPDF)
│   ├── dxf-export.ts           # Exportação DXF
│   ├── iot.functions.ts        # Server functions: IoT
│   ├── tenants.functions.ts    # Server functions: multi-tenant
│   ├── notification-service.ts # Serviço de notificações
│   ├── notification-store.ts   # Zustand: notificações
│   ├── runtime-client.ts       # Cliente runtime simulação
│   ├── workspace-data.ts       # Dados do workspace
│   ├── component-definitions.ts# Definições de componentes
│   ├── error-capture.ts        # Captura de erros
│   └── error-page.ts           # Página de erro
├── __tests__/
│   ├── electrical-calc.test.ts # Testes dimensionamento
│   ├── ladder-runtime.test.ts  # Testes runtime Ladder
│   └── fbd-runtime.test.ts     # Testes runtime FBD
├── styles.css                  # Estilos globais Tailwind
├── routeTree.gen.ts            # Gerado pelo TanStack Router
├── router.tsx                  # Configuração do router
├── server.ts                   # Entrypoint SSR
└── start.ts                    # Inicialização
```

---

## 3. ARQUITETURA DO SISTEMA

### 3.1 Diagrama de Camadas
```
┌───────────────────────────────────────────────────────────────────┐
│                      FRONTEND (TanStack Start)                    │
│  Routes → Components → Hooks → Server Functions → Supabase SDK   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Cloudflare Workers (TanStack Server Functions)            │   │
│  │  /ai-architect  /ai-chat  /stripe-webhook  /mp-webhook     │   │
│  │  /projects  /billing  /export  /iot-ingest  /catalog       │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTPS / WebSocket
┌──────────────────────────────▼────────────────────────────────────┐
│                         SUPABASE BACKEND                          │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │ Auth (JWT) │ │ Database     │ │ Storage      │ │ Realtime  │  │
│  │            │ │ (Postgres15) │ │ (S3-like)    │ │ (WS/PG)   │  │
│  └────────────┘ └──────────────┘ └──────────────┘ └───────────┘  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │           Edge Functions (Deno/TypeScript)               │    │
│  │  /ai-industrial-architect  /stripe-webhook               │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬────────────────────────────────────┘
                               │
                   ┌───────────┼──────────────┐
                   ▼           ▼              ▼
            DeepSeek API   Stripe API    Mercado Pago
          (NexusMind +    (Pagamentos   (Pagamentos
           Architect)      + Webhooks)    alternativos)
```

### 3.2 Estado Global (Zustand) — Stores Descentralizadas

O estado é dividido em **6 stores especializadas** (não uma monolítica):

```typescript
// lib/editor/store.ts — Estado do editor (modo, tags, ladder, FBD)
interface EditorStore {
  activeMode: WorkspaceMode;           // unifilar | ladder | fbd | scada | plc | twin | simulation | alarms
  selectedNodeId: string | null;
  tags: Record<string, EditorTag>;     // Tags compartilhadas (IEC 61131-3)
  rungs: LadderRung[];                 // Rungs do editor Ladder
  fbdNodes: any[];
  fbdEdges: any[];

  setActiveMode: (mode: WorkspaceMode) => void;
  upsertTag, removeTag, setTagValue, forceTagValue, releaseTag;
  setRungs, setFbdAll;
}
```

```typescript
// lib/voltai/store.ts — Diagrama Unifilar (VoltAI) com undo/redo
interface VoltaiStore {
  components: VoltaiDiagramComponent[]; // Componentes IEC 60617
  edges: VoltaiDiagramEdge[];           // Conexões (power | control | signal | neutral)
  selectedId: string | null;
  dirty: boolean;

  // Undo/Redo (stacks manuais)
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  addComponent, updateComponentParam, deleteSelected, rotateComponent;
  addEdge, setAll, simulateStep;
  alignComponents: (axis: 'horizontal' | 'vertical' | 'grid') => void;
}
```

```typescript
// lib/project-store.ts — Runtime industrial (SCADA, motores, sensores)
interface ProjectStore {
  nodes: IndustrialNode[];      // Nós da planta (breaker, motor, tank, sensor...)
  edges: IndustrialEdge[];      // Conexões (power | signal | pipe)
  selectedId: string | null;
  logs: RuntimeLog[];           // Log da simulação em tempo real

  addNode, updateNode, removeNode;
  addEdge, removeEdge;
  addLog, clearLogs;
}
```

Outras stores: `lib/current-project.ts` (projeto ativo), `lib/plc/store.ts` (config PLC), `lib/notification-store.ts` (notificações).

### 3.3 Fluxo de Dados para IA (2 caminhos)

**Caminho A — AI Architect (geração de painel completo):**
```
User prompt (texto / contexto do canvas)
         │
         ▼
ai-architect-client.ts (cliente)
  → RAG: busca trechos normativos (normative_chunks)
  → Cria mensagem com system prompt + contexto
         │
         ▼ (TanStack Server Function — Cloudflare Workers)
ai-architect.functions.ts:
  1. Validar JWT (middleware)
  2. Verificar créditos: consume_ai_credits('generate_panel')  → custa 5 créditos
  3. Chamar DeepSeek API (model: deepseek-chat, tool_choice, temperature: 0.3)
  4. Devolver JSON estruturado: { title, rationale, transformer, ccm, motors, nodes, edges }
         │
         ▼ (Frontend)
applyArchitectToStore():
  → projectStore: nós + edges (SCADA / físico)
  → voltaiStore: componentes + edges (Unifilar)
  → editorStore: rungs Ladder + tags (controle)
```

**Caminho B — AI Chat (conversacional):**
```
User message
         │
         ▼ (TanStack Server Function)
ai-chat.functions.ts:
  1. check_ai_quota() — valida cota mensal
  2. Busca histórico da conversa
  3. Chama DeepSeek API com streaming
  4. Persiste mensagens em ai_conversations + ai_messages
         │
         ▼ (Frontend)
  Renderização Markdown no chat
```

---

## 4. SCHEMA DO BANCO DE DADOS (SUPABASE)

O banco de dados utiliza PostgreSQL 15+ com **56 tabelas**, com suporte a **multi-tenant**, **RLS obrigatório** em todas as tabelas e **enum types** para dados categorizados. As migrations incrementais estão versionadas em `/supabase/migrations/` (14 arquivos .sql numerados por timestamp).

> **Nota:** O schema completo com todas as colunas e relações deve ser gerado via `supabase gen types --lang=typescript > src/integrations/supabase/types.ts`. O resumo abaixo lista as tabelas e seus propósitos.

### 4.1 Enums do Sistema

| Enum | Valores |
|------|---------|
| `subscription_plan` | `FREE`, `PRO`, `INDUSTRIAL` |
| `subscription_status` | `active`, `canceled`, `expired`, `trialing` |
| `alarm_category` | `process`, `equipment`, `safety`, `communication` |
| `alarm_severity` | `critical`, `high`, `medium`, `low`, `info` |
| `alarm_state` | `active`, `acknowledged`, `cleared`, `suppressed` |
| `alert_level` | `critical`, `warning`, `info` |
| `sensor_kind` | `temperature`, `pressure`, `current`, `vibration`, `flow` |
| `iot_command_state` | `PENDING`, `DELIVERED`, `ACKED`, `EXECUTED`, `FAILED`, `TIMED_OUT` |
| `simulation_tag_data_type` | `BOOL`, `INT`, `REAL` |
| `template_category` | `conveyor`, `pumping`, `exhaust`, `panel`, `hvac`, `tank_farm`, `custom` |

### 4.2 Tabelas

**Tenant & Usuários:**
| Tabela | Finalidade |
|--------|-----------|
| `tenants` | Organizações multi-tenant (plano, stripe_customer_id, subscription_status) |
| `tenant_memberships` | Membros do tenant com papel (admin, engineer, operator, viewer) |
| `profiles` | Perfil do usuário (tenant_id, role, avatar) |
| `platform_admins` | Lista de administradores da plataforma |
| `invites` | Convites pendentes para ingressar em tenant |

**Projetos & Diagramas:**
| Tabela | Finalidade |
|--------|-----------|
| `projects` | Projetos industriais (vinculados ao tenant) |
| `project_versions` | Snapshots de versões do projeto |
| `project_bom_items` | Lista de materiais (BOM) do projeto |
| `project_folders` | Organização de projetos em pastas |
| `diagrams` | Diagramas por módulo (unifilar, ladder, fbd, scada) |
| `comments` | Comentários em projetos |

**Catálogo de Componentes:**
| Tabela | Finalidade |
|--------|-----------|
| `catalog_components` | Componentes elétricos catalogados |
| `catalog_component_categories` | Categorias do catálogo |
| `catalog_manufacturers` | Fabricantes de componentes |
| `electrical_components` | Componentes elétricos com símbolos SVG IEC 60617 |
| `system_templates` | Templates de sistema industrial |

**AI & Conhecimento:**
| Tabela | Finalidade |
|--------|-----------|
| `ai_conversations` | Conversas do chat IA |
| `ai_messages` | Mensagens das conversas (role, content, tokens_used) |
| `ai_credit_costs` | Custo em créditos por operação de IA |
| `normative_chunks` | Trechos normativos (NBR 5410, NR-10, etc.) para RAG |
| `normative_documents` | Documentos normativos fonte |
| `knowledge_chunks` | Chunks de conhecimento geral |
| `knowledge_documents` | Documentos de conhecimento |
| `voltai_training_scenarios` | Cenários de treinamento VoltAI |
| `voltai_learning_logs` | Logs de aprendizado |
| `voltai_feedback_votes` | Feedback dos usuários sobre respostas IA |

**IoT & Telemetria:**
| Tabela | Finalidade |
|--------|-----------|
| `iot_devices` | Dispositivos IoT registrados |
| `iot_readings` | Leituras de sensores (Realtime pub/sub) |
| `iot_alerts` | Alertas de dispositivos IoT |
| `iot_command_log` | Histórico de comandos enviados |
| `api_keys` | Chaves de API para ingestão IoT |
| `plant_telemetry` | Telemetria da planta (restrita a service_role) |
| `tag_samples` | Dados de série temporal (particionado por mês) |
| `simulation_tags` | Tags de simulação |
| `simulations` | Sessões de simulação |
| `trend_configs` | Configuração de gráficos de tendência |
| `alarm_configs` | Configuração de alarmes (ISA-18.2) |
| `alarm_history` | Histórico de alarmes |

**Faturamento & Assinaturas:**
| Tabela | Finalidade |
|--------|-----------|
| `subscriptions` | Assinaturas Stripe |
| `invoices` | Faturas |
| `subscription_audit_log` | Log de alterações de plano |
| `billing_events` | Eventos de billing |
| `user_subscriptions` | Assinaturas legadas (usuário direto) |
| `plan_limits` | Limites por plano (max_projects, max_ai_tokens_month) |
| `usage_records` | Consumo de créditos de IA por tenant/mês |
| `stripe_webhook_events` | Idempotência de webhooks Stripe |
| `mp_webhook_processed` | Idempotência de webhooks Mercado Pago |

**Notificações & Conteúdo:**
| Tabela | Finalidade |
|--------|-----------|
| `notifications` | Notificações in-app por tenant |
| `feature_flags` | Flags de funcionalidades |
| `blog_posts` | Posts do blog institucional |
| `blog_categories` | Categorias do blog |
| `calculations` | Cálculos de engenharia salvos |
| `audit_logs` | Log de auditoria |
| `files` | Arquivos enviados |
| `file_versions` | Versões de arquivos |

### 4.3 Funções RPC (Row-Level Security)

```sql
-- Gerenciamento de créditos
check_ai_quota()                              -- Retorna cota atual do usuário
consume_ai_credits(p_operation text)           -- Decrementa créditos atomicamente (com FOR UPDATE)
get_ai_credits_remaining()                     -- Retorna créditos restantes
increment_ai_tokens(p_tokens integer)          -- Incrementa contador de tokens

-- Gerenciamento de tenant
bootstrap_personal_tenant_if_missing()         -- Cria tenant pessoal automático
get_user_tenant_id()                           -- Retorna ID do tenant do usuário
get_user_role()                                -- Retorna papel do usuário
change_tenant_plan(p_plan text)                -- Altera plano (apenas admin/platform_admin)
is_platform_admin()                            -- Verifica se é admin da plataforma
tenant_has_feature(p_feature text)             -- Verifica feature flag

-- IoT
ingest_iot_reading(...)                        -- Ingestão de leitura IoT
iot_acknowledge_alert(p_alert_id text)         -- Reconhecer alerta IoT
iot_enqueue_command(...)                       -- Enfileirar comando IoT

-- Projetos
generate_bom_from_canvas(p_project_id uuid)    -- Gera BOM automaticamente do canvas
accept_invite(p_token text)                    -- Aceitar convite de tenant
```

### 4.4 Migrations (14 arquivos)

Todas em `/supabase/migrations/`, numeradas por timestamp ISO:

| # | Arquivo | Foco |
|---|--------|------|
| 01 | `20260515131612...sql` | Trigger privilege escalation, RLS tightening |
| 02 | `20260515132406...sql` | RLS: voltai_training, iot_command, system_templates |
| 03 | `20260515143520...sql` | Helper `is_platform_admin()`, RLS feature_flags |
| 04 | `20260515151641...sql` | `check_ai_quota()`, `increment_ai_tokens()` |
| 05 | `20260515152911...sql` | INSERT/DELETE policies project_versions |
| 06 | `20260515153905...sql` | Invite flow: `accept_invite()`, privilege trigger |
| 07 | `20260515163007...sql` | Plan limits seed, RLS subscriptions/invoices |
| 08 | `20260515163238...sql` | `change_tenant_plan()` com enum casting |
| 09 | `20260515171052...sql` | **`ai_credit_costs` table**, `consume_ai_credits()`, plan_limits seed |
| 10 | `20260515171329...sql` | `change_tenant_plan()` final com audit log |
| 11 | `20260515172032...sql` | Realtime pub/sub IoT, `ingest_iot_reading()`, `iot_enqueue_command()` |
| 12 | `20260515172758...sql` | **`project_bom_items` table**, `generate_bom_from_canvas()` |
| 13 | `20260515173529...sql` | Lock change_tenant_plan to admins, tighten api_keys |
| 14 | `20260518000001...sql` | **`notifications` table** com RLS tenant-based |

---

## 5. DESIGN SYSTEM E IDENTIDADE VISUAL

### 5.1 Paleta de Cores (TailwindCSS v4 `@theme` em `src/styles.css`)

O tema é **dark-first** (apenas modo escuro) usando o espaço de cores perceptual **oklch()**:

```css
@theme inline {
  --radius: 0.5rem;

  --background:      oklch(0.16 0.01 35);   /* Fundo principal — azul-preto */
  --foreground:      oklch(0.96 0.005 60);   /* Texto primário */
  --panel:           oklch(0.19 0.012 35);   /* Fundo de painéis secundários */
  --card:            oklch(0.205 0.012 35);  /* Cards e modais */
  --popover:         oklch(0.21 0.013 35);   /* Popovers/dropdowns */

  --primary:         oklch(0.78 0.18 55);    /* Âmbar industrial — accent principal */
  --primary-foreground: oklch(0.15 0.02 40);

  --secondary:       oklch(0.26 0.014 30);
  --muted:           oklch(0.24 0.01 30);
  --muted-foreground: oklch(0.68 0.018 50);

  --accent:          oklch(0.32 0.06 50);
  --destructive:     oklch(0.66 0.22 25);    /* Vermelho — falha/erro */
  --success:         oklch(0.76 0.18 155);   /* Verde — energizado/ok */
  --warning:         oklch(0.82 0.17 80);    /* Amarelo — alerta */
  --info:            oklch(0.74 0.15 280);   /* Azul — informação */
  --energized:       oklch(0.86 0.2 90);     /* Verde vibrante — simulação ativa */

  --border:          oklch(0.3 0.014 40 / 0.7);
  --input:           oklch(0.26 0.012 35);
  --ring:            oklch(0.78 0.18 55);    /* Focus ring — âmbar */
  --grid:            oklch(0.3 0.014 40 / 0.35); /* Grid do canvas */

  --gradient-industrial: linear-gradient(135deg, oklch(0.22 0.02 40), oklch(0.16 0.012 35));
  --gradient-primary:    linear-gradient(135deg, oklch(0.78 0.18 55), oklch(0.7 0.2 30));
  --gradient-energized:  linear-gradient(90deg, oklch(0.86 0.2 90), oklch(0.78 0.18 60));
  --shadow-glow:         0 0 24px oklch(0.78 0.18 55 / 0.35);
  --shadow-panel:        0 8px 32px oklch(0 0 0 / 0.45);
}
```

### 5.2 Tipografia

```css
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

- **JetBrains Mono** — fonte monospace principal para código, labels de componentes, tags, e dados técnicos
- **UI system fonts** — demais elementos (botões, navegação, cards) usam fontes do sistema via Tailwind (Inter fallback)

> Nota: Ao contrário da especificação original, não são usadas Orbitron (display) nem DM Sans (UI). O design prioriza coerência técnica com JetBrains Mono + fontes do sistema.

### 5.3 Utilitários CSS e Canvas de Diagramas

```css
/* Glassmorphism — painéis flutuantes */
.glass        { background: oklch(0.2 0.012 35 / 0.55); backdrop-filter: blur(14px); }
.glass-strong { background: oklch(0.18 0.012 35 / 0.78); backdrop-filter: blur(18px); }

/* Grid industrial do canvas (28px, não 20px) */
.industrial-grid {
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 28px 28px;
}

/* Glow do accent primário */
.glow-primary { box-shadow: var(--shadow-glow); }
.text-glow    { text-shadow: 0 0 12px oklch(0.78 0.18 55 / 0.6); }

/* Animação de fluxo em edges (simulação) */
@keyframes flow-dash { to { stroke-dashoffset: -24; } }
.flow-line { stroke-dasharray: 6 6; animation: flow-dash 1.2s linear infinite; }

/* Pulsação de nós energizados */
@keyframes pulse-energy { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
.energized { animation: pulse-energy 1.4s ease-in-out infinite; }

/* Scan line animada em painéis */
@keyframes scan-line { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
.scan-overlay::after { animation: scan-line 4s linear infinite; }

/* ReactFlow — override de tema escuro industrial */
.react-flow__renderer { background: transparent; }
.react-flow__attribution { display: none !important; }
.react-flow__handle { border: 1px solid oklch(0.16 0.012 35) !important; }
```

### 5.4 Regras Visuais do Canvas

```
- Background: transparente com grid industrial (linhas, 28px) via .industrial-grid
- Nós em repouso: bg --card, border --border, texto --foreground
- Nó selecionado: border --ring (2px), box-shadow --shadow-glow
- Nó energizado (simulação): classe .energized com animação pulse + cor --energized
- Nó em falha: classe .animated pulse + cor --destructive
- Edge de fluxo: classe .flow-line com stroke-dasharray animado durante simulação
- Labels de nós: fonte JetBrains Mono, tamanho reduzido
- Painéis laterais: .glass ou .glass-strong com backdrop-filter blur
```

---

## FASE 1 — FUNDAÇÃO E AUTENTICAÇÃO

**Objetivo:** App funcional com auth (React Context + TanStack Router), routing file-based e shell do dashboard.
**Duração estimada:** Já implementado.

### Passo 1.1 — Setup do Projeto
1. Projeto TanStack Start (não Lovable puro) conectado ao repositório GitHub: `https://github.com/lendavira2020/eletric.git`
2. Supabase integrado via variáveis de ambiente:
   ```
   VITE_SUPABASE_URL=<seu-url>
   VITE_SUPABASE_PUBLISHABLE_KEY=<sua-anon-key>
   SUPABASE_URL=<server-url>
   SUPABASE_PUBLISHABLE_KEY=<server-key>
   DEEPSEEK_API_KEY=<deepseek-key>
   ```
3. Migrations em `/supabase/migrations/` (14 arquivos .sql) executados em ordem no Supabase
4. Tipos do banco gerados via `supabase gen types --lang=typescript > src/integrations/supabase/types.ts`

### Passo 1.2 — Configuração do Cliente Supabase
```typescript
// src/integrations/supabase/client.ts — Cliente client-side
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórios');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 10 } },
});
```

Também existe `client.server.ts` para uso em Server Functions (TanStack Start SSR).

### Passo 1.3 — Contexto de Autenticação (React Context)

Auth é gerenciado via **React Context**, não Zustand:

```typescript
// src/hooks/use-auth.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
```

### Passo 1.4 — Middleware de Autenticação (Server-Side)

Para proteger Server Functions (TanStack Server Functions), existe middleware JWT:

```typescript
// src/integrations/supabase/auth-middleware.ts
export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const token = getRequest().headers.get('authorization')?.replace('Bearer ', '');
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getClaims(token);
    if (!data?.claims?.sub) throw new Response('Unauthorized', { status: 401 });
    return next({ context: { supabase, userId: data.claims.sub, claims: data.claims } });
  }
);
```

### Passo 1.5 — Roteamento Protegido (TanStack Router)

As rotas usam o `__root.tsx` para proteger páginas autenticadas:

```typescript
// src/routes/__root.tsx (lógica de proteção)
const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];
// Rotas NÃO em PUBLIC_PATHS redirecionam para /login se não autenticadas
// AuthProvider envolve toda a árvore de rotas

// Rotas definidas via file-system em src/routes/:
routes/
├── __root.tsx          # Layout raiz + AuthProvider + proteção
├── index.tsx           # Landing (pública)
├── login.tsx           # Login (pública)
├── signup.tsx          # Cadastro (pública)
├── forgot-password.tsx # Esqueci senha (pública)
├── reset-password.tsx  # Reset senha (pública)
├── dashboard.tsx       # Dashboard (autenticada)
├── workspace.tsx       # Editor (autenticada)
├── settings.tsx        # Configurações (autenticada)
└── ...
```

### Passo 1.6 — Páginas de Auth (4 rotas separadas)

Diferente da spec original (única página com abas), o real implementa **4 páginas separadas**:

- **`/login`** — Formulário de email/senha + botão Google OAuth. Redireciona para `/workspace` ou `/onboarding` baseado em `useCurrentProject`
- **`/signup`** — Formulário de cadastro com nome, email, senha + Google OAuth
- **`/forgot-password`** — Formulário de email para redefinição de senha
- **`/reset-password`** — Formulário de nova senha (via token recovery)

Todas com design dark industrial, fundo com grid, animações Framer Motion.

**Critérios de Aceitação da Fase 1 (já implementados):**
- [x] Login com email/senha funcional
- [x] Login com Google OAuth funcional
- [x] Redirecionamento correto após login → `/workspace` ou `/onboarding`
- [x] Redirecionamento correto se não autenticado → `/login`
- [x] Profile criado automaticamente via trigger `handle_new_user()`
- [x] signOut limpa sessão completamente
- [x] Sem erros no console
- [x] `npm run build` sem erros

---

## FASE 2 — DASHBOARD E GESTÃO DE PROJETOS

**Objetivo:** Dashboard industrial com monitoramento em tempo real + CRUD de projetos em rota separada.
**Duração estimada:** 4–6 dias.

### Passo 2.1 — Server Functions de Projetos
```typescript
// src/lib/projects.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SnapshotSchema = z.object({
  project: z.object({ nodes: z.array(z.any()).default([]), edges: z.array(z.any()).default([]) }).default({ nodes: [], edges: [] }),
  voltai: z.object({ components: z.array(z.any()).default([]), edges: z.array(z.any()).default([]) }).default({ components: [], edges: [] }),
});
export type ProjectSnapshot = z.infer<typeof SnapshotSchema>;
const EMPTY_SNAPSHOT: ProjectSnapshot = { project: { nodes: [], edges: [] }, voltai: { components: [], edges: [] } };

async function ensureTenant(supabase: any, userId: string): Promise<string> {
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  if (profile?.tenant_id) return profile.tenant_id;
  const { data: tid } = await supabase.rpc("bootstrap_personal_tenant_if_missing");
  return tid;
}

// Listar projetos
export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("projects")
      .select("id, name, description, status, metadata, updated_at")
      .order("updated_at", { ascending: false }).limit(100);
    return { projects: (data ?? []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description,
      status: p.status, client: p.metadata?.client ?? null, updated_at: p.updated_at,
    })) };
  });

// Criar projeto (com validação Zod, multi-tenant e plan_limits)
export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    client: z.string().max(200).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenant_id = await ensureTenant(supabase, userId);
    const { data: tenant } = await supabase.from("tenants").select("plan").eq("id", tenant_id).maybeSingle();
    const planName = tenant?.plan ?? "free";
    const { data: limits } = await supabase.from("plan_limits").select("max_projects").eq("plan", planName).maybeSingle();
    const maxProjects = limits?.max_projects ?? 3;
    if (maxProjects >= 0) {
      const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("tenant_id", tenant_id);
      if ((count ?? 0) >= maxProjects) throw new Error(planName === "free"
        ? "Limite de 3 projetos atingido. Faça upgrade para continuar."
        : `Limite de ${maxProjects} projetos atingido.`);
    }
    const { data: row } = await supabase.from("projects").insert({
      name: data.name, description: data.description ?? null,
      created_by: userId, tenant_id, metadata: data.client ? { client: data.client } : {},
    }).select("id, name, metadata").single();
    await supabase.from("diagrams").insert({ project_id: row.id, name: "main", canvas_data: EMPTY_SNAPSHOT });
    return { id: row.id, name: row.name, client: row.metadata?.client ?? null };
  });

// Carregar projeto + snapshot do diagrama
export const loadProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project } = await supabase.from("projects").select("id, name, description, metadata, updated_at").eq("id", data.projectId).maybeSingle();
    const { data: diagram } = await supabase.from("diagrams").select("id, canvas_data, version, updated_at").eq("project_id", data.projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const parsed = SnapshotSchema.safeParse(diagram?.canvas_data ?? EMPTY_SNAPSHOT);
    return { project: { id: project.id, name: project.name, description: project.description, client: project.metadata?.client ?? null }, diagramId: diagram?.id ?? null, version: diagram?.version ?? 1, snapshot: parsed.success ? parsed.data : EMPTY_SNAPSHOT };
  });

// Salvar snapshot do projeto (com versionamento opcional)
export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid(), snapshot: SnapshotSchema, createVersion: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("diagrams").select("id, version").eq("project_id", data.projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    let diagramId: string, version: number;
    if (existing) { diagramId = existing.id; version = existing.version ?? 1; await supabase.from("diagrams").update({ canvas_data: data.snapshot, updated_at: new Date().toISOString() }).eq("id", diagramId); }
    else { const { data: row } = await supabase.from("diagrams").insert({ project_id: data.projectId, name: "main", canvas_data: data.snapshot }).select("id, version").single(); diagramId = row.id; version = row.version; }
    await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", data.projectId);
    if (data.createVersion) {
      const { data: last } = await supabase.from("project_versions").select("version_number").eq("project_id", data.projectId).order("version_number", { ascending: false }).limit(1).maybeSingle();
      const next = (last?.version_number ?? 0) + 1;
      await supabase.from("project_versions").insert({ project_id: data.projectId, version_number: next, snapshot: data.snapshot, created_by: userId });
      version = next;
    }
    return { diagramId, version, savedAt: new Date().toISOString() };
  });

// Excluir projeto (hard delete)
export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("diagrams").delete().eq("project_id", data.projectId);
    await supabase.from("project_versions").delete().eq("project_id", data.projectId);
    await supabase.from("projects").delete().eq("id", data.projectId);
    return { ok: true };
  });

// Listar versões
export const listProjectVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase.from("project_versions").select("id, version_number, created_at, created_by").eq("project_id", data.projectId).order("version_number", { ascending: false }).limit(50);
    return { versions: rows ?? [] };
  });

// Restaurar versão
export const restoreProjectVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ver } = await supabase.from("project_versions").select("snapshot, version_number").eq("id", data.versionId).eq("project_id", data.projectId).maybeSingle();
    const { data: diagram } = await supabase.from("diagrams").select("id").eq("project_id", data.projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (diagram) await supabase.from("diagrams").update({ canvas_data: ver.snapshot, updated_at: new Date().toISOString() }).eq("id", diagram.id);
    return { ok: true, restoredVersion: ver.version_number };
  });
```

### Passo 2.2 — Dashboard Industrial (monitoring) + Rota de Projetos (gestão)

**Dashboard** (`/dashboard`) — Visão de monitoramento industrial em tempo real:
```
┌─────────────────────────────────────────────────────────────────┐
│ APP SIDEBAR (esquerda fixa)                                      │
│ Dashboard | Projetos | Industrial Workspace | IA | Analytics |   │
│ Clientes | Configurações                                          │
├──────────────────────────────────────────────────────────────────┤
│ TOPBAR: Nome da planta | Busca ⌘K | Salvar | Compartilhar |      │
│         Runtime status | Créditos IA (🔥 142/250) | Notificações │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────── ─┐   │
│  │  🔥 Industrial OS · v0.1                                 │   │
│  │  Bem-vindo de volta, Engenheiro.                          │   │
│  │  3 plantas online · 142 tags ativas · 2 alarmes pendentes │   │
│  │  [Abrir Workspace] [Conversar com IA]                     │   │
│  │                                                           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │   │
│  │  │PLCs    │ │Consumo │ │OEE     │ │Alarmes │            │   │
│  │  │Online  │ │312 kW  │ │87.4%   │ │2 ⚠     │            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Energia kWh  │ │ Produção un/h│ │ Temp. média  │            │
│  │  (area chart)  │  (area chart)  │  (area chart)  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  ┌──────────────────────────────────┐ ┌────────────────────────┐│
│  │ Plantas industriais              │ │ Atividade da IA        ││
│  │  ● Linha 03 · Engarrafamento     │ │ ✓ Gerou unifilar       ││
│  │    OEE 94.1%    ╱‾‾‾╲            │ │ ✓ Sugeriu redimension. ││
│  │  ● Subestação SE-02              │ │ ✓ Detectou rolamento   ││
│  │    OEE 99.0%    ╱‾‾╲             │ │ ✓ Criou ladder E-04    ││
│  │  ● CCM-03 · Motores             │ └────────────────────────┘│
│  │    OEE 78.4%    ╱‾╲             │                            │
│  └──────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

**Projetos** (`/projects`) — CRUD de projetos industriais:
```
┌─────────────────────────────────────────────────────────────────┐
│  Projetos industriais                   9 projeto(s)            │
│                                            [＋ Novo projeto]     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ 🖥 CCM-03   │  │ 🖥 SE-02     │  │ 🖥 Linha 03  │         │
│  │ Coca-Cola   │  │ Petrobras    │  │ Ambev        │         │
│  │ active       │  │ active       │  │ active       │         │
│  │ 15/05/2026   │  │ 14/05/2026   │  │ 12/05/2026   │         │
│  │ BOM Export   │  │ BOM Export   │  │ BOM Export   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  (link para /workspace?projectId=uuid ao clicar)                 │
│                                                                  │
│  Estado vazio (0 projetos):                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │         🖥                                               │    │
│  │    Você ainda não tem projetos.                          │    │
│  │    Crie o primeiro para começar.                         │    │
│  │              [＋ Novo projeto]                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Rota Workspace** (`/workspace?projectId=uuid`) — Ambiente de edição:
```typescript
// src/routes/workspace.tsx
// TanStack Router com validateSearch (zod: projectId z.string().uuid().optional())
// Renderiza <IndustrialWorkspace projectId={projectId} />
// Head: "Industrial Workspace · EletricAI Industrial OS"
```

### Passo 2.3 — Card de Projeto (inline em `src/routes/projects.tsx`)
```typescript
<Link to="/workspace" search={{ projectId: p.id }}>
  <div className="h-9 w-9 bg-primary/15 text-primary grid place-items-center rounded-md">
    <Cpu className="h-4 w-4" />
  </div>
  <div className="mt-3 text-sm font-semibold group-hover:text-primary">{p.name}</div>
  <div className="text-[11px] text-muted-foreground">{p.client ?? p.description ?? "—"}</div>
  <div className="mt-3 pt-3 border-t border-border flex text-[11px] font-mono text-muted-foreground">
    <span>{p.status ?? "active"}</span>
    <span>{new Date(p.updated_at).toLocaleDateString()}</span>
  </div>
</Link>
// Ações: links "BOM" → /projects/$projectId/bom  e  "Exportar" → /projects/$projectId/export
// Delete: botão hover trash → confirm() → deleteProject
// Hover: border-primary/50 + bg-accent/30 + scale(1.02)
```

### Passo 2.4 — Modal de Criação de Projeto (inline em `src/routes/projects.tsx`)
```typescript
// CreateProjectDialog (componente inline, não separado em /dashboard/)
// Campos: Nome * (max 200), Cliente (max 200), Descrição (max 2000)
// Sem campos de tensão/frequência/norma/módulo inicial
// Submete: createProject via useMutation → invalida queryKey ["projects"] → navigate /workspace?projectId
// Upgrade: se erro de limite → toast.error → usuário clica badge de créditos → trigger-upgrade-modal
```

**Critérios de Aceitação da Fase 2:**
- [x] Dashboard carrega dados industriais (não projetos)
- [x] `/projects` carrega projetos do usuário com TanStack Query (`useQuery`)
- [x] Criar projeto funciona com validação Zod (`inputValidator` + `z.object`)
- [x] Limite por plano via `plan_limits.max_projects` com toast de upgrade
- [x] Excluir permanentemente com cascade em diagrams + versions (não archive)
- [x] Estado vazio com CTA para criar primeiro projeto
- [x] Snapshot automático na criação (`EMPTY_SNAPSHOT`)
- [x] Versionamento completo (listar, salvar, restaurar versões)
- [x] Topbar global com créditos restantes (`AiCreditsBadge` + `getAiCredits`)
- [x] Sidebar com navegação entre Dashboard, Projetos, Workspace, IA, etc.
- [x] Duplicar projeto (server function + botão na UI com ícone Copy)
- [x] Arquivar projeto (soft-delete via status="archived", botão Archive + confirmação)

---

## FASE 3 — EDITOR: MÓDULO UNIFILAR

**Objetivo:** Editor funcional com canvas React Flow, biblioteca de componentes IEC 60617 e painel de propriedades com simulação.
**Duração estimada:** 7–10 dias.

### Passo 3.1 — Layout do Editor (Workspace Integrado)
```
┌──────────────────────────────────────────────────────────────────┐
│ APP SIDEBAR (fixa 240px)                                         │
┌──────────────────────────────────────────────────────────────────┤
│ TOPBAR: [branch: main / Planta — Linha 03] | [🔍 Busca ⌘K]     │
│         [💾 Salvar] [🔗 Compartilhar] | ⚡ Runtime · 24ms       │
│         [🔥 142/250 IA] [🔔 Notificações] [👤 Perfil]           │
├──────────────────────────────────────────────────────────────────┤
│ [Unifilar] [Ladder] [FBD] [SCADA] [Digital Twin] [PLC] [Sim] [Alarmes] │
│ IEC 60617    IEC 61131-3  Function Block  HMI Runtime  2D/3D    │
├─────────────┬──────────────────────────────────┬─────────────────┤
│ BIBLIOTECA  │                                  │   PROPRIEDADES  │
│ (colapsável)│         CANVAS                   │   (colapsável)  │
│             │     React Flow + Grid 28px       │                 │
│ [Proteção]  │                                  │ Componente      │
│ ▸ QF        │     Componentes arrastáveis      │   QF-01 · Disj. │
│ ▸ FU        │     Conexões por role            │   Proteção      │
│ ▸ DR        │     (power/control/signal)       │   NBR 5410      │
│             │                                  │                 │
│ [Potência]  │     Multiplayer cursors          │ Parâmetros:     │
│ ▸ M         │     (useCollab hook)             │   In: 220V      │
│ ▸ KM        │                                  │   Curva: B      │
│ ▸ VFD       │     Toolbar: [↩︎] [↪︎] [↻] [⊞]  │   Inom: 100A    │
│             │              [≡] [⌂]             │                 │
│ [Controle]  │                                  │ Tags vinculadas │
│ ▸ KA        │     Barra inferior (colapsável): │   %I0.0 BOOL    │
│ ▸ KT        │     Logs | Alarmes | IA |        │   RUN BOOL      │
│ ▸ CR        │     Terminal | Eventos |         │                 │
│             │     OPC-UA | Modbus | Runtime    │ Sim State:      │
│ [Medição]   │                                  │   ON / FALHA    │
│ ▸ PT / TT   │                                  │                 │
│ ▸ FT / LT   │                                  │ [Restaurar fáb.]│
├─────────────┴──────────────────────────────────┴─────────────────┤
│ MODO: Unifilar | Nós: 12 | Conexões: 8 | Status: Salvos ✓       │
└──────────────────────────────────────────────────────────────────┘
```

### Passo 3.2 — Stores (Zustand, dois stores separados)

**VoltAI Store** (`src/lib/voltai/store.ts`) — Diagrama unifilar (componentes, conexões, simulação, undo/redo):
```typescript
// src/lib/voltai/store.ts
import { create } from "zustand";

interface VoltaiDiagramComponent {
  id: string;
  type: VoltaiComponentType;
  label: string;
  position: { x: number; y: number };
  params: Record<string, unknown>;
  simulationState: VoltaiSimulationState;
  rotation?: number; // 0, 90, 180, 270
}
interface VoltaiDiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  role: "power" | "control" | "signal" | "neutral";
}

interface VoltaiStore {
  components: VoltaiDiagramComponent[];
  edges: VoltaiDiagramEdge[];
  selectedId: string | null;
  lastSimulationJson: string;
  dirty: boolean;
  past: { components: VoltaiDiagramComponent[]; edges: VoltaiDiagramEdge[] }[];
  future: { components: VoltaiDiagramComponent[]; edges: VoltaiDiagramEdge[] }[];

  addComponent: (type: VoltaiComponentType, position: { x: number; y: number }) => string;
  updateComponentParam: (id: string, key: string, value: unknown) => void;
  restoreFactoryParams: (id: string) => void;
  updateComponentPosition: (id: string, position: { x: number; y: number }) => void;
  selectComponent: (id: string | null) => void;
  addEdge: (edge: Omit<VoltaiDiagramEdge, "id">) => void;
  simulateStep: (stepMs: number) => void; // motor térmico, I²t, disparo magnético
  setAll: (components: VoltaiDiagramComponent[], edges: VoltaiDiagramEdge[]) => void;
  markSaved: () => void;
  rotateComponent: (id: string, direction?: "cw" | "ccw") => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  alignComponents: (axis: "horizontal" | "vertical" | "grid") => void;
}

export const useVoltaiStore = create<VoltaiStore>((set) => ({
  components: [],
  edges: [],
  selectedId: null,
  lastSimulationJson: "",
  dirty: false,
  past: [],
  future: [],

  addComponent: (type, position) => {
    const id = nextId(type); // gera QF-01, KM-02, M-03, etc.
    set((store) => {
      // salva snapshot no past antes de modificar
      return {
        past: [...store.past, cloneState(store.components, store.edges)].slice(-50),
        future: [],
        components: [
          ...store.components,
          {
            id,
            type,
            label: id,
            position,
            rotation: 0,
            params: getVoltaiFactoryParams(type),
            simulationState: createVoltaiDefaultState(type),
          },
        ],
        selectedId: id,
        dirty: true,
      };
    });
    return id;
  },

  deleteSelected: () =>
    set((store) => {
      if (!store.selectedId) return {};
      return {
        past: [...store.past, cloneState(store.components, store.edges)].slice(-50),
        future: [],
        components: store.components.filter((c) => c.id !== store.selectedId),
        edges: store.edges.filter((e) => e.source !== store.selectedId && e.target !== store.selectedId),
        selectedId: null,
        dirty: true,
      };
    }),

  undo: () => set((store) => {
    if (store.past.length === 0) return {};
    const previous = store.past[store.past.length - 1];
    return {
      components: previous.components,
      edges: previous.edges,
      past: store.past.slice(0, -1),
      future: [cloneState(store.components, store.edges), ...store.future],
      selectedId: null,
      dirty: true,
    };
  }),

  redo: () => set((store) => {
    if (store.future.length === 0) return {};
    const next = store.future[0];
    return {
      components: next.components,
      edges: next.edges,
      past: [...store.past, cloneState(store.components, store.edges)],
      future: store.future.slice(1),
      selectedId: null,
      dirty: true,
    };
  }),

  simulateStep: (stepMs) =>
    set((store) => ({
      components: store.components.map((c) => simulateComponent(c, stepMs)),
      lastSimulationJson: serializeSimulationPayload(components, stepMs),
    })),
  // ... demais ações (updateComponentParam, rotate, align, setAll, addEdge, etc.)
}));
// Undo/redo usa arrays manuais past/future (sem zundo)
// Simulação embutida: disjuntores (I²t térmico + magnético), fusíveis, contatores,
// motores, relés térmicos, temporizadores, contadores, UPS
```

**Editor Store** (`src/lib/editor/store.ts`) — Estado transversal do workspace:
```typescript
// src/lib/editor/store.ts
import { create } from "zustand";
import type { WorkspaceMode } from "@/lib/workspace-data";

type EditorTagType = "BOOL" | "INT" | "REAL" | "STRING";
interface EditorTag {
  id: string; name: string; type: EditorTagType;
  value: boolean | number | string; forced: boolean;
}

interface EditorState {
  activeMode: WorkspaceMode;          // "unifilar" | "ladder" | "fbd" | "scada" | "twin" | "plc" | "sim" | "alarms"
  selectedNodeId: string | null;
  tags: Record<string, EditorTag>;    // tags vinculadas (cross-module)
  rungs: LadderRung[];                // Ladder state
  fbdNodes: any[]; fbdEdges: any[];   // FBD state

  setActiveMode: (mode: WorkspaceMode) => void;
  setSelectedNode: (id: string | null) => void;
  upsertTag: (tag: EditorTag) => void;
  removeTag: (id: string) => void;
  setTagValue: (id: string, value: EditorTag["value"]) => void;
  forceTagValue: (id: string, value: EditorTag["value"]) => void;
  releaseTag: (id: string) => void;
  setRungs: (rungs: LadderRung[] | ((prev: LadderRung[]) => LadderRung[])) => void;
  setFbdAll: (nodes: any[], edges: any[]) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeMode: "unifilar", selectedNodeId: null, tags: {}, rungs: [], fbdNodes: [], fbdEdges: [],
  setActiveMode: (mode) => set({ activeMode: mode, selectedNodeId: null }),
  upsertTag: (tag) => set((s) => ({ tags: { ...s.tags, [tag.id]: tag } })),
  removeTag: (id) => set((s) => { const t = { ...s.tags }; delete t[id]; return { tags: t }; }),
  setTagValue: (id, value) => set((s) => { const t = s.tags[id]; if (!t || t.forced) return s; return { tags: { ...s.tags, [id]: { ...t, value } } }; }),
  forceTagValue: (id, value) => set((s) => { const t = s.tags[id]; if (!t) return s; return { tags: { ...s.tags, [id]: { ...t, value, forced: true } } }; }),
  releaseTag: (id) => set((s) => { const t = s.tags[id]; if (!t) return s; return { tags: { ...s.tags, [id]: { ...t, forced: false } } }; }),
  setRungs: (rungs) => set((s) => ({ rungs: typeof rungs === "function" ? rungs(s.rungs) : rungs })),
  setFbdAll: (nodes, edges) => set((s) => ({ fbdNodes: typeof nodes === "function" ? nodes(s.fbdNodes) : nodes, fbdEdges: typeof edges === "function" ? edges(s.fbdEdges) : edges })),
}));
```

### Passo 3.3 — VoltaiFlowNode (Nó de Componente Elétrico)
```typescript
// src/components/canvases/voltai-node.tsx
import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { VOLTAI_COLORS, VOLTAI_COMPONENT_BY_TYPE, type VoltaiTerminal, type VoltaiTerminalSide } from "@/lib/voltai/component-definitions";
import { getComponentSymbol } from "@/lib/voltai/symbols";

const SIDE_POSITION: Record<VoltaiTerminalSide, Position> = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

// Suporta múltiplos bornes por componente (entrada/saída por role)
export const VoltaiFlowNode = memo(function VoltaiFlowNode({ data, selected }: NodeProps<VoltaiDiagramComponent>) {
  const definition = VOLTAI_COMPONENT_BY_TYPE[data.type];
  const status = data.simulationState.tripped || data.simulationState.failed || data.simulationState.blown;

  return (
    <div className={`relative w-[148px] rounded-md bg-card/95 backdrop-blur border px-2.5 py-2 shadow-panel transition-all ${selected ? "border-primary ring-2 ring-ring shadow-glow" : "border-border"} ${data.simulationState.energized && "energized"}`}>
      {definition.bornes.map((terminal) => (
        <Handle
          key={terminal.id} id={terminal.id}
          type={terminal.direction === "input" ? "target" : "source"}
          position={SIDE_POSITION[terminal.side]}
          title={`${terminal.id} · ${terminal.role}`}
          style={{ ...handleOffset(definition.bornes, terminal), width: 8, height: 8, background: VOLTAI_COLORS[terminal.role], borderColor: "oklch(0.16 0.012 35)" }}
        />
      ))}
      <div className="flex items-center gap-2">
        <div className="h-11 w-14 shrink-0 [&_svg]:h-full [&_svg]:w-full transition-transform duration-300 ease-out" style={{ transform: `rotate(${data.rotation ?? 0}deg)` }} dangerouslySetInnerHTML={{ __html: getComponentSymbol(data.type) }} />
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold truncate">{data.label}</div>
          <div className="text-[9px] text-muted-foreground truncate">{definition.name}</div>
          <div className={`mt-0.5 text-[9px] font-mono ${status ? "text-destructive" : "text-success"}`}>{status ? "FALHA" : data.simulationState.energized ? "ON" : "READY"}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {definition.bornes.slice(0, 8).map((t) => (<span key={t.id} className="rounded border border-border px-1 py-0.5 text-[8px] font-mono text-muted-foreground">{t.id}</span>))}
      </div>
    </div>
  );
});
// Handles coloridos por role: power (red), control (gold), signal (blue), neutral (gray)
// Símbolos SVG vetoriais por tipo (QF, KM, M, FU, DR, etc.) — 46+ componentes
```

### Passo 3.4 — Canvas Unifilar
```typescript
// src/components/canvases/unifilar-canvas.tsx
// ReactFlow Provider + ReactFlow com:
//   - nodeTypes: { voltai: VoltaiFlowNode }
//   - edgeTypes: {} (default edges)
//   - Background grid (dots 28px)
//   - Controls + MiniMap
//   - Drag-overlay + onDrop handler (lê application/voltai-component do sidebar)
//   - onConnect handler → addEdge com role do handle source
//   - useVoltaiSimulation(true) — ciclo de simulação em tempo real
//   - useCollab(projectId) — multiplayer cursors via BroadcastChannel
//   - Toolbar: Undo | Redo | Rotate CW | Align H | Align V | Grid | FitView | Delete
//   - Keybindings: Ctrl+Z undo, Ctrl+Y redo, Delete remove selected, Ctrl+A select all
//   - Atualiza posição dos componentes via updateComponentPosition do store
```

### Passo 3.5 — Painel de Propriedades
```typescript
// src/components/editor/right-property-panel.tsx
// Lê o componente selecionado: useVoltaiStore(s => s.components.find(n => n.id === s.selectedId))
// Lê definição: getVoltaiCompDef(voltaiNode.type)
// Renderiza:
//   - Info do componente: label, nome, categoria, normas
//   - Parâmetros dinâmicos por type do ParamSpec (number, boolean, select, time)
//   - Campos validados via Zod (validated-param-field.tsx com paramSpecToZod)
//   - Seção de tags vinculadas (add/remove/force/release)
//   - Estado de simulação (on/off, corrente, I²t, etc.)
//   - Botão "Restaurar fábrica" → restoreFactoryParams
// Schema de validação: src/lib/editor/property-schemas.ts
//   - paramSpecToZod: converte ParamSpec em Zod schema (number com min/max, select com enum, etc.)
//   - componentParamsToZod: objeto completo
//   - validateParam: validação de campo único
//   - tagNameSchema: regex /^[A-Za-z%][A-Za-z0-9_.]*$/
```

### Passo 3.6 — Persistência via Server Functions
```typescript
// src/lib/use-project-persistence.ts — hook que gerencia save/load
// - loadProject → setAll(components, edges)
// - saveProject → snapshot via VoltaiStore toJSON
// - saveManualVersion → versionamento com metadados
// - dirty flag do store → autosave via useEffect + timer
// - Indicador de save no Topbar (Save button)
// Persistência via Server Functions em src/lib/projects.functions.ts:
//   loadProject, saveProject, listProjectVersions, restoreProjectVersion
```

**Critérios de Aceitação da Fase 3:**
- [x] Canvas carrega com grid 28px, zoom/pan, MiniMap e Controls (React Flow)
- [x] Arrastar componentes da biblioteca (sidebar → drag data application/voltai-component → onDrop → addComponent)
- [x] Conectar componentes por bornes (handles coloridos por role: power/control/signal/neutral)
- [x] Painel de propriedades edita parâmetros do componente selecionado (ValidatedParamField + Zod)
- [x] Undo/Redo funcional (Ctrl+Z / Ctrl+Y via past/future arrays manuais, sem zundo)
- [x] Autosave via dirty flag + useProjectPersistence hook
- [x] Indicador de status ("Salvo" no Topbar + dirty flag)
- [x] Delete key remove nó selecionado + conexões órfãs
- [x] Rotação 0°, 90°, 180°, 270° com animação CSS
- [x] Alinhamento horizontal, vertical e em grid
- [x] Simulação embutida (disjuntores I²t, fusíveis, contatores, motores, relés, temporizadores, contadores, UPS)
- [x] Multiplayer cursors via BroadcastChannel (useCollab)
- [x] 8 módulos (Unifilar, Ladder, FBD, SCADA, Twin, PLC, Sim, Alarmes) com ModeTabs
- [x] Barra inferior com logs, alarmes, IA, terminal, eventos, OPC-UA, Modbus, runtime (8 abas com ícones, status ao vivo, runtime status, conexões OPC-UA/Modbus)
- [x] Canvas responsivo (zoom fit ao abrir via `fitView` prop + useEffect com timeout para fit após carregamento de nós)

---

## FASE 4 — EDITOR: MÓDULO LADDER

**Objetivo:** Editor Ladder conforme IEC 61131-3 com modelo matricial, paleta completa IEC/Allen-Bradley, compilação IL/ST e simulação com scan history.
**Duração estimada:** 6–8 dias.

### Passo 4.1 — Estrutura de Dados (Modelo Matricial)
```typescript
// src/lib/ladder/types.ts — modelo matricial (rows × cols)
// Cells na mesma row = série (AND). Múltiplas rows = paralelo (OR).
// Última coluna reservada para saída (bobina/timer/contador).

type LadderCellKind = "EMPTY" | "XIC" | "XIO" | "OTE" | "OTL" | "OTU" | "TON" | "CTU";

interface LadderCell {
  kind: LadderCellKind;
  operand: string;       // %I0.0, %Q0.1, K1_CMD
  preset?: number;       // para TON (ms) / CTU (count)
  energized?: boolean;   // Runtime visual
}

interface LadderRung {
  id: string;
  label: string;
  cells: LadderCell[][];     // rows × cols — matriz
  poweredOut?: boolean;       // saída energizada no último scan
}

const RUNG_COLS = 6;          // 5 células série + 1 saída
const OUTPUT_KINDS: LadderCellKind[] = ["OTE", "OTL", "OTU", "TON", "CTU"];
const CONTACT_KINDS: LadderCellKind[] = ["XIC", "XIO"];

// Estado compartilhado via useEditorStore(s => s.rungs)
```

### Passo 4.2 — Paleta de Elementos Ladder
```typescript
// src/lib/ladder/definitions.ts — 37+ elementos em 10 categorias
// Usa notação Allen-Bradley (XIC/XIO/OTE) + IEC 61131-3 (TON/CTU)

LADDER_ELEMENTS = [
  // Contatos: XIC (NA), XIO (NF), R_TRIG (borda +), F_TRIG (borda -)
  // Bobinas: OTE (simples), OTL (set), OTU (reset), SR, NEG_COIL, RET_COIL
  // Temporizadores: TON, TOF, TP, TONR
  // Contadores: CTU, CTD, CTUD
  // Comparação: GT, LT, GE, LE, EQ, NE
  // Blocos Matemáticos: ADD, SUB, MUL, DIV, MOD, SQRT, ABS
  // Blocos Lógicos: AND, OR, XOR, NOT
  // Movimentação: MOVE, INT_TO_REAL, REAL_TO_INT
  // Trilhos: LEFT_RAIL, RIGHT_RAIL
  // Controle: JMP, LBL, MCR, RET
];
// Sidebar drag: EditorLadderSidebar com dataTransfer "application/ladder-element"
```

### Passo 4.3 — Canvas Ladder
```
LAYOUT DO EDITOR LADDER:
┌────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [+ Rung] [▶ Simular] [■ Parar] [📄 Compilar] [📋 Histórico]  │
│                                                       3 rungs · 100ms  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ R001 · Rung 1                        [⊞ branch] [✕ del]     │      │
│  │ ║ ┤├──┤/├──┤ ├──┤ ├──┤ ├──( )──┤├ ║                          │      │
│  │ ║   %I0.0 %I0.1           %Q0.0    ║  ← ENERGIZADO            │      │
│  │ ║ ┤├──────────┤/├─────────────────────║                          │      │
│  │ ║   %I0.2     %I0.3                   ║  (ramo paralelo OR)     │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ R002 · Timer                    [⊞ branch] [✕ del]           │      │
│  │ ║ ┤├──┤/├──────────[TON]────────┤├ ║                          │      │
│  │ ║   %I0.4 %M0.0    TON_01      %Q0.1 ║  3000/5000ms ✓        │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ R003 · Counter                   [⊞ branch] [✕ del]           │      │
│  │ ║ ┤├──────────[CTU]────────┤├ ║                                │      │
│  │ ║   %I0.5     CTU_01      %Q0.2 ║  42/100                     │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
├────────────────────────────────────────────────────────────────────────┤
│ [📄 Compilador IEC 61131-3]                               [.st ↓]     │
│ ┌──[ST]──[IL]─────────────────────────────────────────────────────────┐│
│ │ Q0_0 := (%I0_0 AND NOT %I0_1) OR %I0_2 AND NOT %I0_3;              ││
│ │ TON_01(IN := %I0_4 AND NOT %M0_0, PT := T#5000ms);                 ││
│ │ Q0_1 := TON_01.Q;                                                   ││
│ │ CTU_01(CU := %I0_5, PV := 100);                                    ││
│ │ Q0_2 := CTU_01.DN;                                                  ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ [📋 Histórico de scan (142)]                              [⏸ Pausar]  │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ #42 · R001  ON  ██░░░░░░░░  %I0.0: 0→1                            │ │
│ │ #41 · R003  off ░░░░░░░░░░                                        │ │
│ │ #40 · R002  ON  ██░░░░░░░░  TON_01: 4200/5000ms                   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

// Implementação: src/components/canvases/ladder-canvas.tsx → RungGrid
// Cada célula: LadderCellView com Popover para editar kind, operand, preset
// Cores: energizado = verde (#success), desligado = cinza (#muted)
```

### Passo 4.4 — Runtime de Simulação (scan cycle)
```typescript
// src/lib/ladder/runtime.ts — scanRungs(rungs): ScanResult[]
// Lê tags do useEditorStore (compartilhado cross-module)
// Ciclo: 100ms (setInterval)

interface ScanResult {
  rungId: string;
  poweredOut: boolean;       // bobina principal energizada?
  perCell: boolean[][];      // estado de cada célula (verde/cinza)
  diagnostics: Record<string, { kind: "TON" | "CTU"; value: number; preset: number; done: boolean }>;
}

export const scanRungs = (rungs: LadderRung[]): ScanResult[] => {
  const tags = useEditorStore.getState().tags;
  const now = performance.now();

  for (const rung of rungs) {
    // 1. Avaliar contatos: XIC = tag value, XIO = NOT tag value
    // 2. Multi-row = OR lógico entre rows
    // 3. Escrever bobinas: OTE = writeBool, OTL/OTU = set/reset
    // 4. Timers TON: tickTimer — rising edge start, ACC += dt, DN quando ACC >= PT
    // 5. Counters CTU: tickCounter — rising edge inc, DN quando count >= PV
  }
  return results;
};

// Timer IEC 61131-3 TON:
//   IN ↑ → ACC=0, começa acumular; IN held → ACC+=dt; ACC>=PT → DN=true
//   IN ↓ → ACC=0, DN=false (imediato)

// Estado persistente entre scans:
const timerState = new Map<string, TimerState>();
const counterState = new Map<string, CounterState>();
export const resetRuntimeState = () => { timerState.clear(); counterState.clear(); };

// Forçar variáveis: setTagValue/forceTagValue via useEditorStore
```

### Passo 4.5 — Compilador IEC 61131-3
```typescript
// src/lib/ladder/compiler.ts
// Saída em dois formatos:
//   - Structured Text (ST): %Q0_0 := (%I0_0 AND NOT %I0_1) OR %I0_2;
//   - Instruction List (IL): LD %I0_0 ANDN %I0_1 OR %I0_2 ST %Q0_0

compileRungToST(rung): string   // → Structured Text
compileRungToIL(rung): string   // → Instruction List
compileProgram(rungs, format): string  // → programa completo
// Suporte: OTE, OTL, OTU, TON, CTU
// Download: botão gera .st ou .il file
```

**Critérios de Aceitação da Fase 4:**
- [x] Criação e exclusão de rungs (botão Add Rung + removeRung)
- [x] Editar célula via Popover (tipo, operando, preset)
- [x] Ramos paralelos (OR) — addBranch adiciona row na matriz
- [x] Compilação IL e ST (compileProgram com toggle)
- [x] Simulação com scan a cada 100ms (setInterval + scanRungs)
- [x] Elementos energizados ficam verdes (energized → border-success + bg-success/10)
- [x] Histórico de scan com tag deltas (scanHistory, até 200 entradas)
- [x] Timer TON com acumulador ms e display (diagnostics.value/preset)
- [x] Contador CTU com display count/preset
- [x] Forçar valores via editor store (forceTagValue/setTagValue)
- [x] Código compilado baixável como .st ou .il
- [x] Tags compartilhadas via useEditorStore (cross-module com Unifilar/Simulação)
- [x] Paleta com 37+ elementos em 10 categorias (Contatos, Bobinas, Temporizadores, Contadores, Comparação, Matemáticos, Lógicos, Movimentação, Trilhos, Controle)
- [x] Drag-and-drop da sidebar para o canvas (cada célula aceita drop de "application/ladder-element", mapeia para LadderCellKind, auto-incrementa operando %I0.x/%Q0.x, mostra toast com validação de tipo)

---

## FASE 5 — EDITOR: MÓDULO SCADA

**Objetivo:** HMI/SCADA com canvas Konva, widgets interativos, Monaco script engine e alarmes ISA-18.2.
**Duração estimada:** 6–8 dias.

### Passo 5.1 — Canvas SCADA (Konva, não React Flow)
```typescript
// src/components/canvases/scada-canvas.tsx — entrada do módulo
// Renderiza:
//   1. KonvaCanvas com variant="scada" — canvas de tela livre 2D (react-konva)
//   2. Monaco Editor sidebar (colapsável, 400px)
//   3. Alarm Banner (pulsante, topo) quando ALARM_ACTIVE = true
//   4. Script execution loop a 100ms

// src/components/canvases/konva-canvas.tsx — canvas compartilhado SCADA/Twin
// Stage + Layer + shapes:
//   - IndustrialNode (kind detecta o widget): gauge, display, level, trend,
//     button, switch, slider, input, alarm_banner, alarm_table, label,
//     motor, pump, valve, tank, pipe
//   - Tamanho em node.params.w / node.params.h (default: 120×70, trend/table: 180×100)
//   - Animação via tick counter (setInterval 50ms → tick 0..999)
//   - Drop handler: dataTransfer "application/scada-widget"
//   - Scroll/zoom: wheel zoom (centered at cursor) + zoom buttons
//   - Drag stage to pan
//   - Seleção + resize handle (canto inferior direito)

// Widgets implementados como grupos Konva com rendering condicional por kind:
//   - gauge: Ring + texto numérico + nome da tag
//   - display: Rect escuro + texto grande + unidade
//   - level: tanque de vidro com nível preenchido (0-100%)
//   - trend: mini chart com grid + linha senoidal animada
//   - button: Circle vermelho/verde, toggle tag onClick
//   - switch: Toggle slider (50×24), onClick alterna
//   - slider: Track horizontal + thumb arrastável → setTag com %
//   - motor: Retângulo + fan girando (tick*20°)
//   - pump: Círculo + impeller rotacionando (tick*15°)
//   - tank: Retângulo + líquido animado
//   - valve: Dois triângulos opostos
//   - alarm_banner: Rect vermelho + mensagem (se ALARM_ACTIVE)
//   - pipe: Rect horizontal fino
//   - label: Text simples
//   - fallback: default shape com node.label + node.kind
```

### Passo 5.2 — Monaco Script Engine (JavaScript Runtime)
```typescript
// Editor Monaco inline em ScadaCanvas.tsx (não componente separado)
// @monaco-editor/react com vs-dark theme, JetBrains Mono, 11px
// Script padrão incluso (DEFAULT_SCRIPT):
//   - Gerencia tags: TANQUE_NIVEL, TEMP_M01, SP_SPEED, MOTOR_ON, PUMP_ON
//   - Lógica de aquecimento do motor (proporcional à velocidade)
//   - Controle de fluxo: bomba enche tanque, válvula esvazia
//   - Alarmes: temperatura > 85°C ou nível > 95% → ALARM_ACTIVE + ALARM_MSG
//   - Reset automático de alarmes quando condições normalizam

// Execution loop (100ms setInterval):
const nextTags = { ...tags };
const runScript = new Function("tags", script);  // sandbox JavaScript
runScript(nextTags);
applyTick({ tags: nextTags });                   // sync to project store
syncToEditorStore(nextTags);                     // cross-module tags
if (newAlarm) pushLog({ channel: "Alarmes" });   // bottom panel

// Botões: [▶ Executar] / [⏸ Pausar]
// Console: erros de script em vermelho, sucesso em verde, idle em cinza
// NOTA: sem autocomplete de tags do projeto (pendente)
```

### Passo 5.3 — Sistema de Alarmes (ISA-18.2)

**SCADA runtime** (inline em `ScadaCanvas.tsx`):
```typescript
// Alarme ativo detectado via tags["ALARM_ACTIVE"] === true
// Banner pulsante no topo do canvas com mensagem e botão [Reconhecer]
// acknowledgeAlarm → set ALARM_ACTIVE = false + pushLog("Alarme reconhecido", "ok")
// Alarmes são propagados para o BottomPanel (channel "Alarmes")
```

**Módulo de visualização** (`src/components/canvases/alarms-canvas.tsx`):
```typescript
// Tabela ISA-18.2 com colunas: Sev. | Código | Tag | Mensagem | Hora | Status
// Severidades: high (destructive), med (warning), low (info), info (success)
// Botão ACK para não reconhecidos, badge ACKED para reconhecidos
// BottomStrip: Total, Active, MTTR, ISA-18.2
// Dados mockados (ALARMS array) — integração com runtime pendente
```

**Paleta de widgets** (`src/components/editor/sidebars/editor-scada-sidebar.tsx`):
```typescript
// 5 grupos: Indicadores, Controles, Alarmes, Máquinas, Enfeites
// Drag data: "application/scada-widget" → onDrop em KonvaCanvas
// Categorias visuais (sem lógica associada)
```

**Critérios de Aceitação da Fase 5:**
- [x] Canvas SCADA livre com Konva (Stage + Layer + zoom/pan/resize)
- [x] Arrastar widgets da sidebar (dataTransfer "application/scada-widget" → onDrop → addNode)
- [x] Redimensionar widgets (resize handle canto inferior direito)
- [x] Associar tag a cada widget (node.params.tag no popup de propriedades)
- [x] Monaco Editor com syntax highlighting (vs-dark, JetBrains Mono, JavaScript)
- [x] Loop de script a 100ms (new Function("tags", script) sandbox)
- [x] Banner de alarmes ativos (pulsante, topo, com acknowledge)
- [x] Reconhecer alarme (acknowledgeAlarm → ALARM_ACTIVE = false)
- [x] Tags compartilhadas com Ladder/Unifilar (syncToEditorStore)
- [x] Widgets interativos: button toggle, switch toggle, slider drag
- [x] Animações: motor fan, pump impeller, tank liquid, trend chart, pipe flow
- [x] Tabela de alarmes ISA-18.2 (módulo AlarmsCanvas)
- [x] Autocomplete de tags do projeto no Monaco (completion provider registrado via `beforeMount`, sugere nomes de tags de `useProjectStore` + `useEditorStore`, autocomplete contextual dentro de `tags["..."`)
- [x] Live preview ao digitar (toggle "Live" com Switch, execução debounced a 600ms, exibe resultado formatado no console, não interfere com o loop de runtime)

---

## FASE 6 — ASSISTENTE IA NEXUSMIND (EletricAI Architect)

**Objetivo:** Motor de IA com DeepSeek + tool_calls, RAG normativo, geração cross-module (Unifilar, Ladder, FBD, SCADA, Twin), créditos atômicos e 2 interfaces (FAB no workspace + página `/ai`).
**Duração estimada:** 5–7 dias.

### Passo 6.1 — Server Functions (não Edge Functions)
```typescript
// src/lib/ai-architect.functions.ts — TanStack Start Server Functions
// Provider: DeepSeek (chat/completions), modelo "deepseek-chat"
// NÃO usa Supabase Edge Functions — executa no runtime do TanStack Start

const SYSTEM = `Você é o "EletricAI Architect", um engenheiro elétrico industrial sênior brasileiro.
Projete um SISTEMA ELÉTRICO COMPLETO seguindo NBR 5410, NBR 14039, NR-10, NR-12 e IEC 61131-3.
... KINDS: breaker, contactor, relay, transformer, vfd, softstarter, psu, busbar, ccm, motor, conveyor, screw, valve, pump, tank, reactor, cylinder, pt100, pressure, flow, level, estop, lightcurtain, encoder ...`;

// Schema de resposta via tool_call (function calling) — não parsing de texto
const TOOL = {
  type: "function",
  function: {
    name: "design_industrial_system",
    description: "Devolve o sistema elétrico industrial completo estruturado.",
    parameters: {
      type: "object",
      properties: {
        title, rationale, transformer: { kVA, primary_kV, secondary_V },
        ccm: { columns, cells }, motors: [{ id, power_kW, voltage_V, startMethod, role }],
        nodes: [{ id, kind, category, label, params, position }],
        edges: [{ source, target, kind: "power"|"signal"|"pipe" }],
      },
      required: ["title", "rationale", "transformer", "ccm", "motors", "nodes", "edges"],
    },
  },
};

// RAG: busca chunks normativos na tabela normative_chunks (ILIKE keywords do prompt)
async function fetchNormativeContext(supabase, prompt): Promise<{ chunks; hits }>;
// Extrai tokens ≥4 chars do prompt, filtra stopwords, busca ILike — sem embeddings

// Atomic credit gate: supabase.rpc("consume_ai_credits", { p_operation: "generate_panel" })
// ANTES de chamar DeepSeek (não depois como na spec original)

// Chamada DeepSeek com tool_choice forçado:
fetch("https://api.deepseek.com/chat/completions", {
  model: "deepseek-chat",
  messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userMsg }],
  tools: [TOOL],
  tool_choice: { type: "function", function: { name: "design_industrial_system" } },
  temperature: 0.3,
});

// Tratamento de erros:
// MISSING_KEY, INVALID_KEY_FORMAT, AUTH_401, RATE_LIMIT_429, NO_CREDITS_402, UPSTREAM_5XX

// Server Functions exportadas:
export const generateArchitecture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => { /* ... */ });

export const getAiCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => { /* supabase.rpc("get_ai_credits_remaining") */ });

export const pingArchitect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => { /* teste de conectividade DeepSeek */ });
```

### Passo 6.2 — Duas Interfaces de Chat

**CanvasAiChat** (`src/components/canvas-ai-chat.tsx`) — FAB flutuante no workspace:
```
┌──────────────────────────────────────────────────┐
│ 🤖 NEXUSMIND AI CO-PILOR   [Demo c/ falhas] [✕] │
│ 🔥 142/250 créditos                              │
├──────────────────────────────────────────────────┤
│ 🔮 Alertas Normativos NexusMind                  │
│ ✅ Todos os canvas em conformidade               │
├──────────────────────────────────────────────────┤
│                                                  │
│ 🤖 NexusMind                                     │
│ Olá, sou o **NexusMind**, sua IA especialista... │
│                                                  │
│ 👤 Você                                          │
│ Projete um disjuntor de 125A NBR-5410...         │
│                                                  │
│ 🤖 NexusMind                                     │
| **Sistema: QGBT 125A**                          │
│ CCM: 2 colunas...                               │
│ [Aplicar ao Canvas]                              │
│                                                  │
├──────────────────────────────────────────────────┤
│ [📄 Upload Briefing]                             │
│ ┌──────────────────────────────────────────┐     │
│ │ Digite seu comando...              [➤]   │     │
│ └──────────────────────────────────────────┘     │
│ 📩 Enter envia · Shift+Enter quebra linha        │
└──────────────────────────────────────────────────┘
```

**Página `/ai`** (`src/routes/ai.tsx`) — Full-page com resultados detalhados:
```
┌──────────────────────────────────────────────────────┐
│ 🔮 EletricAI Copilot               CORE ENGINE       │
│ Motor de IA que projeta sistemas elétricos completos │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 🤖 EletricAI                                         │
│ Descreva uma planta, um equipamento...               │
│                                                      │
│ 👤 Você                                              │
│ Sala de máquinas: 15 motores...                      │
│                                                      │
│ 🤖 EletricAI                                         │
│ **Sala de Máquinas - Amônia**                        │
│ ...                                                  │
│                                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │Trafo     │ │Motores   │ │Corrente  │              │
│ │500 kVA   │ │15        │ │1,245 A   │              │
│ │13.8/380V │ │Σ 412 kW  │ │Dem. 580  │              │
│ └──────────┘ └──────────┘ └──────────┘              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │CCM       │ │Nós       │ │Trafo     │              │
│ │6 col.    │ │142       │ │sugerido  │              │
│ │24 cél.   │ │89 lig.   │ │600 kVA   │              │
│ └──────────┘ └──────────┘ └──────────┘              │
│                                                      │
│ [Aplicar como Unifilar] [Aplicar como Ladder]        │
│ [Aplicar e abrir Workspace]                          │
│                                                      │
│ 🛡 Validação normativa                               │
│ Conforme NBR 5410 / NBR 14039 / NR-10 / NR-12...    │
│                                                      │
│ ⚙ Detalhamento por motor                            │
│ ┌──────┬─────┬─────┬──────┬──────┬──────┬─────────┐ │
│ │ ID   │ PkW │ In  │ Ist  │ Cabo │ Disj │ Partida │ │
│ │ M-01 │ 30  │ 57  │ 370  │ 25mm²│ 70A  │ DOL     │ │
│ └──────┴─────┴─────┴──────┴──────┴──────┴─────────┘ │
│                                                      │
│ [💡 Sala máquinas...] [💡 Esteira 7.5kW...]          │
│                                                      │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐     │
│ │ Descreva uma planta...                 [➤]   │     │
│ └──────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

### Passo 6.3 — Aplicação Cross-Module (applyArchitectToStore)
```typescript
// src/lib/ai-architect-client.ts — applyArchitectToStore(result, { mode: "replace"|"merge" })
// Aplica o resultado da IA em TODOS os módulos simultaneamente:

// 1. useProjectStore (SCADA/Twin): mapeia nodes/edges → IndustrialNode/IndustrialEdge
// 2. useVoltaiStore (Unifilar): mapeia kind → VoltaiComponentType (QF, KM, M, TR, VFD...)
// 3. useEditorStore (Ladder): gera rungs DOL (partida direta + selo + alarme) para cada motor
//    - Rung 1: %I0.x (prot) AND %I0.x+1 (start) AND NOT %I0.x+2 (stop) → OTE %Q0.x (contator)
//    - Rung 2: NOT %I0.x (overload NC) → OTE %Q0.x+1 (alarm lamp)
// 4. useEditorStore (FBD): cria blocos AND + TON para cada motor
// 5. useEditorStore (Tags): auto-cria tags %I0.x, %Q0.x para cada motor
// 6. Auto-save version: supabase.project_versions.insert com snapshot

// Erro tratado via AIServiceError com códigos + userMessage + steps
// Créditos: getLocalAiUsage() + incrementLocalAiUsage() (localStorage + evento "ai-usage-event")
// Status tracking: getStatusEvents() + pushStatus() (localStorage + evento "ai-status-event")
```

**Critérios de Aceitação da Fase 6:**
- [x] Chat abre/fecha via FAB no workspace (CanvasAiChat)
- [x] Página dedicada `/ai` com interface full-page de resultados
- [x] DeepSeek via tool_call (function calling estruturado, não parse de texto)
- [x] RAG normativo via normative_chunks (ILIKE keyword, sem embeddings)
- [x] Créditos debitados atomicamente ANTES da chamada (consume_ai_credits RPC)
- [x] Erro de créditos insuficientes → dispara trigger-upgrade-modal
- [x] applyArchitectToStore aplica em 4 módulos: SCADA/Twin + Unifilar + Ladder + FBD + tags
- [x] Auto-save de versão do projeto após cada geração
- [x] Upload de PDF (simulado com OCR → mock result)
- [x] Health check via pingArchitect + rota /settings/ai-status
- [x] Cálculos elétricos embutidos: calcDemand + calcMotor (Tabela 36/37 NBR 5410)
- [x] Validação normativa do resultado: validateProject + summarize
- [ ] Rate limiting (pendente — tratado via AUTH_429 apenas no provider)

---

## FASE 7 — SIMULAÇÃO, TELEMETRIA E DIGITAL TWIN

**Objetivo:** Três camadas de simulação — (1) física de componentes elétricos no Voltai, (2) runtime de planta com OPC-UA/Modbus, (3) Digital Twin 3D com What-If preditivo — mais telemetria IoT em tempo real.
**Duração estimada:** 8–12 dias.

### Arquitetura — 3 Camadas de Simulação

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — DIGITAL TWIN (5º módulo — "twin")                │
│  twin-canvas.tsx + twin-3d-viewer.tsx + EditorTwinSidebar    │
│  ├─ TwinCanvas: isométrico 2D com sensor badges + sparklines │
│  ├─ Twin3DViewer: React Three Fiber (Motor3D, Tank3D, Pump) │
│  ├─ "What-If" preditivo: load/voltage/temp delta + horizon   │
│  │  → modelo físico motor + térmico → predições speed/eff    │
│  └─ Telemetria: polling tags SPEED/CURRENT/LEVEL 30-sample   │
│     + maintenance alert marker                                │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 — RUNTIME DE PLANTA (conexão com mundo real)        │
│  runtime-client.ts + project-store.ts + EditorSimSidebar     │
│  ├─ Supabase Realtime broadcast channel (tick events)        │
│  ├─ Local fallback: startLocalSimulation() gera tags a 50ms  │
│  │  (SPEED, CURRENT, NIVEL, POS para motores/pumps/tanks)    │
│  ├─ applyTick(payload): merge tags + energized + params+logs │
│  ├─ OPC-UA / Modbus console tabs no BottomPanel              │
│  └─ Planos Pro/Premium gateiam feature "realtime"            │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1 — FÍSICA DE COMPONENTES (Voltai — a cada 50ms)     │
│  voltai/store.ts + useVoltaiSimulation() + EditorSidebar     │
│  ├─ simulateStep(stepMs) → simulateComponent() cada nó       │
│  ├─ I²t térmico (QF), curva magnética (disjuntor)            │
│  ├─ Coil energização (KM/KA/CR), rotor (M), timer (KT)      │
│  ├─ Corrente, potência, torque, velocidade, temperatura      │
│  └─ compact serialization → serial exec em runtime-client    │
└──────────────────────────────────────────────────────────────┘
```

### Passo 7.1 — Digital Twin (5º módulo — `"twin"`)

```typescript
// src/components/canvases/twin-canvas.tsx — 876 linhas
// Renderiza estação de bombeamento isométrica (Canvas 2D):
//   - Tanque com nível animado, motor com eixo rotativo, ondas fluido
//   - Sensor badges: M01.SPEED, M01.CURRENT, LT_01.LEVEL
//   - Telemetry history: buffer 30 amostras → SVG sparkline inline
//
// What-If Panel (painel preditivo):
//   - Sliders: ΔLoad (-50% a +50%), ΔVoltage (-15% a +15%), ΔTemp (-20 a +40°C)
//   - Horizon: 1/6/24/168 horas
//   - Modelo físico: motor assíncrono + térmico
//   - Saídas: speed, current, temp, efficiency, bearing L10 life, failure risk
//
// 2D/3D toggle → Twin3DViewer (React Three Fiber):

// src/components/canvases/twin-3d-viewer.tsx — 286 linhas
// <Canvas> com <OrbitControls>
//   - Motor3D: cilindro + rotor animado (useFrame), emissive ring se running
//   - Tank3D: geometria vidro + líquido com vertex displacement (wave)
//   - Pump3D: impelidor rotativo
//   - Pipe, Ground com grid, HTML labels (speed, level)
// Tags lidas de: useProjectStore + useEditorStore

// src/components/editor/sidebars/editor-twin-sidebar.tsx — 21 linhas
//   - Busca de ativos GLB/GLTF (import placeholder)
//   - "Tags vinculadas" (placeholder vazio)
```

### Passo 7.2 — Runtime e Simulação de Planta (7º módulo — `"sim"`)

```
src/components/canvases/sim-canvas.tsx — 498 linhas
┌─────────────────────────────────────────────────────────────────┐
│ Simulação · Osciloscópio            [▶ Play] [⏸ Pause] [📥]   │
│ Tags: [Todos ▼] Buffer: [30s ▾]                                │
├─────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ AreaChart (Recharts) — speed / current / level / temp     │   │
│ │ V ┤  ┌─────────────┐                                     │   │
│ │    ──│   sparkline  │──                                  │   │
│ │  0 ┴─└─────────────┴──                                   │   │
│ │      t (s)                                               │   │
│ └───────────────────────────────────────────────────────────┘   │
│ Scan: 50ms | Viz: 3/3 | Samples: 512 | Quality: Good           │
│                                                                  │
│ [👁 Watch Table] [🔔 Alarmes]                                   │
├─────────────────────────────────────────────────────────────────┤
│ (Watch Table — opcional, toggle showWatch)                      │
│ ┌────────────────────────────────────────────────────────┐      │
│ │ Watch Table  [🔍 Buscar...]  [⟳ Auto-refresh: ON]     │      │
│ │ Motor_M01.SPEED     | 1750.0 | [Forçar] [Release]     │      │
│ │ Motor_M01.CURRENT   |   12.4 | [Forçar] [Release]     │      │
│ │ TQ_01.LEVEL         │   67.2 | [Forçar] [Release]     │      │
│ │ PT_01.PRESSURE      │    3.8 | [Forçar] [Release]     │      │
│ └────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Fontes de dados runtime:**
```typescript
// src/lib/runtime-client.ts
// Conexão via Supabase Realtime (broadcast channel "tick")
// Ou fallback local: startLocalSimulation() → gera dados sintéticos
//   - Motores: SPEED (1750 +-5%), CURRENT (12.4 +-20%), TEMP (65 +-5%)
//   - Tanques: LEVEL (50-80% senoidal), POS (válvula)
//   - Bombas: PUMP (boolean, alterna)
// Polling a cada 50ms (20 Hz)

// project-store.ts — applyTick(payload):
//   { ts, cycleMs, tags: Record<string, number>, energized, params, logs }
//   Faz merge dos valores + log entries + estado energizado
```

**Simulação de Componentes (Voltai Store — física cross-module):**
```typescript
// src/lib/voltai/store.ts — simulateStep(stepMs)
// Itera todos os componentes, chama simulateComponent() para cada tipo:
//   QF (disjuntor): I²t térmico + curva magnética (sobrecarga = trip)
//   FU (fusível): I²t → blow se corrente excede
//   KM (contator): coil energizado = contatos fecham
//   KA/CR (relé): lógica igual KM
//   M (motor): corrente proporcional à carga; torque/velocidade
//   FR/MPCB (relé térmico): sobrecarga → contato NC abre
//   KT (timer): acumula tempo se coil ligado; dispara delay
//   CT (contador): incrementa/decrementa borda
//   UPS: descarga linear conforme corrente
//   VFD, Soft-Starter: modelo simplificado (rampa de aceleração)

// src/lib/voltai/use-voltai-simulation.ts — roda a cada 50ms
export function useVoltaiSimulation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const store = useEditorStore.getState();
      /* simular Ladder rungs → obter saídas → alimentar Voltai */
      useVoltaiStore.getState().simulateStep(50);
    }, 50);
    return () => clearInterval(interval);
  }, [enabled]);
}

// src/components/simulation/watch-table.tsx — 220 linhas
// Lê de editorStore.tags (Ladder/PLC) + projectStore.tags (SCADA)
// Força valor booleano (toggle) ou numérico (slider) via editorStore.forceTag()
// Auto-refresh toggle
```

**Gerenciamento de Alarmes ISA-18.2:**
```typescript
// src/lib/simulation/scada-engine.ts — 114 linhas
// ScadaEngine class: evaluate(tags), acknowledge(tag), getActiveAlarms()
// Prioridades: CRITICAL > HIGH > MEDIUM > LOW
// Regras configuradas no sim-canvas.tsx:
//   TEMP_M01 > 90°C     → CRITICAL
//   TANQUE_NIVEL < 20%  → HIGH
//   PRESSAO_PT01 > 10   → MEDIUM
//   ESTOP                → CRITICAL
//   VIBRACAO_M03 > 7    → MEDIUM
// Notificações: pushNotification("alarm", ...) no sim-canvas
```

### Passo 7.3 — Telemetria IoT (/realtime)

```typescript
// src/routes/realtime.tsx — 434 linhas
// Feature gate: tenant_has_feature("realtime") (Pro/Premium)
// Página dedicada com:
//   - Device list (iot_devices table — da Supabase)
//   - Live telemetry chart (SVG sparkline via Supabase Realtime iot_readings)
//   - Alert panel (iot_alerts → acknowledge via server function)
//   - Command panel → enqueue PLC commands (iot_enqueue_command RPC)
//   - API key creator (scope iot:ingest)

// src/lib/iot.functions.ts — 128 linhas
// listIotDevices, getLatestReadings, listIotAlerts (server functions)
// acknowledgeAlert, enqueueIotCommand, checkRealtimeFeature
// createIotApiKey (scope "iot:ingest")

// Tabelas: iot_devices, iot_readings, iot_alerts, plant_telemetry, simulation_tags
// Enums: simulation_tag_data_type (BOOL | INT | REAL)
// RPCs: batch_update_simulation_tags, iot_enqueue_command
```

### Passo 7.4 — Sidebar de Simulação (EditorSimSidebar)
```
src/components/editor/sidebars/editor-sim-sidebar.tsx — 296 linhas
┌──────────────────────────────┐
│ 🔌 Runtime Connection        │
│ [▶ Iniciar] [■ Parar]       │
│ Modo: [Unifilar ▾]           │
│ Velocidade: [1x] [10x] [100x]│
├──────────────────────────────┤
│ 🔍 Buscar tag...             │
├──────────────────────────────┤
│ 🎯 Watch List / Forçamento   │
│ ┌─────────────────────────┐  │
│ │ Motor_M01.SPEED 1750.0 │  │
│ │ [▶ Forçar]             │  │
│ │ ─────────────────────  │  │
│ │ Motor_M01.CURRENT 12.4 │  │
│ │ [▶ Forçar]             │  │
│ └─────────────────────────┘  │
├──────────────────────────────┤
│ Variáveis de Forçamento      │
│ (toggles bool + sliders num) │
└──────────────────────────────┘
```

**Critérios de Aceitação da Fase 7:**
- [x] Digital Twin 2D isométrico com sensor badges + sparklines
- [x] Digital Twin 3D (R3F) com Motor/Tank/Pump animados
- [x] "What-If" preditivo com modelo motor + térmico + L10 bearing
- [x] Runtime local (startLocalSimulation) gera dados sintéticos a 50ms
- [x] Runtime via Supabase Realtime broadcast (produção)
- [x] Osciloscópio Recharts em sim-canvas com buffer configurável
- [x] Watch Table com tags de ambas stores (editor + project) e auto-refresh
- [x] Forçar variável (bool toggle / numeric slider)
- [x] Alarmes ISA-18.2 (ScadaEngine) com CRITICAL/HIGH/MEDIUM/LOW
- [x] Notificações de alarme via pushNotification
- [x] IoT/Telemetria via /realtime com devices, readings, alerts, commands
- [x] Voltai simulationStep a cada 50ms (física de 46+ tipos de componente)
- [x] I²t térmico, curva magnética, coil energização, timer/counter lógica
- [x] Feature gate "realtime" para Pro/Premium
- [ ] Integração OPC-UA / Modbus real (console tabs existem, conexão real TBD)

---

## FASE 8 — MÓDULOS FBD E PLC

**Objetivo:** Implementar os módulos FBD (Function Block Diagram) e PLC (Programmable Logic Controller IDE).
**Duração estimada:** 8–12 dias.

### Passo 8.1 — Módulo FBD (3º módulo — `"fbd"`)

**Arquitetura:**
```
src/lib/fbd/
├── types.ts       — 296 linhas: FbdBlockKind (23 tipos), FbdBlock, FbdPin, FbdConnection, FbdProgram, BLOCK_DEFINITIONS
├── compiler.ts    — 220 linhas: compileFbdToSt() + compileFbdToIL() (IEC 61131-3 ST/IL)
└── runtime.ts     — 360 linhas: scanFbd() — in-browser soft-PLC runtime com timer/counter state
src/components/
├── canvases/fbd-canvas.tsx    — 582 linhas: React Flow visual editor + sim + code export
└── editor/sidebars/editor-fbd-sidebar.tsx — 59 linhas: palette drag-drop em 8 categorias
src/__tests__/fbd-runtime.test.ts — 167 linhas: 9 testes Vitest
```

**23 Block Kinds em 8 Categorias (BLOCK_DEFINITIONS):**
| Categoria | Blocos |
|-----------|--------|
| Lógica | AND, OR, NOT, XOR |
| Memória (Flip-Flop) | SR (set-dominant), RS (reset-dominant) |
| Temporizador | TON (on-delay), TOF (off-delay), TP (pulse) |
| Contador | CTU (up), CTD (down) |
| Matemática | ADD, SUB, MUL, DIV |
| Comparação | GT, LT, EQ, GE, LE, NE |
| Movimentação | MOVE (conditional copy) |
| Seleção | SEL (2-to-1 mux) |

**FbdCanvas (`fbd-canvas.tsx`):**
- **FbdBlockNode** — nó React Flow customizado com:
  - Header com label + tipo
  - Input handles à esquerda, output handles à direita
  - Botão de configuração de parâmetros
  - Valor atual dos pinos durante simulação (runtime feedback)
  - Pinos coloridos por tipo: BOOL=cyan, INT=yellow, REAL=green
- **onConnect** — validação de tipo na conexão (rejeita se tipo incompatível)
- **onDrop** — arrasta da sidebar → cria nó com pins e defaults corretos
- **drag 'n' drop** — MIME type `application/fbd-block`
- **Simulação** — setInterval 100ms: nodes→FbdBlock[], edges→FbdConnection[], scanFbd()→pinValues
- **Toolbar:** Play/Stop, Show ST, Show IL, Delete, Export
- **Code Panel:** painel estilo Monaco (read-only) com código ST ou IL compilado + export .st/.il

**Compilador (`compiler.ts`):**
```typescript
// ST output example:
AND1_OUT := IN1 AND IN2;
TON_TON(IN := IN1, PT := T#1000MS, Q => TON1_OUT, ET => TON1_ET);

// IL output example:
LD IN1
AND IN2
ST AND1_OUT
```

**Runtime (`runtime.ts`):**
- `FbdRuntimeState` — blockOutputs, timerStates (accum, running, done), counterStates (count, done), srStates
- `scanFbd(blocks, connections, externInputs, state, dtMs)` → `FbdScanResult`
- Processa blocos em ordem topológica, propaga valores via conexões
- Timers: TON acumula enquanto IN=true, TOF delay após IN=false, TP pulso fixo
- Counters: CTU sobe na borda Cu, CTD desce na borda Cd

**Testes Vitest (9 casos):**
- AND, OR, NOT, SR, TON, CTU, ADD, GT, chained blocks (AND→OR)

### Passo 8.2 — Módulo PLC (6º módulo — `"plc"`)

**Arquitetura:**
```
src/lib/plc/
├── types.ts       — 271 linhas: PlcProject, PlcVariable, PlcModule, PlcProgramBlock, HARDWARE_CATALOG (14 módulos)
└── store.ts       — 99 linhas: usePlcStore — Zustand CRUD para projeto PLC
src/components/
├── canvases/plc-canvas.tsx    — 631 linhas: PLC IDE com 4 abas
└── editor/sidebars/editor-plc-sidebar.tsx — 38 linhas: árvore Hardware/Tags/Programas
```

**PlcCanvas — IDE Completa (`plc-canvas.tsx`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ [📊 Dashboard] [🔧 Hardware] [📋 Variáveis] [📝 Blocos]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ─── DASHBOARD ───                                                │
│ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐     │
│ │ CPU    │ │ HARD   │ │  PROGR   │ │  VARS  │ │ DIAG     │     │
│ │ S7-1214│ │ 3/12   │ │  5 bl.   │ │  8/32  │ │ OK       │     │
│ └────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘     │
│ Tabela de valores de tags (live)                                │
│                                                                  │
│ ─── HARDWARE ───                                                │
│ Esquerda: catálogo (14 módulos Siemens S7-1200/1500)           │
│   CPU: S7-1211C, S7-1214C, S7-1511, S7-1516                   │
│   DI: 8/16/32 ch                                                │
│   DO: 8 relay/16/32 ch, AI: 4/8 ch, AO: 4 ch                   │
│   Comm: Profinet, Modbus TCP, PS: 24V/10A                       │
│ Direita: rack view com slots, dots coloridos por categoria     │
│   add/remove module                                             │
│                                                                  │
│ ─── VARIÁVEIS ───                                               │
│ Tabela editável inline:                                         │
│ ┌──────┬──────────┬──────┬──────────┬─────┬──────────┐         │
│ │ Nome │ Endereço │ Tipo │ Inicial │ Ret │ Coment   │         │
│ │START │ %I0.0    │ BOOL │ FALSE   │ □   │ Botão... │         │
│ └──────┴──────────┴──────┴──────────┴─────┴──────────┘         │
│ ADD / SAVE / DELETE                                             │
│                                                                  │
│ ─── BLOCOS ───                                                  │
│ Esquerda: lista de program blocks (coloridos: OB=FC=FB=DB)     │
│   MAIN (Ladder), MotorCtrl (ST), Alarm (FBD)                   │
│ Direita: Monaco Editor para código ST                          │
│   Language: [LAD ▾] → switch entre Ladder/FBD/ST               │
│   LAD e FBD mostram placeholder "Edite no canvas principal"    │
│   Compile button                                                │
└─────────────────────────────────────────────────────────────────┘
```

**PLC Types (`types.ts`):**
```typescript
interface PlcProject {
  vendor: "siemens" | "rockwell" | "schneider" | "generic";
  rack: PlcModule[];
  variables: PlcVariable[];
  programBlocks: PlcProgramBlock[];
  cycleTimeMs: number; // default 100
}

interface PlcVariable {
  id: string;
  name: string;       // e.g. "START"
  address: string;    // e.g. "%I0.0"
  type: "BOOL" | "BYTE" | "WORD" | "DWORD" | "INT" | "DINT" | "REAL" | "TIME" | "STRING";
  initialValue: string;
  comment: string;
  retentive: boolean;
}

interface PlcModule {
  id: string;
  catalogKey: string;
  category: "cpu" | "di" | "do" | "ai" | "ao" | "comm" | "power";
  label: string;
  description: string;
  slot: number;
  channels: number;
  params: Record<string, unknown>;
}

interface PlcProgramBlock {
  id: string;
  name: string;         // e.g. "Main"
  type: "OB" | "FC" | "FB" | "DB";
  number: number;
  language: "ladder" | "fbd" | "st";
  code: string;         // ST code (Monaco editable)
  comment: string;
}
```

**PLC Store (`store.ts`):**
- `activeTab`: `"dashboard" | "hardware" | "variables" | "blocks"`
- `activeBlockId`: bloco selecionado
- `addModule/removeModule`: gerencia rack com auto-increment slot
- `addVariable/updateVariable/removeVariable`: CRUD variáveis
- `addBlock/updateBlock/removeBlock`: CRUD blocos

**EditorPlcSidebar:**
```
┌──────────────────────────────┐
│ 🔧 Projeto PLC               │
│ ├─ Hardware                   │
│ │  ├─ CPU S7-1214C            │
│ │  ├─ DI 16x 24V              │
│ │  └─ DO 16x Relay            │
│ ├─ Tags                       │
│ │  ├─ %I0.0 START             │
│ │  ├─ %I0.1 STOP              │
│ │  └─ %Q0.0 K1_CMD            │
│ └─ Programas                  │
│    ├─ MAIN (Ladder)           │
│    └─ SUB_MOTOR (FBD)         │
└──────────────────────────────┘
```

**Integração com Simulação:**
- Variáveis PLC são tags no `editorStore.tags`
- `editor-sim-sidebar.tsx` permite forçar/release tags PLC durante simulação runtime
- `editorStore.forceTag(address, value)` + `editorStore.releaseTag(address)`

---

## FASE 9 — PLANOS, PAGAMENTOS E CRÉDITOS DE IA

**Objetivo:** Assinaturas via Stripe + Mercado Pago (Pix/Boleto), plan_limits com feature gating, créditos de IA atômicos via RPC.
**Duração estimada:** 4–5 dias.

### Planos (src/lib/plans.ts)

| Plano | Preço (BRL/mês) | Créditos IA/mês | Projetos | Realtime | Features (plan_limits) |
|-------|----------------|-----------------|----------|----------|------------------------|
| Free | R$ 0 | 10 | 3 | ✗ | basic_diagrams, pdf_export, community_support |
| Basic | R$ 100 | 100 | 10 | ✗ | standard_ai, pdf_export, email_support |
| Pro | R$ 580 | 250 | ∞ | ✓ | advanced_ai, digital_twin, realtime, opcua, modbus, priority_support |
| Premium | R$ 1.000 | ∞ | ∞ | ✓ | all_features, dedicated_capacity, sla, custom_integrations |

Os limites reais estão na tabela `plan_limits` no banco. O `SUBSCRIPTION_PLANS` array em `plans.ts` é a fonte de verdade do frontend.

### Tabela `ai_credit_costs` (banco)

| operation | credits | description |
|-----------|---------|-------------|
| generate_single_line | 1 | Geração de diagrama unifilar |
| generate_panel | 5 | Geração de painel elétrico completo |
| generate_digital_twin | 10 | Geração de digital twin |
| analyze_safety | 3 | Análise de segurança / NR-10 / NR-12 |
| suggest_optimization | 2 | Sugestões de otimização |

### Passo 9.1 — Webhooks Dual Provider (Stripe + Mercado Pago)

**Stripe — TanStack Route** (`src/routes/api/public/stripe.webhook.ts`, 202 linhas — **primário**):
```typescript
// Rota POST /api/public/stripe.webhook — sem auth middleware (Stripe envia)
// Verifica HMAC-SHA256 com stripe.webhooks.constructEvent(body, signature, webhookSecret)
// Eventos tratados:
//   checkout.session.completed → ativar subscription, setar plano
//   customer.subscription.updated → trocar plano (upgrade/downgrade)
//   customer.subscription.deleted → rebaixar para 'free'
//   invoice.paid → registrar pagamento, renovar créditos (reset consumo mensal)
//   invoice.payment_failed → marcar como failed
```

**Stripe — Edge Function** (`supabase/functions/stripe-webhook/index.ts`, 199 linhas — **alternativa**):
```typescript
// Deno Edge Function, mesmo comportamento, deploy via supabase functions deploy
// Usa crypto.subtle.verify() para verificar assinatura
```

**Mercado Pago — TanStack Route** (`src/routes/api/public/mp.webhook.ts`, 103 linhas):
```typescript
// Rota POST /api/public/mp.webhook
// Verifica shared secret (x-mp-signature + x-request-id)
// Re-fetch pagamento via MP API para confirmar
// Atualiza tenants.status + invoices
// Idempotência via tabela mp_webhook_processed (payment_id)
```

### Passo 9.2 — Funções SQL: Consumo Atômico de Créditos

```sql
-- NÃO usar decrement_ai_credits — a função real é:

-- Retorna saldo do mês atual (plan_limits driven, não campo profiles.ai_credits)
CREATE OR REPLACE FUNCTION get_ai_credits_remaining()
RETURNS TABLE(
  plan TEXT, max_credits INT, used INT, remaining INT, unlimited BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
  -- Lê plan_limits.max_ai_tokens_month + usage_records do mês corrente
  -- Se unlimited, retorna remaining = -1
$$;

-- Operação atômica: debita ANTES de chamar DeepSeek (evita gastar sem crédito)
CREATE OR REPLACE FUNCTION consume_ai_credits(p_operation TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
  -- 1. Lê custo de ai_credit_costs WHERE operation = p_operation
  -- 2. LOCK plan_limits + usage_records FOR UPDATE
  -- 3. Verifica se used + cost <= max_ai_tokens_month
  -- 4. Insere em usage_records
  -- 5. Se estourar: RAISE 'insufficient_credits'
$$;
```

**Chamada no servidor** (src/lib/ai-architect.functions.ts:208-228):
```typescript
// ANTES de chamar DeepSeek:
const { data, error } = await supabase.rpc('consume_ai_credits', {
  p_operation: 'generate_panel',
});
if (error) throw new AIServiceError('NO_CREDITS_402', ...);
```

**Project limit gating** (src/lib/projects.functions.ts:74-98):
```typescript
// ANTES de criar projeto:
const { data } = await supabase.rpc('check_project_limit');
if (data?.exceeded) throw new Error('Project limit reached for plan');
```

### Passo 9.3 — Billing UI (3 entry points)

**`/settings/billing`** (`src/routes/settings.billing.tsx`, 225 linhas — **página completa**):
```
┌──────────────────────────────────────────────────────────────────┐
│  ⚙ Faturamento e Assinatura                                     │
├──────────────────────────────────────────────────────────────────┤
│  Assinatura Atual: PRO · R$ 580/mês                             │
│  Créditos IA: 142/250 usados este mês                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐                    │
│  │ FREE │ │BASIC │ │   PRO    │ │ PREMIUM  │                    │
│  │Grátis│ │R$100 │ │  R$580   │ │ R$1.000  │                    │
│  │10 IA │ │100 IA│ │  250 IA  │ │IA Ilimit.│                    │
│  │3 proj│ │10proj│ │ Ilimitado│ │ Ilimitado│ ← Atual            │
│  │      │ │      │ │  ✓ REAL  │ │Suporte 24│                    │
│  │      │ │Upgrade│ │ Upgrade  │ │ Upgrade  │                   │
│  └──────┘ └──────┘ └──────────┘ └──────────┘                    │
│  [Pagar com Stripe] [Pagar com Mercado Pago (Pix/Boleto)]      │
│                                                                  │
│  Histórico de Faturas                                           │
│  ┌──────────────────────────────────────────────┬──────────┐    │
│  │ Pro · mai/2026                              │ R$ 580   │    │
│  │ Basic · abr/2026                            │ R$ 100   │    │
│  └──────────────────────────────────────────────┴──────────┘    │
│                                                                  │
│  [Cancelar Assinatura] (cancel_at_period_end)                    │
└──────────────────────────────────────────────────────────────────┘
```

**Upgrade Modal** (`src/components/upgrade-modal.tsx`, 131 linhas):
- Disparado por evento `trigger-upgrade-modal` (via créditos insuficientes ou feature gate)
- Mostra 3 planos pagos com Stripe + MP buttons
- `createStripeCheckout({ priceId, tenantId })` → redirect Stripe
- `createMpPreference({ planId, tenantId })` → redirect MP (Pix/Boleto)

**Pricing na Landing Page** (`src/routes/index.tsx:396-469`):
- Inline 4 cards com links para `/settings/billing`

### Feature Gating
```typescript
// RPC: tenant_has_feature(p_feature) → boolean
// Verifica: plan_limits.features @> p_feature OU contains "all_features"
// Usado em:
//   - /realtime → upgrades se plano não tem "realtime"
//   - AI credits → bloqueia se max_ai_tokens_month = 0
//   - Digital Twin → bloqueia se não tem "digital_twin"

// Server Functions de billing:
//   getBillingOverview() → plan, stripe IDs, subs, invoices, usage
//   changePlanManual() → admin override (chama change_tenant_plan RPC)
//   createStripeCheckout() → Stripe session URL
//   createMpPreference() → MP preference URL
//   cancelSubscription() → set cancel_at_period_end
```

**Critérios de Aceitação da Fase 9:**
- [x] Stripe webhook TanStack route (primário) + Edge Function (alternativa)
- [x] Mercado Pago webhook (Pix/Boleto)
- [x] `consume_ai_credits()` atômico com row lock + plan_limits
- [x] `get_ai_credits_remaining()` com saldo do mês
- [x] Checkout Stripe e MP abrem corretamente
- [x] UI billing em `/settings/billing` com plano atual
- [x] Upgrade modal disparado por evento
- [x] Feature gating via `tenant_has_feature` RPC
- [x] Project limit enforcement (check_project_limit)
- [x] Cancelamento com cancel_at_period_end
- [x] Histórico de faturas
- [x] Admin override (changePlanManual)

---

## FASE 10 — EXPORTAÇÃO, COMPARTILHAMENTO, NOTIFICAÇÕES E ALARMES

**Objetivo:** Exportação PDF/DXF/BOM, sistema de notificações em tempo real, compartilhamento com colaboração, e módulo de alarmes ISA-18.2.
**Duração estimada:** 6–8 dias.

### Passo 10.1 — Exportação PDF + DXF + BOM (lado cliente, não Edge Function)

**Arquitetura:**
```
src/routes/projects.$projectId.export.tsx   — Página de exportação (PDF + DXF)
src/routes/projects.$projectId.bom.tsx      — Página de BOM (Bill of Materials)
src/lib/pdf-export.ts                       — Geração PDF via jsPDF (lado cliente)
src/lib/dxf-export.ts                       — Geração DXF R12 (AutoCAD)
src/lib/export.functions.ts                 — Server function getProjectExportData
src/lib/bom.functions.ts                    — CRUD de itens BOM (5 server functions)
```

**PDF Export** (`pdf-export.ts`, 159 linhas):
```typescript
import { jsPDF } from 'jspdf';
buildProjectPdf({ project, diagrams, bom, totalBRL }) → jsPDF document
// Gera A4 com: header EletricAI, bloco identificação, tabela BOM, total estimado
// Suporte multi-página com numeração
// Salva via pdf.save("relatorio.pdf")
```

**DXF Export** (`dxf-export.ts`, 163 linhas):
```typescript
buildDxf(nodes: DxfNode[], edges: DxfEdge[]) → string (AutoCAD R12 ASCII DXF)
// ENTITIES: LINE, CIRCLE, TEXT
// Layers: COMPONENTS, WIRES, LABELS, SYMBOLS
// Símbolos: motor (círculo + "M"), trafo (círculos sobrepostos), disjuntor (caixa + diagonal)
downloadDxf(filename, dxf) → trigger download .dxf
```

**BOM Management** (`/projects/$projectId/bom`, 266 linhas):
```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Lista de Materiais (BOM)     [Gerar do Canvas] [+ Adicionar]│
├──────────────────────────────────────────────────────────────────┤
│ ┌──────┬──────────────┬──────────┬───┬──────┬────────┬────────┐ │
│ │ PN   │ Descrição    │ Fabric.  │Qtd│Preço │Subtotal│ Origem │ │
│ │FU-01│ Fusível 10A  │WEG       │ 3 │R$ 12 │ R$ 36  │ Canvas │ │
│ │QF-01│ Disj. 125A   │Siemens   │ 1 │R$ 890│R$ 890  │ Manual │ │
│ │...  │              │          │   │      │        │        │ │
│ └──────┴──────────────┴──────────┴───┴──────┴────────┴────────┘ │
│                                             Total: R$ 12.450    │
└──────────────────────────────────────────────────────────────────┘
```
- `listBom/addBomItem/updateBomItem/deleteBomItem` (server functions)
- `generateBomFromCanvas` (RPC: `generate_bom_from_canvas`)
- Catálogo pesquisável para adicionar itens manuais
- Inline editing de qty/price

### Passo 10.2 — Notificações In-App (completo)

**Arquitetura:**
```
src/lib/notification-store.ts       — Zustand store
src/lib/notification-service.ts     — pushNotification() local + Supabase
src/components/ui/notification-dropdown.tsx — Bell icon + badge + dropdown
src/hooks/use-notifications.ts      — Realtime Postgres subscription
src/components/topbar.tsx           — Integração no topbar
supabase/migrations/20260518000001_create_notifications_table.sql
```

**Tipos de Notificação:**
| type | Exemplo |
|------|---------|
| `simulation_complete` | "Simulação concluída — 0 falhas detectadas" |
| `credits_low` | "Você tem apenas 10% dos créditos restantes" |
| `team_invite` | "João convidou você para 'Subestação Industrial'" |
| `alarm` | "🔴 TEMP_M01 > 90°C — CRÍTICO" |
| `export_ready` | "Exportação PDF concluída" |
| `info` | Geral |

**Fluxo:**
1. `useNotifications()` hook no topbar inicializa contexto + carrega últimos 100 registros
2. Realtime channel `notifications-${tenantId}-${userId}` escuta INSERT na tabela `notifications`
3. `pushNotification()` cria localmente + persiste no Supabase (se contexto disponível)
4. `NotificationDropdown` mostra badge "N" no sino + dropdown com lista + "Marcar tudo"
5. ACK → `markAsRead(id)` → atualiza `read_at` no DB

**Tabela `notifications`:**
```sql
CREATE TABLE notifications (
  id UUID PK, tenant_id FK tenents, user_id FK users,
  type TEXT CHECK (type IN ('simulation_complete','credits_low','team_invite','alarm','export_ready','info')),
  title TEXT, message TEXT, data JSONB, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ
);
-- RLS: SELECT na tenant, INSERT na tenant, UPDATE próprio
-- Index: (tenant_id, user_id, created_at DESC)
```

**Integrações:**
- `ai-credits-badge.tsx`: dispara `pushNotification("credits_low")` quando créditos ≤ 10%
- `sim-canvas.tsx`: dispara `pushNotification("alarm")` em alarmes críticos via ScadaEngine

### Passo 10.3 — Compartilhamento e Colaboração em Tempo Real

**Team Management** (`/settings/team`, 247 linhas):
```
┌──────────────────────────────────────────────────────────────────┐
│  ⚙ Equipe                                                        │
├──────────────────────────────────────────────────────────────────┤
│  Workspaces (tenants)                                            │
│  ┌──────────────────────────────────────┬────────────┬─────────┐ │
│  │ EletricAI Industrial                 │ admin      │ [Ativar]│ │
│  │ Subestação ABC                       │ engineer   │ [Ativar]│ │
│  └──────────────────────────────────────┴────────────┴─────────┘ │
│                                                                  │
│  Convidar Membro                                                 │
│  Email: [____________] Papel: [admin ▾] [Convidar]              │
│                                                                  │
│  Membros                                                         │
│  ┌────────────┬──────────┬──────────────────────┬──────────────┐ │
│  │ Nome       │ Papel    │ Entrou               │              │ │
│  │ João Silva │ admin    │ 15/05/2026           │ [Remover]    │ │
│  │ Maria      │ engineer │ 16/05/2026           │ [Remover]    │ │
│  └────────────┴──────────┴──────────────────────┴──────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```
- Roles: `admin`, `engineer`, `operator`, `viewer`
- Server functions: `listMyTenants`, `switchActiveTenant`, `listTenantMembers`, `listTenantInvites`, `createInvite`, `revokeInvite`, `removeMember`, `updateMemberRole`, `acceptInviteByToken`
- RPC `accept_invite(p_token)` — valida token, checa email, upsert membership, marca invite
- Trigger `prevent_profile_privilege_escalation()` — impede auto-elevar role

**Share Modal** (`share-modal.tsx`, 121 linhas):
```
┌──────────────────────────────────────┐
│  🔗 Compartilhar Workspace            │
│                                       │
│  Link: https://.../workspace?id=xxx   │
│  [Copiar Link]                        │
│                                       │
│  Online agora:                        │
│  🟢 João · 🟢 Maria · 🟢 Carlos      │
└──────────────────────────────────────┘
```

**Real-time Collaboration** (`use-collab.ts`, 211 linhas):
```typescript
// Canal Realtime: project-collab-${projectId}
// Presence: sync/join/leave com nome + cor (paleta 7 cores)
// Broadcast cursor: broadcastCursor(x, y) → outros veem cursor
// Broadcast canvas: quando project-store ou voltai-store dirty,
//   transmite estado completo → listeners chamam setAll() das stores
// Toast: notifica quando alguém entra/sai
```

**Convite via Link** (`/invite/$token`, 78 linhas):
- Se não logado: tela "faça login para aceitar" com redirect
- Se logado: chama `acceptInviteByToken`, redireciona ao dashboard

### Passo 10.4 — Módulo Alarmes ISA-18.2 (8º módulo — `"alarms"`)

**AlarmsCanvas** (`alarms-canvas.tsx`, 123 linhas):
```
┌──────────────────────────────────────────────────────────────────┐
│  🔔 Alarmes · ISA-18.2   [🟢 Active] [🟡 Acked] [🔵 Shelved][⚪ Supp.] │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────┬──────┬──────────────┬────────────────────────┬──────────┐ │
│ │ Sev│ Code │ Tag          │ Message                │ Status   │ │
│ │ 🔴 │ A-01 │ TEMP_M01    │ Temperatura > 90°C     │ UNACK    │ │
│ │ 🟡 │ A-02 │ TQ_NIVEL    │ Nível < 20%            │ ACKED    │ │
│ │ 🔵 │ A-03 │ PRESSAO_PT01│ Pressão > 10 bar       │ UNACK    │ │
│ │ 🟢 │ A-04 │ SISTEMA     │ Sistema operacional    │ NORMAL   │ │
│ └─────┴──────┴──────────────┴────────────────────────┴──────────┘ │
│                                                     [ACK Todos]  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Total: 12 | Active: 3 | MTTR: 45min | ISA-18.2: ✓         │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```
- Severidades: `high` (🔴 AlertCircle, destaque), `med` (🟡 AlertTriangle, warning), `low` (🔵 Info), `info` (🟢 CheckCircle2)
- Não-reconhecidos: bolinha pulsante + fundo vermelho
- `BottomStrip`: Total, Active, MTTR, ISA-18.2 compliance
- Sem sidebar (left-sidebar-host retorna null para mode="alarms")

**Critérios de Aceitação da Fase 10:**
- [x] PDF export via jsPDF (lado cliente) com capa, BOM, totais
- [x] DXF export (AutoCAD R12) com símbolos elétricos em layers
- [x] BOM CRUD completo com geração a partir do canvas
- [x] Notificações: store + service + dropdown + Realtime subscription
- [x] 6 tipos de notificação com ícones no dropdown
- [x] Team management (/settings/team) com 4 roles e invite system
- [x] Share modal com link copiável + online users
- [x] Colaboração real-time: presença, cursor, broadcast canvas state
- [x] Invite accept route (/invite/$token) com login redirect
- [x] Módulo Alarmes ISA-18.2 com severidades e ACK

## 16. SEGURANÇA — CHECKLIST INVARIANTE

Execute este checklist antes de cada deploy e antes de fechar cada fase.

### Autenticação e Autorização
- [ ] Todas as rotas do cliente protegidas por middleware `requireSupabaseAuth`
- [ ] Todas as Server Functions usam `requireSupabaseAuth` middleware
- [ ] RLS habilitado em TODAS as tabelas — verificar via Supabase Dashboard
- [ ] Papéis de equipe (admin/engineer/operator/viewer) verificados no servidor para ações sensíveis

### Dados e API
- [ ] `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` são as únicas vars expostas no cliente
- [ ] `DEEPSEEK_API_KEY`, `STRIPE_SECRET_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` apenas em Server Functions + Edge Functions
- [ ] Nenhuma chave secreta em código-fonte ou `.env` commitado
- [ ] `.gitignore` inclui `.env`, `.env.local`, `.env.*.local`
- [ ] Validação Zod em TODOS os inputs de formulários e server functions
- [ ] Todos os labels de componentes SVG têm escape HTML

### Supabase RLS — Verificações Críticas
- [ ] `profiles`: usuário só lê/atualiza seu próprio perfil; trigger impede auto-escalar role
- [ ] `projects`: tenant_id + tenant_memberships verificado em todas as operações
- [ ] `tenant_memberships`: admin pode gerenciar membros, viewer só lê
- [ ] `notifications`: SELECT na tenant, INSERT na tenant, UPDATE próprio
- [ ] `invites`: apenas admin da tenant pode criar/revogar
- [ ] `ai_credit_costs`: leitura pública, escrita protegida
- [ ] Nenhuma política `FOR ALL USING (true)` — verificar explicitamente

### Frontend
- [ ] Sem `console.log` com dados de usuário em produção
- [ ] Sem `any` explícito em TypeScript — `strict: true` no tsconfig
- [ ] Imagens com `alt` text
- [ ] Sem IDs de projeto ou usuário expostos em URLs previsíveis (usar UUIDs)

### Headers HTTP (configurar no deploy)
```
X-Robots-Tag: noindex, nofollow  (páginas autenticadas)
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
```

---

## 17. TESTES E QUALIDADE

### Passo a Passo por Fase

**Antes de avançar para a próxima fase, executar:**
```bash
npm run build          # Zero erros de compilação (TanStack Start)
npm run lint           # Zero erros ESLint
npm run typecheck      # Zero erros TypeScript (tsc --noEmit)
npm run test           # Vitest — todos os testes passando
```

### Testes Manuais Críticos (antes de cada PR)
1. Fluxo de autenticação completo (signup, login, logout, Google OAuth, invite link)
2. CRUD de projetos com verificação de limite do plano Free (plan_limits.max_projects)
3. Arrastar componente → conectar → editar propriedades → salvar (Unifilar, Ladder, FBD)
4. Simulação runtime: iniciar → animar → verificar watch table → parar → reset
5. AI Architect via CanvasAiChat ou /ai → receber resultado → Aplicar ao Canvas
6. Stripe + Mercado Pago: checkout → webhook → créditos atualizados
7. RLS: criar dois usuários em tenants diferentes e verificar isolamento

### Testes Automatizados (implementados)
```typescript
// src/__tests__/fbd-runtime.test.ts — 167 linhas, 9 casos Vitest
//   ✓ AND block — TRUE only when both inputs true
//   ✓ OR block — TRUE when at least one input true
//   ✓ NOT block — inverts input
//   ✓ SR flip-flop — set dominates reset
//   ✓ TON timer — fires after preset ms, tracks accumulated time
//   ✓ CTU counter — counts rising edges, fires at preset
//   ✓ ADD block — sums two numbers
//   ✓ GT comparator — IN1 > IN2
//   ✓ Chained blocks — AND output feeds OR input via connection
```

### Prioridade para Novos Testes
1. `voltai/store.ts` — simulateComponent() para cada tipo (QF, KM, M, FR, KT)
2. `fbd/compiler.ts` — ST e IL output para blocos aninhados
3. `ladder/runtime.ts` — scanRungs() com matriz completa
4. `ai-architect-client.ts` — applyArchitectToStore com merge/replace
5. `pdf-export.ts` — verificação de conteúdo do PDF gerado

---

## 18. DEPLOY E DEVOPS

### Plataforma: TanStack Start (não Vercel SPA)

O projeto usa **TanStack Start** (React 19 + Vinxi + Nitro), não um SPA Lovable/Vite. O deploy produz um servidor Node.js (modo SSR/híbrido), não HTML estático.

**Comando de build:**
```bash
npm run build          # Compila Server Functions + cliente + SSR
npm run start          # Inicia servidor de produção (porta 3000)
```

### CI/CD (GitHub Actions — `.github/workflows/ci.yml`)
- Lint + typecheck + build em cada push
- Deploy automático do `stripe-webhook` Edge Function via Supabase CLI
- Migrações SQL versionadas em `/supabase/migrations/`

### Rotas de API Pública (webhooks — sem auth middleware)
```
POST /api/public/stripe.webhook   → Stripe events (assinatura HMAC-SHA256)
POST /api/public/mp.webhook       → Mercado Pago events (shared secret)
```

### Variáveis de Ambiente por Ambiente
```
# .env (local de desenvolvimento — NUNCA commitar)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Server Functions + Edge Functions Secrets (via Dashboard ou .env)
DEEPSEEK_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
MERCADO_PAGO_ACCESS_TOKEN=TEST-...
MERCADO_PAGO_WEBHOOK_SECRET=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### CI/CD Checklist
- [ ] Branch `main` → deploy automático em produção
- [ ] Branch `develop` → deploy em staging
- [ ] PR obrigatório para `main` com review
- [ ] Migrations Supabase versionadas em `/supabase/migrations/`
- [ ] Edge Functions em `/supabase/functions/` (ex: stripe-webhook)
- [ ] TanStack Server Functions compiladas com o bundle (não deploy separado)

---

## 19. APÊNDICE: REFERÊNCIAS TÉCNICAS E NORMATIVAS

### Normas Mandatórias
| Código | Título | Aplicação |
|--------|--------|-----------|
| NBR 5410:2004 | Instalações elétricas de baixa tensão | Residencial, comercial, industrial leve |
| NBR 14039:2011 | Instalações elétricas de média tensão | 1kV a 36,2kV |
| NBR 5419:2015 | Proteção contra descargas atmosféricas | SPDA/para-raios |
| NR-10 | Segurança em instalações elétricas | Obrigatória por lei |
| NR-12 | Segurança em máquinas | Automação industrial |
| IEC 60617 | Símbolos gráficos para esquemas | Simbologia dos diagramas |
| IEC 61131-3:2025 | Linguagens de programação CLP | Ladder, FBD, ST, SFC |
| ISA-18.2 | Gestão de alarmes SCADA/HMI | Sistema de alarmes |
| ISO 13849-1 | Segurança funcional de máquinas | PL/SIL categorias |

### Tabela de Dimensionamento de Cabos (NBR 5410, Tabela 36)
```
Seção (mm²) | Corrente máx - método B1 | Corrente máx - método E
1,5         | 13,5 A                    | 18,5 A
2,5         | 18,0 A                    | 25,0 A
4,0         | 24,0 A                    | 34,0 A
6,0         | 31,0 A                    | 43,0 A
10,0        | 42,0 A                    | 60,0 A
16,0        | 56,0 A                    | 80,0 A
25,0        | 73,0 A                    | 101,0 A
35,0        | 89,0 A                    | 126,0 A
50,0        | 108,0 A                   | 153,0 A
```

### Endereçamento de Memória CLP (Genérico IEC 61131-3)
```
%IX0.0 – %IX0.7   Entradas digitais (bits do byte 0)
%QX0.0 – %QX0.7   Saídas digitais
%MX0.0 – %MX...   Marcadores (memória interna)
%IW0              Entrada analógica word 0
%QW0              Saída analógica word 0
%DB1.DBX0.0       Bloco de dados Siemens S7
T#5s, T#100ms     Literais de tempo IEC
```

### Convenção de Identificação de Equipamentos (ABNT NBR 13403)
```
QG    Quadro Geral
QD    Quadro de Distribuição
QA    Quadro de Automação
QF    Disjuntor (Quebra-Fusível)
QS    Chave Seccionadora
KM    Contator Principal
KA    Relé Auxiliar
FR    Relé de Sobrecarga (bimetálico)
KT    Relé Temporizador
M     Motor
TR    Transformador
FU    Fusível
SB    Botão de Pulso
SA    Seletor Rotativo
HL    Indicador Luminoso
```

---

## ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

```
SPRINT 1 (Semana 1-2): Fase 1 + Fase 2
  → App funcional com auth e dashboard

SPRINT 2 (Semana 3-4): Fase 3 (Unifilar)
  → Editor principal funcional

SPRINT 3 (Semana 5-6): Fase 4 (Ladder) + início Fase 6 (IA)
  → Dois módulos + IA básica

SPRINT 4 (Semana 7-8): Fase 5 (SCADA) + Fase 7 (Simulação)
  → SCADA + simulação integrada

SPRINT 5 (Semana 9-10): Fase 9 (Pagamentos) + Fase 10 (Export)
  → SaaS completo com monetização

SPRINT 6 (Semana 11-12): Fase 8 (FBD/Twin/PLC) + Polish
  → Módulos avançados + refinamento UX
```

---

## 20. PLANO DE CRESCIMENTO E EXPANSÃO TECNOLÓGICA (VISÃO FUTURA)

Este plano apresenta as melhorias arquiteturais e funcionais identificadas como o maior potencial de crescimento para tornar a EletricAI a plataforma líder absoluta do mercado global de engenharia elétrica assistida por IA.

### 20.1 Multi-Agent Agentic Workflow (NexusMind v2)
Atualmente, a geração e análise dependem de uma única chamada LLM em estilo sequencial. A versão v2 evolui para uma arquitetura de múltiplos agentes especialistas cooperando de forma síncrona:

1. **Agente Orquestrador**: Interpreta a intenção do usuário e distribui as tarefas.
2. **Agente Construtor de Diagramas**: Focado exclusivamente na topologia e lógica do circuito (nós e caminhos de cabos).
3. **Agente Validador de Conformidade (Compliance Guard)**: Analisa o diagrama gerado em tempo real contra as normas ABNT NBR 5410 e NR-12 e insere relatórios de violação.
4. **Agente de Layout e Roteamento**: Executa algoritmos de posicionamento visual automático (ex: force-directed ou baseados em grid) para garantir que os desenhos apareçam organizados, legíveis e esteticamente perfeitos no canvas.

#### Exemplo de Resposta Estruturada (JSON Consolidado):
```json
{
  "status": "compliant | warnings_found",
  "text": "Explicação detalhada dos dimensionamentos elétricos baseados na NBR 5410...",
  "diagramPatch": {
    "module": "unifilar",
    "nodes": [
      {
        "id": "QF-motor-vfd",
        "typeKey": "disjuntor",
        "props": { "current_a": 32, "curve": "C", "poles": 3 }
      }
    ],
    "edges": [
      { "source": "QF-motor-vfd", "target": "VFD-motor", "role": "power" }
    ]
  },
  "complianceReport": {
    "checkedNorms": ["NBR 5410:2004 §6.2.1", "NR-12 §12.2"],
    "violations": []
  }
}
```

### 20.2 Sincronização Local-First e Resiliência (Offline Operation)
Considerando que engenheiros trabalham frequentemente em subestações isoladas, salas de máquinas subterrâneas ou áreas industriais com sinal de internet inexistente ou instável, a EletricAI deve suportar operação **offline-first**.

#### Mecanismo de Sincronização:
* **Banco Local**: Substituição do estado simples de memória por um banco local IndexedDB persistido via RxDB/Yjs.
* **Edição Colaborativa (CRDT)**: Uso de Y.js para resolver conflitos de alteração no canvas ou nos rungs do Ladder de forma automática quando a conexão for restabelecida.
* **Fila de Sincronização**: Todas as mutações e logs de simulação são inseridos em uma fila de prioridade local com retentativa exponencial.

### 20.3 Automação Bidirecional & Loop de Controle IoT Seguro (IoT Loop)
Permitir que o EletricAI interaja diretamente com CLP e sensores reais, permitindo não apenas ler dados (telemetria), mas também enviar comandos diretos do SCADA e do Digital Twin de forma segura e auditável.

#### Protocolo de Segurança e Controle de Acesso (Loop IoT):
```sql
-- Tabela para rastrear e auditar comandos de escrita via SCADA
CREATE TABLE scada_write_commands (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id),
  project_id    UUID NOT NULL REFERENCES projects(id),
  tag_name      TEXT NOT NULL,
  value         DOUBLE PRECISION NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'executed', 'rejected'
  authorized_by UUID REFERENCES profiles(id),    -- Dupla autorização para comandos industriais
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Apenas membros com papel 'engineer' ou superior podem gravar comandos
CREATE POLICY "Engineers can write commands" ON scada_write_commands
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = scada_write_commands.project_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin', 'engineer')
    )
  );
```

### 20.4 AI Blueprint Vectorizer (Importação Inteligente de CAD/DWG)
Gargalo comum: engenheiros já possuem milhares de quilômetros de plantas elétricas legadas em arquivos DWG ou PDFs de projetos antigos. O **AI Blueprint Vectorizer** é um microsserviço de Visão Computacional que processa imagens ou arquivos vetoriais de diagramas antigos e os recria como componentes editáveis no canvas.

#### Pipeline do Vectorizer:
1. **Extração de Vetores**: Leitura de linhas e polilinhas do arquivo DWG.
2. **Classificação por Visão Computacional**: Um modelo YOLOv8 treinado em símbolos elétricos (IEC 60617) classifica os blocos (ex: disjuntor, motor, contator).
3. **Conexões Topológicas**: Identificação das interseções de linhas para mapear os caminhos dos cabos (`edges`).
4. **Reconstrução Automática**: O sistema exporta o `diagramPatch` correspondente inserindo diretamente no banco de dados do projeto.

### 20.5 IA Preditiva de Autocomplete de Circuitos (Next-Node Recommendation)
Enquanto o engenheiro desenha manualmente no canvas do Unifilar ou Ladder, a IA atua silenciosamente prevendo o próximo nó baseado em padrões estatísticos e normativos da base de conhecimento da EletricAI.

#### Exemplo de Fluxo:
* Engenheiro insere um **Motor Trifásico de 15kW**.
* O painel lateral sugere imediatamente em destaque translúcido:
  1. *Falta de proteção térmica de sobrecarga: Sugerido Relé Térmico (FR) com ajuste [28.0 - 40.0] A.*
  2. *Sugerido Contator principal KM de 40A para manobra.*
  3. *Cabo recomendado: 6 mm² (método B1) conforme NBR 5410.*
* Um único clique em "Adicionar Proteção Sugerida" posiciona e conecta os 3 elementos no canvas de forma ordenada.

---

*Documento gerado para uso exclusivo da equipe de engenharia do EletricAI.*
*Versão 1.1 — Plano de Crescimento Adicionado — Maio 2026*
*Repositório: https://github.com/lendavira2020/eletric.git*
