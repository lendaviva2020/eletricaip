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

  -- Plan-check: IoT realtime requer plano Pro ou Premium.
  SELECT plan INTO v_plan FROM public.tenants WHERE id = v_tenant;
  IF v_plan IS NULL OR v_plan NOT IN ('pro', 'premium') THEN
    RAISE EXCEPTION 'plan_required';
  END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE key_hash = v_hash;

  SELECT id INTO v_device FROM public.iot_devices
   WHERE tenant_id = v_tenant AND device_external_id = p_device_external_id;
  IF v_device IS NULL THEN
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