
-- Drop duplicate/loose policies that target the {public} role (includes anon)
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can delete their own templates" ON public.system_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.system_templates;

-- Re-create only authenticated-scoped variants with proper WITH CHECK
CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own templates" ON public.system_templates
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND is_builtin = false);

CREATE POLICY "Users can update own templates" ON public.system_templates
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND is_builtin = false)
  WITH CHECK (created_by = auth.uid() AND is_builtin = false);

-- realtime.messages: only authenticated users may broadcast on private channels
-- whose name starts with their auth uid (e.g. "user:<uid>:notifications") OR
-- their tenant id (e.g. "tenant:<tenant_id>:presence"). Adjust topic
-- conventions in app code to match.
DROP POLICY IF EXISTS "Authenticated users can broadcast scoped channels" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast scoped channels"
  ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND (
      topic LIKE ('user:' || auth.uid()::text || ':%')
      OR topic LIKE ('tenant:' || public.get_user_tenant_id()::text || ':%')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read scoped channels" ON realtime.messages;
CREATE POLICY "Authenticated users can read scoped channels"
  ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND (
      topic LIKE ('user:' || auth.uid()::text || ':%')
      OR topic LIKE ('tenant:' || public.get_user_tenant_id()::text || ':%')
    )
  );
