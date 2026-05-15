## Objetivo
Resolver o erro `Missing Supabase environment variable(s)` recriando o arquivo `.env` na sandbox do preview.

## Contexto
- O `.env` foi removido da sandbox (provavelmente após limpeza do GitHub).
- O projeto continua conectado ao Supabase `hcjkwqyxqxnbqikwltvc`.
- As variáveis `VITE_*` são **públicas por design** (vão para o bundle do navegador). Não são segredos — a segurança real vem das RLS policies já implementadas.
- A `service_role` permanece apenas nos secrets do Supabase (nunca no `.env`).

## Passos

1. **Criar `.env`** na raiz do projeto com:
   ```
   VITE_SUPABASE_URL=https://hcjkwqyxqxnbqikwltvc.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon key já no contexto>
   VITE_SUPABASE_PROJECT_ID=hcjkwqyxqxnbqikwltvc
   ```

2. **Verificar `.gitignore`** — garantir que `.env` está listado (boa prática, mesmo sendo chaves públicas).

3. **Reiniciar o dev server** para o Vite recarregar as variáveis.

4. **Validar** que o preview carrega sem o erro de "Missing Supabase environment variable(s)".

## Notas de segurança
- Não vou mexer em `SUPABASE_SERVICE_ROLE_KEY` nem outros secrets do edge function — esses já estão configurados corretamente nos secrets do Supabase.
- Se você quiser **rotacionar a anon key** por precaução, isso é feito no painel do Supabase (Settings → API → roll anon key) e o `.env` precisa ser atualizado depois — me avise se for o caso.
