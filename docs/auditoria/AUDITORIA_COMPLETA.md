# RELATÓRIO DE AUDITORIA COMPLETA — ELETRICAI

**Data da Auditoria:** 14 de Outubro de 2026  
**Auditor:** Engenharia de Sistemas Industriais, Arquitetura SaaS e Segurança Cibernética  
**Repositório Auditado:** `lendaviva2020/eletricaip` (Git Branch: `main`, commit `eb584bf`)  
**URL de Produção em Nuvem:** `https://eletricaip.vercel.app` (App real TanStack Start) / `https://eletricai.vercel.app` (Ambiente legado Next.js estático)  
**Ambiente de Execução:** Windows 10/11, Node.js v24.15.0, npm 11.12.1, Bun 1.4.2  
**Framework / Stack:** TanStack Start 1.168 (React 19, TanStack Router 1.170, Nitro Vercel Preset), TypeScript 5.8 (Strict), Supabase (Postgres, RLS, Auth, Realtime, Storage), DeepSeek AI  

---

## 1. Sumário Executivo e Diagnóstico de Maturidade

O **ElétricAi** é uma aplicação SaaS ambiciosa e avançada voltada à engenharia elétrica industrial e automação, unificando em um único workspace web diagramas unifilares/multifilares (Pixi.js), lógica Ladder e FBD (IEC 61131-3), configuração de racks PLC, telas de supervisão SCADA/HMI (Konva), gêmeo digital 3D (Three.js/R3F), telemetria IoT e assistência por inteligência artificial (DeepSeek).

A auditoria exaustiva e não destrutiva realizada sobre o repositório comprovou que o projeto possui uma base técnica substancial:
- **Testes Unitários e Integração:** 32 arquivos de teste e 263 testes automatizados (Vitest 4) aprovados com sucesso.
- **Tipagem Estática:** `tsc --noEmit` aprovado com 0 erros em modo `strict: true`.
- **Qualidade de Código:** ESLint 9 aprovado sem warnings ou erros de linting.
- **Domínio Lógico e Cálculos:** O motor de scan Ladder (`scan-core.ts`), o motor de blocos FBD (`fbd/engine/*`), o memorial multifilar derivado e os estudos elétricos determinísticos de potência (curto-circuito IEC 60909, seletividade IEC 60947, arco elétrico IEEE 1584 e esforço térmico de partida) são puros, determinísticos e matematicamente consistentes.

### Veredito Final de Prontidão para Produção: **NÃO PRONTO PARA LANÇAMENTO COMERCIAL**

Apesar do alto nível de sofisticação nos motores matemáticos e lógicos, o software **não pode receber clientes reais no estado atual** devido a 10 vulnerabilidades e bloqueios críticos:
1. **Inexistência de DDL das tabelas centrais no repositório (RISK-014 / DB-01):** As migrations locais não criam as tabelas estruturais (`profiles`, `projects`, `tenants`, `tenant_memberships`, `diagrams`, `iot_devices`, etc.). O banco remoto atual do app (`rvaaxvdimggztjxoktvy`) não possui tais tabelas, tornando impossível qualquer recuperação de desastre ou deploy limpo do zero.
2. **Edge Function de IA exposta sem autenticação no CI (.github/workflows/ci.yml:61):** O deploy automático da função `ai-industrial-architect` é feito com a flag `--no-verify-jwt`, permitindo que qualquer agente na internet use a cota paga da DeepSeek sem autenticação.
3. **Funcionalidades simuladas (Mocks) na interface do usuário:** O upload de briefing técnico (PDF/CSV) no chat de IA exibe uma barra de progresso falsa e sempre retorna o mesmo circuito estático de exemplo. A tela de `/analytics` gera métricas de consumo e OEE com `Math.random()`. As telas de faturamento (`/settings/billing`) e equipe (`/settings/team`) entram em modo demo silencioso quando o backend falha.
4. **Protocolos Industriais sem implementação real:** O Modbus TCP não possui codificação de frames (MBAP/PDU), lendo de um Map em memória. O OPC-UA lança erro explícito por falta da biblioteca `node-opcua`. O protocolo MQTT inexiste (apenas campos visuais de texto).
5. **Editor Ladder com ~30 instruções decorativas:** A paleta lateral do Ladder exibe dezenas de instruções IEC 61131-3, mas o grid e o runtime só executam 9 (`XIC`, `XIO`, `OTE`, `OTL`, `OTU`, `TON`, `TOF`, `TP`, `CTU`). Arrastar qualquer outra instrução resulta em erro visual de rejeição.
6. **Duplicação de motores FBD:** Coexistem dois compiladores FBD no repositório; o editor usa o motor novo, mas o canvas de PLC (`plc-canvas.tsx`) usa o compilador legado.
7. **Dimensionamento elétrico simplificado:** A seleção de cabos não implementa as tabelas da NBR 5410 por método de instalação nem fatores de correção de temperatura/agrupamento, e a queda de tensão ignora a reatância indutiva em cabos de grande bitola.
8. **Inexistência de simulação de circuito em malha:** Não há análise nodal de circuitos elétricos; a energização no diagrama unifilar é apenas animação visual sem solução de equações de rede.
9. **Armazenamento de tokens em `localStorage`:** A sessão de autenticação do Supabase fica no `localStorage` do navegador, vulnerável a comprometimento por scripts.
10. **Desalinhamento de Domínio de Produção:** O domínio `https://eletricai.vercel.app` anunciado aponta para uma build antiga estática em Next.js (onde rotas dinâmicas como `/login`, `/dashboard`, `/mcp` retornam 404), enquanto o app real está em `https://eletricaip.vercel.app`.

