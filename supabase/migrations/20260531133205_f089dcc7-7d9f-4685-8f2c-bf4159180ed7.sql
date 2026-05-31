-- Restrict Stripe identifier columns on public.tenants to service_role only.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants FROM authenticated, anon;
GRANT SELECT (stripe_customer_id, stripe_subscription_id) ON public.tenants TO service_role;

-- Restrict raw invite token column from tenant admins. Server functions use service_role to read tokens during acceptance flow.
REVOKE SELECT (token) ON public.invites FROM authenticated, anon;
GRANT SELECT (token) ON public.invites TO service_role;