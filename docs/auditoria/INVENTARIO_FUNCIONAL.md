# INVENTÁRIO FUNCIONAL DO ELETRICAI

**Data da Avaliação:** 14 de Outubro de 2026  
**Critérios de Classificação:**
- **Funcional e testado:** Código implementado, com integração de ponta a ponta e testes automatizados aprovados no repositório.
- **Implementado, mas não validado:** Código completo no frontend e backend, porém sem testes automatizados ou dependente de banco com DDL ausente.
- **Parcialmente funcional:** Módulo opera com limitações de escopo, regras simplificadas ou subset de instruções.
- **Interface sem operação real comprovada:** Elemento ou tela presente na UI que simula respostas (mock), opera puramente em memória ou não conecta com o destino anunciado.
- **Ausente:** Recurso planejado ou mencionado em menus que não possui código de suporte no repositório.
- **Bloqueado por dependência externa:** Recurso que depende de biblioteca ausente no `package.json` ou credencial de terceiro não fornecida.
- **Não verificável no ambiente atual:** Funcionalidade que depende de hardware físico ou serviço inacessível neste ambiente estático de leitura.

---

## 1. Gestão de Projetos e Plataforma

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Cadastro, Login e OAuth** | **Funcional e testado** | `src/routes/login.tsx:58`, `signup.tsx:32`, `safe-redirect.test.ts` | Supabase Auth com PKCE. Redirecionamento validado com `isSafeRedirect`. Sessão em localStorage. |
| **Recuperação de Senha** | **Implementado, mas não validado** | `src/routes/forgot-password.tsx:22`, `reset-password.tsx:33` | Dispara e-mail via Supabase Auth. Sem rate limiting próprio de aplicação na rota. |
| **Dashboard de Projetos** | **Parcialmente funcional** | `src/routes/dashboard.tsx:84-140` | Lista projetos recentes reais; telemetria exibe zeros ou dados de mock quando vazia. |
| **CRUD e Duplicação de Projetos** | **Funcional e testado** | `src/lib/projects.functions.ts:140-350`, `src/__tests__/deletion.test.ts` | Criação, arquivamento, clonagem e exclusão com cascade de 11 tabelas filhas. |
| **Autosave e Histórico de Versões** | **Funcional e testado** | `src/lib/use-project-persistence.ts:45`, `project_versions` | Debounce de 2 segundos com persistência em snapshot JSONB e histórico rastreável. |
| **Colaboração em Tempo Real** | **Funcional e testado** | `src/hooks/use-collab.ts:25`, `src/__tests__/collab-remote-command.test.ts` | Canal Realtime `diagram:v2:<id>` sincronizando cursores e comandos. |
| **Gestão de Equipe e Papéis** | **Parcialmente funcional** | `src/routes/settings.team.tsx:235-388` | Operações reais via RPC `accept_invite`, mas entra em modo demo silencioso quando o backend falha. |
| **Central Financeira / Assinaturas** | **Parcialmente funcional** | `src/routes/settings.billing.tsx:110-158`, `billing.functions.ts` | Checkout Stripe e Mercado Pago integrados; fallback para tela demo com faturas falsas em caso de erro. |
| **Exclusão de Conta (LGPD)** | **Funcional e testado** | `src/lib/account-deletion.functions.ts:40`, `src/__tests__/deletion.test.ts` | Solicitação e anonimização de dados pessoais e projetos do usuário. |

---

