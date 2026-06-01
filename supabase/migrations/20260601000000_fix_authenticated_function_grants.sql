-- Fix: restore EXECUTE grants to `authenticated` for SECURITY DEFINER functions
-- that check `auth.uid()` internally and were incorrectly revoked from `authenticated`
-- in migration 20260518183000.

GRANT EXECUTE ON FUNCTION public.bootstrap_personal_tenant_if_missing() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_credits_remaining() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_tokens(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_normative_chunks(extensions.vector, double precision, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_tenant_plan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_bom_from_canvas(uuid) TO authenticated;
