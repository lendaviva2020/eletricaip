
-- 1. Prevent role/tenant escalation on profiles via BEFORE UPDATE trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    NEW.tenant_id := OLD.tenant_id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (current_setting('role', true) <> 'service_role')
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Remove user self-update on user_subscriptions
DROP POLICY IF EXISTS user_subscriptions_update_own ON public.user_subscriptions;

-- 3. Tighten comments SELECT policy to author-only (was: any authenticated user)
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
CREATE POLICY "Users can view their own comments"
ON public.comments
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. plant_telemetry: add explicit deny-all for anon/authenticated; service role bypasses RLS
CREATE POLICY "plant_telemetry_no_client_access"
ON public.plant_telemetry
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- 5. tag_samples partitions: mirror parent policy (project membership) explicitly
DO $$
DECLARE
  part record;
BEGIN
  FOR part IN
    SELECT c.relname AS tname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.relname = 'tag_samples' AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part.tname);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_members" ON public.%I', part.tname, part.tname);
    EXECUTE format($p$
      CREATE POLICY "%s_select_members" ON public.%I
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects pr
        WHERE pr.id = project_id
          AND (pr.created_by = auth.uid()
               OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                          WHERE tm.tenant_id = pr.tenant_id AND tm.user_id = auth.uid()))
      ))
    $p$, part.tname, part.tname);
  END LOOP;
END $$;

-- 6. Revoke EXECUTE from authenticated on internal helper functions that should not be callable by clients
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.update_platform_admins_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.update_user_subscriptions_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.touch_simulation_tag_updated_at() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.create_monthly_tag_samples_partition(date) FROM PUBLIC, authenticated, anon;
