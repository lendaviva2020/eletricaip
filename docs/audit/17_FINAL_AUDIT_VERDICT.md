# 17 — Parecer (ciclo 4)

## ESTADO GERAL: **AUDITORIA INCOMPLETA**, com **bloqueios P0 confirmados**

Motivo: 29 dos 666 arquivos de código próprio (≈3,0% das linhas) foram lidos integralmente e 105 parcialmente, com leitura dirigida às funções de maior risco. Os P0 de segurança estão confirmados no repositório. O ciclo 2 adicionou três riscos P1 de integridade de dados (perda e sobrescrita de projetos), dois P1 de cálculo no diagnóstico do canvas e a constatação de que a comunicação industrial do edge é simulada. Quando a cobertura for concluída, o parecer esperado, salvo nova evidência, é **NÃO APTO PARA EVOLUÇÃO ANTES DE CORREÇÕES P0**.

| # | Item | Valor |
|---|---|---|
| 1 | Arquivos inventariados | 1.088 rastreados, mais os blocos não rastreados (doc 02) |
| 2 | Totalmente lidos | 29 (5.328 linhas) |
| 3 | Parcialmente lidos | 105 (inclui 71 migrations via parser automatizado) |
| 4 | Não revisados | 708 (175 testes executados mas não lidos; 533 de código e config). Auditoria em lotes, por ordem de risco |
| 5 | Módulos examinados | Auth, tenants, billing (authz), IoT, webhooks, MCP, frota (authz), edge daemon e drivers, persistência de projetos, Studio store, cálculos (`electrical-calc` + diagnóstico do `multifilar`), Ladder scan e TON, IA (parcial), RLS (estático), segredos |
| 6 | Verificações executadas | 6 (typecheck, lint, format, vitest, audit, calc-check) + varredura de segredos + navegação offline (24 rotas, 375 px, bundle de produção) |
| 7 | Aprovadas | vitest 1.372/1.372 (165 arquivos); 71/71 migrations aplicadas num banco vazio |
| 8 | Reprovadas | typecheck (25), lint (29), format (7 arquivos); calc-check (9 divergências); 3 divergências entre os motores de queda de tensão; **RLS cross-tenant, concorrência no save e validação do snapshot (Supabase local)** |
| 9 | Bloqueadas | bun audit (rede), app no browser contra o Supabase local (bloqueado por `env.ts`), e2e e build (não executados por segurança) |
| 10 | Vulnerabilidades | **3 P0** (SEC-001, SEC-020 com ampliações, **DB-005 confirmado em banco real**); 4 P1 (SEC-002, SEC-009, SEC-010, SEC-053); 8 P2; 2 P3 |
| 11 | Erros de cálculo | 7 P1 (CALC-022, 023, 025, 026, 027, 050, 051); 7 P2; 1 P3 |
| 12 | Funcionalidades incompletas | Comunicação industrial real (P1-INC-048); persistência do Studio no servidor (P1-DATA-046); IEC 60909; queda acumulada |
| 13 | Falhas arquiteturais | Schema base ausente; ≥ 6 representações do projeto num snapshot; dois motores de cálculo divergentes; invariante física duplicada; webhooks duplicados; stores com localStorage paralelo |
| 14 | Riscos de engenharia | Dimensionamento não conservador; canvas e dimensionador discordantes; "OK — conforme NBR 5410" emitido sobre premissas default |
| 15 | Prioridades | F0.1–F0.6, F0.10–F0.11 → F1.7 (perda de dados) → F1.8 → F1.1–F1.3 → Fase 2 |
| 16 | Dependências externas | Rotação de segredos; dump do schema remoto; tabela NBR 5410 oficial; Supabase local (Docker); rede para `bun audit`; decisão de produto sobre o edge |
| 17 | Plano | `15_MASTER_REMEDIATION_PLAN.md` |

Ausência de evidência ≠ ausência de defeito: todos os módulos NOT_VERIFIED continuam em aberto (doc 04).
