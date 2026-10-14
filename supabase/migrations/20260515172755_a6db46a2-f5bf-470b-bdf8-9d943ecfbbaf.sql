
-- Project BOM (Bill of Materials) items
-- Idempotente: catalog_components pode ainda não existir (DDL fora do repo).
-- Cria a tabela com a FK quando o alvo existe, sem a FK caso contrário, e
-- tenta anexar a FK sempre que ambos existirem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components') THEN
    CREATE TABLE IF NOT EXISTS public.project_bom_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      component_id uuid REFERENCES public.catalog_components(id) ON DELETE SET NULL,
      part_number text,
      description text,
      manufacturer text,
      quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit text NOT NULL DEFAULT 'un',
      reference text,
      notes text,
      unit_price_brl numeric,
      source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'canvas', 'ai')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.project_bom_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      component_id uuid,
      part_number text,
      description text,
      manufacturer text,
      quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit text NOT NULL DEFAULT 'un',
      reference text,
      notes text,
      unit_price_brl numeric,
      source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'canvas', 'ai')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_components')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_bom_items_component_id_fkey') THEN
    ALTER TABLE public.project_bom_items
      ADD CONSTRAINT project_bom_items_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES public.catalog_components(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_bom_project ON public.project_bom_items(project_id);
CREATE INDEX IF NOT EXISTS idx_project_bom_component ON public.project_bom_items(component_id);

ALTER TABLE public.project_bom_items ENABLE ROW LEVEL SECURITY;

-- Policies (idempotente: pula se projects/tenant_memberships ainda não existirem).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant members view BOM" ON public.project_bom_items;
    EXECUTE $pol$
      CREATE POLICY "Tenant members view BOM"
        ON public.project_bom_items FOR SELECT
        USING (EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = project_bom_items.project_id AND tm.user_id = auth.uid()
        ));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ insert BOM" ON public.project_bom_items;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ insert BOM"
        ON public.project_bom_items FOR INSERT
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = project_bom_items.project_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        ));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ update BOM" ON public.project_bom_items;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ update BOM"
        ON public.project_bom_items FOR UPDATE
        USING (EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = project_bom_items.project_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        ));
    $pol$;

    DROP POLICY IF EXISTS "Engineers+ delete BOM" ON public.project_bom_items;
    EXECUTE $pol$
      CREATE POLICY "Engineers+ delete BOM"
        ON public.project_bom_items FOR DELETE
        USING (EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = project_bom_items.project_id
            AND tm.user_id = auth.uid()
            AND tm.role = ANY (ARRAY['owner','admin','engineer'])
        ));
    $pol$;
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_project_bom_items()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_project_bom_items_touch ON public.project_bom_items;
CREATE TRIGGER trg_project_bom_items_touch
  BEFORE UPDATE ON public.project_bom_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_bom_items();

-- RPC: generate BOM from canvas snapshot (aggregates duplicates by part_number)
CREATE OR REPLACE FUNCTION public.generate_bom_from_canvas(p_project_id uuid)
RETURNS TABLE(items_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_role text;
  v_tenant uuid;
  v_canvas jsonb;
  v_node jsonb;
  v_part text;
  v_desc text;
  v_qty numeric;
BEGIN
  -- Authz: engineer+ on project tenant
  SELECT p.tenant_id INTO v_tenant FROM public.projects p WHERE p.id = p_project_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  SELECT tm.role INTO v_role FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_tenant AND tm.user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','engineer') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Clear previous canvas-sourced items
  DELETE FROM public.project_bom_items
    WHERE project_id = p_project_id AND source = 'canvas';

  -- Iterate diagrams nodes
  FOR v_canvas IN
    SELECT canvas_data FROM public.diagrams WHERE project_id = p_project_id
  LOOP
    FOR v_node IN
      SELECT jsonb_array_elements(COALESCE(v_canvas->'nodes', '[]'::jsonb))
    LOOP
      v_part := COALESCE(v_node->'data'->>'partNumber', v_node->'data'->>'model', v_node->>'type');
      v_desc := COALESCE(v_node->'data'->>'label', v_node->'data'->>'description', v_node->>'type');
      v_qty := COALESCE((v_node->'data'->>'quantity')::numeric, 1);
      IF v_part IS NULL THEN CONTINUE; END IF;

      -- Aggregate
      IF EXISTS (
        SELECT 1 FROM public.project_bom_items
        WHERE project_id = p_project_id AND source = 'canvas' AND part_number = v_part
      ) THEN
        UPDATE public.project_bom_items
          SET quantity = quantity + v_qty
          WHERE project_id = p_project_id AND source = 'canvas' AND part_number = v_part;
      ELSE
        INSERT INTO public.project_bom_items
          (project_id, part_number, description, quantity, source, created_by)
          VALUES (p_project_id, v_part, v_desc, v_qty, 'canvas', auth.uid());
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_count;
END $$;

REVOKE ALL ON FUNCTION public.generate_bom_from_canvas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_bom_from_canvas(uuid) TO authenticated;
