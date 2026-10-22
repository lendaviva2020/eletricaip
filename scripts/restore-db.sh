#!/usr/bin/env bash
# ==============================================================================
# EletricAI Industrial OS — Script de Restauração e Validação em Banco Secundário
# Tarefa 9.2 — Verifica integridade SHA-256, executa pg_restore e audita tabelas
# ==============================================================================
set -euo pipefail

RESTORE_TMP_DIR="${RESTORE_TMP_DIR:-/tmp/eletricai-restore}"
BACKUP_ARTIFACT="${1:-}"

if [[ -z "${TARGET_RESTORE_DATABASE_URL:-}" ]]; then
  echo "[ERROR] Variável TARGET_RESTORE_DATABASE_URL não definida." >&2
  exit 1
fi

# Trava de segurança contra sobrescrita acidental do banco de produção
if [[ "${TARGET_RESTORE_DATABASE_URL}" == *"prod"* ]] && [[ "${ALLOW_PRODUCTION_RESTORE:-false}" != "true" ]]; then
  echo "[FATAL] TARGET_RESTORE_DATABASE_URL aparenta ser um ambiente de produção. Defina ALLOW_PRODUCTION_RESTORE=true se for intencional." >&2
  exit 1
fi

mkdir -p "${RESTORE_TMP_DIR}"

AWS_ENDPOINT_ARGS=()
if [[ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]]; then
  AWS_ENDPOINT_ARGS=(--endpoint-url "${BACKUP_S3_ENDPOINT_URL}")
fi

if [[ "${BACKUP_ARTIFACT}" == s3://* ]]; then
  LOCAL_DUMP="${RESTORE_TMP_DIR}/$(basename "${BACKUP_ARTIFACT}")"
  LOCAL_SHA="${LOCAL_DUMP}.sha256"
  echo "[INFO] Baixando artefato de ${BACKUP_ARTIFACT}..."
  aws s3 cp "${BACKUP_ARTIFACT}" "${LOCAL_DUMP}" "${AWS_ENDPOINT_ARGS[@]}"
  aws s3 cp "${BACKUP_ARTIFACT}.sha256" "${LOCAL_SHA}" "${AWS_ENDPOINT_ARGS[@]}"
elif [[ -n "${BACKUP_ARTIFACT}" && -f "${BACKUP_ARTIFACT}" ]]; then
  LOCAL_DUMP="${BACKUP_ARTIFACT}"
  LOCAL_SHA="${BACKUP_ARTIFACT}.sha256"
else
  echo "[ERROR] Informe o caminho local do .dump ou a URI s3:// do backup a restaurar." >&2
  exit 1
fi

if [[ -f "${LOCAL_SHA}" ]]; then
  echo "[INFO] Verificando integridade SHA-256 do dump..."
  EXPECTED_HASH="$(awk '{print $1}' "${LOCAL_SHA}")"
  ACTUAL_HASH="$(sha256sum "${LOCAL_DUMP}" | awk '{print $1}')"
  if [[ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]]; then
    echo "[FATAL] Divergência de checksum SHA-256! Esperado=${EXPECTED_HASH}, Atual=${ACTUAL_HASH}" >&2
    exit 1
  fi
  echo "[INFO] Checksum SHA-256 íntegro (${ACTUAL_HASH})."
fi

echo "[INFO] Validando lista de objetos do arquivo de dump..."
pg_restore --list "${LOCAL_DUMP}" > /dev/null

echo "[INFO] Executando pg_restore no banco de destino..."
pg_restore \
  --dbname="${TARGET_RESTORE_DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --single-transaction \
  "${LOCAL_DUMP}"

echo "[INFO] Executando auditoria pós-restauração no banco secundário..."
TABLE_COUNT="$(psql "${TARGET_RESTORE_DATABASE_URL}" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"

if [[ "${TABLE_COUNT}" -lt 1 ]]; then
  echo "[FATAL] Validação pós-restore falhou: nenhuma tabela encontrada no schema public!" >&2
  exit 1
fi

echo "[OK] Restauração homologada com sucesso (${TABLE_COUNT} tabelas públicas verificadas)."
