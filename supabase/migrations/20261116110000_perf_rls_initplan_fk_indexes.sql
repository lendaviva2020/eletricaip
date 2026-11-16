-- Desempenho do banco (advisors Supabase 0003, 0001 e 0004) — 2026-11-16.
--
-- 1. auth_rls_initplan: 155 policies chamavam auth.uid()/auth.jwt() por LINHA.
--    `(select auth.uid())` vira InitPlan: avaliado uma vez por consulta.
--    A reescrita é mecânica e feita no próprio banco (sem transcrição manual):
--    só envolve as chamadas; roles, comando, PERMISSIVE/RESTRICTIVE e o resto
--    da expressão não mudam. Semântica idêntica (auth.uid() é STABLE na
--    transação). Equivalência verificada por fingerprint antes/depois.
-- 2. unindexed_foreign_keys: cria índice para toda FK sem índice cuja
--    coluna líder seja a da FK (acelera join e ON DELETE CASCADE).
-- 3. no_primary_key: promove o índice único existente a PK (sem rebuild);
--    plant_telemetry só se tag_id não tiver duplicatas.
--
-- Idempotente: reexecutar não envolve duas vezes nem duplica índices.

DO $$
DECLARE
  p record;
  v_using text;
  v_check text;
  v_sql text;
  n_policies int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.(uid|jwt|role|email)\(\)'
  LOOP
    -- O lookbehind impede envolver de novo uma chamada já dentro de SELECT.
    v_using := regexp_replace(p.qual, '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)', '(SELECT auth.\1())', 'g');
    v_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)', '(SELECT auth.\1())', 'g');
    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    n_policies := n_policies + 1;
  END LOOP;
  RAISE NOTICE 'policies otimizadas: %', n_policies;
END $$;

DO $$
DECLARE
  fk record;
  v_name text;
  n_idx int := 0;
BEGIN
  FOR fk IN
    SELECT c.conrelid, cl.relname AS tbl, c.conname,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
           c.conkey
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    WHERE c.contype = 'f'
      AND cl.relnamespace = 'public'::regnamespace
      AND cl.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
      )
  LOOP
    v_name := left('idx_' || fk.tbl || '_' || replace(replace(fk.cols, '"', ''), ', ', '_'), 50)
              || '_' || substr(md5(fk.conname), 1, 6);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', v_name, fk.tbl, fk.cols);
    n_idx := n_idx + 1;
  END LOOP;
  RAISE NOTICE 'índices de FK criados: %', n_idx;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.mp_webhook_processed'::regclass AND contype = 'p')
     AND to_regclass('public.uq_mp_webhook_processed_payment_id') IS NOT NULL THEN
    ALTER TABLE public.mp_webhook_processed
      ADD CONSTRAINT mp_webhook_processed_pkey PRIMARY KEY USING INDEX uq_mp_webhook_processed_payment_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.stripe_webhook_events'::regclass AND contype = 'p')
     AND to_regclass('public.uq_stripe_webhook_events_event_id') IS NOT NULL THEN
    ALTER TABLE public.stripe_webhook_events
      ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY USING INDEX uq_stripe_webhook_events_event_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plant_telemetry'::regclass AND contype = 'p')
     AND NOT EXISTS (SELECT tag_id FROM public.plant_telemetry GROUP BY tag_id HAVING count(*) > 1) THEN
    ALTER TABLE public.plant_telemetry ADD CONSTRAINT plant_telemetry_pkey PRIMARY KEY (tag_id);
  END IF;
END $$;
