
-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.iot_readings    REPLICA IDENTITY FULL;
ALTER TABLE public.iot_alerts      REPLICA IDENTITY FULL;
ALTER TABLE public.iot_command_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='iot_readings';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_readings; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='iot_alerts';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_alerts; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='iot_command_log';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_command_log; END IF;
END $$;

-- Plan feature gate
CREATE OR REPLACE FUNCTION public.tenant_has_feature(p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.tenants t ON t.id = pr.tenant_id
    JOIN public.plan_limits pl ON pl.plan = COALESCE(t.plan,'free')
    WHERE pr.id = auth.uid()
      AND (
        pl.features ? p_feature
        OR pl.features @> '["all_features"]'::jsonb
      )
  );
$$;

-- ===== Ingest endpoint via API key (no auth.uid) =====
CREATE OR REPLACE FUNCTION public.ingest_iot_reading(
  p_api_key text,
  p_device_external_id text,
  p_value double precision,
  p_quality text DEFAULT 'GOOD',
  p_message_id text DEFAULT NULL,
  p_ttl_ms integer DEFAULT 5000
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant uuid; v_device uuid; v_reading_id uuid;
  v_hash text := encode(extensions.digest(p_api_key, 'sha256'), 'hex');
BEGIN
  IF p_api_key IS NULL OR length(p_api_key) < 16 THEN RAISE EXCEPTION 'invalid_api_key'; END IF;

  SELECT tenant_id INTO v_tenant FROM public.api_keys
   WHERE key_hash = v_hash AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND 'iot:ingest' = ANY(scopes);
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE key_hash = v_hash;

  -- find or create device
  SELECT id INTO v_device FROM public.iot_devices
   WHERE tenant_id = v_tenant AND device_external_id = p_device_external_id;
  IF v_device IS NULL THEN
    INSERT INTO public.iot_devices (tenant_id, device_external_id, name, kind, metadata)
    VALUES (v_tenant, p_device_external_id, p_device_external_id, 'sensor'::iot_device_kind, '{}'::jsonb)
    RETURNING id INTO v_device;
  END IF;

  -- idempotency by message_id
  IF p_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.iot_readings WHERE device_id = v_device AND message_id = p_message_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO public.iot_readings (device_id, value, quality, message_id, ttl_ms, timestamp)
  VALUES (v_device, p_value, COALESCE(p_quality,'GOOD'), p_message_id, COALESCE(p_ttl_ms,5000), now())
  RETURNING id INTO v_reading_id;

  RETURN jsonb_build_object('ok', true, 'reading_id', v_reading_id, 'device_id', v_device);
END; $$;

REVOKE ALL ON FUNCTION public.ingest_iot_reading(text,text,double precision,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_iot_reading(text,text,double precision,text,text,integer) TO anon, authenticated, service_role;

-- ===== Acknowledge alert =====
CREATE OR REPLACE FUNCTION public.iot_acknowledge_alert(p_alert_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  UPDATE public.iot_alerts SET is_resolved = true
   WHERE id = p_alert_id
     AND device_id IN (
       SELECT d.id FROM public.iot_devices d
       JOIN public.tenant_memberships tm ON tm.tenant_id = d.tenant_id
       WHERE tm.user_id = auth.uid()
     );
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  IF v_ok IS NULL OR v_ok = false THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ===== Enqueue command (with watchdog) =====
CREATE OR REPLACE FUNCTION public.iot_enqueue_command(
  p_device_external_id text,
  p_command text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_watchdog_ms integer DEFAULT 5000
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_tenant uuid; v_cmd_id uuid;
  v_external text := encode(extensions.gen_random_bytes(8), 'hex');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no_tenant'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant AND user_id = auth.uid()
      AND role = ANY (ARRAY['owner','admin','engineer'])
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.iot_command_log (
    command_id, tenant_id, target_device, command, payload,
    requested_by, watchdog_timeout_ms, fail_safe_on_timeout, expires_at
  ) VALUES (
    v_external, v_tenant, p_device_external_id, p_command, COALESCE(p_payload,'{}'::jsonb),
    auth.uid(), COALESCE(p_watchdog_ms, 5000), true,
    now() + make_interval(secs => COALESCE(p_watchdog_ms,5000)/1000.0)
  ) RETURNING id INTO v_cmd_id;

  RETURN jsonb_build_object('ok', true, 'command_id', v_cmd_id, 'command_external_id', v_external);
END; $$;