## 2. Editor Elétrico Unifilar e Multifilar

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Canvas Gráfico WebGL** | **Funcional e testado** | `src/components/canvases/webgl-canvas.tsx`, `render/stage.ts` | Pixi.js 8 com pan, zoom, seleção por marquee, snap à grade e rendering acelerado. |
| **Biblioteca de Símbolos IEC** | **Funcional e testado** | `src/lib/palette/component-catalog.ts:20-180`, `symbols.ts` | 24 tipos de componentes (disjuntores, contatores, relés, transformadores, inversores, etc.). |
| **Conectividade Elétrica e Portas** | **Funcional e testado** | `src/lib/diagram/render/ports.ts:15`, `schema.ts:205` | Nós e arestas estruturados com identificação de portas de entrada/saída. |
| **Geração de Diagrama Multifilar** | **Funcional e testado** | `src/lib/diagram/multifilar.ts:35-180`, `src/__tests__/multifilar.test.ts` | Dedução de condutores (F+N, 3F+N+PE), seções nominais e memorial descritivo. |
| **Validação Normativa (Linter)** | **Funcional e testado** | `src/lib/norm-validator.ts:30-150`, `src/__tests__/norm-validator.test.ts` | Regras NBR 5410/NR-10 checando DR obrigatório, seccionamento e aterramento. |
| **Exportação DXF** | **Funcional e testado** | `src/lib/diagram/export-dxf.ts:20-120` | Gera arquivo DXF estruturado em layers com blocos e textos técnicos. |
| **Exportação PDF de Engenharia** | **Funcional e testado** | `src/lib/pdf-export.ts:40-200`, `routes/projects.$projectId.export.tsx` | jsPDF gerando prancha A4/A3 com carimbo, lista de materiais e diagramas. |
| **Lista de Materiais (BOM)** | **Funcional e testado** | `src/lib/bom.functions.ts:50-120`, `projects.$projectId.bom.tsx` | Agrupamento de componentes, fabricantes, códigos e quantitativos. |

---

## 3. Programação de CLPs (IEC 61131-3)

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Editor Ladder Gráfico** | **Funcional e testado** | `src/components/canvases/ladder/rung-grid.tsx:57-120` | Matriz dinâmica de rungs e células com suporte a ramos em paralelo (OR). |
| **Motor de Scan Ladder** | **Funcional e testado** | `src/lib/ladder/scan-core.ts:218-294`, `src/__tests__/ladder-runtime.test.ts` | Executa `XIC`, `XIO`, `OTE`, `OTL`, `OTU`, `TON`, `TOF`, `TP`, `CTU` com limite de 50 ms. |
| **Instruções Avançadas de Ladder** | **Interface sem operação real comprovada** | `src/components/canvases/ladder/ladder-cell.tsx:103-107`, `definitions.ts:63` | ~30 blocos (matemáticos, comparação, bordas, MOVE) geram erro de rejeição ao serem inseridos. |
| **Compilador Ladder → IL / ST** | **Funcional e testado** | `src/lib/ladder/compiler.ts:25-110`, `src/__tests__/ladder-runtime.test.ts` | Tradução de rungs para Instruction List e Structured Text IEC 61131-3. |
| **Importador de Lógica Ladder** | **Funcional e testado** | `src/lib/ladder/importer.ts:30-95`, `src/__tests__/ladder-import.test.ts` | Parser textual reconvertendo instruções para a matriz visual. |
| **Editor FBD (React Flow)** | **Funcional e testado** | `src/components/canvases/fbd-canvas.tsx`, `use-fbd-engine.ts` | Conexões de blocos com checagem de tipos de dados, ciclo e feedback. |
| **Motor FBD Moderno (IEC Engine)** | **Funcional e testado** | `src/lib/fbd/engine/*`, `src/__tests__/fbd-engine-compiler.test.ts` | Compilação em IR tipada, suporte a EN/ENO, runtime determinístico de simulação. |
| **Compilação FBD → ST no PLC** | **Parcialmente funcional** | `src/components/canvases/plc-canvas.tsx:39` | Utiliza o motor FBD legado em vez do motor moderno, gerando divergência arquitetural. |
| **Configuração de Rack de PLC** | **Funcional e testado** | `src/lib/plc/rack-validation.ts`, `src/__tests__/plc-rack-validation.test.ts` | Validação de slots, limites elétricos do bastidor e endereçamento I/O Siemens/Rockwell. |
| **Exportação PLCopen XML** | **Funcional e testado** | `src/lib/plc/plcopen-export.ts:25-140` | Gera XML compatível com CODESYS e ambientes de engenharia IEC 61131-3. |
| **Comunicação Direta com CLP Real** | **Ausente** | `src/lib/plc/*` | Não há driver de protocolo proprietário (ex.: S7comm, EtherNet/IP) nem download físico. |

---

