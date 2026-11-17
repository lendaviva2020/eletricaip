# 17 — Plano mestre de implementação

Aguardando autorização. Cada fase em patches pequenos, com testes antes e depois, sem deploy nem migration remota sem aprovação expressa.

## Fase 0 — Honestidade e estabilidade (pré-requisito de tudo) — ✅ concluída em 2026-11-17

- **Resolver:** SR-01, SR-02, SR-03, SR-04, SR-06, SR-09, SR-10; SEC-2, SEC-3, SEC-7.
- **Modificar:** `scada-store.ts` (remover fabricação por nome e limites 30/40 A; envio periódico do buffer com teto), `canonical-bridge.ts` (categoria correta, qualidade `NOT_CONNECTED`, sem data inventada, sem 380 V/FP presumidos exibidos como telemetria), `scada-overview-view.tsx`/`scada-sidebar.tsx`/`scada-os-status-bar.tsx`/`scada-communication-view.tsx` (sem números fixos), `scada-layout.tsx` (usar `canvasData`; demo CCM mostra o CCM), `scada.functions.ts`/`edge-ingest.functions.ts` (lote máximo, mensagens genéricas).
- **Manter:** runtime, motor de alarmes, CCM, demo ETE.
- **Testes:** estender `real-data-integrity.test.ts` ao SCADA; teste de que projeto de cliente sem fonte mostra "sem fonte"; teste do teto do buffer.
- **Aceite:** nenhum número na interface do SCADA de cliente sem origem identificável.

## Fase 1 — Fundação (fonte única e persistência) — ✅ concluída em 2026-11-17 (ver AGENTS.md, 15ª rodada)

- **Criar:** base única de tags com origem por projeto; ligação da bancada Arduino/IoT e do CCM como fontes.
- **Modificar:** alarmes e auditoria passam a persistir nas tabelas existentes; forçar tag exige papel e motivo.
- **Consolidar:** `useAlarmStore` e `scadaAlarmEngine` em um serviço; editor HMI lendo a base única (com migração de projetos salvos).
- **Migration (sob aprovação):** `tag_samples` + `source`, `unit`, `equipment_id`, `sequence`.
- **Aceite:** recarregar a página não perde alarmes nem auditoria; um tag aparece com o mesmo valor e origem no SCADA, no editor HMI e no modo Alarmes.

## Fase 2 — Supervisão e HMI

- Hierarquia ISA-101: visão geral só com desvios; áreas da designação `=planta+local`; faceplate por equipamento canônico; árvore de ativos; paleta neutra; remover versões inventadas; P&ID da ETE só na demo.
- **Aceite:** operador chega de qualquer alarme ao faceplate e à tendência em até 2 cliques.

## Fase 3 — Alarmes e eventos (ISA-18.2)

- Configuração racionalizada (causa, consequência, ação), shelving com prazo, fora de serviço, alarme de comunicação, primeiro alarme, indicadores (alarmes/hora, inundação, chattering, parados).
- **Aceite:** lista de shelving e de fora de serviço; indicadores calculados do `alarm_history`.

## Fase 4 — Histórico e tendências

- Ingestão com origem; tempo máximo entre amostras; consulta agregada por janela; "Trend" a 1 clique; retenção por plano.
- **Aceite:** tendência de 24 h de um tag real com origem visível; simulado nunca misturado sem marcação.

## Fase 5 — Integrações industriais

- Aba Comunicação lendo a frota Edge real (`/settings/edge-fleet`), qualidade por driver, alarme de comunicação. Sem novos protocolos.
- **Aceite:** derrubar o gateway de teste gera alarme de comunicação e tags `STALE`.

## Fase 6 — IA assistiva

- Painel lateral somente leitura sobre equipamento/alarme em foco, Gemini já configurado, saída estruturada (fato / correlação / hipótese / verificação), créditos e limites existentes.
- **Aceite:** respostas citam tags/alarmes de origem; recusa explícita quando não há dado; nenhum caminho de escrita.

## Fase 7 — Homologação

- E2E do SCADA com sessão de cliente, carga (tags × 1 Hz por horas, memória estável), testes de isolamento entre empresas, revisão de segurança, cenário "fábrica de óleo e farinha" como demo isolada.

## Dependências e pendências externas

- `docs/SQL_APLICAR_HOJE.sql` aplicado (sem ele não há leitura IoT real para ligar ao SCADA).
- Aprovação da migration de `tag_samples`.
- Definição do provedor de IA, caso não seja o Gemini já configurado.
