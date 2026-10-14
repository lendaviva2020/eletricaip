-- Fix: restore EXECUTE grants to `authenticated` for SECURITY DEFINER functions
-- that check `auth.uid()` internally and were incorrectly revoked from `authenticated`
-- in migration 20260518183000.
-- Idempotente: pula funções ainda inexistentes (DDL/fora do repo).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bootstrap_personal_tenant_if_missing'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_ai_quota'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_ai_credits'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.consume_ai_credits(text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_ai_credits_remaining'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_ai_credits_remaining() TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_ai_tokens'
      AND pg_get_function_identity_arguments(p.oid) = 'integer'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_ai_tokens(integer) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_usage'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, integer'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_normative_chunks'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tenant_has_feature'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.tenant_has_feature(text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_invite'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'change_tenant_plan'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_bom_from_canvas'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.generate_bom_from_canvas(uuid) TO authenticated';
  END IF;
END $$;
