
-- 1) Storage client-logos: drop overly broad policies
DROP POLICY IF EXISTS "Authenticated delete client-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update client-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload client-logos" ON storage.objects;

-- 2) profiles: prevent role/tenant self-escalation
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 3) system_templates: remove the loose public INSERT policy
DROP POLICY IF EXISTS "Users can create templates" ON public.system_templates;