## 4. Simulação Elétrica e de Processos

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Cálculo de Curto-Circuito (IEC 60909)** | **Funcional e testado** | `src/lib/electrical-sim.ts:88-131`, `src/__tests__/electrical-sim.test.ts` | $I''_k$ trifásico e monofásico, corrente de pico $i_p$ e impedância por grupo vetorial. |
| **Estudo de Seletividade (IEC 60947)** | **Funcional e testado** | `src/lib/electrical-sim.ts:223-275`, `src/__tests__/electrical-sim.test.ts` | Avaliação amperimétrica e cronométrica entre dispositivos montante/jusante. |
| **Energia Incidente de Arco (IEEE 1584)** | **Funcional e testado** | `src/lib/electrical-sim.ts:309-340`, `src/__tests__/electrical-sim.test.ts` | Energia incidente ($cal/cm^2$), categoria PPE (NFPA 70E) e fronteira de arco elétrico. |
| **Esforço Térmico de Motores** | **Funcional e testado** | `src/lib/electrical-sim.ts:415-438`, `src/__tests__/electrical-sim.test.ts` | Energia $I^2t$ e elevação adiabática normalizada por $\tau=120\text{ s}$. |
| **Simulador de Planta 8M+2EX** | **Funcional e testado** | `src/lib/simulation/plant-engine.ts`, `src/__tests__/plant-engine.test.ts` | Processo determinístico com rampas, aquecimento, histerese de nível e trip térmico. |
| **Ponte Unifilar → Ladder** | **Funcional e testado** | `src/lib/simulation/unifilar-ladder-bridge.ts`, `src/__tests__/unifilar-ladder-bridge.test.ts` | Gera rungs de intertravamento de comando a partir do desenho de potência unifilar. |
| **Motor de Fluxo em Malha Elétrica** | **Ausente** | `src/lib/diagram/*`, `sim-canvas.tsx` | Não existe solução de matriz admitância nodal; a energização de fios é puramente visual. |

---

## 5. Inteligência Artificial Aplicada

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Arquiteto de Sistemas Elétricos** | **Funcional e testado** | `src/lib/ai-architect.functions.ts:410-490`, `deepseek` | Gera diagramas completos a partir de texto com RAG e validação Zod. |
| **Loop de Autocorreção Normativa** | **Funcional e testado** | `src/lib/ai-architect.functions.ts:446-474`, `verify-architecture.ts` | Até 2 rodadas automáticas de correção caso o projeto viole regras elétricas ou de E-STOP. |
| **Chat Técnico Assistente** | **Funcional e testado** | `src/lib/ai-chat.functions.ts:120-220`, `chat.tsx` | Streaming SSE de respostas com histórico persistido e sanitização básica de prompt. |
| **Patch de IA no Canvas** | **Funcional e testado** | `src/lib/diagram/ai.functions.ts`, `ai-patch-preview.tsx` | Propõe alterações com pré-visualização visual de adição/remoção de nós antes do commit. |
| **Controle de Cotas e Rate Limit** | **Funcional e testado** | `src/integrations/supabase/ai-rate-limit-middleware.ts`, `rate-limiter.server.ts` | Fail-closed quando Upstash cai; dedução de créditos por operação via RPC. |
| **Upload de Briefing (PDF/CSV) no Chat** | **Interface sem operação real comprovada** | `src/components/canvas-ai-chat.tsx:208-230` | 100% simulado: exibe etapas de OCR falsas e injeta sempre o mesmo circuito estático. |
| **Edge Function de IA Exposta** | **Bloqueado por dependência externa** | `supabase/functions/ai-industrial-architect/index.ts`, `.github/workflows/ci.yml:61` | Função órfã deployada com `--no-verify-jwt` no CI; expõe cota de IA se chamada externamente. |

---

## 6. SCADA, HMI, Protocolos e IoT

