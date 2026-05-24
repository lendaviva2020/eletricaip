
-- ============================================================
-- Storage: client-logos bucket — require tenant_id prefix
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload client logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload client logos for own tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can update client logos for own tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete client logos for own tenant" ON storage.objects;

CREATE POLICY "Users can upload client logos for own tenant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-logos'
    AND public.get_user_tenant_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Users can update client logos for own tenant"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  )
  WITH CHECK (
    bucket_id = 'client-logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Users can delete client logos for own tenant"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-logos'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- ============================================================
-- notifications — remove tenant-wide leak, scope to user
-- ============================================================
DROP POLICY IF EXISTS "Users can view their tenant notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notifications for their tenant" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert notifications for themselves"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.get_user_tenant_id()
  );

-- ============================================================
-- comments — enforce user_id = auth.uid() on insert
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='comments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert comments" ON public.comments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can create comments" ON public.comments';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments';
    EXECUTE $p$
      CREATE POLICY "Users can insert their own comments"
        ON public.comments FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid())
    $p$;
  END IF;
END$$;

-- ============================================================
-- system_templates — require tenant scoping on insert
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='system_templates') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert system templates" ON public.system_templates';
    EXECUTE 'DROP POLICY IF EXISTS "Users can create system templates" ON public.system_templates';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can insert templates" ON public.system_templates';
    EXECUTE $p$
      CREATE POLICY "Users can insert templates in their tenant"
        ON public.system_templates FOR INSERT TO authenticated
        WITH CHECK (
          created_by = auth.uid()
          AND tenant_id = public.get_user_tenant_id()
        )
    $p$;
  END IF;
END$$;
