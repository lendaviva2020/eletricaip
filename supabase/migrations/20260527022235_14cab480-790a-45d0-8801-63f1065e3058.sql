-- 1) Trocar política de UPDATE de profiles por uma sem subquery auto-referencial.
-- Idempotente: pula se profiles ainda não existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can update own profile (no role/tenant change)" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
    EXECUTE $pol$
      CREATE POLICY "Users can update own profile"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
    $pol$;

    DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
    EXECUTE $trg$
      CREATE TRIGGER trg_prevent_profile_privilege_escalation
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
    $trg$;
  END IF;
END $$;

-- 2) file_versions — políticas faltantes
-- Idempotente: pula se file_versions/files/tenant_memberships ainda não existirem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'file_versions')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;
    GRANT ALL ON public.file_versions TO service_role;

    DROP POLICY IF EXISTS "Tenant members can insert file versions" ON public.file_versions;
    EXECUTE $pol$
      CREATE POLICY "Tenant members can insert file versions"
      ON public.file_versions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.files f
          JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
          WHERE f.id = file_versions.file_id
            AND tm.user_id = auth.uid()
        )
      );
    $pol$;

    DROP POLICY IF EXISTS "Tenant admins can update file versions" ON public.file_versions;
    EXECUTE $pol$
      CREATE POLICY "Tenant admins can update file versions"
      ON public.file_versions
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.files f
          JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
          WHERE f.id = file_versions.file_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.files f
          JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
          WHERE f.id = file_versions.file_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        )
      );
    $pol$;

    DROP POLICY IF EXISTS "Tenant admins can delete file versions" ON public.file_versions;
    EXECUTE $pol$
      CREATE POLICY "Tenant admins can delete file versions"
      ON public.file_versions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.files f
          JOIN public.tenant_memberships tm ON tm.tenant_id = f.tenant_id
          WHERE f.id = file_versions.file_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        )
      );
    $pol$;
  END IF;
END $$;