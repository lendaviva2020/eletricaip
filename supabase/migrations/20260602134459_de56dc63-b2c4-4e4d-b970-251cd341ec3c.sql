-- Bloco 1.2: WITH CHECK obrigatório em políticas de escrita
-- Espelha o filtro USING em WITH CHECK para impedir row-escape via UPDATE.

-- ai_conversations
DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
CREATE POLICY "Users can update own conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- calculations
DROP POLICY IF EXISTS "Engineers+ can manage calculations" ON public.calculations;
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

-- clients (UPDATE only — INSERT já tem WITH CHECK próprio)
DROP POLICY IF EXISTS "Engineers+ can update clients" ON public.clients;
CREATE POLICY "Engineers+ can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = clients.tenant_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships tm WHERE tm.tenant_id = clients.tenant_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])));

-- diagrams
DROP POLICY IF EXISTS "Engineers+ can manage diagrams" ON public.diagrams;
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

-- files
DROP POLICY IF EXISTS "Engineers+ can manage files" ON public.files;
CREATE POLICY "Engineers+ can manage files" ON public.files
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));

-- invites
DROP POLICY IF EXISTS "Admins can manage invites" ON public.invites;
CREATE POLICY "Admins can manage invites" ON public.invites
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);

-- knowledge_chunks
DROP POLICY IF EXISTS "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.knowledge_documents kd WHERE kd.id = knowledge_chunks.document_id AND kd.tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_documents kd WHERE kd.id = knowledge_chunks.document_id AND kd.tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text])));

-- knowledge_documents
DROP POLICY IF EXISTS "Engineers plus can manage knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Engineers plus can manage knowledge documents" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));

-- project_bom_items
DROP POLICY IF EXISTS "Engineers+ update BOM" ON public.project_bom_items;
CREATE POLICY "Engineers+ update BOM" ON public.project_bom_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id WHERE p.id = project_bom_items.project_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id WHERE p.id = project_bom_items.project_id AND tm.user_id = auth.uid() AND tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])));

-- project_folders
DROP POLICY IF EXISTS "Engineers+ can manage folders" ON public.project_folders;
CREATE POLICY "Engineers+ can manage folders" ON public.project_folders
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));

-- projects (UPDATE)
DROP POLICY IF EXISTS "Engineers+ can update projects" ON public.projects;
CREATE POLICY "Engineers+ can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]));

-- tenant_memberships
DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
CREATE POLICY "Admins can manage memberships" ON public.tenant_memberships
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);

-- tenants (UPDATE)
DROP POLICY IF EXISTS "Admins can update tenant" ON public.tenants;
CREATE POLICY "Admins can update tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text)
  WITH CHECK (id = public.get_user_tenant_id() AND public.get_user_role() = 'admin'::text);

-- voltai_training_scenarios
DROP POLICY IF EXISTS "Admins can manage training scenarios" ON public.voltai_training_scenarios;
CREATE POLICY "Admins can manage training scenarios" ON public.voltai_training_scenarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE platform_admins.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.platform_admins WHERE platform_admins.user_id = auth.uid()));