#!/usr/bin/env bash
# ==============================================================================
# EletricAI Industrial OS — Rotina de Backup Lógico Diário (PostgreSQL / Supabase)
# Tarefa 9.2 — Retenção de 30 dias em Bucket S3 / Cloudflare R2 independente
# ==============================================================================
set -euo pipefail

BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/eletricai-backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DATE_PREFIX="$(date -u +"%Y-%m-%d")"
DUMP_FILENAME="eletricai_pg_${TIMESTAMP}.dump"
DUMP_PATH="${BACKUP_DIR}/${DUMP_FILENAME}"
CHECKSUM_PATH="${DUMP_PATH}.sha256"

if [[ -z "${BACKUP_DATABASE_URL:-}" ]]; then
  echo "[ERROR] Variável BACKUP_DATABASE_URL não definida." >&2
  exit 1
fi

if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "[ERROR] Variável BACKUP_S3_BUCKET não definida (ex: s3://eletricai-db-backups)." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Iniciando pg_dump lógico (formato custom comprimido) em ${TIMESTAMP}..."
pg_dump "${BACKUP_DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --schema=public \
  --file="${DUMP_PATH}"

if [[ ! -s "${DUMP_PATH}" ]]; then
  echo "[ERROR] Arquivo de dump vazio ou não gerado: ${DUMP_PATH}" >&2
  exit 1
fi

# Valida catálogo interno do arquivo .dump antes do upload
pg_restore --list "${DUMP_PATH}" > /dev/null
echo "[INFO] Catálogo do pg_dump validado localmente com sucesso."

# Gera manifesto de integridade SHA-256
sha256sum "${DUMP_PATH}" | awk '{print $1 "  " "'"${DUMP_FILENAME}"'"}' > "${CHECKSUM_PATH}"
CHECKSUM_VALUE="$(awk '{print $1}' "${CHECKSUM_PATH}")"
echo "[INFO] SHA-256 gerado: ${CHECKSUM_VALUE}"

# Argumentos opcionais para compatibilidade com Cloudflare R2 / S3 custom endpoint
AWS_ENDPOINT_ARGS=()
if [[ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]]; then
  AWS_ENDPOINT_ARGS=(--endpoint-url "${BACKUP_S3_ENDPOINT_URL}")
fi

REMOTE_BASE="${BACKUP_S3_BUCKET%/}/daily/${DATE_PREFIX}"
echo "[INFO] Enviando dump e checksum para ${REMOTE_BASE}/..."

aws s3 cp "${DUMP_PATH}" "${REMOTE_BASE}/${DUMP_FILENAME}" \
  "${AWS_ENDPOINT_ARGS[@]}" \
  --sse AES256

aws s3 cp "${CHECKSUM_PATH}" "${REMOTE_BASE}/${DUMP_FILENAME}.sha256" \
  "${AWS_ENDPOINT_ARGS[@]}" \
  --sse AES256

# Expurgo de backups com idade superior a BACKUP_RETENTION_DAYS (padrão: 30 dias)
CUTOFF_DATE="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-"${BACKUP_RETENTION_DAYS}"d +"%Y-%m-%d")"
echo "[INFO] Aplicando política de retenção de ${BACKUP_RETENTION_DAYS} dias (cutoff: ${CUTOFF_DATE})..."

aws s3 ls "${BACKUP_S3_BUCKET%/}/daily/" "${AWS_ENDPOINT_ARGS[@]}" | while read -r line; do
  FOLDER_DATE="$(echo "${line}" | awk '{print $2}' | tr -d '/')"
  if [[ "${FOLDER_DATE}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "${FOLDER_DATE}" < "${CUTOFF_DATE}" ]]; then
    echo "[INFO] Removendo backup expirado: ${BACKUP_S3_BUCKET%/}/daily/${FOLDER_DATE}/"
    aws s3 rm "${BACKUP_S3_BUCKET%/}/daily/${FOLDER_DATE}/" --recursive "${AWS_ENDPOINT_ARGS[@]}"
  fi
done

rm -f "${DUMP_PATH}" "${CHECKSUM_PATH}"
echo "[OK] Backup concluído e verificado: ${REMOTE_BASE}/${DUMP_FILENAME}"