---

## 2. Inspeção Técnica da Arquitetura

### 2.1 Frontend e Roteamento
- **Framework:** TanStack Start com TanStack Router baseado em arquivos (`src/routes/*`).
- **Renderização:** SSR híbrido com hidratação client-side via Nitro (preset Vercel).
- **Roteamento:** 42 rotas registradas em `src/routeTree.gen.ts`. A raiz `src/routes/__root.tsx` implementa um `AuthGate` client-side com allowlist para rotas públicas (`/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/termos`, `/privacidade`).
- **Interface e Estilização:** Tailwind CSS v4, componentes Radix UI e tokens industriais escuros (`#0B0D10`).
- **Edição Gráfica:**
  - Unifilar/Multifilar: Pixi.js 8 com viewport acelerado via WebGL.
  - SCADA: Konva / react-konva para renderização 2D de sinóticos.
  - FBD: React Flow (`reactflow`).
  - Gêmeo Digital: Three.js e `@react-three/fiber` / `@react-three/drei` para renderização de malhas GLB/GLTF.
  - Código: Monaco Editor (`@monaco-editor/react`).

### 2.2 Camada de Servidor (Server Functions)
- Em vez de uma API REST tradicional separada, o TanStack Start utiliza **Server Functions** (`createServerFn`).
- Todas as funções de servidor em `src/lib/*.functions.ts` utilizam middlewares compostos:
  1. `requireSupabaseAuth`: Valida o token JWT (JWKS com fallback local e remoto) e instancia um cliente Supabase com contexto de segurança do usuário (`Authorization: Bearer <token>`).
  2. `requireAiQuota` e `requireBurstLimit`: Limitam taxas e créditos antes de chamadas de IA.
  3. `requireTenantAdmin`: Exige papel de proprietário (`owner`) ou administrador (`admin`) na organização.
- As server functions públicas (`/api/public/*`) tratam ingestão de IoT e webhooks Stripe/Mercado Pago.

### 2.3 Banco de Dados e Persistência
- **BaaS:** Supabase Cloud (PostgreSQL 17).
- **Modelo de Dados Multi-tenant:**
  - A organização é representada pela tabela `tenants`.
  - Usuários autenticados ligam-se a tenants via `profiles.tenant_id` e `tenant_memberships` (com papéis `owner`, `admin`, `engineer`, `operator`, `viewer`).
  - Projetos (`projects`) possuem chave estrangeira para `tenant_id`.
  - Diagramas (`diagrams`) persistem um snapshot JSONB unificado (`canvas_data`) contendo o estado unifilar, ladder, fbd, scada e plc, versionado via `project_versions`.
- **Falha de Infraestrutura (RISK-014):** A cadeia local de migrations possui 56 arquivos SQL, dos quais 11 são meros marcadores (`remote_history_placeholder.sql`). O DDL de criação das tabelas centrais não está versionado no repositório. O baseline RLS `20260906072900_baseline_rls_consolidation.sql` foi criado a partir de um dump de policies, mas não possui os comandos `CREATE TABLE` correspondentes.

