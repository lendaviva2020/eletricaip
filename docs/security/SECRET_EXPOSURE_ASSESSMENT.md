# ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
# AVALIAÇÃO TÉCNICA DE EXPOSIÇÃO DE SEGREDOS, CREDENCIAIS E PLANO DE ROTAÇÃO

> **Regra Estrita de Confidencialidade:** Nenhum valor de `.env`, JWT, token de sessão, chave Supabase ou segredo de servidor é reproduzido ou impresso neste documento.

---

## 1. Resumo das 5 Ocorrências Apontadas pelo Trivy (`secret` scanner)

| # | Arquivo Apontado | Regra Trivy | Linha | Classificação Técnica | Situação de Rastreamento Git | Ação Executada |
|---:|---|---|---:|---|---|---|
| 1 | `eletricai-demo-video/auth-state.json` | `jwt-token` | 9 | Token de sessão de usuário (`access_token` + `refresh_token`) gravado localmente pelo Playwright (`storageState`) | **Não rastreado** (diretório auxiliar fora do repo Git `eletricaip`), porém persistido em disco | **Removido e Sanitizado:** Substituído por `{ "cookies": [], "origins": [] }` e incluído em `.gitignore` (`eletricai-demo-video/.gitignore`, `eletricaip/.gitignore` e `.gitignore` raiz). |
| 2 | `eletricaip/.env` | `jwt-token` | 19 | `SUPABASE_SERVICE_ROLE_KEY` (JWT com `role: "service_role"`) no arquivo de variáveis locais do servidor | **Não rastreado no HEAD** (`.env` está em `eletricaip/.gitignore` linhas 25–28) | **Isolado no Servidor + Plano de Rotação:** Confirmado que nunca entrou em commit histórico nem no bundle cliente; documentado procedimento de rotação e migração para Supabase Secret Keys (`sb_secret_...`). |
| 3 | `eletricaip/src/integrations/supabase/env.ts` | `jwt-token` | 15 | `SUPABASE_PUBLISHABLE_KEY_FALLBACK` (JWT público `role: "anon"`, projeto `rvaaxvdimggztjxoktvy`) | **Rastreado (Intencional):** Chave anônima pública client-side sujeita a políticas RLS | **Preservada e Verificada:** Confirmado programaticamente (`inspectSupabaseJwtRoleSafe`) que possui exclusivamente `role: "anon"` e jamais `service_role`. |
| 4 | `eletricaip/.vercel/output/functions/__server.func/_ssr/env-BeUYEG36.mjs` | `jwt-token` | 3 | Mesma constante `SUPABASE_PUBLISHABLE_KEY_FALLBACK` (`role: "anon"`) compilada no artefato SSR local | **Não rastreado** (`.vercel/` está no `.gitignore` linha 20) | **Auditado por Teste Automatizado:** Confirmado que nenhum segredo de servidor (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, etc.) foi emitido no bundle. |
| 5 | `eletricaip/.vercel/output/static/assets/index-DVHulCGx.js` | `jwt-token` | 33 | Mesma constante `SUPABASE_PUBLISHABLE_KEY_FALLBACK` (`role: "anon"`) compilada no bundle estático do cliente | **Não rastreado** (`.vercel/` está no `.gitignore` linha 20) | **Auditado por Teste Automatizado:** Inspecionado via `scanClientBundleContentForSecrets` em `src/lib/security/secret-bundle-inspector.ts`. |

---

## 2. Auditoria Forense de `SUPABASE_SERVICE_ROLE_KEY` e Histórico do `.env` (Seção 6.1)

1. **Rastreamento no índice Git atual (`git ls-files .env`):**
   - Resultado: **Negativo**. O arquivo `eletricaip/.env` está protegido por `.gitignore` (`.env` e `.env.*`).
2. **Inspeção do histórico completo do Git (`git log --all --stat -- .env`):**
   - Foram identificados 2 commits históricos antigos (`f21ff94` que adicionou 5 linhas e `b26d35d` que removeu o arquivo).
   - A inspeção forense exclusivamente dos nomes das chaves presentes em `f21ff94:.env` comprovou que aquele commit continha **apenas** 5 variáveis públicas (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`).
   - **Conclusão Forense:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `STRIPE_SECRET_KEY`, `MP_ACCESS_TOKEN`, `GEMINI_API_KEY` e `UPSTASH_REDIS_REST_TOKEN` **nunca foram comitados no histórico do Git nem enviados ao GitHub**.
3. **Verificação de Uso Exclusivo no Servidor:**
   - `SUPABASE_SERVICE_ROLE_KEY` é lida exclusivamente em módulos server-only (`src/lib/server-only/` e handlers administrativos com `process.env.SUPABASE_SERVICE_ROLE_KEY`), protegidos pelos limites server/client estabilizados no Gate 3.6.1.
   - O scanner automatizado `scanClientBundleContentForSecrets` (`src/lib/security/secret-bundle-inspector.ts`) verifica continuamente que nenhum identificador de segredo de servidor ou JWT com `role: "service_role"` aparece em código cliente ou bundles estáticos.

### 2.1 Plano Operacional de Rotação Preventiva (`SUPABASE_SERVICE_ROLE_KEY` -> Supabase Secret Keys)

Mesmo sem exposição em commits ou bundles públicos, como a chave residiu em arquivo `.env` local de estação de desenvolvimento e foi lida pelo scanner local, aplica-se a diretriz de **Defesa em Profundidade (Zero-Trust)**:

1. **Geração de Nova Secret Key no Supabase Dashboard:**
   - Acessar *Project Settings -> API Keys* no projeto Supabase (`rvaaxvdimggztjxoktvy`).
   - Criar uma nova chave de servidor no modelo oficial Supabase Secret Keys (`sb_secret_...`) em substituição à `service_role` JWT legada (sem regenerar o JWT signing secret global sem janela de manutenção planejada, evitando invalidação abrupta de sessões ativas de operadores).
2. **Atualização de Variáveis de Ambiente (Zero-Downtime):**
   - Atualizar `SUPABASE_SERVICE_ROLE_KEY` nas variáveis de ambiente de servidor (Vercel Environment Variables — *Production / Preview* — e `.env` local não rastreado).
3. **Validação de Saúde, Autenticação e RLS:**
   - Executar os smoke tests de autenticação, isolamento multi-tenant (`organization_id`) e ingestão de telemetria Edge.
4. **Revogação da Chave Antiga:**
   - Após confirmação de tráfego 100% saudável com a nova chave, revogar a chave anterior no painel do Supabase.

---

## 3. Remediação de `eletricai-demo-video/auth-state.json` (Seção 6.2)

- **Problema:** O arquivo `eletricai-demo-video/auth-state.json` armazenava em texto claro na propriedade `origins[0].localStorage` o objeto `sb-rvaaxvdimggztjxoktvy-auth-token` contendo um `access_token` JWT e um `refresh_token` de sessão de teste.
- **Correção Implementada:**
  1. O conteúdo de `eletricai-demo-video/auth-state.json` foi limpo para `{ "cookies": [], "origins": [] }`.
  2. As regras `auth-state.json`, `auth-state*.json`, `playwright/.auth/` e `temp-recording-frames/` foram adicionadas em:
     - `eletricai-demo-video/.gitignore`
     - `eletricaip/.gitignore`
     - `.gitignore` (raiz do workspace)
  3. O teste automatizado em `src/__tests__/gate3_8_2_security_remediation.test.ts` falha caso `auth-state.json` volte a conter `access_token`, `refresh_token` ou cookies/origins persistidos.
