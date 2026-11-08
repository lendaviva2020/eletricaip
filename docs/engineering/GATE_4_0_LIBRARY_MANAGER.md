# GATE 4.0 — INDUSTRIAL LIBRARY MANAGER & DEPENDENCY ENGINE
## ARQUITETURA DE BIBLIOTECAS, RESOLUÇÃO DE PLACEHOLDERS E CATÁLOGO INDUSTRIAL

### 1. OBJETIVO E VISÃO GERAL

O módulo **Library Manager** do ElétricAi Industrial OS implementa paridade funcional com o subsistema de bibliotecas do CODESYS Development System V3.5, oferecendo:
- Resolução dinâmica de **Placeholders** (`#Standard`, `#SysTypes`, `#IoStandard`, etc.) conforme o hardware e a versão de runtime.
- Grafo direcionado acíclico (DAG) de dependências com ordenação topológica e detecção rigorosa de referências circulares.
- Compatibilidade semântica de versões baseada em SemVer (`^1.0.0`, `~1.2.0`, `>=`, exata).
- Catálogo de 12 bibliotecas originais de automação e engenharia elétrica desenvolvidas especificamente para o ElétricAi.
- Salvaguarda inviolável de isolamento físico: `IS_PHYSICAL_CONTROL_ALLOWED = false`.

---

### 2. MECANISMO DE RESOLUÇÃO DE PLACEHOLDERS

Em sistemas modernos de automação como o CODESYS, POUs e blocos funcionais não devem depender diretamente de implementações acopladas a hardwares específicos. Em vez disso, o projeto referencia **Placeholders**, indicados convencionalmente pelo prefixo `#`.

```
                    ┌────────────────────────┐
                    │ Projeto de Automação   │
                    │ Referência: #Standard  │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  Placeholder Resolver  │
                    │   (Target Controller)  │
                    └───────────┬────────────┘
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ CODESYS V3.5 │         │ Siemens S7   │         │ Rockwell CIP │
│ EletricAi_Std│         │ S7_IoStandard│         │ CIP_IoStd    │
└──────────────┘         └──────────────┘         └──────────────┘
```

#### Resoluções Padrão Mapeadas:
1. `#Standard` $\rightarrow$ `EletricAi_Standard` (v3.5.20.0): Blocos de temporização (TON, TOF, TP), gatilhos (R_TRIG, F_TRIG) e contadores (CTU, CTD, CTUD).
2. `#SysTypes` $\rightarrow$ `EletricAi_SysTypes` (v3.5.20.0): Handles de ponteiro e tipos de sistema fundamentais (`RTS_IEC_HANDLE`, `RTS_IEC_RESULT`).
3. `#IoStandard` $\rightarrow$ Resolução adaptativa por fornecedor de controlador (CODESYS_VIRTUAL, SIEMENS, ROCKWELL).
4. `#CmpApp` $\rightarrow$ `EletricAi_CmpApp`: Gerenciamento de ciclo de vida de aplicações no controlador.

---

### 3. GRAFO DE DEPENDÊNCIAS E ORDENAÇÃO TOPOLÓGICA

O `IndustrialLibraryManager` constrói o grafo de dependências transitivas e executa busca em profundidade (DFS) com detecção de ciclo por pilha de visitação:

- **Estado UNVISITED**: Nó ainda não processado.
- **Estado VISITING**: Nó atualmente na pilha de recursão. Se um vizinho já estiver em VISITING, um ciclo fatal é diagnosticado (`ERR_CIRCULAR_DEPENDENCY`).
- **Estado VISITED**: Nó completamente resolvido e incluído na lista de ordenação de carga reversa (`loadOrder`).

---

### 4. ESPECIFICAÇÃO DAS 12 BIBLIOTECAS INDUSTRIAIS DO ELÉTRICAI

| # | Nome da Biblioteca | Categoria | Dependências | Principais Blocos Funcionais / Contratos |
|---|---|---|---|---|
| 1 | `ElectricalProtection` | APPLICATION | `EletricAi_Standard` | `FB_Overcurrent50_51` (Curvas IEC 60255), `FB_VoltageProtection27_59` |
| 2 | `Transformers` | APPLICATION | `ElectricalProtection` | `FB_TransformerThermalModel` (IEC 60076-7), `FB_OLTCTapChanger` |
| 3 | `MotorStarters` | APPLICATION | `EletricAi_Standard` | `FB_DOLStarter`, `FB_StarDeltaStarter` (anti-flashover dwell) |
| 4 | `VFDControl` | MOTION | `EletricAi_Standard` | `FB_VFDControl` (Rampas, ControlWord CiA 402/Profidrive) |
| 5 | `PumpsAndPiping` | APPLICATION | `MotorStarters` | `FB_DuplexPumpAlternation` (por horímetro), `FB_PumpCavitationProtection` |
| 6 | `ValvesAndActuators` | APPLICATION | `EletricAi_Standard` | `FB_DiscreteValve` (supervisão de curso), `FB_ModulatingValve` |
| 7 | `SensorsAndInstruments`| APPLICATION | Nenhuma | `FB_AnalogInputScaling` (NAMUR NE43: <3.6mA aberto, >21mA curto) |
| 8 | `ProcessControl` | APPLICATION | `SensorsAndInstruments` | `FB_PIDController` (Anti-reset windup, derivativo filtrado) |
| 9 | `EnergyMetering` | APPLICATION | Nenhuma | `FB_ThreePhasePowerMeter` (kW, kvar, kVA, FP, kWh acumulado) |
| 10| `SafetyMonitoring` | APPLICATION | `EletricAi_Standard` | `FB_DualChannelEStop` (Supervisão bicanal, discrepância max 50ms) |
| 11| `WaterTreatmentETE` | APPLICATION | `ProcessControl`, `PumpsAndPiping` | `FB_WaterTreatmentETE` (Neutralização pH, controle de sopradores) |
| 12| `Conveyors` | APPLICATION | `MotorStarters` | `FB_ZeroPressureAccumulation` (Lógica ZPA, desobstrução de zona) |

---

### 5. GARANTIA DE SEGURANÇA E ISOLAMENTO FÍSICO

Todas as classes e blocos funcionais operam sob simulação determinística no espaço do navegador / Node.js. Nenhuma instrução dessas bibliotecas emite comandos físicos a relés reais, uma vez que:
```typescript
export const IS_PHYSICAL_CONTROL_ALLOWED: false = false;
```
Qualquer tentativa de acionamento em hardware em tempo de execução sem permissão formal emula uma exceção de segurança de barreira de hardware.
