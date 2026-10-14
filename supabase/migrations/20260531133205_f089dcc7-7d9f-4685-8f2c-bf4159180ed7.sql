-- Restrict Stripe identifier columns on public.tenants to service_role only.
-- Idempotente: pula se a tabela/colunas ainda não existirem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tenants'
            AND column_name IN ('stripe_customer_id', 'stripe_subscription_id')) = 2 THEN
    EXECUTE 'REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM authenticated, anon';
    EXECUTE 'GRANT SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants TO service_role';
  END IF;
END $$;

-- Restrict raw invite token column from tenant admins. Server functions use service_role to read tokens during acceptance flow.
-- Idempotente: pula se a tabela/coluna ainda não existirem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invites')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'invites'
                   AND column_name = 'token') THEN
    EXECUTE 'REVOKE SELECT (token) ON public.invites FROM authenticated, anon';
    EXECUTE 'GRANT SELECT (token) ON public.invites TO service_role';
  END IF;
END $$;