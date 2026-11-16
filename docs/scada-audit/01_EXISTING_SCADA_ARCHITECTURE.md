# 01 — Arquitetura atual do SCADA

## Pontos de entrada

| Entrada | Arquivo | Observação |
|---|---|---|
| Rota `/scada?projectId=` | `src/routes/scada.tsx` | Zod valida `projectId` como GUID; renderiza `ScadaLayout` |
| Modo SCADA do workspace | `src/components/industrial-workspace.tsx:48` | Carrega o mesmo `ScadaLayout` sob demanda |
| Editor HMI (legado) | `components/scada/views/scada-hmi-editor-view.tsx` → `components/canvases/scada-canvas.tsx` (Konva) | Usa OUTRA base de tags (editor/projeto) |

## Fluxo real dos dados hoje

```
                ┌───────────────────────── SERVIDOR ─────────────────────────┐
 /scada?projectId → resolveScadaProjectContext (auth + tenant + papel)       │
                │  devolve: projeto + canvasData do diagrama                  │
                └─────────────────────────────┬──────────────────────────────┘
                                              │ canvasData é IGNORADO
                                              ▼
 ScadaLayout ── se o documento unificado já está na memória do workspace ──► syncUnifiedDocToScada
            │                                                                  (canonical-bridge)
            └── senão ──► setProjectContext SEM equipamentos nem tags (SCADA vazio)

 useScadaStore (Zustand, em memória)
   ├─ tickSimulation() a cada 1 s (scada-header.tsx:41-65)
   │    ├─ demo ETE: senoides fixas (scada-store.ts:810-868)
   │    └─ cliente: valor fabricado pelo NOME do tag (scada-store.ts:727-736)
   │          └─ tag-runtime.processUpdate(source "SIMULATION") → amostra histórica
   │                 └─ bufferedHistoricalSamples cresce sem limite (nunca enviado)
   ├─ scadaAlarmEngine.evaluateTag → alarmes em memória (não persistidos)
   ├─ auditLogs em memória (não persistidos; trilha encadeada do banco não usada)
   ├─ gatewayStatus: constante "CONNECTED" (scada-store.ts:162-190)
   └─ KPIs fixos na Visão Geral (scada-overview-view.tsx:337-370)

 Telas: Visão Geral, CCM, Sinóticos, Alarmes, Tendências, Equipamentos, Tags,
        Comunicação, Eventos, Relatórios, Editor HMI, Configurações
        → TODAS leem do useScadaStore (exceto Editor HMI e CCM)
```

## Subsistemas e estado

| Subsistema | Implementação | Ligado à interface? | Persistido? |
|---|---|---|---|
| Contexto/autorização | `scada.functions.ts` `resolveScadaProjectContext`, `listAccessibleScadaProjects` | Sim | — |
| Runtime de tags | `lib/scada/tag-runtime.ts` (473 linhas) | Sim, pelo tick | Não |
| Motor de alarmes | `lib/scada/alarm-engine.ts` (603 linhas) | Sim, pelo tick | Não (`alarm_configs`/`alarm_history` sem uso pelo SCADA) |
| Histórico | `ingestTagSamplesBatch`, `queryHistorianRange` | Não (`flushHistoricalSamples` sem chamador; tendências leem só a memória) | Só se chamado; hoje não é |
| Auditoria | `recordScadaAuditEvent`, `verifyProjectAuditChain`, `audit-verifier.ts` | Não | Não |
| Relatórios | `generateOperationalReportData` | Não (a tela lê 3 números da memória) | — |
| Edge → nuvem | `edge-ingest.functions.ts` `ingestEdgeTelemetryBatch` | Não | Pela frota Edge |
| Comunicação | `scada-communication-view.tsx` | Sim, mas exibe constante | — |
| CCM (motores) | `lib/simulation/motor-*`, `scada-motors-view.tsx` | Sim | Não (simulação efêmera, correto) |
| Editor HMI | `scada-canvas.tsx` | Sim | Snapshot do projeto (outra base de tags) |

## Diagrama da arquitetura recomendada

Ver doc 14.
