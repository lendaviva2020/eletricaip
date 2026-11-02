# ADR-004: Limites de Comandos Supervisórios vs. Funções de Segurança (NR-10 / NR-12)

- **Status:** Aceito
- **Data:** 01 de Novembro de 2026
- **Autor:** Principal Safety & Industrial Automation Architect
- **Contexto Normativo:** NR-10, NR-12, ISO 13849-1, IEC 62061, IEC 61508, ISA-101

---

## 1. Contexto do Problema

A auditoria forense apontou um risco P0 crítico (**RSK-P0-01**):
O botão vermelho de emergência (E-STOP) na interface do SCADA operava estritamente alterando flags em memória no Zustand (`state.estopActive = true`), disparando um toast que afirmava: *"Todos os acionamentos de bombas e motores foram interrompidos"*.

Isso criava o gravíssimo risco de induzir operadores ou engenheiros à falsa crença de que o clique em tela realizava o desarme elétrico físico da instalação fabril ou atuava como um SIS (Safety Instrumented System). Conforme as normas brasileiras NR-10 e NR-12 e as normas internacionais ISO 13849-1 e IEC 62061, uma parada de emergência física **NUNCA** pode depender exclusivamente de um navegador web, sistema operacional de propósito geral ou mutação de software não determinística.

---

## 2. Decisão Arquitetural

1. **Tipagem e Hierarquia Rígida de 4 Níveis de Parada (`SafetyActionLevel`):**
   Fica proibido tratar parada virtual como sinônimo de emergência física. Estabelece-se a seguinte hierarquia inegociável:
   - `SIMULATION_HALT`: Parada da Simulação em software. Interrompe modelos em memória e cessa oscilações de cálculo, sem desenergização física ou desarme de disjuntor de campo.
   - `OPERATIONAL_STOP_REQUEST`: Solicitação de Parada Operacional. Comando supervisório normal de processo despachado para a lógica de CLP (parada em rampa controlada).
   - `PHYSICAL_EMERGENCY_STOP`: Dispositivo Físico de Parada de Emergência. Botão cogumelo com abertura positiva de contato cabeado diretamente ao relé de segurança e bobina de corte de potência.
   - `VALIDATED_SAFETY_FUNCTION`: Função Instrumentada de Segurança (SIF/SIS). Malha certificada com arquitetura redundante conforme categoria/PL (ISO 13849-1) ou SIL (IEC 62061).

2. **Remediação Semântica da Interface:**
   - O botão do cabeçalho passa a ser rotulado como `PARADA DA SIMULAÇÃO (VIRTUAL)` / `Rearmar Simulação`.
   - Banner de segurança indelével posicionado permanentemente no topo do SCADA:
     *"AVISO DE SEGURANÇA OPERACIONAL (NR-10 / NR-12): Este supervisório opera em modo de simulação/engenharia. Comandos virtuais de parada não substituem o botão físico de parada de emergência e relés de segurança certificados cabeados em campo."*
   - Toasts e trilhas de auditoria registram a ação com a advertência explícita: `"PARADA DA SIMULAÇÃO — AÇÃO VIRTUAL, SEM ATUAÇÃO FÍSICA"`.

3. **Bloqueio Estrito de Controle Físico Não Homologado:**
   - A store define `isPhysicalControlAllowed: false`.
   - Qualquer comando de operador (`START`, `STOP`, `OPEN`, `CLOSE`) no Gate 1 é registrado categoricamente como ação simulada virtual (`details: "... (Simulação virtual — Sem atuação em CLP físico)"`).

---

## 3. Consequências

### Positivas:
- Conformidade legal e técnica com as exigências da NR-10 e NR-12.
- Proteção da integridade de operadores e equipamentos elétricos.
- Arquitetura preparada para acoplar no futuro com módulos de I/O de segurança de hardware independentes.
