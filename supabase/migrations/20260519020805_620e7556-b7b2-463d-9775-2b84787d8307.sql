CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TYPE public.client_status AS ENUM ('active','prospect','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  status public.client_status NOT NULL DEFAULT 'active',
  sla_pct NUMERIC(5,2) NOT NULL DEFAULT 99.9,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view clients" ON public.clients;
CREATE POLICY "Tenant members can view clients"
ON public.clients FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.tenant_id = clients.tenant_id AND tm.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Engineers+ can insert clients" ON public.clients;
CREATE POLICY "Engineers+ can insert clients"
ON public.clients FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = clients.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','admin','engineer')
  )
);

DROP POLICY IF EXISTS "Engineers+ can update clients" ON public.clients;
CREATE POLICY "Engineers+ can update clients"
ON public.clients FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.tenant_id = clients.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('owner','admin','engineer')
));

DROP POLICY IF EXISTS "Engineers+ can delete clients" ON public.clients;
CREATE POLICY "Engineers+ can delete clients"
ON public.clients FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.tenant_memberships tm
  WHERE tm.tenant_id = clients.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.role IN ('owner','admin','engineer')
));

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_client ON public.projects(client_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos','client-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read client-logos" ON storage.objects;
CREATE POLICY "Public read client-logos" ON storage.objects FOR SELECT USING (bucket_id = 'client-logos');

DROP POLICY IF EXISTS "Authenticated upload client-logos" ON storage.objects;
CREATE POLICY "Authenticated upload client-logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'client-logos');

DROP POLICY IF EXISTS "Authenticated update client-logos" ON storage.objects;
CREATE POLICY "Authenticated update client-logos" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'client-logos');

DROP POLICY IF EXISTS "Authenticated delete client-logos" ON storage.objects;
CREATE POLICY "Authenticated delete client-logos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'client-logos');