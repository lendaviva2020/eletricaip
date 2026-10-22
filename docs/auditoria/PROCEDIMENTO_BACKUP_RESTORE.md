# Procedimento Operacional: Observabilidade, Backup Lógico e Restauração (DRP)

**Fase 9 — Plano de Execução Pós-Auditoria**  
**Retenção Padrão:** 30 dias corridos  
**Armazenamento:** Bucket S3 / Cloudflare R2 isolado com criptografia SSE-AES256  

---

## 1. Rastreamento de Erros em Tempo Real (Tarefa 9.1)

O módulo [`src/lib/error-capture.ts`](../../src/lib/error-capture.ts) intercepta exceções em tempo real no cliente (`window.onerror`, `unhandledrejection`, `ErrorBoundary`, `RootErrorComponent`) e no servidor SSR (`src/server.ts`), aplicando higienização prévia (`maskSensitiveString` e `maskSensitiveData`) antes de qualquer log ou envio de telemetria.

### Variáveis de Ambiente Suportadas
- `VITE_SENTRY_DSN` (Cliente/Browser): DSN do projeto Sentry ou receptor compatível (GlitchTip / Highlight / Sentry self-hosted).
- `SENTRY_DSN` (Servidor SSR): DSN de backend para falhas 500 de SSR.

### Garantias de Mascaramento (Zero-Leak)
Antes de serializar qualquer evento, o coletor substitui automaticamente:
- Credenciais em URIs de banco/mensageria (`postgres://user:[REDACTED_PASSWORD]@host`)
- Tokens `Bearer` e `Basic` (`Bearer [REDACTED_TOKEN]`)
- JSON Web Tokens (`[REDACTED_JWT]`)
- Chaves Gemini (`AIza...` → `[REDACTED_API_KEY]`), Stripe (`sk_live_...`, `whsec_...` → `[REDACTED_STRIPE_KEY]`) e Supabase (`sbp_...`, `sb_secret_...` → `[REDACTED_SUPABASE_KEY]`)
- Propriedades de objetos contendo `password`, `senha`, `secret`, `token`, `apiKey`, `authorization`, `cookie`, `cvv` (`[REDACTED]`)

---

## 2. Rotina Automatizada de Backup do Banco de Dados (Tarefa 9.2)

### Arquitetura do Backup
- **Ferramenta:** `pg_dump` (formato custom `--format=custom --compress=9 --no-owner --no-privileges`)
- **Frequência:** Diária às `03:00 UTC` (`00:00 BRT`) via GitHub Actions ([`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml))
- **Script:** [`scripts/backup-db.sh`](../../scripts/backup-db.sh)
- **Integridade:** Validação de catálogo (`pg_restore --list`) + arquivo `.sha256` pareado
- **Retenção:** 30 dias (`BACKUP_RETENTION_DAYS=30`) com expurgo automático de prefixos expirados em `s3://<bucket>/daily/YYYY-MM-DD/`

### Segredos Necessários no Repositório (GitHub Secrets)
| Segredo | Descrição |
| :--- | :--- |
| `BACKUP_DATABASE_URL` | URI PostgreSQL de leitura do banco de produção (Direct Connection porta 5432) |
| `TEST_RESTORE_DATABASE_URL` | URI PostgreSQL do banco secundário isolado para teste diário de restauração |
| `BACKUP_S3_BUCKET` | URI do bucket independente (ex: `s3://eletricai-dr-backups`) |
| `BACKUP_S3_ENDPOINT_URL` | Endpoint S3 (necessário para Cloudflare R2: `https://<account_id>.r2.cloudflarestorage.com`) |
| `BACKUP_AWS_ACCESS_KEY_ID` | Chave de acesso com permissão restrita ao bucket de backup |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Chave secreta do bucket de backup |

---

## 3. Procedimento Passo a Passo de Restauração e Homologação

### 3.1 Validação em Banco Secundário de Teste (Drill de DR)
1. Exporte a string de conexão do banco secundário de homologação/teste:
   ```bash
   export TARGET_RESTORE_DATABASE_URL="postgresql://postgres:senha@localhost:54322/eletricai_restore_test"
   export BACKUP_S3_BUCKET="s3://eletricai-dr-backups"
   ```
2. Execute o script [`scripts/restore-db.sh`](../../scripts/restore-db.sh) apontando para o artefato S3 ou arquivo `.dump` local:
   ```bash
   ./scripts/restore-db.sh "s3://eletricai-dr-backups/daily/2026-10-21/eletricai_pg_20261021T030000Z.dump"
   ```
3. O script executará automaticamente:
   - Download do `.dump` e `.dump.sha256`;
   - Verificação criptográfica do hash SHA-256;
   - Inspeção estrutural (`pg_restore --list`);
   - Restauração transacional única (`pg_restore --single-transaction --clean --if-exists`);
   - Auditoria pós-restauração confirmando a presença das tabelas públicas no schema `public`.

### 3.2 Restauração de Emergência em Produção
Por segurança, [`scripts/restore-db.sh`](../../scripts/restore-db.sh) bloqueia execuções quando `TARGET_RESTORE_DATABASE_URL` contém o identificador `prod`. Em caso de desastre real autorizado pela liderança técnica:
```bash
ALLOW_PRODUCTION_RESTORE=true \
TARGET_RESTORE_DATABASE_URL="<URI_PRODUCAO>" \
./scripts/restore-db.sh "s3://eletricai-dr-backups/daily/<DATA>/<ARQUIVO>.dump"
```
