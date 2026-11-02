# ELÉTRICAI — SCADA MASTER AUDIT REPORT
## Auditoria Técnica e Diagnóstico Arquitetural do Sistema Supervisório Industrial

**Data da Auditoria:** 01/11/2026  
**Status do Repositório:** `main` (commit `ad09191`)  
**Engenharia Responsável:** Equipe de Engenharia e Arquitetura ElétricAi  
**Classificação:** Documento Técnico de Arquitetura e Segurança  

---

## 1. RESUMO EXECUTIVO

O ElétricAi possui atualmente componentes fundamentais de automação industrial (editores unifilar/multifilar WebGL/PixiJS, editor Ladder IEC 61131-3, editor FBD com compilador de blocos, configuração de rack PLC e Digital Twin 3D). No entanto, o subsistema de supervisão (SCADA/HMI) encontrava-se fragmentado como uma sub-aba simplificada no workspace (`scada-canvas.tsx` com `konva-canvas.tsx`), misturando edição de scripts Monaco com widgets Konva isolados, sem a experiência de uma estação de operação industrial completa (SCADA Supervisório com sinóticos P&ID, registro unificado de TAGs, gestão de alarmes ISA-18.2, gráficos de tendências, comunicação multi-protocolo OPC UA/Modbus/MQTT, relatórios e controle operacional autorizado).

Esta auditoria estabelece o diagnóstico de conformidade, riscos, dependências e o plano de transição para consolidar o **SCADA SUPERVISÓRIO** como módulo de primeira classe da plataforma.

---

## 2. INVENTÁRIO DO CÓDIGO ATUAL E MATRIZ DE MATURIDADE

### 2.1 Componentes e Módulos Identificados

| Módulo / Arquivo | Responsabilidade Atual | Estado Real | Lacunas e Diagnóstico |
| :--- | :--- | :--- | :--- |
| `src/components/canvases/scada-canvas.tsx` | Editor de script de animação em Monaco + visualizador Konva | **Parcial** | O foco estava no editor de script JS do Monaco (sandbox), sem navegação por sinóticos, KPIs ou alarmes em grade operacional. |
| `src/components/canvases/konva-canvas.tsx` | Renderizador Konva 2D de nós e formas industriais | **Parcial** | Desenha formas básicas (Motor, Tanque, Bomba, Gauge, Display). Falta sinótico vetorial avançado P&ID com tubulações conectadas, válvulas com atuador e diagramação de planta. |
| `src/components/editor/sidebars/editor-scada-sidebar.tsx` | Paleta de arrastar widgets HMI | **Parcial** | Lista 15 widgets básicos. Não possui biblioteca de equipamentos por família (elétrica, acionamentos, processos, válvulas, instrumentação, automação). |
| `src/components/canvases/alarms-canvas.tsx` | Aba de alarmes do workspace | **Parcial** | Lê do `useAlarmStore`, exibe lista simples, mas não está integrada com sinóticos de planta nem com auditoria de reconhecimento. |
| `src/lib/alarm-store.ts` & `scada-engine.ts` | Motor ISA-18.2 de avaliação de alarmes | **Pronto (Base)** | Suporta prioridades (CRITICAL, HIGH, MEDIUM, LOW) e estados (unacknowledged, acknowledged, cleared). Precisa de persistência e amarração com Tag Registry. |
| `src/lib/model/unified-schema.ts` | Schema canônico v3 (Single Source of Truth) | **Pronto (Base)** | Possui `CanonicalEquipment`, `CanonicalTag`, `ScadaWidgetLayout` e `ScadaEdgeLayout`. Precisa ser exposto e consumido diretamente pela interface do SCADA. |
| `src/lib/model/runtime-store.ts` | Store efêmera de simulação (60 Hz / 100 ms) | **Pronto (Base)** | Armazena valores de TAGs em tempo real desacoplado da persistência do documento. Perfeito para alimentar o SCADA sem poluir o histórico do projeto. |
| `src/lib/opcua-server.functions.ts` | Servidor OPC UA com sessão de laboratório e socket real | **Parcial / Funcional** | Suporta conexões com proteção SSRF, leitura de NodeIds e emulação segura. Falta monitoramento de Subscriptions e DataChange em streaming contínuo para o cliente. |
| `src/lib/modbus-server.functions.ts` | Servidor Modbus TCP com socket real e SSRF guard | **Parcial / Funcional** | Suporta Coils, Holding Registers, Unit ID e conversão float/inteiro. Falta polling contínuo de varredura com heartbeat. |
| `src/routes/settings.integrations.tsx` | Configuração de credenciais OPC UA, Modbus e MQTT | **Parcial** | MQTT estava marcado como oculto/pendente ("cliente MQTT over WebSockets ainda não implementado"). |
| `src/lib/iot.functions.ts` | Server functions de telemetria, dispositivos e alertas IoT | **Pronto** | Possui listagem de devices, persistência de leituras e enfileiramento de comandos (`iot_command_log`). |
| `supabase/migrations/` | Tabelas de alarmes, telemetria, tags e histórico | **Pronto** | `alarm_configs`, `alarm_history`, `iot_devices`, `iot_command_log`, `tag_samples` particionada, `trend_configs`. |

