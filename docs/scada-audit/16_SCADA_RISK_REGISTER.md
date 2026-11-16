# 16 — Registro de riscos do SCADA

| ID | Risco | Probabilidade | Impacto | Evidência | Tratamento | Fase |
|---|---|---|---|---|---|---|
| SR-01 | Operador ou cliente toma decisão com base em valor fabricado | Alta (todo projeto de cliente) | Alto | `scada-store.ts:727-736` | Remover fabricação; "sem fonte" | 0 |
| SR-02 | Alarme falso de sobrecorrente por limite fixo de 30/40 A (motor pequeno nunca alarma; grande alarma sempre) | Alta | Alto | `scada-store.ts:257-282` | Remover limites automáticos | 0 |
| SR-03 | KPIs de confiabilidade fixos lidos como medidos | Alta | Médio | `scada-overview-view.tsx:337-370` | Calcular ou "sem dados" | 0 |
| SR-04 | Perda real de comunicação escondida por status fixo | Média (quando houver Edge) | Alto | `scada-store.ts:162-190` | Estado real | 0 |
| SR-05 | Histórico misturando simulado e real | Média (se ligado como está) | Alto | `tag_samples` sem `source` | Migration + origem obrigatória | 1/4 |
| SR-06 | Vazamento de memória em aba aberta por horas (sala de controle) | Alta | Médio | `scada-store.ts:804` | Envio periódico com limite | 0 |
| SR-07 | Ausência de rastreabilidade de forçamentos e reconhecimentos | Alta | Alto | auditoria em memória | Persistir auditoria | 1 |
| SR-08 | Divergência entre 4 bases de tags e 4 sistemas de alarme | Alta | Médio | doc 09, doc 07 | Consolidar | 1 |
| SR-09 | Projeto de cliente aberto em `/scada` aparece vazio (cliente acha que perdeu dados) | Alta | Médio | `scada-layout.tsx:155-163` | Usar `canvasData` | 0 |
| SR-10 | Abuso de ingestão por lote ilimitado | Baixa | Médio | doc 12 SEC-2 | Limite de lote | 0 |
| SR-11 | IA "explicando" dado inventado | Alta se a IA vier antes da Fase 0 | Alto | doc 11 | Ordem das fases | 6 |
| SR-12 | Regressão ao consolidar o editor HMI (projetos salvos) | Média | Alto | `scada-canvas.tsx` | Migração com compatibilidade e testes | 1/2 |
| SR-13 | Versões inventadas na interface ("Core v4.2") geram desconfiança comercial | Média | Baixo | doc 08 | Remover | 2 |
| SR-14 | Afirmação de conformidade ISA/IEC sem verificação | Média | Médio | textos dos componentes | Linguagem "inspirado em", sem selo | 2 |
