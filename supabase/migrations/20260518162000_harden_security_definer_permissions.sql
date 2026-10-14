-- Tighten exposed SECURITY DEFINER RPCs that are no longer called directly by clients.
-- Keep only the minimum grants needed for server-side code paths.
-- Idempotente: pula funções ainda inexistentes (DDL/fora do repo).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_invite'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'change_tenant_plan'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.change_tenant_plan(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_ai_credits'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consume_ai_credits(text) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.consume_ai_credits(text) TO authenticated, service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_ai_credits_remaining'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_ai_credits_remaining() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_ai_credits_remaining() TO authenticated, service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ingest_iot_reading'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, double precision, text, text, integer'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'iot_acknowledge_alert'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.iot_acknowledge_alert(uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.iot_acknowledge_alert(uuid) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'iot_enqueue_command'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, jsonb, integer'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.iot_enqueue_command(text, text, jsonb, integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.iot_enqueue_command(text, text, jsonb, integer) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tenant_has_feature'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tenant_has_feature(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.tenant_has_feature(text) TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_usage'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, integer'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_normative_chunks'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;
