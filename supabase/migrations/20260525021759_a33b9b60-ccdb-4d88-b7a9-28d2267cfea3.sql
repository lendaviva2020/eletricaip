
-- 1) Profiles: tighten UPDATE policy with strict WITH CHECK on role/tenant_id
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can update own profile (no role/tenant change)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- Ensure the defense-in-depth trigger is attached
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Make client-logos bucket private and add tenant-scoped read policy
UPDATE storage.buckets SET public = false WHERE id = 'client-logos';

-- Drop existing client-logos policies to start clean
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (policyname ILIKE '%client-logos%' OR policyname ILIKE '%client_logos%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Path convention: <tenant_id>/<filename>
CREATE POLICY "client-logos read by tenant members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "client-logos insert by tenant members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id::text = (storage.foldername(name))[1]
      AND tm.role = ANY (ARRAY['owner','admin','engineer'])
  )
);

CREATE POLICY "client-logos update by tenant members"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'client-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id::text = (storage.foldername(name))[1]
      AND tm.role = ANY (ARRAY['owner','admin','engineer'])
  )
);

CREATE POLICY "client-logos delete by tenant members"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-logos'
  AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id::text = (storage.foldername(name))[1]
      AND tm.role = ANY (ARRAY['owner','admin','engineer'])
  )
);
