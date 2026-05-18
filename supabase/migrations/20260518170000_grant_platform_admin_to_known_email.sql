-- Grant platform-admin access to the known application owner email and keep it synced.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = '989111474fe@gmail.com'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, role, created_by)
    VALUES (v_user_id, 'owner', v_user_id)
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'owner',
          updated_at = now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_known_platform_admin_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = '989111474fe@gmail.com' THEN
    INSERT INTO public.platform_admins (user_id, role, created_by)
    VALUES (NEW.id, 'owner', NEW.id)
    ON CONFLICT (user_id) DO UPDATE
      SET role = 'owner',
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_known_platform_admin_email_on_auth_users ON auth.users;
CREATE TRIGGER sync_known_platform_admin_email_on_auth_users
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_known_platform_admin_email();

REVOKE EXECUTE ON FUNCTION public.sync_known_platform_admin_email() FROM PUBLIC, authenticated, anon;
