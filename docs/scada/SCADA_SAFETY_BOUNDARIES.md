# ELÉTRICAI SCADA — FRONTEIRAS DE SEGURANÇA OPERACIONAL (NR-10 / NR-12)
# DIRETRIZES DE COMANDOS SUPERVISÓRIOS, INTERTRAVAMENTOS E E-STOP

- **Data de Emissão:** 01 de Novembro de 2026
- **Normas Aplicadas:** NR-10, NR-12, ISO 13849-1, IEC 62061, IEC 61508, ISA-101
- **Classificação:** Requisito Crítico P0 (Remediação do Risco RSK-P0-01)

---

## 1. PRINCÍPIO FUNDAMENTAL DE SEGURANÇA

> **UM BOTÃO DE SOFTWARE EM UM NAVEGADOR WEB NUNCA SUBSTITUI UM CIRCUITO FÍSICO DE PARADA DE EMERGÊNCIA, UM RELÉ DE SEGURANÇA DE HARDWARE MONITORADO OU UM SISTEMA INSTRUMENTADO DE SEGURANÇA (SIS) CERTIFICADO.**

Sob as diretrizes das Normas Regulamentadoras Brasileiras **NR-10** (Segurança em Instalações e Serviços em Eletricidade) e **NR-12** (Segurança no Trabalho em Máquinas e Equipamentos), as funções de parada de emergência destinadas a proteger a integridade humana devem atuar por corte físico direto da alimentação de força (bobinas de desarme de disjuntores e contatores de segurança com contatos positivamente guiados), independentemente de processadores de controle ou sistemas operacionais de computadores.

---

## 2. OS 4 NÍVEIS DE PARADA OPERACIONAL E DE SEGURANÇA

O ElétricAi estabelece no código-fonte (`SafetyActionLevel` em `src/lib/scada/types.ts`) a separação categórica dos 4 níveis de parada:

| Nível | Identificador | Natureza | Requer Hardware Físico | Desenergiza Potência | Descrição Operacional |
|---|---|---|---|---|---|
| **1** | `SIMULATION_HALT` | **Software / Virtual** | Não | **NÃO** | **Parada da Simulação.** Interrompe geradores matemáticos, congela telemetria e marca equipamentos em memória como `TRIPPED`. Restrita ao ambiente de engenharia e modelagem. |
| **2** | `OPERATIONAL_STOP_REQUEST` | **Supervisório / Processo** | Sim (Rede CLP) | Não (Parada em rampa) | **Solicitação de Parada Operacional.** Comando do operador despachado via barramento industrial para que o CLP desacelere o motor suavemente. |
| **3** | `PHYSICAL_EMERGENCY_STOP` | **Hardware / Elétrico** | Sim (Botão Físico) | **SIM (Corte Direto)** | **Parada de Emergência Física.** Abertura mecânica de botão cogumelo cabeado ao relé de segurança, desenergizando a bobina do contator principal. |
| **4** | `VALIDATED_SAFETY_FUNCTION` | **SIS / Malha Certificada** | Sim (CLP de Segurança) | **SIM (Seguro / Cat 4 / PL e)** | **Função de Segurança Validada.** Malha instrumentada certificada conforme análise de risco (ISO 13849-1 / IEC 62061 / SIL 3). |

---

## 3. REMEDIAÇÃO EXECUTADA NA INTERFACE SCADA

1. **Rótulo do Botão no Cabeçalho:**
   O botão do cabeçalho que anteriormente exibia "Parada de Emergência" foi alterado para:
   $$\text{\textbf{PARADA DA SIMULAÇÃO (VIRTUAL)}} \quad / \quad \text{\textbf{Rearmar Simulação}}$$
   com tooltip explicativo alertando sobre a ausência de desarme físico.

2. **Banner Permanente de Segurança:**
   Todas as visões do SCADA exibem permanentemente no topo da tela o aviso regulamentador:
   > **AVISO DE SEGURANÇA OPERACIONAL (NR-10 / NR-12):** Este supervisório opera em modo de simulação/engenharia. Comandos virtuais de parada não substituem o botão físico de parada de emergência e relés de segurança certificados cabeados em campo.

3. **Status Bar de Bloqueio Físico:**
   A barra de status inferior (`ScadaOsStatusBar`) mantém o indicador:
   $$\text{\textbf{CONTROLE FÍSICO BLOQUEADO (MODO VIRTUAL)}}$$

4. **Trilha de Auditoria com Disclaimer Explícito:**
   Ao disparar o comando de parada, o log gravado no histórico registra:
   `"PARADA DA SIMULAÇÃO — AÇÃO VIRTUAL, SEM ATUAÇÃO FÍSICA. Interrupção apenas do modelo de simulação em memória. Não houve desenergização elétrica física nem atuação de relés de segurança certificados cabeados em campo (NR-10 / NR-12)."`
   gravado com severidade `CRITICAL`.
