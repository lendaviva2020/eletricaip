-- ============================================================
-- EletricAI — SQL para aplicar (2026-11-16)
-- Cole TUDO no Supabase → SQL Editor → Run. Pode rodar mais de uma vez.
-- 1) Catálogo da empresa
-- 2) Planos v2 + limites IoT/usuários + vencimento + 3 correções da ingestão
--    IoT (sem elas NENHUMA leitura de dispositivo era gravada)
-- 3) Telemetria real da bancada Arduino (grandeza por leitura + Realtime)
-- Testado em Postgres 16 local com o mesmo esquema de produção.
-- ============================================================

-- >>> 20261116140000_tenant_catalog_items.sql
-- Catálogo próprio de cada organização (2026-11-16).
--
-- O catálogo global (catalog_components) só é gravável por admin da
-- plataforma e está vazio. Cada empresa precisa montar o PRÓPRIO catálogo,
-- começando vazio, escolhendo a origem de cada item:
--   manual    — digitado pelo usuário;
--   planilha  — importado de CSV/XLSX;
--   mouser    — importado da API de busca da Mouser (preço do distribuidor,
--               com data da última consulta, atualizável).
-- Nenhum preço é convertido de moeda nem presumido: guarda-se o valor e a
-- moeda informados pela fonte.

CREATE TABLE IF NOT EXISTS public.tenant_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manufacturer text NOT NULL CHECK (length(btrim(manufacturer)) BETWEEN 1 AND 120),
  part_number text NOT NULL CHECK (length(btrim(part_number)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  category text CHECK (category IS NULL OR length(category) <= 120),
  rated_current_a double precision CHECK (rated_current_a IS NULL OR rated_current_a >= 0),
  rated_voltage_v double precision CHECK (rated_voltage_v IS NULL OR rated_voltage_v >= 0),
  unit_price numeric(14, 4) CHECK (unit_price IS NULL OR unit_price >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  price_source text NOT NULL DEFAULT 'manual'
    CHECK (price_source IN ('manual', 'planilha', 'mouser')),
  source_part_id text CHECK (source_part_id IS NULL OR length(source_part_id) <= 120),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  datasheet_url text CHECK (datasheet_url IS NULL OR datasheet_url ~ '^https?://'),
  stock integer CHECK (stock IS NULL OR stock >= 0),
  price_updated_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_catalog_items_part
  ON public.tenant_catalog_items (tenant_id, lower(manufacturer), lower(part_number));
CREATE INDEX IF NOT EXISTS idx_tenant_catalog_items_created_by
  ON public.tenant_catalog_items (created_by);

DROP TRIGGER IF EXISTS trg_tenant_catalog_items_updated_at ON public.tenant_catalog_items;
CREATE TRIGGER trg_tenant_catalog_items_updated_at BEFORE UPDATE ON public.tenant_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_catalog_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_catalog_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_catalog_items TO authenticated;

-- Leitura: qualquer membro da organização.
DROP POLICY IF EXISTS rls_select_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_select_tenant_catalog_items ON public.tenant_catalog_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
  ));

-- Escrita: owner, admin ou engineer (viewer/operator só consultam).
DROP POLICY IF EXISTS rls_insert_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_insert_tenant_catalog_items ON public.tenant_catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));

DROP POLICY IF EXISTS rls_update_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_update_tenant_catalog_items ON public.tenant_catalog_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));

DROP POLICY IF EXISTS rls_delete_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_delete_tenant_catalog_items ON public.tenant_catalog_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));

-- >>> 20261116150000_plans_v2_iot_limits_expiry.sql
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
-- 5. Corrige comparação text = uuid em iot_readings.device_id (toda leitura
--    com message_id falhava com "operator does not exist").
-- 6. kind = NULL ao criar dispositivo: o tipo iot_device_kind não existe no
--    banco (a coluna é sensor_kind) e TODO dispositivo novo era recusado.
-- 7. iot_readings.ingested_at era NOT NULL sem default e a função não o
--    preenchia: toda leitura falhava. Default now().
-- Idempotente.

ALTER TABLE public.iot_readings ALTER COLUMN ingested_at SET DEFAULT now();

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
    VALUES (v_tenant, p_device_external_id, p_device_external_id, NULL, '{}'::jsonb)
    RETURNING id INTO v_device;
  END IF;

  IF p_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.iot_readings WHERE device_id = v_device::text AND message_id = p_message_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  INSERT INTO public.iot_readings (device_id, value, quality, message_id, ttl_ms, timestamp)
  VALUES (v_device::text, p_value, COALESCE(p_quality,'GOOD'), p_message_id, COALESCE(p_ttl_ms,5000), now())
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

-- >>> 20261116170000_bench_telemetry.sql
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

