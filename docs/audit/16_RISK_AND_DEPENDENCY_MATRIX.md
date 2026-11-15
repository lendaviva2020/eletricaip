# 16 — Matriz de Risco e Dependências

| ID | Severidade | Probabilidade | Impacto | Dependências externas | Bloqueia |
|---|---|---|---|---|---|
| P0-SEC-020 | Crítica | Alta para quem tem acesso ao repo | Personificação de usuários; possível bypass total de RLS | Dono: rotação no painel Supabase | Todas as fases |
| P0-SEC-001 | Crítica | Média (arquivo local; o valor apareceu em saída de ferramenta) | Controle da conta Supabase via Management API | Dono: revogar o PAT | Todas |
| P0-DB-005 | **Crítica (confirmada)** | Alta para quem conhece o UUID de um tenant (qualquer usuário autenticado pode tentar) | Leitura de projetos, tenant e perfis de outra empresa | — | Fase 0 |
| P1-SEC-002 | Alta | Baixa (depende do deploy) | Personificação de usuário fixo | — | — |
| P1-CALC-022..027 | Alta | Certa (código determinístico) | Subdimensionamento de cabos, queda de tensão real acima do limite | Tabela NBR 5410 oficial | Fase 2 |
| P1-TYPE-036 | Alta | Certa | CI vermelho; contratos de IA ocultos | — | Merge |
| P2-DB-006 | Média (rebaixado no ciclo 4) | Certa | O banco local é reconstruível pelas migrations, mas a equivalência com o remoto não é verificável | Dump do remoto (dono) | — |
| P1-SEC-009 | Alta | Depende da configuração | Entrada indevida em tenant | Config Auth | — |
| P1-DATA-044 | Alta | Baixa/média (qualquer evolução de schema que quebre o parse) | Projeto inteiro sobrescrito por vazio | — | Fase 1 (F1.7 primeiro) |
| P1-DATA-043 | Alta | Média (multiusuário ou duas abas) | Atualizações perdidas | — | Fase 1 |
| P1-DATA-046 | Alta | Certa | Trabalho do Studio perdido ao trocar de dispositivo ou limpar o navegador | — | Fase 1 |
| P1-SEC-053 | Alta | Baixa sem forja; alta com P0-SEC-020 | Ações de platform admin | — | Fase 0 |
| P1-CALC-050/051 | Alta | Certa | Diagnóstico do canvas diverge do dimensionamento | — | Fase 2 |
| P1-INC-048 | Alta | Certa | Telemetria "ao vivo" do edge não existe; o produto aparenta conectividade | Decisão de produto | Fase 4 |
| P2-* | Média | — | Ver docs 05, 07, 08, 09 e 13 | — | — |

Ordem crítica: F0.1 → F0.2 → (F0.3 ∥ F0.4 ∥ F0.6) → F1.1 → F0.5 → F1.2. Em paralelo: F1.3, depois F2.1 → F2.2..F2.6.
