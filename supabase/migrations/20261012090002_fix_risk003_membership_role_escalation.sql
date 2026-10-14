-- RISK-003: impedir escalação de papel via policy de tenant_memberships.
--
-- Contexto: a policy "Admins can manage memberships" (FOR ALL) validava apenas
-- o papel do CHAMADOR (admin do tenant), sem restringir NEW.role / NEW.user_id /
-- NEW.tenant_id. Um admin podia gravar role='owner' para si via PostgREST.
--
-- Esta migration substitui a policy FOR ALL por policies granulares:
--   - SELECT: membros do tenant (inalterado semanticamente; restrito a authenticated).
--   - INSERT/UPDATE: owner/admin do tenant, com WITH CHECK que
--       (a) limita role ao enum da aplicação,
--       (b) trava tenant_id no tenant do chamador, e
--       (c) permite role='owner' SOMENTE quando o chamador já é owner.
--   - DELETE: owner/admin do tenant; linhas com role='owner' só podem ser
--     removidas por um owner (admin não remove owner).
--
-- Fonte de verdade de papel do chamador: public.tenant_memberships
-- (nunca profiles.role), conforme docs/sdd/10-seguranca.md.
-- Validação necessária (ambiente de teste, usuário admin não-owner):
--   UPDATE public.tenant_memberships SET role = 'owner' WHERE user_id = <si mesmo>;
-- deve falhar por violação de policy; o mesmo vale para INSERT com role='owner'.

-- Idempotente: pula se tenant_memberships ou get_user_tenant_id() ainda não
-- existirem (DDL central e helpers vivem fora do repo).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'get_user_tenant_id') THEN
    DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;

    DROP POLICY IF EXISTS "Members can view own tenant memberships" ON public.tenant_memberships;
    CREATE POLICY "Members can view own tenant memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (tenant_id = get_user_tenant_id());

    DROP POLICY IF EXISTS "Owners and admins can insert memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can insert memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (
        tenant_id = get_user_tenant_id()
        AND role IN ('owner', 'admin', 'engineer', 'operator', 'viewer')
        AND EXISTS (SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin'))
        AND (
          role <> 'owner'
          OR EXISTS (SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner')
        )
      );

    DROP POLICY IF EXISTS "Owners and admins can update memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can update memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR UPDATE TO authenticated
      USING (
        tenant_id = get_user_tenant_id()
        AND EXISTS (SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin'))
      )
      WITH CHECK (
        tenant_id = get_user_tenant_id()
        AND role IN ('owner', 'admin', 'engineer', 'operator', 'viewer')
        AND (
          role <> 'owner'
          OR EXISTS (SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner')
        )
      );

    DROP POLICY IF EXISTS "Owners and admins can delete memberships" ON public.tenant_memberships;
    CREATE POLICY "Owners and admins can delete memberships" ON public.tenant_memberships
      AS PERMISSIVE FOR DELETE TO authenticated
      USING (
        tenant_id = get_user_tenant_id()
        AND EXISTS (SELECT 1
          FROM public.tenant_memberships m
          WHERE m.tenant_id = tenant_memberships.tenant_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner', 'admin'))
        AND (
          role <> 'owner'
          OR EXISTS (SELECT 1
            FROM public.tenant_memberships m2
            WHERE m2.tenant_id = tenant_memberships.tenant_id
              AND m2.user_id = auth.uid()
              AND m2.role = 'owner')
        )
      );
  END IF;
END $$;
