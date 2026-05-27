-- 1) Trocar política de UPDATE de profiles por uma sem subquery auto-referencial.
DROP POLICY IF EXISTS "Users can update own profile (no role/tenant change)" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Garantir trigger BEFORE UPDATE que trava role/tenant_id/id
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) file_versions — políticas faltantes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_versions TO authenticated;
GRANT ALL ON public.file_versions TO service_role;

DROP POLICY IF EXISTS "Tenant members can insert file versions" ON public.file_versions;
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

DROP POLICY IF EXISTS "Tenant admins can update file versions" ON public.file_versions;
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

DROP POLICY IF EXISTS "Tenant admins can delete file versions" ON public.file_versions;
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