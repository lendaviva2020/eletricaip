ALTER TABLE public.catalog_components
  ADD COLUMN IF NOT EXISTS rated_current_a numeric NULL,
  ADD COLUMN IF NOT EXISTS rated_voltage_v numeric NULL,
  ADD COLUMN IF NOT EXISTS list_price_brl numeric NULL,
  ADD COLUMN IF NOT EXISTS etim_class text NULL;

COMMENT ON COLUMN public.catalog_components.rated_current_a IS 'Corrente nominal (A) extraida para coluna propria para filtro numerico rapido; specs jsonb segue livre para os demais atributos.';
COMMENT ON COLUMN public.catalog_components.rated_voltage_v IS 'Tensao nominal (V) extraida para coluna propria para filtro numerico rapido.';
COMMENT ON COLUMN public.catalog_components.list_price_brl IS 'Preco de referencia mantido pelo tenant via importacao manual. NAO e preco de distribuidor em tempo real e nao deve ser tratado como cotacao.';
COMMENT ON COLUMN public.catalog_components.etim_class IS 'Codigo de classe ETIM (ex: EC000023) quando disponivel na fonte importada.';

CREATE INDEX IF NOT EXISTS idx_catalog_components_rated_current_a ON public.catalog_components (rated_current_a);
CREATE INDEX IF NOT EXISTS idx_catalog_components_rated_voltage_v ON public.catalog_components (rated_voltage_v);
CREATE INDEX IF NOT EXISTS idx_catalog_components_etim_class ON public.catalog_components (etim_class);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_components_manufacturer_part ON public.catalog_components (manufacturer_id, part_number);