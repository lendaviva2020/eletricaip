-- ============================================================================
-- Migration: Drop Digital Twin Module (P0.7 - Reversible Cleanup Artifact)
-- Date: 2026-11-14
-- Description:
--   Removes Digital Twin database schema artifacts (`public.twin_hotspots`,
--   `public.projects.twin_model_path`, and `twin-models` storage policies)
--   following complete removal of the Digital Twin module from the application.
--
-- IMPORTANT SAFETY NOTE:
--   Run only after verifying no active tenants require exporting legacy
--   3D hotspot/model metadata. Existing JSON snapshots retain forward/backward
--   read compatibility via SnapshotSchema.passthrough().
--
-- ROLLBACK SQL (Reversible Restoration):
--   ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS twin_model_path TEXT;
--   CREATE TABLE IF NOT EXISTS public.twin_hotspots (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
--     project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
--     equipment_id TEXT NOT NULL,
--     label TEXT NOT NULL,
--     tag TEXT NOT NULL,
--     type TEXT NOT NULL DEFAULT 'status',
--     unit TEXT NOT NULL DEFAULT '',
--     position JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0}',
--     color TEXT NOT NULL DEFAULT '#00ff00',
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--   );
--   ALTER TABLE public.twin_hotspots ENABLE ROW LEVEL SECURITY;
-- ============================================================================

BEGIN;

-- 1. Drop RLS & storage bucket policies referencing Digital Twin
DROP POLICY IF EXISTS "tenant_select_twin_hotspots" ON public.twin_hotspots;
DROP POLICY IF EXISTS "tenant_insert_twin_hotspots" ON public.twin_hotspots;
DROP POLICY IF EXISTS "tenant_update_twin_hotspots" ON public.twin_hotspots;
DROP POLICY IF EXISTS "tenant_delete_twin_hotspots" ON public.twin_hotspots;

DROP POLICY IF EXISTS "twin_models_select" ON storage.objects;
DROP POLICY IF EXISTS "twin_models_insert" ON storage.objects;
DROP POLICY IF EXISTS "twin_models_update" ON storage.objects;
DROP POLICY IF EXISTS "twin_models_delete" ON storage.objects;

-- 2. Drop twin_hotspots table
DROP TABLE IF EXISTS public.twin_hotspots CASCADE;

-- 3. Drop twin_model_path column on public.projects
ALTER TABLE IF EXISTS public.projects
  DROP COLUMN IF EXISTS twin_model_path;

COMMIT;
