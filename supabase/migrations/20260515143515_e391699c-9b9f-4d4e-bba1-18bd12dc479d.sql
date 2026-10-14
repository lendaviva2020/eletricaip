-- 1. Garantir que a tabela platform_admins existe
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 2. Helper: is the current user a platform admin?
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- 3. feature_flags policies (Protegido contra tabela inexistente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feature_flags') THEN
    DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
    DROP POLICY IF EXISTS "Admins can view feature flags" ON public.feature_flags;
    DROP POLICY IF EXISTS "Platform admins can view feature flags" ON public.feature_flags;
    DROP POLICY IF EXISTS "Platform admins can manage feature flags" ON public.feature_flags;

    CREATE POLICY "Platform admins can view feature flags"
    ON public.feature_flags FOR SELECT
    TO authenticated
    USING (public.is_platform_admin());

    CREATE POLICY "Platform admins can manage feature flags"
    ON public.feature_flags FOR ALL
    TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

-- 4. blog_posts policies (Protegido contra tabela inexistente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blog_posts') THEN
    DROP POLICY IF EXISTS "Admins can manage blog posts" ON public.blog_posts;
    DROP POLICY IF EXISTS "Platform admins can manage blog posts" ON public.blog_posts;

    CREATE POLICY "Platform admins can manage blog posts"
    ON public.blog_posts FOR ALL
    TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
  END IF;
END $$;