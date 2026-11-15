# 06 — Revisão de Conformidade Normativa

Regra adotada: o fato de o código citar uma norma **não** prova conformidade. Cada item foi classificado pelo que a implementação lida faz de fato. Só se referenciam seções (sem reproduzir texto protegido).

| Norma (edição) | Seção referida | Onde aparece | Estado | Justificativa |
|---|---|---|---|---|
| ABNT NBR 5410:2004 | Tab. 36/37/38 (Iz) | `electrical-calc.ts:67-690` | PARTIAL | Tabelas presentes, mas com erros em C-3c PVC e F (P1-CALC-023, P2-CALC-024) |
| ABNT NBR 5410:2004 | Tab. 40/41 (kt) | `electrical-calc.ts` | PARTIAL | Valores conferem; extrapolação acima de 60 °C incorreta |
| ABNT NBR 5410:2004 | Tab. 42 (kg) | `electrical-calc.ts` | PARTIAL | Só a linha 1 da tabela |
| ABNT NBR 5410:2004 | §5.3.4.1 (coordenação de sobrecarga) | `verifyOverloadCoordination` | IMPLEMENTED | Ib ≤ In ≤ Iz e I2 ≤ 1,45 Iz (I2 = 1,45 In para disjuntores IEC) |
| ABNT NBR 5410:2004 | §5.3.5 / Tab. 30 (I²t) | `verifyThermalWithstandI2t` | PARTIAL | k correto; clamp de t inválido |
| ABNT NBR 5410:2004 | §6.2.7 (queda de tensão) | `sizeConductorNBR5410`, `calcVoltageDrop` | PARTIAL | Fórmula ok; limites não estruturados por origem e tipo de circuito; ρ a 20 °C |
| ABNT NBR 5410:2004 | Tab. 47 (seção mínima) | `minSection_mm2` default 2,5 | PARTIAL | Iluminação (1,5) depende do chamador |
| ABNT NBR 5410:2004 | Condutor de proteção (PE) | — | NOT_VERIFIED | Não localizado no motor lido |
| ABNT NBR 14039 | MT | — | NOT_VERIFIED | — |
| IEC 60909 | Curto-circuito | — | NOT_IMPLEMENTED no motor lido | Corrente de falta recebida como entrada |
| IEC 60617 / NR-12 | Metadados de diagrama | `engineering-tools.server.ts` (`norms: ["NBR 5410","IEC 60617","NR-12"]`) | NAME_ONLY | Rótulo gravado no doc; sem verificação |
| IEC 61131-3 | Ladder/FBD/ST | `src/lib/ladder`, `fbd`, `studio/iec` | NOT_VERIFIED | Lote B7 pendente |
| IEC 61439 / 60204-1 / 60947 / 61800 | — | — | NOT_VERIFIED | — |
| NR-10 / NR-12 | — | textos de segurança | NOT_VERIFIED | — |

O "painel de conformidade normativa real" citado no commit `8fb7baf` (`evaluateNormativeEngineeringCompliance`) não foi lido neste ciclo.
