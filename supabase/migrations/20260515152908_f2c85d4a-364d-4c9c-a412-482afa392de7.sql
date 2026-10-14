
-- Idempotente/replay-safe: só cria as policies se a tabela e as funções
-- auxiliares existirem. Em banco novo/replay limpo elas ainda não existem
-- (o DDL central e get_user_role()/get_user_tenant_id() vivem fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'get_user_role') THEN
    DROP POLICY IF EXISTS "Engineers+ can insert versions" ON public.project_versions;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ can insert versions"
      ON public.project_versions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = project_versions.project_id
            AND p.tenant_id = public.get_user_tenant_id()
            AND public.get_user_role() = ANY (ARRAY['admin','engineer'])
        )
      );
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ can delete versions" ON public.project_versions;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ can delete versions"
      ON public.project_versions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = project_versions.project_id
            AND p.tenant_id = public.get_user_tenant_id()
            AND public.get_user_role() = ANY (ARRAY['admin','engineer'])
        )
      );
    $pol$;
  END IF;
END $$;
