
CREATE TABLE public.ai_rate_limit_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  burst_window_ms integer NOT NULL DEFAULT 10000,
  burst_max integer NOT NULL DEFAULT 10,
  fallback_window_ms integer NOT NULL DEFAULT 10000,
  fallback_max integer NOT NULL DEFAULT 10,
  note text NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_rate_limit_configs_user_unique UNIQUE (user_id),
  CONSTRAINT ai_rate_limit_configs_burst_window_chk CHECK (burst_window_ms BETWEEN 1000 AND 3600000),
  CONSTRAINT ai_rate_limit_configs_burst_max_chk CHECK (burst_max BETWEEN 1 AND 10000),
  CONSTRAINT ai_rate_limit_configs_fallback_window_chk CHECK (fallback_window_ms BETWEEN 1000 AND 3600000),
  CONSTRAINT ai_rate_limit_configs_fallback_max_chk CHECK (fallback_max BETWEEN 1 AND 10000)
);

-- Single global row uses user_id IS NULL; enforce uniqueness for that as well.
CREATE UNIQUE INDEX ai_rate_limit_configs_global_unique
  ON public.ai_rate_limit_configs ((user_id IS NULL))
  WHERE user_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_rate_limit_configs TO authenticated;
GRANT ALL ON public.ai_rate_limit_configs TO service_role;

ALTER TABLE public.ai_rate_limit_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform admins can read rate limit configs"
  ON public.ai_rate_limit_configs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform admins can insert rate limit configs"
  ON public.ai_rate_limit_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform admins can update rate limit configs"
  ON public.ai_rate_limit_configs
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform admins can delete rate limit configs"
  ON public.ai_rate_limit_configs
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

CREATE TRIGGER ai_rate_limit_configs_touch
  BEFORE UPDATE ON public.ai_rate_limit_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
