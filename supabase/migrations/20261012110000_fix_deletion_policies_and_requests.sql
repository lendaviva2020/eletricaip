-- Correções de exclusão (LGPD Art. 18, VI):
--  1) ai_messages sem policy de DELETE fazia o deleteConversation apagar a
--     conversa e deixar as mensagens órfãs no banco (falha silenciosa).
--  2) alarm_history sem policy de DELETE impedia a limpeza completa do projeto.
--  3) deletion_requests: fila auditável de pedidos de eliminação de conta.
--
-- Após aplicar, validar no banco vivo:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename IN ('ai_messages', 'alarm_history') AND cmd = 'DELETE';
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'deletion_requests';

-- 1) Dono da conversa pode apagar suas mensagens.
DROP POLICY IF EXISTS "Users can delete messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users can delete messages in own conversations" ON public.ai_messages
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1
    FROM public.ai_conversations
    WHERE ai_conversations.id = ai_messages.conversation_id
      AND ai_conversations.user_id = auth.uid()));

-- 2) Limpeza de histórico de alarmes em projetos acessíveis (mesmo padrão
-- das policies de alarm_configs/function_block_instances).
DROP POLICY IF EXISTS "Users can delete alarm history in accessible projects" ON public.alarm_history;
CREATE POLICY "Users can delete alarm history in accessible projects" ON public.alarm_history
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1
    FROM public.projects p
    WHERE p.id = alarm_history.project_id
      AND ((p.created_by = auth.uid()) OR (EXISTS (SELECT 1
        FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p.tenant_id AND tm.user_id = auth.uid())))));

-- 3) Fila de pedidos de eliminação de conta (LGPD Art. 18, §1º).
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON public.deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON public.deletion_requests(status);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can request own deletion" ON public.deletion_requests;
CREATE POLICY "Users can request own deletion" ON public.deletion_requests
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own deletion requests" ON public.deletion_requests;
CREATE POLICY "Users can view own deletion requests" ON public.deletion_requests
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Platform admins manage deletion requests" ON public.deletion_requests;
CREATE POLICY "Platform admins manage deletion requests" ON public.deletion_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deletion_requests TO authenticated;
