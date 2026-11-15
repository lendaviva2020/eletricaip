# 14 — Análise de Causa Raiz (P0/P1)

## P0-SEC-020 — JWT secret em evidência versionada
- **Sintoma:** o valor de `SUPABASE_JWT_SECRET` aparece em claro em `docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json`.
- **Esperado:** relatórios de scanner nunca contêm segredos e não são commitados sem redação.
- **Sequência:** o Trivy rodou com `--scanners secret` sobre um diretório que continha o `.env`. A redação do Trivy mascarou alguns campos (service role), mas a linha 20 do bloco `Code.Lines` trouxe `SUPABASE_JWT_SECRET=<valor>`. O JSON foi commitado em `81d481f`.
- **Causa raiz:** falta de pós-processamento e redação de artefatos de evidência, e ausência de gitleaks/trufflehog no CI para `docs/`. O CI greps só `src/` com 3 literais fixos.
- **Efeitos:** forja de JWT aceita por `auth-middleware.ts` (ramo HS256). Se for o segredo do projeto, bypass total de RLS.
- **Correção:** rotacionar o segredo; remover o ramo HS256 legado; purgar o histórico; adicionar gitleaks ao CI cobrindo o repositório inteiro.
- **Prova da correção:** `gitleaks detect` limpo; teste que confirma 401 para um token HS256 assinado com qualquer segredo.

## P1-DB-005 — Tenant resolvido por coluna mutável sem membership
- **Sintoma (hipótese):** um usuário sem membership enxerga dados do tenant cujo UUID gravou no próprio profile.
- **Causa raiz:** `get_user_tenant_id()` usa `profiles.tenant_id` como fonte primária e não confirma `tenant_memberships`. A defesa ficou num trigger que cobre só UPDATE.
- **Módulos afetados:** todas as policies que usam `get_user_tenant_id()`.
- **Correção:** exigir membership dentro da função; trigger BEFORE INSERT OR UPDATE; criar o profile via trigger em `auth.users`.
- **Prova:** teste de RLS com dois usuários (doc 08 §2).

## P1-CALC-022/023/025/026/027 — Motor de dimensionamento não conservador
- **Sintoma:** queda de tensão subestimada (15-40% conforme o caso), Iz superestimada ~5% no método padrão, resultado "300 mm²" silencioso.
- **Causa raiz:** (a) tabelas transcritas manualmente sem teste de referência coluna a coluna; (b) constantes físicas com rótulo incorreto (ρ a 20 °C rotulado como 70 °C); (c) API com defaults implícitos (380 V, cosφ 0,86, 5%) aplicados até quando o contexto contradiz (monofásico); (d) ausência de modelo de "origem → trecho → terminal" para acumular a queda; (e) laço de busca sem estado de "não atende".
- **Correção incremental:** testes de referência primeiro (doc 05 §6); corrigir as tabelas; ρ por temperatura de operação conforme a isolação; exigir `voltage_V` coerente com `phases`; retornar `status: "NO_SECTION_SATISFIES"`; criar um modelo de queda acumulada com limites parametrizados por tipo de origem e circuito.

## P1-SEC-002 — Bypass de desenvolvimento no servidor
- **Causa raiz:** um caminho de autenticação alternativo vive em código de produção, controlado por variável de ambiente.
- **Correção:** isolar o bypass em módulo excluído do build de produção (`import.meta.env.DEV` estático + tree-shaking) ou removê-lo; teste de build que falha se a string `dev-access-token` existir no bundle de servidor.

## P1-TYPE-036 — Contratos de server functions quebrados
- **Causa raiz:** handlers de `createServerFn` com middleware cuja tipagem de contexto não fecha (TS2345), e consumidores que recebem `{}`/`unknown`. Introduzido no commit `38267ee` sem que o typecheck fosse executado.
- **Correção:** tipar os retornos explicitamente; rodar o typecheck no pre-commit.

## P0-DB-005 (antes P1-DB-005): confirmado em Supabase local
- **Sintoma reproduzido:** os usuários B e C leram o projeto, o tenant e os perfis do tenant A depois de gravar o `tenant_id` de A no próprio perfil.
- **Causa raiz:** (1) a função de trigger `SECURITY DEFINER` usa `current_user`, que dentro dela vale sempre `postgres`, então a proteção nunca executa; (2) `get_user_tenant_id()` não confere membership; (3) a policy de INSERT de `profiles` não restringe `tenant_id`.
- **Por que os testes não pegaram:** a suíte Vitest usa mocks do cliente Supabase; não há teste de RLS contra Postgres real.
- **Prova da correção:** `tools/rls-test.mjs` com 0 vazamentos, incorporado ao CI com `supabase start`.

## P1-DATA-043: reproduzido
- **Causa raiz:** o check-then-act em duas requisições PostgREST sem condição de versão no UPDATE.
- **Correção:** `UPDATE diagrams SET … , version = version + 1 WHERE id = $1 AND version = $2 RETURNING version` (RPC); 0 linhas devolvidas significa `VERSION_CONFLICT`.
