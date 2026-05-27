
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
