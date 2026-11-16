# 09 — Tags, runtime e fluxo de dados

## Origem de cada valor exibido

| Valor | Origem real | Tipo | Correto? |
|---|---|---|---|
| Tags da ETE de demonstração | Senoides em `scada-store.ts:810-868` | Simulado (demo) | ✅ com banner |
| Tags de projeto de cliente | **Fabricado pelo nome**: "CORRENTE" 26,5, "POTENCIA" 11,2, "TEMP" 48,5, "VAZAO" 85, + `Math.sin` (`scada-store.ts:727-736`) | Inventado | ❌ |
| Potência/vazão totais de cliente | Soma de `powerKw`/`flowRateM3h` dos equipamentos "RUNNING" (`:713-718`) | Calculado sobre parâmetro de projeto | ⚠️ aceitável só como "simulado" |
| Corrente do equipamento | Corrente nominal calculada da potência, com tensão 380 V e FP 0,88 presumidos (`canonical-bridge.ts:34-45`) | Parâmetro de projeto exibido como telemetria | ❌ |
| Categoria do equipamento | `drive`/`load` → "PUMP" (`canonical-bridge.ts:23-24`) | Errado | ❌ |
| Qualidade do tag | "GOOD" fixo ao carregar (`canonical-bridge.ts:94`) | Inventado | ❌ deveria ser "NOT_CONNECTED" sem fonte |
| `isSimulated` do tag | `false` (`:101`) embora o valor venha da simulação | Contraditório | ❌ |
| Última manutenção | Data de hoje (`:63`) | Inventado | ❌ |
| Estado dos drivers | Constante (`scada-store.ts:162-190`) | Inventado | ❌ |
| CCM (motores) | `motor-protection-engine.ts` (modelo físico simplificado) | Simulado rotulado | ✅ |
| Bancada Arduino / IoT | `iot_readings` (após o SQL pendente) e Web Serial | Real | ✅ mas não chega ao SCADA |

## O runtime de tags é bom e subaproveitado

`lib/scada/tag-runtime.ts` já faz: escala, deadband por tag (`:286-298`), mudança de qualidade gera amostra, proveniência (fonte, carimbo da fonte, recebido em, sequência), forçamento com valor original guardado e degradação para `UNCERTAIN`/`STALE` (`:225`). Tudo testado (`scada-gate2-tag-runtime`, `scada-gate2-5-runtime-and-deadband`, `scada-gate2-5-staleness-forcing`). O problema não é o runtime: é o que o alimenta.

## Bases de tags paralelas (contra a "fonte única")

| Base | Onde | Consumidores |
|---|---|---|
| Tags canônicas do projeto | `model/unified-schema.ts` (`engineering.tags`) | Ponte para o SCADA, CLP, Studio |
| Tags do SCADA | `useScadaStore.tags` (cópia da canônica + valores) | Telas do SCADA |
| Tags do editor/runtime | `useEditorStore`/`useProjectStore` (`runtime-client.ts`) | Editor HMI, Simulação |
| Tags da planta simulada | `plant-store.ts` | Aba Simulação |
| Estado do CCM | `motor-control-store.ts` | Aba CCM, unifilar |
| Leituras IoT | `iot_readings` | `/realtime`, bancada Arduino |

## Recomendação

1. **Fase 0:** a simulação de cliente deixa de inventar valores por nome; tag sem fonte mostra "sem fonte" com qualidade `NOT_CONNECTED`.
2. **Fase 1:** uma única base de tags por projeto (a canônica), com **origem** explícita por tag: `simulação:<motor>` (CCM, planta, bancada simulada), `iot:<dispositivo>.<grandeza>` (bancada real, ESP32) ou `edge:<gateway>.<endereço>`.
3. O CCM e a bancada Arduino passam a **publicar** nessa base em vez de terem telas próprias desconectadas do SCADA.
