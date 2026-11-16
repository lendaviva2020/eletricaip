-- Catálogo próprio de cada organização (2026-11-16).
--
-- O catálogo global (catalog_components) só é gravável por admin da
-- plataforma e está vazio. Cada empresa precisa montar o PRÓPRIO catálogo,
-- começando vazio, escolhendo a origem de cada item:
--   manual    — digitado pelo usuário;
--   planilha  — importado de CSV/XLSX;
--   mouser    — importado da API de busca da Mouser (preço do distribuidor,
--               com data da última consulta, atualizável).
-- Nenhum preço é convertido de moeda nem presumido: guarda-se o valor e a
-- moeda informados pela fonte.

CREATE TABLE IF NOT EXISTS public.tenant_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  manufacturer text NOT NULL CHECK (length(btrim(manufacturer)) BETWEEN 1 AND 120),
  part_number text NOT NULL CHECK (length(btrim(part_number)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  category text CHECK (category IS NULL OR length(category) <= 120),
  rated_current_a double precision CHECK (rated_current_a IS NULL OR rated_current_a >= 0),
  rated_voltage_v double precision CHECK (rated_voltage_v IS NULL OR rated_voltage_v >= 0),
  unit_price numeric(14, 4) CHECK (unit_price IS NULL OR unit_price >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  price_source text NOT NULL DEFAULT 'manual'
    CHECK (price_source IN ('manual', 'planilha', 'mouser')),
  source_part_id text CHECK (source_part_id IS NULL OR length(source_part_id) <= 120),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://'),
  datasheet_url text CHECK (datasheet_url IS NULL OR datasheet_url ~ '^https?://'),
  stock integer CHECK (stock IS NULL OR stock >= 0),
  price_updated_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_catalog_items_part
  ON public.tenant_catalog_items (tenant_id, lower(manufacturer), lower(part_number));
CREATE INDEX IF NOT EXISTS idx_tenant_catalog_items_created_by
  ON public.tenant_catalog_items (created_by);

DROP TRIGGER IF EXISTS trg_tenant_catalog_items_updated_at ON public.tenant_catalog_items;
CREATE TRIGGER trg_tenant_catalog_items_updated_at BEFORE UPDATE ON public.tenant_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_catalog_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_catalog_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_catalog_items TO authenticated;

-- Leitura: qualquer membro da organização.
DROP POLICY IF EXISTS rls_select_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_select_tenant_catalog_items ON public.tenant_catalog_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
  ));

-- Escrita: owner, admin ou engineer (viewer/operator só consultam).
DROP POLICY IF EXISTS rls_insert_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_insert_tenant_catalog_items ON public.tenant_catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));

DROP POLICY IF EXISTS rls_update_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_update_tenant_catalog_items ON public.tenant_catalog_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));

DROP POLICY IF EXISTS rls_delete_tenant_catalog_items ON public.tenant_catalog_items;
CREATE POLICY rls_delete_tenant_catalog_items ON public.tenant_catalog_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = tenant_catalog_items.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role IN ('owner', 'admin', 'engineer')
  ));
