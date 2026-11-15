# 05 — Auditoria dos Cálculos de Engenharia Elétrica

Escopo lido integralmente: `src/lib/electrical-calc.ts` (1.305 linhas), que é o motor usado pelo arquiteto de IA, pelo validador normativo e pela simulação de potência (cabeçalho, linhas 1-2).
Verificação independente: script `tools/calc-check.ts` (no scratchpad da auditoria). Ele importa as funções reais e compara com cálculo manual.
**Não lidos neste ciclo:** `electrical-sim.ts`, `norm-validator.ts`, `component-definitions.ts`, `diagnostics/conductor-solver.ts`, `dossier/calculations.ts`, `dossier/normative.ts`, `diagram/electrical-simulation.ts`, `scada/energy-calculator.ts`. Eles podem conter fórmulas próprias e paralelas, o que é suspeita de duplicidade (INSUFFICIENT_EVIDENCE).

## 1. Fórmulas verificadas

| Função | Fórmula implementada | Unidades | Resultado |
|---|---|---|---|
| `motorNominalCurrent` (l.55-60) | I = P·1000 / (√3·U·cosφ·η) | P kW mecânico, U V linha | ✅ 15 kW/380 V/0,85/0,90 → 29,79 A (manual 29,79 A) |
| `motorStartingCurrent` (l.62-65) | I_p = k·I_n; k = 7 (DOL), 3,5 (soft), 1,1 (VFD) | — | ⚠ fatores fixos, sem dado de placa (P3-CALC-033) |
| `temperatureFactorKt` (l.~730) | degrau superior das Tab. 40/41 | °C | ✅ valores conferem até 60 °C; ❌ clamp acima de 60 °C (P2-CALC-028) |
| `groupingFactorKg` | Tab. 42, linha 1 | nº circuitos | ✅ valores conferem; ⚠ linha única para todos os métodos (P3-CALC-033) |
| `ampacityIz` | lookup Tab. 36/37/38 | A | ❌ ver §2 |
| `calcVoltageDrop` | ΔV = k·I·(R·cosφ + X·senφ); k = √3 (3φ) ou 2 (1φ); R = ρL/S | I A, L m, S mm², X mΩ/m | ✅ fórmula; ❌ ρ e tensão default (P1-CALC-022/026) |
| `verifyThermalWithstandI2t` | I²t ≤ k²S², k Tab. 30 (115/103/143/76/68/94) | A, s, mm² | ✅ k confere; ❌ clamp t ≤ 5 s (P2-CALC-029) |
| `sizeConductorNBR5410` | menor S com Iz·kt·kg ≥ max(Ib·fs, In) e ΔV ≤ limite | — | ❌ P1-CALC-025/027 |
| `calcDemand` | S = ΣP·div/cosφ; trafo ≥ 1,25·S | kW mecânico | ❌ sem η (P2-CALC-031) |

## 2. Tabelas de capacidade de condução (Iz)

| ID | Sev. | Divergência | Evidência |
|---|---|---|---|
| P1-CALC-023 | P1 | **PVC, método C, 3 condutores carregados, ≥ 25 mm²:** o código usa 101/125/151/192/232/269/309/353/415/473 A, valores praticamente iguais à coluna B1 de 2 condutores. A referência (IEC 60364-5-52 Tab. B.52.4, reproduzida pela NBR 5410:2004 Tab. 36) dá 96/119/144/184/223/259/299/341/403/464 A. **Superestima ~5% no método padrão do sistema ("C")**, o que é não conservador | `electrical-calc.ts:147-164` |
| P2-CALC-024 | P2 | Método F: PVC 3c ≥ 70 mm² e XLPE 3c (coluna inteira) são cópia exata da coluna C de 2 condutores (detecção automática). O método F não existe na norma para 1,5-16 mm² (valores inventados). Valores do método D divergem da edição 2004 (a menor, portanto conservador): confirmar contra a tabela oficial | `calc-check.ts` saída "COPY?" |

Os valores de referência acima vêm de conhecimento técnico de domínio público (IEC). **A conferência final precisa usar a tabela oficial licenciada da NBR 5410:2004.** O texto normativo não é reproduzido aqui.

## 3. Queda de tensão (§7.3 do pedido)

| ID | Sev. | Achado | Caso de referência |
|---|---|---|---|
| P1-CALC-022 | P1 | `RHO = 0,0178 Ω·mm²/m` está comentado como "a 70 °C", mas é o valor aproximado a 20 °C. Em regime (70 °C para PVC), o cobre fica perto de 0,0209 | 50 A / 100 m / 16 mm² / 380 V / cosφ 0,85: código **2,16%**; com ρ70 + X = 0,08 mΩ/m: **≈ 2,63%** (subestimado ~18%) |
| P1-CALC-026 | P1 | `phases: 1` mantém o default `voltage_V = 380`; o percentual monofásico usa a base errada | 16 A / 30 m / 2,5 mm² / cosφ 0,95: código **1,71%**; base 220 V: **2,95%** |
| P1-CALC-025 | P1 | O dimensionamento aplica um único limite de 5% por trecho (`maxVoltageDrop_pct ?? 5`), sem acumular desde a origem. Não distingue origem em transformador próprio de fornecimento em BT nem circuito terminal de distribuição, e não verifica a queda na partida de motores | `electrical-calc.ts` `sizeConductorNBR5410` |
| P3-CALC-033 | P3 | Reatância desprezada para S < 35 mm² (premissa não exposta ao usuário) | — |

