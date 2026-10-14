-- Idempotente: pula policies de tabelas ainda inexistentes (DDL fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    EXECUTE 'ALTER POLICY "Users can create conversations" ON public.ai_conversations TO authenticated';
    EXECUTE 'ALTER POLICY "Users can delete own conversations" ON public.ai_conversations TO authenticated';
    EXECUTE 'ALTER POLICY "Users can view own conversations" ON public.ai_conversations TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    EXECUTE 'ALTER POLICY "Admins can view audit logs" ON public.audit_logs TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'calculations') THEN
    EXECUTE 'ALTER POLICY "Tenant members can view calculations" ON public.calculations TO authenticated';
  END IF;
END $$;
