-- Telemetria real da bancada Arduino (Web Serial → servidor → iot_readings).
--
-- 1. iot_readings ganha `metric` e `unit`: uma bancada envia várias grandezas
--    (corrente, tensão, estado de relé, E-STOP) como UM dispositivo, sem gastar
--    o limite de dispositivos do plano com cada canal. Linhas antigas ficam
--    com metric NULL (dispositivo de grandeza única).
-- 2. ingest_bench_telemetry(): chamada só pelo servidor (service_role) depois
--    de autenticar o usuário. Confere no banco: empresa do usuário, papel com
--    permissão de escrita, plano com IoT, limite de dispositivos e formato de
--    cada leitura (máx. 64 por lote).
-- 3. iot_readings entra na publicação do Realtime (a policy de SELECT já
--    restringe as linhas aos membros da empresa dona do dispositivo).
-- Idempotente.

ALTER TABLE public.iot_readings ALTER COLUMN ingested_at SET DEFAULT now();

ALTER TABLE public.iot_readings
  ADD COLUMN IF NOT EXISTS metric text,
  ADD COLUMN IF NOT EXISTS unit text;

DO $$
BEGIN
  ALTER TABLE public.iot_readings
    ADD CONSTRAINT iot_readings_metric_format
    CHECK (metric IS NULL OR metric ~ '^[A-Za-z0-9_.:-]{1,48}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.iot_readings
    ADD CONSTRAINT iot_readings_unit_format
    CHECK (unit IS NULL OR length(unit) <= 12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS iot_readings_device_metric_ts_idx
  ON public.iot_readings (device_id, metric, "timestamp" DESC);

CREATE OR REPLACE FUNCTION public.ingest_bench_telemetry(
  p_user_id uuid,
  p_device_external_id text,
  p_device_name text,
  p_readings jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_role text;
  v_plan text;
  v_max_devices integer;
  v_device_count integer;
  v_device uuid;
  v_item jsonb;
  v_metric text;
  v_value double precision;
  v_quality text;
  v_unit text;
  v_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_device_external_id IS NULL OR p_device_external_id !~ '^[A-Za-z0-9_.:-]{3,64}$' THEN
    RAISE EXCEPTION 'bad_device';
  END IF;
  IF jsonb_typeof(p_readings) <> 'array'
     OR jsonb_array_length(p_readings) = 0
     OR jsonb_array_length(p_readings) > 64 THEN
    RAISE EXCEPTION 'bad_readings';
  END IF;

  SELECT pr.tenant_id INTO v_tenant FROM public.profiles pr WHERE pr.id = p_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no_tenant';
  END IF;

  SELECT tm.role INTO v_role
    FROM public.tenant_memberships tm
   WHERE tm.tenant_id = v_tenant AND tm.user_id = p_user_id;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'engineer', 'operator') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT t.plan, COALESCE(pl.max_iot_devices, 0)
    INTO v_plan, v_max_devices
    FROM public.tenants t
    LEFT JOIN public.plan_limits pl ON pl.plan = t.plan
   WHERE t.id = v_tenant;
  IF v_plan IS NULL OR v_max_devices = 0 THEN
    RAISE EXCEPTION 'plan_required';
  END IF;

  SELECT id INTO v_device FROM public.iot_devices
   WHERE tenant_id = v_tenant AND device_external_id = p_device_external_id;
  IF v_device IS NULL THEN
    SELECT count(*) INTO v_device_count FROM public.iot_devices WHERE tenant_id = v_tenant;
    IF v_max_devices > 0 AND v_device_count >= v_max_devices THEN
      RAISE EXCEPTION 'device_limit';
    END IF;
    INSERT INTO public.iot_devices (tenant_id, device_external_id, name, kind, metadata)
    VALUES (
      v_tenant,
      p_device_external_id,
      left(COALESCE(NULLIF(btrim(p_device_name), ''), p_device_external_id), 80),
      NULL,
      jsonb_build_object('source', 'arduino_bench') || COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_device;
  ELSE
    UPDATE public.iot_devices
       SET metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
                      || jsonb_build_object('source', 'arduino_bench', 'last_seen_at', now())
     WHERE id = v_device;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_readings) LOOP
    v_metric := v_item->>'metric';
    IF v_metric IS NULL OR v_metric !~ '^[A-Za-z0-9_.:-]{1,48}$' THEN
      RAISE EXCEPTION 'bad_metric';
    END IF;
    IF jsonb_typeof(v_item->'value') <> 'number' THEN
      RAISE EXCEPTION 'bad_value';
    END IF;
    v_value := (v_item->>'value')::double precision;
    IF v_value <> v_value OR abs(v_value) > 1e9 THEN
      RAISE EXCEPTION 'bad_value';
    END IF;
    v_quality := COALESCE(v_item->>'quality', 'GOOD');
    IF v_quality NOT IN ('GOOD', 'UNCERTAIN', 'BAD') THEN
      RAISE EXCEPTION 'bad_quality';
    END IF;
    v_unit := v_item->>'unit';
    IF v_unit IS NOT NULL AND length(v_unit) > 12 THEN
      RAISE EXCEPTION 'bad_unit';
    END IF;

    INSERT INTO public.iot_readings
      (device_id, metric, unit, value, quality, ttl_ms, "timestamp", ingested_at)
    VALUES
      (v_device::text, v_metric, v_unit, v_value, v_quality, 15000, now(), now());
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'device_id', v_device, 'inserted', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.ingest_bench_telemetry(uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_bench_telemetry(uuid, text, text, jsonb, jsonb)
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iot_readings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_readings;
  END IF;
END $$;