---

## 3. AUDITORIA DETALHADA POR REQUISITO

### 3.1 Identidade Única do Equipamento (Canvas ↔ SCADA)
* **Estado:** Parcial. O Canvas Unifilar cria `DiagramNode` e `CanonicalEquipment` na store unificada (`unified-store.ts`), porém o `ScadaCanvas` anterior instanciava nós genéricos próprios em Konva independentes.
* **Correção Obrigatória:** O SCADA deve sincronizar diretamente com o inventário de `CanonicalEquipment` do projeto. Um motor `M-01` criado no unifilar possui a mesma identificação, potência nominal, corrente de placa e TAGs no SCADA, sem duplicação de entidades.

### 3.2 Tag Registry Central
* **Estado:** Parcial. Existem tags esparsas em `useProjectStore.tags`, `useEditorStore.editorTags` e `useRuntimeStore.runtimeTags`.
* **Correção Obrigatória:** Consolidar um **Tag Registry** unificado e indexado com tipos estritos (`BOOL`, `INT`, `UINT`, `DINT`, `REAL`, `LREAL`, `STRING`, `ENUM`), unidades de engenharia (`kW`, `A`, `V`, `m³/h`, `bar`, `°C`, `%`, `Hz`), origens rastreáveis (`SIMULATED`, `INTERNAL_RUNTIME`, `OPC_UA`, `MODBUS_TCP`, `MQTT`) e estados de qualidade (`GOOD`, `BAD`, `UNCERTAIN`, `STALE`, `NOT_CONNECTED`).

### 3.3 Sinóticos Industriais de Processo
* **Estado:** Apenas visual / incompleto. Faltavam representações realistas de P&ID conectando tubulações com fluxo animado direcional, estações elevatórias de esgoto/efluentes (ETE/ETA), tanques com gradiente de nível, subestações abrigadas, quadros QGBT e racks de CLP.
* **Correção Obrigatória:** Implementar o sinótico principal da Estação de Tratamento de Efluentes (ETE-Industrial-01) com suporte a múltiplos setores (`Tratamento`, `Bombagem`, `Filtros`, `Reservatórios`, `Elétrica`), renderização vetorial SVG de alta precisão e animações alimentadas pelo motor de simulação real.

### 3.4 Motor de Alarmes e Eventos (ISA-18.2)
* **Estado:** Lógica parcial em `scada-engine.ts`, sem interface operacional contextual com prioridades codificadas por cores (Vermelho Crítico, Laranja Alto, Amarelo Médio, Azul Baixo), timestamps de precisão milissegundos e diálogo de reconhecimento com nota do operador.
* **Correção Obrigatória:** Integrar a central de alarmes completa na Visão Geral e na página dedicada de Alarmes com filtros dinâmicos, contadores de alarmes ativos na sidebar e exportação para auditoria.

### 3.5 Histórico e Tendências (Historian)
* **Estado:** Existem as tabelas `tag_samples` e `trend_configs` no Supabase, mas a interface não exibia o gráfico multivariável contínuo na visão geral com seleção de períodos e escalas.
* **Correção Obrigatória:** Integrar visualizador de tendências multi-linha (Vazão, Pressão, Nível, Potência) com buffer histórico e cursor de leitura temporal.

