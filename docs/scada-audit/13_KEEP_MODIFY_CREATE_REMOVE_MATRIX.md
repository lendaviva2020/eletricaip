# 13 — Matriz manter / modificar / criar / consolidar / remover

Nenhuma remoção foi executada. Remoções só depois de mapear consumidores, dados e rotas (regra do pedido).

| Componente | Estado atual | Decisão | Justificativa | Impacto |
|---|---|---|---|---|
| `tag-runtime.ts` | Funcional, testado | KEEP | Base correta de qualidade/proveniência | Baixo |
| `alarm-engine.ts` | Funcional, testado, sem shelving | MODIFY | Acrescentar shelving, fora de serviço, alarme de comunicação | Médio |
| `audit-verifier.ts` | Funcional, sem uso | KEEP | Será usado ao persistir a auditoria | Baixo |
| `energy-calculator.ts` | Funcional, sem uso visível | INVESTIGATE | Confirmar consumidores antes de decidir | Pendente |
| `scada.functions.ts` | 9 funções, 7 sem consumidor | MODIFY | Ligar à interface; limitar lotes; gravar origem; mensagens genéricas | Médio |
| `scada-store.ts` — simulação de cliente por nome | Fabrica valores | **REMOVE (o trecho)** | Viola a regra de dado real; substituir por "sem fonte" ou simulação física explícita | Alto |
| `scada-store.ts` — limites 30/40 A automáticos | Inventados | **REMOVE (o trecho)** | Alarme só com configuração racionalizada | Médio |
| `scada-store.ts` — `gatewayStatus` constante | Inventado | MODIFY | Ler da frota Edge real ou mostrar "sem driver" | Médio |
| `scada-store.ts` — buffer de histórico | Cresce sem limite | MODIFY | Envio periódico com limite | Baixo |
| `scada-store.ts` — KPIs da ETE no estado global | Mistura demo e cliente | MODIFY | Isolar dados da demo | Médio |
| `canonical-bridge.ts` | Presume valores; categoria errada | MODIFY | Categoria correta; qualidade `NOT_CONNECTED`; sem data de manutenção inventada | Médio |
| `scada-layout.tsx` | Ignora `canvasData`; demo CCM vira ETE | MODIFY | Construir a partir do snapshot devolvido pelo servidor; demo CCM mostra o CCM | Médio |
| `scada-overview-view.tsx` KPIs fixos | Inventados | MODIFY | Só KPIs calculáveis, senão "sem dados"; manter na demo com rótulo | Baixo |
| `scada-os-status-bar.tsx` / `scada-sidebar.tsx` "100% OK" | Inventado | MODIFY | Estado real | Baixo |
| `scada-communication-view.tsx` | Mostra constante | MODIFY | Ler `/settings/edge-fleet` (frota real) | Médio |
| `scada-trends-view.tsx` | Só memória | MODIFY | Consultar o histórico | Médio |
| `scada-reports-view.tsx` | 3 números da memória | MODIFY | Usar `generateOperationalReportData` | Baixo |
| `scada-events-view.tsx` | Memória | MODIFY | Ler auditoria persistida | Baixo |
| `scada-alarms-view.tsx` | Funcional, sem persistência | MODIFY | Persistir; shelving | Médio |
| `scada-motors-view.tsx` (CCM) | Funcional | KEEP | Bom exemplo de simulação honesta | Baixo |
| `equipment-inspector-drawer.tsx` | Funcional | KEEP → evoluir a faceplate | — | Baixo |
| `ete-synoptic-p-and-id.tsx` (1.496 linhas) | Só ETE; aparece em todo projeto | MODIFY | Exibir só na demo; projeto de cliente usa sinótico gerado | Baixo |
| `demo-ete-seed.ts` | Funcional | KEEP | Demonstração isolada por ID | Baixo |
| Editor HMI (`scada-canvas.tsx`) | Funcional, outra base de tags | CONSOLIDATE | Passar a ler a base única | Alto |
| `useAlarmStore` + `alarm.functions.ts` | Sistema de alarmes paralelo | CONSOLIDATE | Um serviço de alarmes por projeto | Alto |
| `lib/simulation/scada-engine.ts` | Alarmes de regra da aba Simulação | CONSOLIDATE | Virar fonte de condições do serviço único | Médio |
| Base única de tags com origem | Não existe | CREATE | Fonte única de verdade | Alto |
| Árvore de ativos do SCADA | Não existe | CREATE | Navegação (imagem 3) | Médio |
| Shelving / fora de serviço / indicadores de alarme | Não existe | CREATE | ISA-18.2 | Médio |
| Painel de IA assistiva | Não existe | CREATE (Fase 6) | Depende de dados confiáveis | Médio |
| Ligação bancada Arduino / IoT → SCADA | Não existe | CREATE | Primeira fonte de dado real disponível | Médio |
| Versões inventadas na interface ("Core v4.2", "v2.0.0", "v4.2 PRO") | Inventadas | MODIFY | Remover ou usar versão real | Baixo |
| Redundância de servidores, OPC UA servidor | Não existe | DEFER | Sem necessidade comprovada | — |
| `energy-calculator.ts`, `simulation_tags`, `trend_configs` | Sem consumidor claro | INVESTIGATE | Mapear antes de qualquer decisão | — |

Nenhum arquivo inteiro é candidato a remoção nesta fase. As remoções propostas são **trechos** que fabricam dados.
