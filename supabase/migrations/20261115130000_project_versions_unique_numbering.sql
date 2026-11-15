-- ============================================================================
-- Migration: 20261115130000_project_versions_unique_numbering.sql
-- Auditoria Fase 1 / F1.8 (P2-DATA-045): numeração de versões sem duplicatas.
--
-- project_versions.version_number era calculado como MAX+1 sem restrição de
-- unicidade: dois "salvar versão" concorrentes geravam números repetidos.
-- O índice único faz a corrida falhar com 23505, e a aplicação recalcula
-- (insertProjectVersion em src/lib/projects.functions.ts).
--
-- Seguro para dados existentes: se já houver duplicatas, o índice NÃO é criado
-- (a migration não falha) e um NOTICE informa a contagem para saneamento manual.
-- Idempotente.
-- ============================================================================
DO $$
DECLARE
  dup_count integer;
BEGIN
  IF to_regclass('public.project_versions') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'project_versions_project_id_version_number_key'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO dup_count
  FROM (
    SELECT project_id, version_number
    FROM public.project_versions
    GROUP BY project_id, version_number
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE 'project_versions: % pares (project_id, version_number) duplicados; índice único não criado. Sanear e reaplicar.', dup_count;
  ELSE
    CREATE UNIQUE INDEX project_versions_project_id_version_number_key
      ON public.project_versions (project_id, version_number);
  END IF;
END $$;