### 3.6 Comunicação Industrial (OPC UA, Modbus TCP e MQTT)
* **Estado:**
  * OPC UA e Modbus TCP possuem server functions implementadas em `src/lib/opcua-server.functions.ts` e `src/lib/modbus-server.functions.ts` com validação de hosts anti-SSRF (`resolveToAllowedIPv4`, bloqueio de IPs de metadados de nuvem e loopback não autorizado).
  * Falta driver MQTT industrial client com suporte a payloads JSON/SparkplugB e telemetria.
  * O frontend precisa de uma página de Comunicação dedicada que exiba o status de cada conexão, latência, contadores de pacotes e estado claro de `Simulação Ativa` vs `Conexão Física Ativa`.

### 3.7 Comandos Autorizados e Segurança Operacional
* **Estado:** A tabela `iot_command_log` já suporta o ciclo de vida do comando (`REQUESTED`, `AUTHORIZED`, `DELIVERED`, `EXECUTED`, `ACKED`, `TIMEOUT`, `FAILED`).
* **Correção Obrigatória:** Implementar diálogo de confirmação operacional de dois estágios com justificativa técnica, validação de permissão de escrita da TAG e bloqueio automático quando a emergência (E-STOP) estiver travada.

---

## 4. RISCOS TÉCNICOS E DE SEGURANÇA IDENTIFICADOS

1. **Risco de Falso Sentimento de Segurança (Safety Interlock):**
   * O botão visual de E-STOP ou de controle de processo nunca deve ser confundido com um circuito de parada de emergência física (categoria 4 / PLe conforme ISO 13849-1 ou SIL 3 conforme IEC 62061). O sistema deve alertar explicitamente o operador sobre esta limitação.
2. **Risco de Exposição de Rede OT (SSRF):**
   * Conexões Modbus TCP e OPC UA diretas a partir da nuvem pública não podem atingir redes industriais internas sem Edge Gateway. O ElétricAi já possui a validação `isHostAllowed` em `modbus-server.functions.ts`, que deve ser estendida para todos os drivers.
3. **Risco de Sobrecarga de Renderização (Re-render Throttling):**
   * Atualizações de telemetria a 10 Hz ou 60 Hz não podem re-renderizar o DOM completo. O motor de dados deve usar seletores pontuais (Zustand com `subscribeWithSelector` e `memo`) para atualizar apenas os badges e ponteiros que sofreram alteração.

---

## 5. PLANO MESTRE DE IMPLEMENTAÇÃO EM FASES

* **Fase 1 (P0):** Auditoria técnica e estruturação dos documentos de arquitetura (`docs/scada/`).
* **Fase 2 (P1):** Criação da rota e layout de primeira classe `SCADA SUPERVISÓRIO` (`src/routes/scada.tsx`) com navegação lateral pelas 11 páginas obrigatórias e sincronização com `ModeTabs` e `AppSidebar`.
* **Fase 3 (P2):** Biblioteca Industrial de Equipamentos e consolidação com o Modelo Canônico Unificado.
* **Fase 4 (P3):** Central de TAGs Industriais (Tag Registry) com qualidades, tipos e origens.
* **Fase 5 (P4 & P5):** Sinótico P&ID Vetorial de Alta Precisão (ETE - Estação de Tratamento de Efluentes) e integração com o Motor de Simulação Real (contatores, motores, bombas, níveis e vazões).
* **Fase 6 (P6 & P7):** Central de Alarmes ISA-18.2, painel de KPIs operacionais e visualizador de Tendências históricas.
* **Fase 7 (P8 & P9):** Painel de Comunicação Industrial (OPC UA, Modbus TCP, MQTT), testes e diagnósticos de conectividade.
* **Fase 8 (P10):** Comandos autorizados de operação, diálogo de confirmação, auditoria e controle de acesso baseado em papéis (RBAC).
* **Fase 9 (P11 & P12):** Homologação automatizada com Playwright, execução dos quality gates (`format`, `typecheck`, `lint`, `test`, `build`) e documentação final de aceite.

---
*Relatório de Auditoria aprovado para execução contínua no ElétricAi.*