### 2.4 Integração de Inteligência Artificial
- **Provedor:** DeepSeek (`deepseek-chat`) via chamadas HTTP REST diretas no servidor (`api.deepseek.com`).
- **Segurança da Chave:** A chave `DEEPSEEK_API_KEY` reside exclusivamente no ambiente do servidor (`process.env`), não sendo exposta ao bundle do navegador.
- **Fluxo do Arquiteto (`ai-architect.functions.ts`):**
  1. O usuário submete um prompt textual (máx. 32.000 caracteres) e contexto do projeto.
  2. A função recupera fragmentos normativos em `normative_chunks` (RAG local).
  3. A saída é estruturada e validada em tempo de execução via Zod (`AiDiagramPatchSchema`).
  4. Executa-se um loop de autovalidação com regras normativas e simulação de intertravamento de segurança E-STOP (até 2 rodadas de autocorreção pela IA).
  5. Débito de créditos atômico via RPC (`consume_ai_credits`).

---

## 3. Análise Detalhada dos Módulos

### 3.1 Editor Elétrico e Cálculos de Engenharia
- **Editor Gráfico (Unifilar/Multifilar):**
  - Implementado em `src/components/canvases/webgl-canvas.tsx` e `src/lib/diagram/*`.
  - Possui catálogo de símbolos IEC (transformadores, disjuntores, contatores, relés, motores, inversores, chaves seccionadoras, sensores, botoeiras E-STOP).
  - Conexões entre portas de componentes estabelecem um grafo de adjacência.
  - Geração de diagrama multifilar a partir do unifilar (`multifilar.ts`) deduz fases (F+N, 3F, 3F+N+PE).
  - Exportação para DXF e PDF com memorial descritivo funcional.
- **Cálculos Elétricos (`electrical-calc.ts`):**
  - Corrente nominal trifásica: $I_n = \frac{P}{\sqrt{3} \cdot U \cdot \cos\varphi \cdot \eta}$ (Correto).
  - Dimensionamento de cabos: Usa tabela simplificada IEC 60364 com fator 1,25. **Não atende à NBR 5410** por não considerar método de instalação (B1, B2, C, F), temperatura ambiente real ($k_t$), nem agrupamento de circuitos ($k_g$).
  - Queda de tensão: Considera apenas a parcela resistiva ($\Delta V = \frac{\sqrt{3} \cdot \rho \cdot L \cdot I \cdot \cos\varphi}{S \cdot U}$). Para cabos acima de $35\text{ mm}^2$, o erro acumulado por ignorar a reatância ($X_L \cdot \sin\varphi$) pode ultrapassar 20%.
- **Estudos Elétricos de Potência (`electrical-sim.ts`):**
  - Curto-circuito conforme IEC 60909-0 simplificado para secundário de trafo: $Z_{tr} = \frac{u_k\%}{100} \cdot \frac{U_n^2}{S_n}$, $I''_k = \frac{c \cdot U_n}{\sqrt{3} \cdot Z_{tr}}$.
  - Seletividade amperimétrica e cronométrica segundo IEC 60947.
  - Arco elétrico simplificado segundo IEEE 1584-2002 e categorias de vestimenta NFPA 70E.
  - Esforço térmico de partida de motores com normalização pela constante de tempo do enrolamento ($\tau = 120\text{ s}$).

### 3.2 Programação de CLPs e Simulação Lógica
- **Ladder (IEC 61131-3):**
  - Motor de scan determinístico e desacoplado (`src/lib/ladder/scan-core.ts`).
  - Orçamento de tempo de execução seguro (50 ms / 2000 rungs) para prevenir travamento do navegador.
  - Instruções ativas: `XIC`, `XIO`, `OTE`, `OTL`, `OTU`, `TON`, `TOF`, `TP`, `CTU`.
  - Validador estático detecta bobinas duplicadas, operandos não associados a tags e circuitos abertos.
  - Verificação de E-STOP por injeção de falha funcional (`verify-estop.ts`).
  - **Limitação:** As instruções de comparação, blocos matemáticos, movimentação (MOVE) e bordas (R_TRIG/F_TRIG) exibidas na barra lateral não são aceitas pelo grid.
