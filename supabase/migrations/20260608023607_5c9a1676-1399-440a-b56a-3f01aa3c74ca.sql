
-- ============ tenant_settings ============
-- Idempotente: tenants pode ainda não existir (DDL central fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    CREATE TABLE IF NOT EXISTS public.tenant_settings (
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      key text NOT NULL,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, key)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.tenant_settings (
      tenant_id uuid NOT NULL,
      key text NOT NULL,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, key)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_tenant_id_fkey') THEN
    ALTER TABLE public.tenant_settings
      ADD CONSTRAINT tenant_settings_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Policies (idempotente: pula se tenant_memberships ainda não existir).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "members can read tenant settings" ON public.tenant_settings;
    EXECUTE $pol$
      CREATE POLICY "members can read tenant settings"
        ON public.tenant_settings FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
        ));
    $pol$;

    DROP POLICY IF EXISTS "members can upsert tenant settings" ON public.tenant_settings;
    EXECUTE $pol$
      CREATE POLICY "members can upsert tenant settings"
        ON public.tenant_settings FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
        ));
    $pol$;

    DROP POLICY IF EXISTS "members can update tenant settings" ON public.tenant_settings;
    EXECUTE $pol$
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
    $pol$;

    DROP POLICY IF EXISTS "admins can delete tenant settings" ON public.tenant_settings;
    EXECUTE $pol$
      CREATE POLICY "admins can delete tenant settings"
        ON public.tenant_settings FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = tenant_settings.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner','admin')
        ));
    $pol$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS tenant_settings_touch_updated_at ON public.tenant_settings;
DROP TRIGGER IF EXISTS tenant_settings_touch_updated_at ON public.tenant_settings;
CREATE TRIGGER tenant_settings_touch_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ ai_status_events ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    CREATE TABLE IF NOT EXISTS public.ai_status_events (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ok boolean NOT NULL,
      code text,
      latency_ms integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.ai_status_events (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      tenant_id uuid NOT NULL,
      user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ok boolean NOT NULL,
      code text,
      latency_ms integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_status_events_tenant_id_fkey') THEN
    ALTER TABLE public.ai_status_events
      ADD CONSTRAINT ai_status_events_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_status_events_tenant_time_idx
  ON public.ai_status_events (tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.ai_status_events TO authenticated;
GRANT ALL ON public.ai_status_events TO service_role;

ALTER TABLE public.ai_status_events ENABLE ROW LEVEL SECURITY;

-- Policies (idempotente: pula se tenant_memberships ainda não existir).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "members can read tenant ai events" ON public.ai_status_events;
    EXECUTE $pol$
      CREATE POLICY "members can read tenant ai events"
        ON public.ai_status_events FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = ai_status_events.tenant_id AND tm.user_id = auth.uid()
        ));
    $pol$;

    DROP POLICY IF EXISTS "users insert own tenant ai events" ON public.ai_status_events;
    EXECUTE $pol$
      CREATE POLICY "users insert own tenant ai events"
        ON public.ai_status_events FOR INSERT TO authenticated
        WITH CHECK (
          user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.tenant_id = ai_status_events.tenant_id AND tm.user_id = auth.uid()
          )
        );
    $pol$;
  END IF;
END $$;
