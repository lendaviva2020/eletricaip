-- Planos v2 (aprovados em 2026-11-16) + limite de dispositivos IoT + vencimento.
--
-- 1. plan_limits espelha src/lib/plans.ts: Grátis / Autônomo (id "basic") /
--    Pro Empresa / Premium. Premium deixa de ter IA ilimitada (custo real por
--    chamada) e passa a 1500 créditos/mês.
-- 2. Nova coluna max_iot_devices; ingest_iot_reading recusa CRIAR dispositivo
--    acima do limite do plano (dispositivos já existentes seguem enviando).
-- 3. Pagamento avulso (Mercado Pago) passa a ter vencimento em subscriptions;
--    expire_overdue_subscriptions() rebaixa para "free" após 3 dias de
--    tolerância. Só service_role executa.
-- Idempotente.

ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS max_iot_devices integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS plan_limits_plan_key ON public.plan_limits (plan);

INSERT INTO public.plan_limits
  (plan, max_projects, max_ai_tokens_month, max_storage_mb, max_users, max_iot_devices, features)
VALUES
  ('free',     3,   10,   100,   1,  0, '["pdf_export"]'::jsonb),
  ('basic',   -1,  150,  2048,   1,  0, '["pdf_export","excel_export","dxf_export","catalog"]'::jsonb),
  ('pro',     -1,  400, 10240,   3, 10, '["pdf_export","excel_export","dxf_export","catalog","realtime","scada"]'::jsonb),
  ('premium', -1, 1500, 51200,  10, 50, '["pdf_export","excel_export","dxf_export","catalog","realtime","scada","priority_support"]'::jsonb)
ON CONFLICT (plan) DO UPDATE
  SET max_projects = EXCLUDED.max_projects,
      max_ai_tokens_month = EXCLUDED.max_ai_tokens_month,
      max_storage_mb = EXCLUDED.max_storage_mb,
      max_users = EXCLUDED.max_users,
      max_iot_devices = EXCLUDED.max_iot_devices,
      features = EXCLUDED.features;

-- Ingestão IoT com limite de dispositivos por plano.
CREATE OR REPLACE FUNCTION public.ingest_iot_reading(
  p_api_key text,
  p_device_external_id text,
  p_value double precision,
  p_quality text DEFAULT 'GOOD'::text,
  p_message_id text DEFAULT NULL::text,
  p_ttl_ms integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_device uuid; v_reading_id uuid;
  v_plan text;
  v_max_devices integer;
  v_device_count integer;
  v_hash text := encode(extensions.digest(p_api_key, 'sha256'), 'hex');
BEGIN
  IF p_api_key IS NULL OR length(p_api_key) < 16 THEN
    RAISE EXCEPTION 'invalid_api_key';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.api_keys
   WHERE key_hash = v_hash AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND 'iot:ingest' = ANY(scopes);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT t.plan, COALESCE(pl.max_iot_devices, 0)
    INTO v_plan, v_max_devices
    FROM public.tenants t
    LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
   WHERE t.id = v_tenant;
  IF v_plan IS NULL OR v_max_devices = 0 THEN
    RAISE EXCEPTION 'plan_required';
  END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE key_hash = v_hash;

  SELECT id INTO v_device FROM public.iot_devices
   WHERE tenant_id = v_tenant AND device_external_id = p_device_external_id;
  IF v_device IS NULL THEN
    IF v_max_devices > 0 THEN
      SELECT count(*) INTO v_device_count FROM public.iot_devices WHERE tenant_id = v_tenant;
      IF v_device_count >= v_max_devices THEN
        RAISE EXCEPTION 'device_limit';
      END IF;
    END IF;
    INSERT INTO public.iot_devices (tenant_id, device_external_id, name, kind, metadata)
    VALUES (v_tenant, p_device_external_id, p_device_external_id, 'sensor'::iot_device_kind, '{}'::jsonb)
    RETURNING id INTO v_device;
  END IF;

  IF p_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.iot_readings WHERE device_id = v_device AND message_id = p_message_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO public.iot_readings (device_id, value, quality, message_id, ttl_ms, timestamp)
  VALUES (v_device, p_value, COALESCE(p_quality,'GOOD'), p_message_id, COALESCE(p_ttl_ms,5000), now())
  RETURNING id INTO v_reading_id;

  RETURN jsonb_build_object('ok', true, 'reading_id', v_reading_id, 'device_id', v_device);
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_iot_reading(text, text, double precision, text, text, integer)
  TO service_role;

-- Vencimento de assinaturas por pagamento avulso (Mercado Pago: id "mp_%").
CREATE OR REPLACE FUNCTION public.expire_overdue_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH overdue AS (
    UPDATE public.subscriptions s
       SET status = 'expired', updated_at = now()
     WHERE s.status = 'active'
       AND s.stripe_subscription_id LIKE 'mp\_%'
       AND s.current_period_end IS NOT NULL
       AND s.current_period_end < now() - interval '3 days'
       -- não rebaixa se houver outra assinatura ativa e vigente do mesmo tenant
       AND NOT EXISTS (
         SELECT 1 FROM public.subscriptions s2
          WHERE s2.tenant_id = s.tenant_id AND s2.id <> s.id
            AND s2.status = 'active'
            AND (s2.current_period_end IS NULL OR s2.current_period_end >= now() - interval '3 days')
       )
    RETURNING s.tenant_id
  )
  UPDATE public.tenants t
     SET plan = 'free', subscription_status = 'expired', updated_at = now()
    FROM overdue o
   WHERE t.id = o.tenant_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_overdue_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_subscriptions() TO service_role;

-- 4. Limite de usuários por plano na própria tabela de membros (defesa em
--    profundidade: o servidor já recusa convites acima do limite). Não remove
--    ninguém após um downgrade — só impede NOVAS entradas acima do limite.
CREATE OR REPLACE FUNCTION public.enforce_tenant_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  SELECT COALESCE(pl.max_users, 1)
    INTO v_max
    FROM public.tenants t
    LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
   WHERE t.id = NEW.tenant_id;
  IF v_max IS NULL OR v_max < 0 THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_count
    FROM public.tenant_memberships
   WHERE tenant_id = NEW.tenant_id AND user_id <> NEW.user_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'seat_limit: plano permite % usuário(s)', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_tenant_seat_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_tenant_seat_limit ON public.tenant_memberships;
CREATE TRIGGER trg_enforce_tenant_seat_limit
  BEFORE INSERT ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_seat_limit();