| Funcionalidade | Estado | Evidência Técnica (Arquivo / Linha) | Detalhe / Limitação |
| :--- | :---: | :--- | :--- |
| **Telas SCADA e Widgets HMI** | **Funcional e testado** | `src/components/canvases/scada-canvas.tsx:50-180` | Posicionamento de gauges, tanques, válvulas, motores e displays vinculados a tags. |
| **Sandbox de Scripts de Usuário** | **Parcialmente funcional** | `src/lib/simulation/scada-worker.ts`, `src/__tests__/scada-sandbox-guards.test.ts` | Executa em Web Worker sem rede/DOM; pre-scan por regex é vulnerável a bypass (RISK-011). |
| **Gerenciamento de Alarmes ISA-18.2** | **Funcional e testado** | `src/lib/alarm.functions.ts`, `alarms-canvas.tsx` | Estados de alarme (UNACK, ACK, RTN) com prioridades, histerese e persistência. |
| **Gêmeo Digital 3D (GLB Viewer)** | **Funcional e testado** | `src/routes/digital-twin.tsx`, `twin-3d-viewer.tsx` | Carregamento de malhas 3D com hotspots parametrizáveis e vinculação a tags de telemetria. |
| **Ingestão de Telemetria IoT** | **Funcional e testado** | `src/routes/api/public/iot.ingest.ts`, `src/__tests__/iot-ingest-rate-limit.test.ts` | Endpoint público autenticado por hash SHA-256 de API Key com rate limiting Upstash. |
| **Fila de Comandos IoT para Campo** | **Parcialmente funcional** | `src/lib/iot.functions.ts:138-160`, `iot_command_log` | Registra comandos com watchdog e fail-safe; nenhum agente ou CLP em campo consome a fila. |
| **Comunicação Modbus TCP** | **Interface sem operação real comprovada** | `src/lib/modbus-server.functions.ts:241-370` | Abre socket TCP cru sem framing MBAP nem PDU Modbus; lê/escreve de Map com dados falsos. |
| **Comunicação OPC-UA** | **Bloqueado por dependência externa** | `src/lib/opcua-server.functions.ts:304-350` | Lança erro exigindo `node-opcua`; teste de conexão retorna lista estática mockada. |
| **Comunicação MQTT** | **Ausente** | `src/routes/settings.integrations.tsx:93-110` | Apenas campos de texto na UI; sem cliente MQTT, biblioteca de transporte ou broker. |
| **Gráficos Industriais em Analytics** | **Interface sem operação real comprovada** | `src/routes/analytics.tsx:30-32` | Métricas de OEE e consumo kWh geradas aleatoriamente via `Math.random()`. |

---

## 7. Conformidade Normativa e Jurídica

| Norma / Requisito | Estado | Evidência Técnica | Avaliação Técnica |
| :--- | :---: | :--- | :--- |
| **NBR 5410 (Instalações BT)** | **Parcialmente funcional** | `src/lib/electrical-calc.ts`, `norm-validator.ts` | Regras de segurança (DR, condutor neutro, PE) ativas; tabelas de ampacidade e agrupamento ausentes. |
| **NR-10 (Segurança em Instalações)** | **Funcional e testado** | `src/lib/norm-validator.ts`, `electrical-sim.ts` | Cálculo de energia incidente para vestimentas de proteção e distâncias mínimas de segurança. |
| **NR-12 / E-STOP (Segurança de Máquinas)**| **Funcional e testado** | `src/lib/ladder/verify-estop.ts`, `ai-architect.functions.ts:442` | Validação e simulação obrigatória de intertravamento de segurança com contato NF (XIO). |
| **IEC 61131-3 (Linguagens de CLP)** | **Parcialmente funcional** | `src/lib/ladder/*`, `src/lib/fbd/engine/*` | Ladder e FBD executam as instruções essenciais; operadores avançados sem suporte no grid. |
| **IEC 60909 (Curto-Circuito em CA)** | **Funcional e testado** | `src/lib/electrical-sim.ts:88` | Fator de tensão $c$, impedância $Z_{tr}$ e cálculo de $I''_k$ implementados com rigor matemático. |
| **IEEE 1584 / NFPA 70E (Arco Elétrico)** | **Funcional e testado** | `src/lib/electrical-sim.ts:309` | Modelo de cálculo de energia incidente e categoria PPE documentados e testados. |
| **LGPD (Lei Geral de Proteção de Dados)**| **Parcialmente funcional** | `src/routes/privacidade.tsx`, `account-deletion.functions.ts` | Políticas de privacidade publicadas e exclusão de conta criada; falta confirmação de backup/retenção. |