Limites aplicáveis (referência por seção, sem reprodução de texto): NBR 5410:2004 §6.2.7. Os limites dependem da origem da instalação e do tipo de circuito, e incluem um limite específico para circuitos terminais e a condição de partida de motores. O código não modela essa estrutura.

## 4. Dimensionamento, proteção e entradas inválidas

| ID | Sev. | Achado | Reprodução |
|---|---|---|---|
| P1-CALC-027 | P1 | Quando nenhuma seção atende, o resultado é 300 mm² silenciosamente | `sizeConductorNBR5410(900)` → 300 mm², Iz' = 473 A, só `coordination.coordinated = false` |
| P2-CALC-029 | P2 | `t` limitado a 5 s: t = 10 s é avaliado como 5 s | 10 mm², 400 A, 10 s → `adequate: true`; manual: 1,6e6 > 1,32e6 → **inadequado** |
| P2-CALC-028 | P2 | kt para ambiente > 60 °C retorna o último degrau | PVC a 65 °C/70 °C → 0,5 (deveria ser inválido) |
| P2-CALC-030 | P2 | Seção não comercial é arredondada para cima; não há material | `ampacityIz(1)` → 17,5 A (Iz de 1,5 mm²); alumínio usaria tabela de cobre |
| P2-CALC-031 | P2 | Demanda usa kW mecânico sem η; diversidade default 0,85 silenciosa | 100 kW → 96,6 kVA (com η 0,92 ≈ 105 kVA) |
| P2-CALC-032 | P2 | Sem validação: NaN, 0 e negativos se propagam | In(NaN) = NaN; U = 0 → Infinity; P < 0 → corrente negativa; S = 0 → ΔV Infinity |

## 5. Curto-circuito, seletividade, harmônicas, correção de FP

- Neste ciclo, nenhum cálculo de Ik3/ip/Ik1 (IEC 60909) foi localizado em `electrical-calc.ts`. A função térmica recebe `faultCurrent_A` como entrada, sem impedância de fonte. Outros módulos não foram lidos (INSUFFICIENT_EVIDENCE).
- Seletividade, coordenação, harmônicas, correção de FP, aterramento e PE: NOT_VERIFIED neste ciclo.

## 6. Testes de referência propostos

Criar `src/lib/__tests__/electrical-calc.reference.test.ts` com os casos das tabelas acima (valores esperados calculados manualmente), propriedades de monotonicidade (2c ≥ 3c, XLPE ≥ PVC, Iz crescente com S) e rejeição de entradas inválidas. Hoje a suíte passa (1.372/1.372) mesmo com estes defeitos, o que mostra que os testes atuais não cobrem valores de referência independentes.

## 7. Ciclo 2: segundo motor de queda de tensão (diagnósticos do canvas)

`src/lib/diagram/multifilar.ts:454-537` (`calculateVoltageDropNbr5410`, que alimenta `runDiagramDiagnostics`) é **independente** de `electrical-calc.ts`, e os dois são contraditórios:

| Parâmetro | `electrical-calc.ts` | `multifilar.ts` |
|---|---|---|
| ρ (Ω·mm²/m) | 0,0178 | 0,0215 |
| Reatância | só S ≥ 35 mm² | sempre 0,08 Ω/km |
| Limite | 5% (dimensionamento) | 4% para **toda** aresta, inclusive alimentadores |
| cosφ / η do motor | parâmetros do nó (default 0,86/0,92) | **fixos 0,85/0,88**, ignorando o nó |
| Tensão | parâmetro | fixa 380 V (3F) / 220 V (1F) |

| ID | Sev. | Achado |
|---|---|---|
| P1-CALC-050 | P1 | O mesmo circuito (50 A, 100 m, 16 mm², 3F) dá ≈ 2,7% no diagnóstico do canvas contra 2,16% no dimensionamento: o canvas e o dimensionador discordam |
| P1-CALC-051 | P1 | Carga `load` usa I = P/(V·fp), a fórmula monofásica, mesmo em circuito 3F (superestima √3×); motor com cosφ/η fixos; `Math.round` na corrente |
| P2-CALC-052 | P2 | `drop_pct` é arredondado para 0,1 **antes** da comparação (4,04% → "conforme"); com defaults 25 m / 4 mm² / 20 A, o resultado é um alerta "OK — em conformidade NBR 5410" (as premissas são registradas em `assumptions`, mas a severidade fica OK) |

O problema conhecido nº 8 (premissas apresentadas como dados confirmados) **persiste** também no canvas.
