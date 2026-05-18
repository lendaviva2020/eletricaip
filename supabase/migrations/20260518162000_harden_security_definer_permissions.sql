-- Tighten exposed SECURITY DEFINER RPCs that are no longer called directly by clients.
-- Keep only the minimum grants needed for server-side code paths.

REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.change_tenant_plan(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_ai_credits(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_ai_credits_remaining() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_credits_remaining() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.iot_acknowledge_alert(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iot_acknowledge_alert(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.iot_enqueue_command(text, text, jsonb, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iot_enqueue_command(text, text, jsonb, integer)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.tenant_has_feature(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.search_normative_chunks(
  extensions.vector,
  double precision,
  integer,
  text
) FROM PUBLIC, anon, authenticated;
