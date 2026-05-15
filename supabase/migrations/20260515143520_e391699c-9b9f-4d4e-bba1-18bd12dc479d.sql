
-- Helper: is the current user a platform admin?
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

-- feature_flags
DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Admins can view feature flags" ON public.feature_flags;

CREATE POLICY "Platform admins can view feature flags"
ON public.feature_flags FOR SELECT
TO authenticated
USING (public.is_platform_admin());

CREATE POLICY "Platform admins can manage feature flags"
ON public.feature_flags FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- blog_posts
DROP POLICY IF EXISTS "Admins can manage blog posts" ON public.blog_posts;

CREATE POLICY "Platform admins can manage blog posts"
ON public.blog_posts FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
