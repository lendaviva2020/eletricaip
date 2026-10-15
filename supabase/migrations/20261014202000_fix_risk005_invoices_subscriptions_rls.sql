-- Migration: Correção de Segurança RISK-005
-- Restringe a leitura de invoices e subscriptions exclusivamente a admins e owners do tenant.
-- Remove as policies permissivas duplicadas ("Admins can view invoices" e "Admins can view subscription")
-- que permitiam leitura a qualquer papel (viewer/operator) apenas checando tenant_id.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    -- Remove a policy que permitia leitura a qualquer membro do tenant sem checagem de role
    DROP POLICY IF EXISTS "Admins can view invoices" ON public.invoices;

    -- Garante que apenas a policy restrita para admins e owners exista e esteja atualizada
    DROP POLICY IF EXISTS "tenant admins read invoices" ON public.invoices;

    CREATE POLICY "tenant admins read invoices" ON public.invoices
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = invoices.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['admin'::text, 'owner'::text])
        )
      );
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
  RAISE NOTICE 'RISK-005 invoices skip (objeto ausente): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    -- Remove a policy que permitia leitura a qualquer membro do tenant sem checagem de role
    DROP POLICY IF EXISTS "Admins can view subscription" ON public.subscriptions;

    -- Garante que apenas a policy restrita para admins e owners exista e esteja atualizada
    DROP POLICY IF EXISTS "tenant admins read subscriptions" ON public.subscriptions;

    CREATE POLICY "tenant admins read subscriptions" ON public.subscriptions
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = subscriptions.tenant_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['admin'::text, 'owner'::text])
        )
      );
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN
  RAISE NOTICE 'RISK-005 subscriptions skip (objeto ausente): %', SQLERRM;
END $$;
