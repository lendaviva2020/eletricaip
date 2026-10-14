
-- 1) Storage client-logos: drop overly broad policies
DROP POLICY IF EXISTS "Authenticated delete client-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update client-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload client-logos" ON storage.objects;

-- 2) profiles: prevent role/tenant self-escalation
-- Idempotente: pula se profiles ainda não existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
    EXECUTE $trg$
      CREATE TRIGGER prevent_profile_privilege_escalation_trg
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
    $trg$;
  END IF;
END $$;

-- 3) system_templates: remove the loose public INSERT policy
-- Idempotente: pula se a tabela ainda não existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_templates') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can create templates" ON public.system_templates';
  END IF;
END $$;
