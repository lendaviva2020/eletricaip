
-- ============ tenant_settings ============
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read tenant settings"
  ON public.tenant_settings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "members can upsert tenant settings"
  ON public.tenant_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "members can update tenant settings"
  ON public.tenant_settings FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "admins can delete tenant settings"
  ON public.tenant_settings FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_settings.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','admin')
  ));

CREATE TRIGGER tenant_settings_touch_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ ai_status_events ============
CREATE TABLE IF NOT EXISTS public.ai_status_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ok boolean NOT NULL,
  code text,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_status_events_tenant_time_idx
  ON public.ai_status_events (tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_status_events TO authenticated;
GRANT ALL ON public.ai_status_events TO service_role;

ALTER TABLE public.ai_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read tenant ai events"
  ON public.ai_status_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = ai_status_events.tenant_id AND tm.user_id = auth.uid()
  ));

CREATE POLICY "users insert own tenant ai events"
  ON public.ai_status_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = ai_status_events.tenant_id AND tm.user_id = auth.uid()
    )
  );
