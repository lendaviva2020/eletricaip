-- Auditoria 2026-11-16 — duas escalações encontradas no banco vivo.
--
-- A) tenants: `authenticated` tinha UPDATE em TODAS as colunas e a policy
--    "Admins can update own tenant" deixava owner/admin gravar
--    plan='premium', subscription_status='active' e ids Stripe direto pelo
--    PostgREST — upgrade de plano sem pagamento. Toda mudança de plano no app
--    passa por service role (billing.functions.ts, webhooks Stripe/MP), então
--    o cliente só precisa de name/settings.
-- B) tenant_memberships: o USING do UPDATE não protegia a linha do owner;
--    um admin podia rebaixar o owner (ex.: role='viewer') e assumir o tenant.
--    Agora só o owner altera linha de owner (igual ao DELETE).

REVOKE UPDATE ON public.tenants FROM authenticated, anon;
GRANT UPDATE (name, settings, updated_at) ON public.tenants TO authenticated;

DROP POLICY IF EXISTS "Owners and admins can update memberships" ON public.tenant_memberships;
CREATE POLICY "Owners and admins can update memberships"
  ON public.tenant_memberships
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = tenant_memberships.tenant_id
        AND m.user_id = auth.uid()
        AND m.role = ANY (ARRAY['owner', 'admin'])
    )
    AND (
      role <> 'owner'
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships m2
        WHERE m2.tenant_id = tenant_memberships.tenant_id
          AND m2.user_id = auth.uid()
          AND m2.role = 'owner'
      )
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND role = ANY (ARRAY['owner', 'admin', 'engineer', 'operator', 'viewer'])
    AND (
      role <> 'owner'
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships m2
        WHERE m2.tenant_id = tenant_memberships.tenant_id
          AND m2.user_id = auth.uid()
          AND m2.role = 'owner'
      )
    )
  );
