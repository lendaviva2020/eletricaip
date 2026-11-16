# 12 — Segurança OT

## Controles verificados (positivos)

| Controle | Evidência |
|---|---|
| Toda server function do SCADA (exceto a do Edge) exige sessão | `scada.functions.ts`: 9/9 com `requireSupabaseAuth` |
| Autorização por projeto, empresa e papel (viewer não escreve) | `authorizeProjectAccess`, `scada.functions.ts:59-115` |
| Consultas com cliente do usuário (RLS aplica) | `authCtx.supabase` |
| Nenhum caminho escreve em equipamento | `commandEquipment` só muda estado simulado (`scada-store.ts:462-470`); CCM com `MCC_FIELD_WRITE_ENABLED = false` |
| Drivers Edge somente leitura com testes adversariais | `edge-physical-readonly-enforcement`, `edge-sparkplug-command-deny`, `gate3_8_*` |
| Edge inicia a conexão para a nuvem (de dentro para fora), autenticado por token de gateway | `edge-ingest.functions.ts`, `lib/edge/cloud-sync-client.ts` |
| Guarda de rede/SSRF no Modbus | `edge-network-allowlist.ts`, `modbus-server.functions.ts` |
| Navegador guarda só preferências do SCADA | `scada-store.ts:1098-1103` |
| Scripts do editor HMI em Web Worker isolado | `scada-worker.ts` (RISK-011 em aberto) |

## Achados

| ID | Achado | Evidência | Gravidade |
|---|---|---|---|
| SEC-1 | Trava física do SCADA é campo mutável do store (`isPhysicalControlAllowed: boolean`), não constante; o ramo "reservado" está vazio | `scada-store.ts:54,139,469` | Baixa (nenhum setter usa `true`); endurecer |
| SEC-2 | Lote de amostras sem tamanho máximo (ingestão do SCADA e do Edge) | `scada.functions.ts:269`, `edge-ingest.functions.ts` (`z.array` sem `.max`) | Média (abuso/custo) |
| SEC-3 | Mensagens de erro do banco repassadas ao cliente | `scada.functions.ts` (`DB_ERROR: ${pErr.message}`) | Baixa |
| SEC-4 | Buffer de histórico da demonstração em memória do servidor, compartilhado por todos os usuários da instância; qualquer usuário autenticado pode gravar nele | `scada.functions.ts` (`demoHistoricalSamples`; `authorizeProjectAccess` libera o ID demo) | Baixa (dado sem valor, limitado a 5.000) |
| SEC-5 | Trilha de auditoria de operação só em memória: forçamento de tag, reconhecimento e comandos não deixam registro persistente | `scada-store.ts` `auditLogs`; `recordScadaAuditEvent` sem consumidor | Alta (rastreabilidade) |
| SEC-6 | Forçar tag não exige papel nem confirmação na interface | `scada-tags-view.tsx` → `forceTagValue` | Média (hoje só memória/simulação) |
| SEC-7 | Status de comunicação fixo "CONNECTED" esconderia uma perda real de comunicação | `scada-store.ts:162-190` | Alta quando houver dado real |
| SEC-8 | A política de MFA `aal2` no RLS segue pendente (RISK-017) e afeta acesso direto ao PostgREST das tabelas do SCADA | AGENTS.md §10 | Média |

## Recomendação

- Fase 0: SEC-7 (mostrar estado real ou "sem driver"), SEC-2 (limites de lote), SEC-3 (mensagens genéricas).
- Fase 1: SEC-5 (persistir auditoria com cadeia de hash já existente), SEC-6 (forçar exige papel engineer+ e motivo).
- SEC-1: transformar em constante importada (`IS_PHYSICAL_CONTROL_ALLOWED`) e teste-guarda.
- Nenhuma mudança deve abrir acesso de entrada à rede OT; o Edge continua iniciando a conexão.
