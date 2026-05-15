
-- 1) voltai_training_scenarios: restrict SELECT to platform admins
DROP POLICY IF EXISTS "Authenticated users can read active scenarios" ON public.voltai_training_scenarios;
CREATE POLICY "Platform admins can read training scenarios"
ON public.voltai_training_scenarios
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()));

-- 2) iot_command_log: restrict write/update to engineer/admin/owner
DROP POLICY IF EXISTS "Users can insert command log of their tenant" ON public.iot_command_log;
DROP POLICY IF EXISTS "Users can update command log of their tenant" ON public.iot_command_log;

CREATE POLICY "Engineers+ can insert command log"
ON public.iot_command_log
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner','admin','engineer')
  )
);

CREATE POLICY "Engineers+ can update command log"
ON public.iot_command_log
FOR UPDATE TO authenticated
USING (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner','admin','engineer')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tm.tenant_id FROM public.tenant_memberships tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner','admin','engineer')
  )
);

-- 3) system_templates: require auth for builtin SELECT
DROP POLICY IF EXISTS "Anyone can read builtin templates" ON public.system_templates;
CREATE POLICY "Authenticated users can read builtin templates"
ON public.system_templates
FOR SELECT TO authenticated
USING (is_builtin = true OR created_by = auth.uid());

-- 4) tag_samples partitions: explicitly deny direct writes from clients
DO $$
DECLARE p text;
BEGIN
  FOR p IN
    SELECT inhrelid::regclass::text
    FROM pg_inherits
    WHERE inhparent = 'public.tag_samples'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_no_client_writes" ON %s', split_part(p,'.',2), p);
    EXECUTE format($f$CREATE POLICY "%s_no_client_writes" ON %s AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)$f$, split_part(p,'.',2), p);
  END LOOP;
END $$;
