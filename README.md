# ELETRICAI

Plataforma industrial de design elétrico e automação assistida por IA.
Stack: TanStack Start + Supabase + Vercel.

---

## 🚀 CI/CD — Configuração de Secrets no GitHub

O workflow `.github/workflows/ci.yml` executa **lint, testes, typecheck** e — em pushes na branch `main` — faz **deploy automático** de:

- **Supabase Edge Functions** (`ai-industrial-architect`, `stripe-webhook`)
- **Vercel** (frontend de produção)

Para que o deploy funcione, configure os **5 secrets** abaixo em:

> **Settings → Secrets and variables → Actions → aba `Secrets` → `New repository secret`**

> ⚠️ **Atenção:** use a aba **`Secrets`** (criptografada), **NÃO** a aba `Variables`. O workflow lê `${{ secrets.XXX }}`.

### ✅ Checklist de Secrets

#### 🟢 Supabase (deploy de Edge Functions)

- [ ] **`SUPABASE_ACCESS_TOKEN`**
  - **O que é:** token pessoal de acesso à CLI do Supabase
  - **Onde obter:** <https://supabase.com/dashboard/account/tokens> → **Generate new token**
  - **Formato:** `sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

- [ ] **`SUPABASE_PROJECT_REF`**
  - **O que é:** ID de referência do projeto Supabase
  - **Onde obter:** Supabase Dashboard → **Project Settings → General → Reference ID**
  - **Formato:** string de 20 caracteres (ex: `hcjkwqyxqxnbqikwltvc`)

#### 🔺 Vercel (deploy do frontend)

- [ ] **`VERCEL_TOKEN`**
  - **O que é:** token de API da sua conta Vercel
  - **Onde obter:** <https://vercel.com/account/tokens> → **Create Token** (escopo: Full Account)

- [ ] **`VERCEL_ORG_ID`**
  - **O que é:** ID da sua organização / team Vercel
  - **Onde obter:** Vercel Dashboard → **Settings → General** (ou `.vercel/project.json` após `vercel link`)
  - **Formato:** `team_xxxxxxxxxxxxxxxxxxxxxxxx`

- [ ] **`VERCEL_PROJECT_ID`**
  - **O que é:** ID do projeto na Vercel
  - **Onde obter:** Vercel Dashboard → **Project → Settings → General** (campo "Project ID")
  - **Formato:** `prj_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

### 📋 Resumo (cole no GitHub)

| Nome do Secret           | Tipo   | Obrigatório |
| ------------------------ | ------ | ----------- |
| `SUPABASE_ACCESS_TOKEN`  | Secret | ✅          |
| `SUPABASE_PROJECT_REF`   | Secret | ✅          |
| `VERCEL_TOKEN`           | Secret | ✅          |
| `VERCEL_ORG_ID`          | Secret | ✅          |
| `VERCEL_PROJECT_ID`      | Secret | ✅          |

### 🔍 Validação

Após configurar todos os secrets:

1. Faça um commit qualquer na branch `main`
2. Vá em **Actions** no GitHub e abra o run mais recente
3. Os jobs **`deploy-supabase`** e **`deploy-vercel`** devem passar em verde ✅

Se um job falhar com mensagem `Input required and not supplied` ou `unauthorized`, é porque o secret correspondente está **faltando ou com nome incorreto** (case-sensitive).

---

## 🛠️ Desenvolvimento local

```bash
npm install
npm run dev
```

Variáveis de ambiente locais ficam em `.env` (auto-populadas pelo Lovable Cloud — veja `.env.example`).
