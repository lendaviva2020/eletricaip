-- Bloco 1.2: WITH CHECK obrigatório em políticas de escrita
-- Espelha o filtro USING em WITH CHECK para impedir row-escape via UPDATE.
-- Idempotente: cada bloco pula se a tabela (ou as funções auxiliares
-- get_user_role()/get_user_tenant_id(), que vivem fora do repo) ainda não existir.

DO $$
DECLARE
  helpers_exist boolean :=
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'get_user_role');
BEGIN
  -- ai_conversations (só auth.uid() no corpo: precisa só da tabela)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_conversations') THEN
    DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
    EXECUTE $pol$
      CREATE POLICY "Users can update own conversations" ON public.ai_conversations
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid());
    $pol$;
  END IF;

  IF helpers_exist THEN
    -- calculations
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'calculations')
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
      DROP POLICY IF EXISTS "Engineers+ can manage calculations" ON public.calculations;
      EXECUTE $pol$
        CREATE POLICY "Engineers+ can manage calculations" ON public.calculations
          FOR ALL TO authenticated
          USING (
            EXISTS (SELECT 1 FROM public.projects WHERE projects.id = calculations.project_id AND projects.tenant_id = public.get_user_tenant_id())
            AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])
          )
          WITH CHECK (
            EXISTS (SELECT 1 FROM public.projects WHERE projects.id = calculations.project_id AND projects.tenant_id = public.get_user_tenant_id())
            AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])
          );
      $pol$;
    END IF;

    -- diagrams
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diagrams')
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
      DROP POLICY IF EXISTS "Engineers+ can manage diagrams" ON public.diagrams;
      EXECUTE $pol$
        CREATE POLICY "Engineers+ can manage diagrams" ON public.diagrams
          FOR ALL TO authenticated
          USING (
            EXISTS (SELECT 1 FROM public.projects WHERE projects.id = diagrams.project_id AND projects.tenant_id = public.get_user_tenant_id())
            AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])
          )
          WITH CHECK (
            EXISTS (SELECT 1 FROM public.projects WHERE projects.id = diagrams.project_id AND projects.tenant_id = public.get_user_tenant_id())
            AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])
          );
      $pol$;
    END IF;

    -- files
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'files') THEN
      DROP POLICY IF EXISTS "Engineers+ can manage files" ON public.files;
      EXECUTE $pol$
        CREATE POLICY "Engineers+ can manage files" ON public.files
          FOR ALL TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));
      $pol$;
    END IF;

    -- invites
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites') THEN
      DROP POLICY IF EXISTS "Admins can manage invites" ON public.invites;
      EXECUTE $pol$
        CREATE POLICY "Admins can manage invites" ON public.invites
          FOR ALL TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);
      $pol$;
    END IF;

    -- knowledge_chunks
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_chunks')
       AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents') THEN
      DROP POLICY IF EXISTS "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks;
      EXECUTE $pol$
        CREATE POLICY "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks
          FOR ALL TO authenticated
          USING (EXISTS (SELECT 1 FROM public.knowledge_documents kd WHERE kd.id = knowledge_chunks.document_id AND kd.tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])))
          WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_documents kd WHERE kd.id = knowledge_chunks.document_id AND kd.tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])));
      $pol$;
    END IF;

    -- knowledge_documents
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'knowledge_documents') THEN
      DROP POLICY IF EXISTS "Engineers plus can manage knowledge documents" ON public.knowledge_documents;
      EXECUTE $pol$
        CREATE POLICY "Engineers plus can manage knowledge documents" ON public.knowledge_documents
          FOR ALL TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));
      $pol$;
    END IF;

    -- project_folders
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_folders') THEN
      DROP POLICY IF EXISTS "Engineers+ can manage folders" ON public.project_folders;
      EXECUTE $pol$
        CREATE POLICY "Engineers+ can manage folders" ON public.project_folders
          FOR ALL TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));
      $pol$;
    END IF;

    -- projects (UPDATE)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
      DROP POLICY IF EXISTS "Engineers+ can update projects" ON public.projects;
      EXECUTE $pol$
        CREATE POLICY "Engineers+ can update projects" ON public.projects
          FOR UPDATE TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));
      $pol$;
    END IF;

    -- tenant_memberships
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
      DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
      EXECUTE $pol$
        CREATE POLICY "Admins can manage memberships" ON public.tenant_memberships
          FOR ALL TO authenticated
          USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
          WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);
      $pol$;
    END IF;

    -- tenants (UPDATE)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
      DROP POLICY IF EXISTS "Admins can update tenant" ON public.tenants;
      EXECUTE $pol$
        CREATE POLICY "Admins can update tenant" ON public.tenants
          FOR UPDATE TO authenticated
          USING (id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
          WITH CHECK (id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);
      $pol$;
    END IF;
  END IF;

  -- clients (UPDATE only — INSERT já tem WITH CHECK próprio; corpo usa tenant_memberships)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ can update clients" ON public.clients;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ can update clients" ON public.clients
        FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = clients.tenant_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))
        WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = clients.tenant_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])));
    $pol$;
  END IF;

  -- project_bom_items (corpo usa projects + tenant_memberships)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_bom_items')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Engineers+ update BOM" ON public.project_bom_items;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ update BOM" ON public.project_bom_items
        FOR UPDATE TO authenticated
        USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id WHERE p.id = project_bom_items.project_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))
        WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id WHERE p.id = project_bom_items.project_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])));
    $pol$;
  END IF;

  -- voltai_training_scenarios (corpo usa platform_admins)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voltai_training_scenarios')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins') THEN
    DROP POLICY IF EXISTS "Admins can manage training scenarios" ON public.voltai_training_scenarios;
    EXECUTE $pol$
      CREATE POLICY "Admins can manage training scenarios" ON public.voltai_training_scenarios
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE platform_admins.user_id = auth.uid()))
        WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE platform_admins.user_id = auth.uid()));
    $pol$;
  END IF;
END $$;
