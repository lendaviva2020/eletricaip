-- ============================================================================
-- GATE 4.3.3 — CONTINUOUS AI MEMORY & MULTI-TENANT RLS ISOLATION HARDENING
-- Enforce active tenant_memberships on project-scoped ai_conversations,
-- ai_messages, and ai_fix_audit (eliminating stale user_id cross-tenant bypass
-- when a user is removed from an organization).
-- WORM immutability on ai_fix_audit is strictly preserved.
-- ============================================================================

-- Helper check pattern reused inline:
-- When project_id IS NOT NULL, require active tenant membership or platform admin.

DROP POLICY IF EXISTS "Users manage own ai_conversations" ON public.ai_conversations;
CREATE POLICY "Users manage own ai_conversations"
  ON public.ai_conversations FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      user_id = auth.uid()
      AND (
        project_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = ai_conversations.project_id
            AND (
              p.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.tenant_memberships tm
                WHERE tm.tenant_id = p.tenant_id
                  AND tm.user_id = auth.uid()
              )
            )
        )
      )
    )
    OR (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = ai_conversations.project_id
          AND tm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      user_id = auth.uid()
      AND (
        project_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = ai_conversations.project_id
            AND (
              p.created_by = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.tenant_memberships tm
                WHERE tm.tenant_id = p.tenant_id
                  AND tm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users manage messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users manage messages in own conversations"
  ON public.ai_messages FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND (
          (
            c.user_id = auth.uid()
            AND (
              c.project_id IS NULL
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = c.project_id
                  AND (
                    p.created_by = auth.uid()
                    OR EXISTS (
                      SELECT 1
                      FROM public.tenant_memberships tm
                      WHERE tm.tenant_id = p.tenant_id
                        AND tm.user_id = auth.uid()
                    )
                  )
              )
            )
          )
          OR (
            c.project_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
              WHERE p.id = c.project_id
                AND tm.user_id = auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND (
          (
            c.user_id = auth.uid()
            AND (
              c.project_id IS NULL
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = c.project_id
                  AND (
                    p.created_by = auth.uid()
                    OR EXISTS (
                      SELECT 1
                      FROM public.tenant_memberships tm
                      WHERE tm.tenant_id = p.tenant_id
                        AND tm.user_id = auth.uid()
                    )
                  )
              )
            )
          )
        )
    )
  );

-- Harden ai_fix_audit: remove stale auth.uid() = user_id cross-tenant bypass on SELECT
-- and enforce active project membership on INSERT. Preserves WORM (no UPDATE/DELETE).
DROP POLICY IF EXISTS "ai_fix_audit_select_policy" ON public.ai_fix_audit;
CREATE POLICY "ai_fix_audit_select_policy"
  ON public.ai_fix_audit FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = ai_fix_audit.project_id
        AND (
          p.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm
            WHERE tm.tenant_id = p.tenant_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "ai_fix_audit_insert_policy" ON public.ai_fix_audit;
CREATE POLICY "ai_fix_audit_insert_policy"
  ON public.ai_fix_audit FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = ai_fix_audit.project_id
        AND (
          p.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.tenant_memberships tm
            WHERE tm.tenant_id = p.tenant_id
              AND tm.user_id = auth.uid()
          )
        )
    )
  );
