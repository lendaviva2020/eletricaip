# UNIFILAR TOPOLOGY & NORMATIVE ENGINEERING VALIDATION

**Escopo:** Validação determinística de topologia elétrica e conformidade normativa sem presunção de parâmetros  
**Módulo Principal:** [`graph-validator.ts`](src/lib/diagram/connection/graph-validator.ts) + [`normative-compliance-panel.tsx`](src/components/diagnostics/normative-compliance-panel.tsx)  
**Data:** 2026-11-14  

---

## 1. Princípio de Honestidade Técnica (Zero Fabricação de Dados)

As verificações de engenharia distinguem explicitamente estado válido de estado não verificável por ausência de dados informados pelo projetista. Parâmetros elétricos ausentes (ex.: seção/comprimento de condutores ou $I_{cc}$ de disjuntores) **não** são preenchidos ou presumidos como aprovados.

Statuses explícitos exportados em [`EngineeringComplianceStatus`](src/lib/diagram/connection/graph-validator.ts#L346-L352):
- `VALID`
- `INVALID`
- `WARNING`
- `INCOMPLETE`
- `REQUIRES_ENGINEERING_REVIEW`
- `NOT_VERIFIABLE`

---

## 2. Regras Avaliadas em `evaluateNormativeEngineeringCompliance`

Função: [`evaluateNormativeEngineeringCompliance`](src/lib/diagram/connection/graph-validator.ts#L389-L561)

| Norma | Cláusula / Critério Verificado | Condição & Status Emitido |
| :--- | :--- | :--- |
| **IEC 60617** | Topologia Geral & Conectividade Canônica | Sem nós -> `INCOMPLETE`; arestas inválidas -> `INVALID`; nós desconectados ou ramais abertos -> `INCOMPLETE`; topologia contínua -> `VALID`. |
| **NBR 5410** | §5.1 / §6.4 Aterramento (PE) | Presença explícita de elemento `ground` quando há componentes -> se ausente, `WARNING`. |
| **NBR 5410** | §6.2.6 / §6.2.7 Condutores e Queda de Tensão | Arestas `power` sem `cable.section_mm2` ou `cable.length_m` -> `NOT_VERIFIABLE` (explicitando ausência sem presunção). |
| **IEC 60909** | Capacidade de Interrupção ($I_{cu}/I_{cn}$) | Disjuntores (`breaker`) sem `icc_kA` declarada -> `NOT_VERIFIABLE`. |
| **IEC 61439** | §8.6 Corrente Nominal de Barramento | Soma das correntes nominais ($I_n$) de disjuntores alimentados pelo barramento > $1{,}25 \times$ corrente nominal do barramento -> `REQUIRES_ENGINEERING_REVIEW`. |
| **IEC 60204-1** | §9.2.2 / §10.7 Parada de Emergência | Acionamento contendo motores (`motor`) sem dispositivo explícito `estop` no diagrama -> `REQUIRES_ENGINEERING_REVIEW`. |

---

## 3. Integração na Interface de Engenharia

- **Canvas Unifilar ([`handleValidate`](src/components/canvases/webgl-canvas.tsx#L674)):** ao acionar a validação no canvas, o usuário recebe feedback refletindo tanto `topology.status` quanto `complianceReport.overallStatus`.
- **Painel Direito ([`NormsPanel`](src/components/right-panel.tsx) / [`NormativeCompliancePanel`](src/components/diagnostics/normative-compliance-panel.tsx)):** exibe o badge de status geral (`data-testid="normative-overall-status"`), contagem de achados (`Valid`, `Pend./Rev.`, `Não Verif./Inv.`), cards por norma com cláusula e um atalho direto para abrir o dock inferior na aba `diagnosticos` preservando o botão **Corrigir com IA** (`AiFixButton`).
