-- RISK-001: garantir a tabela twin_hotspots com RLS e policies por projeto/tenant.
--
-- Contexto: o frontend consulta public.twin_hotspots (list/insert/update/delete em
-- src/lib/digital-twin.functions.ts), mas nenhum artefato local comprova RLS.
-- Esta migration é idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS) para ser
-- segura tanto se a tabela já existir no banco vivo quanto se ainda não existir.
--
-- Após aplicar, validar no banco vivo:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'twin_hotspots';
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'twin_hotspots';
-- E, com dois usuários de tenants distintos, confirmar que SELECT/INSERT/UPDATE/
-- DELETE cruzado entre tenants é negado.

-- Coluna usada por confirmTwinModelUpload / getProjectTwinModel.
-- Idempotente: pula se projects ainda não existir (DDL central fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS twin_model_path text;
  END IF;
END $$;

-- twin_hotspots com FK condicional (mesmo padrão das demais migrations).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    CREATE TABLE IF NOT EXISTS public.twin_hotspots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      equipment_id text NOT NULL,
      equipment_label text NOT NULL,
      label text NOT NULL,
      tag text NOT NULL,
      type text NOT NULL CHECK (type IN ('temperature', 'current', 'voltage', 'level', 'pressure', 'status', 'flow')),
      unit text,
      position_x double precision NOT NULL,
      position_y double precision NOT NULL,
      position_z double precision NOT NULL,
      color text NOT NULL DEFAULT '#3b82f6',
      alert_threshold double precision,
      critical_threshold double precision,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.twin_hotspots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      equipment_id text NOT NULL,
      equipment_label text NOT NULL,
      label text NOT NULL,
      tag text NOT NULL,
      type text NOT NULL CHECK (type IN ('temperature', 'current', 'voltage', 'level', 'pressure', 'status', 'flow')),
      unit text,
      position_x double precision NOT NULL,
      position_y double precision NOT NULL,
      position_z double precision NOT NULL,
      color text NOT NULL DEFAULT '#3b82f6',
      alert_threshold double precision,
      critical_threshold double precision,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'twin_hotspots_project_id_fkey') THEN
    ALTER TABLE public.twin_hotspots
      ADD CONSTRAINT twin_hotspots_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_twin_hotspots_project ON public.twin_hotspots(project_id);

ALTER TABLE public.twin_hotspots ENABLE ROW LEVEL SECURITY;

-- Policies (idempotente: pula se projects/tenant_memberships ainda não existirem).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members view twin hotspots" ON public.twin_hotspots;
    EXECUTE $pol$
      CREATE POLICY "Tenant members view twin hotspots" ON public.twin_hotspots
        AS PERMISSIVE FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1
          FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = twin_hotspots.project_id AND tm.user_id = auth.uid()));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ insert twin hotspots" ON public.twin_hotspots;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ insert twin hotspots" ON public.twin_hotspots
        AS PERMISSIVE FOR INSERT TO authenticated
        WITH CHECK (EXISTS (SELECT 1
          FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = twin_hotspots.project_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ update twin hotspots" ON public.twin_hotspots;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ update twin hotspots" ON public.twin_hotspots
        AS PERMISSIVE FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1
          FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = twin_hotspots.project_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')))
        WITH CHECK (EXISTS (SELECT 1
          FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = twin_hotspots.project_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ manage twin hotspots" ON public.twin_hotspots;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ manage twin hotspots" ON public.twin_hotspots
        AS PERMISSIVE FOR DELETE TO authenticated
        USING (EXISTS (SELECT 1
          FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = twin_hotspots.project_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin', 'engineer')));
    $pol$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.twin_hotspots TO authenticated;

-- updated_at automático (mesma função usada por clients/bom).
DROP TRIGGER IF EXISTS trg_twin_hotspots_updated_at ON public.twin_hotspots;
CREATE TRIGGER trg_twin_hotspots_updated_at BEFORE UPDATE ON public.twin_hotspots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
