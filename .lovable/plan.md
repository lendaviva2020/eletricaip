## Contexto
O repositório não possui README.md. O workflow CI/CD em `.github/workflows/ci.yml` exige 5 secrets no GitHub para deploy automático de Supabase Edge Functions e Vercel.

## O que será feito
1. Criar `README.md` na raiz do projeto
2. Adicionar seção "Configuração de Secrets" com checklist explicando cada secret necessário em **Settings → Secrets and variables → Actions → Repository secrets**

## Checklist de Secrets (5 itens)

| Secret | Onde obter | Usado em |
|--------|-----------|----------|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens | Deploy de Edge Functions |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard → Project Settings → General → Reference ID | Deploy de Edge Functions |
| `VERCEL_TOKEN` | Vercel Dashboard → Account Settings → Tokens | Deploy na Vercel |
| `VERCEL_ORG_ID` | Vercel Dashboard → Team/Account Settings → General | Deploy na Vercel |
| `VERCEL_PROJECT_ID` | Vercel Dashboard → Project Settings → General | Deploy na Vercel |

O README terá instruções passo a passo e o checklist em formato markdown para fácil cópia.