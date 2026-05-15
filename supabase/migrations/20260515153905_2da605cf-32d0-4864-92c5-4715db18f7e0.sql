
-- Allow profile.tenant_id change ONLY if the user is already a member of the target tenant
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = NEW.id AND tm.tenant_id = NEW.tenant_id
    ) THEN
      NEW.tenant_id := OLD.tenant_id;
    END IF;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Accept invite by token: adds caller to tenant with the invited role
CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_inv record;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT * INTO v_inv
  FROM public.invites
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > now();
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invite';
  END IF;
  IF lower(v_inv.email) <> lower(v_email) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, accepted_at)
  VALUES (v_inv.tenant_id, auth.uid(), v_inv.role, now())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, accepted_at = now();

  UPDATE public.invites SET accepted_at = now() WHERE id = v_inv.id;

  RETURN jsonb_build_object('tenant_id', v_inv.tenant_id, 'role', v_inv.role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
