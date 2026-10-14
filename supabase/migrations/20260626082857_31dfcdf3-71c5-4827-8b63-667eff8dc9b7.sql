
-- Twin models bucket policies: path convention "<tenant_id>/<project_id>/<filename>.glb"
-- Idempotente: pula se get_user_tenant_id() ainda não existir (fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "twin_models_read_own_tenant" ON storage.objects;
    EXECUTE $pol$
      CREATE POLICY "twin_models_read_own_tenant"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'twin-models'
        AND (storage.foldername(name))[1]::uuid = public.get_user_tenant_id()
      );
    $pol$;

    DROP POLICY IF EXISTS "twin_models_insert_own_tenant" ON storage.objects;
    EXECUTE $pol$
      CREATE POLICY "twin_models_insert_own_tenant"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'twin-models'
        AND (storage.foldername(name))[1]::uuid = public.get_user_tenant_id()
      );
    $pol$;

    DROP POLICY IF EXISTS "twin_models_update_own_tenant" ON storage.objects;
    EXECUTE $pol$
      CREATE POLICY "twin_models_update_own_tenant"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'twin-models'
        AND (storage.foldername(name))[1]::uuid = public.get_user_tenant_id()
      )
      WITH CHECK (
        bucket_id = 'twin-models'
        AND (storage.foldername(name))[1]::uuid = public.get_user_tenant_id()
      );
    $pol$;

    DROP POLICY IF EXISTS "twin_models_delete_own_tenant" ON storage.objects;
    EXECUTE $pol$
      CREATE POLICY "twin_models_delete_own_tenant"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'twin-models'
        AND (storage.foldername(name))[1]::uuid = public.get_user_tenant_id()
      );
    $pol$;
  END IF;
END $$;