- **FBD (Function Block Diagram):**
  - O motor moderno (`src/lib/fbd/engine/*`) compila grafos de blocos em Representação Intermediária (IR) tipada, respeita sinais EN/ENO e avalia a ordem de execução determinística.
  - O canvas de PLC (`plc-canvas.tsx`) ainda referencia o compilador FBD legado para gerar Structured Text (ST).
  - Não há suporte a criação de blocos de função customizados pelo usuário no navegador.
- **Hardware e Integração PLC:**
  - Permite configurar fisicamente racks (PSU, CPU, módulos de I/O digitais e analógicos).
  - Valida consumo de corrente do barramento e limites de endereçamento.
  - Exporta arquivo XML no padrão PLCopen.
  - Não realiza download, monitoramento online ou comunicação física com nenhum CLP real.

### 3.3 SCADA, HMI, IoT e Gêmeo Digital
- **Supervisão SCADA:**
  - Desenho de telas com gauges, botões, tanques e atuadores em canvas Konva.
  - Vinculação de propriedades visuais a tags do projeto (`bind-tag-dialog.tsx`).
  - Gerenciamento de alarmes ISA-18.2 (estados Normal, Unacknowledged, Acknowledged, RTN).
  - Scripts de automação executam em Web Worker dedicado (`scada-worker.ts`), mas a sandbox depende de regex que pode ser contornada (RISK-011).
- **Comunicação Industrial:**
  - **Modbus TCP:** O servidor apenas abre um socket TCP genérico e popula um Map com dados senoidais simulados; não envia requisições Modbus reais.
  - **OPC-UA:** O código lança erro explícito exigindo instalação de dependência inexistente.
  - **MQTT:** Não implementado.
- **Gêmeo Digital (Digital Twin):**
  - Renderiza modelos 3D industriais em formato GLB/GLTF.
  - Armazena posições de hotspots 3D vinculados a tags de telemetria.
  - Painel de simulação "What-If" permite forçar variáveis para teste de comportamento.

---

## 4. Auditoria de Segurança Cibernética e SaaS

| Área | Situação Verificada | Nível de Risco |
| :--- | :--- | :---: |
| **Isolamento Multi-tenant** | Maioria das queries usa `tenant_id`. Policies de `invoices`/`subscriptions` permitem leitura a qualquer membro (RISK-005). | **Alto (P1/P2)** |
| **Exposição de Segredos** | Credenciais sensíveis protegidas no `.env`, mas histórico do Git registra e-mail administrativo (PII) e chaves antigas. | **Médio (P2)** |
| **Proteção de Edge Functions** | A função `ai-industrial-architect` é implantada via GitHub Actions com `--no-verify-jwt`. | **Crítico (P0)** |
| **Armazenamento de Sessão** | Tokens de acesso e refresh residem no `localStorage` sob risco de exfiltração por XSS. | **Alto (P1)** |
| **Proteção contra Força Bruta** | Sem rate limiting nas telas de login, cadastro e recuperação de senha. | **Médio (P2)** |
| **Segurança em Protocolos** | Guarda de SSRF protege conexões de rede em Modbus, bloqueando loopback, link-local e IPs públicos não autorizados. | **Adequado** |
| **Execução de Código de Usuário** | Scripts SCADA rodam em Web Worker com Proxy defensivo, mas regex de sanitização é vulnerável a evasão. | **Médio (P2)** |

---

## 5. Conclusão da Auditoria

O **ElétricAi** é um sistema com alto valor de engenharia e uma arquitetura base bem concebida. Seus componentes fundamentais (cálculos de curto-circuito, motores de scan Ladder, compilador FBD, geração de multifilar e validação Zod no servidor) são sólidos e comprovadamente funcionais através de 263 testes unitários verdes.

No entanto, o produto encontra-se em um estágio onde **recursos avançados foram anunciados ou simulados antes da estabilização da fundação básica**:
1. O banco de dados do ambiente novo não possui as tabelas centrais.
2. A Edge Function de IA está aberta na internet.
3. Vários fluxos simulam respostas (upload de PDF, telemetria sintética em analytics, protocolos industriais sem drivers reais).

Para atingir a qualidade comercial necessária para operar com clientes pagantes industriais, o projeto deve seguir rigorosamente o plano de remediação estruturado nos documentos complementares desta auditoria.
