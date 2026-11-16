-- Endurecimento de grants de funções (auditoria 2026-11-16, advisors Supabase
-- 0011/0028/0029). Nenhuma lógica muda; só quem pode chamar via /rest/v1/rpc.
--
-- 1. Funções de TRIGGER/EVENT TRIGGER não devem ser RPC. O disparo de trigger
--    não verifica EXECUTE, então revogar não afeta o funcionamento.
-- 2. notify_schema_change: sem chamador no app; anon/authenticated podiam
--    emitir NOTIFY à vontade (ruído/DoS).
-- 3. ingest_iot_reading: chamada SOMENTE pelo endpoint do servidor com
--    service role (src/routes/api/public/iot.ingest.ts). Exposta ao anon,
--    permitia contornar o rate limit e a validação Zod do endpoint.
-- 4. Funções que exigem auth.uid(): revoga anon (defesa em profundidade). Já
--    verificado: nenhuma policy TO public/anon depende de get_user_role /
--    get_user_tenant_id, então anon não passa a receber erro em SELECT.
-- 5. try_parse_tenant_uuid: search_path fixo.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.assign_test_scenario_run_number()',
    'public.prevent_fleet_audit_chain_mutation()',
    'public.prevent_immutable_diagnostic_mutation()',
    'public.update_updated_at_column()',
    'public.rls_auto_enable()',
    'public.notify_schema_change()',
    'public.ingest_iot_reading(text, text, double precision, text, text, integer)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.consume_ai_credits(text)',
    'public.get_user_role()',
    'public.get_user_tenant_id()',
    'public.iot_acknowledge_alert(uuid)',
    'public.iot_enqueue_command(text, text, jsonb, integer)',
    'public.try_parse_tenant_uuid(text)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;

  IF to_regprocedure('public.try_parse_tenant_uuid(text)') IS NOT NULL THEN
    ALTER FUNCTION public.try_parse_tenant_uuid(text) SET search_path = public, pg_temp;
  END IF;
END $$;
