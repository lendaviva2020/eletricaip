-- Idempotente: pula se invites ainda não existir (DDL central fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites') THEN
    ALTER TABLE public.invites
      ADD COLUMN IF NOT EXISTS invited_name text,
      ADD COLUMN IF NOT EXISTS invited_sector text;
  END IF;
END $$;