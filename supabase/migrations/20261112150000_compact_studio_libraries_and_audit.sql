-- =============================================================================
-- ELÉTRICAI — FASE 9: Compact Studio (eletric Studio) Libraries & Audit Tables
-- Strictly multi-tenant isolated via Row-Level Security (RLS).
--
-- Reversible rollback DDL (if needed in non-production):
--   DROP POLICY IF EXISTS "rls_insert_compact_studio_device_audit" ON public.compact_studio_device_audit;
--   DROP POLICY IF EXISTS "rls_select_compact_studio_device_audit" ON public.compact_studio_device_audit;
--   DROP POLICY IF EXISTS "rls_manage_compact_studio_libraries" ON public.compact_studio_libraries;
--   DROP POLICY IF EXISTS "rls_select_compact_studio_libraries" ON public.compact_studio_libraries;
--   DROP TABLE IF EXISTS public.compact_studio_device_audit;
--   DROP TABLE IF EXISTS public.compact_studio_libraries;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compact_studio_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  payload_json jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_compact_studio_libraries_tenant
  ON public.compact_studio_libraries (tenant_id);

CREATE TABLE IF NOT EXISTS public.compact_studio_device_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  protocol text NOT NULL,
  target_endpoint text NOT NULL,
  outcome text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compact_studio_device_audit_tenant_created
  ON public.compact_studio_device_audit (tenant_id, created_at DESC);

-- Enable Row Level Security strictly on both tables
ALTER TABLE public.compact_studio_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compact_studio_device_audit ENABLE ROW LEVEL SECURITY;

-- Revoke all anon privileges
REVOKE ALL ON public.compact_studio_libraries FROM anon;
REVOKE ALL ON public.compact_studio_device_audit FROM anon;

-- Tenant-isolated policies for compact_studio_libraries
DROP POLICY IF EXISTS "rls_select_compact_studio_libraries" ON public.compact_studio_libraries;
CREATE POLICY "rls_select_compact_studio_libraries"
  ON public.compact_studio_libraries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = compact_studio_libraries.tenant_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_manage_compact_studio_libraries" ON public.compact_studio_libraries;
CREATE POLICY "rls_manage_compact_studio_libraries"
  ON public.compact_studio_libraries
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = compact_studio_libraries.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer')
    )
    OR public.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = compact_studio_libraries.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'engineer')
    )
    OR public.is_platform_admin()
  );

-- Append-only tenant-isolated RLS policies for compact_studio_device_audit (NEVER UPDATE/DELETE)
DROP POLICY IF EXISTS "rls_select_compact_studio_device_audit" ON public.compact_studio_device_audit;
CREATE POLICY "rls_select_compact_studio_device_audit"
  ON public.compact_studio_device_audit
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = compact_studio_device_audit.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin', 'auditor', 'engineer')
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "rls_insert_compact_studio_device_audit" ON public.compact_studio_device_audit;
CREATE POLICY "rls_insert_compact_studio_device_audit"
  ON public.compact_studio_device_audit
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = compact_studio_device_audit.tenant_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer', 'operator')
      )
      OR public.is_platform_admin()
    )
  );
