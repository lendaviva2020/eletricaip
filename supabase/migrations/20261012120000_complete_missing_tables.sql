-- Migration: Tabelas para ponte Unifilar → Ladder e cenários de teste
-- Criação das tabelas necessárias para integração completa
--
-- NOTA (2026-10-14): blocos condicionais (IF EXISTS) porque o DDL central
-- (projects/tenants/tenant_memberships) vive fora do repo. Tabelas próprias
-- são criadas com a FK quando o alvo existe, sem a FK caso contrário (com
-- tentativa de anexar a constraint quando ambos existirem). Policies que
-- referenciam tabelas ausentes são puladas. Nenhuma lógica foi alterada.

-- 1. Tabela de mapeamento Unifilar → Ladder (bobinas → motores)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    CREATE TABLE IF NOT EXISTS public.unifilar_ladder_mapping (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      unifilar_node_id text NOT NULL,
      ladder_tag_name text NOT NULL,
      equipment_type text NOT NULL CHECK (equipment_type IN (
        'motor', 'exhaustor', 'breaker', 'contactor', 'vfd', 'softstarter',
        'transformer', 'psu', 'estop', 'sensor'
      )),
      equipment_id text NOT NULL,
      mapping_type text NOT NULL CHECK (mapping_type IN ('command', 'feedback', 'protection', 'status')),
      is_primary boolean DEFAULT true,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id, unifilar_node_id, ladder_tag_name)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.unifilar_ladder_mapping (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      unifilar_node_id text NOT NULL,
      ladder_tag_name text NOT NULL,
      equipment_type text NOT NULL CHECK (equipment_type IN (
        'motor', 'exhaustor', 'breaker', 'contactor', 'vfd', 'softstarter',
        'transformer', 'psu', 'estop', 'sensor'
      )),
      equipment_id text NOT NULL,
      mapping_type text NOT NULL CHECK (mapping_type IN ('command', 'feedback', 'protection', 'status')),
      is_primary boolean DEFAULT true,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(project_id, unifilar_node_id, ladder_tag_name)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unifilar_ladder_mapping_project_id_fkey') THEN
    ALTER TABLE public.unifilar_ladder_mapping
      ADD CONSTRAINT unifilar_ladder_mapping_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_unifilar_ladder_mapping_project ON public.unifilar_ladder_mapping(project_id);
CREATE INDEX IF NOT EXISTS idx_unifilar_ladder_mapping_node ON public.unifilar_ladder_mapping(unifilar_node_id);
CREATE INDEX IF NOT EXISTS idx_unifilar_ladder_mapping_tag ON public.unifilar_ladder_mapping(ladder_tag_name);

-- RLS
ALTER TABLE public.unifilar_ladder_mapping ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Project members can view mappings" ON public.unifilar_ladder_mapping;
    CREATE POLICY "Project members can view mappings" ON public.unifilar_ladder_mapping
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = unifilar_ladder_mapping.project_id
          AND tm.user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "Engineers+ can manage mappings" ON public.unifilar_ladder_mapping;
    CREATE POLICY "Engineers+ can manage mappings" ON public.unifilar_ladder_mapping
      AS PERMISSIVE FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = unifilar_ladder_mapping.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = unifilar_ladder_mapping.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));
  END IF;
END $$;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_unifilar_ladder_mapping_updated_at ON public.unifilar_ladder_mapping;
CREATE TRIGGER trg_unifilar_ladder_mapping_updated_at BEFORE UPDATE ON public.unifilar_ladder_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unifilar_ladder_mapping TO authenticated;


-- 2. Tabela de cenários de teste persistidos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    CREATE TABLE IF NOT EXISTS public.test_scenarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      scenario_type text NOT NULL CHECK (scenario_type IN ('normal', 'fault_injection', 'protection_test', 'interlock_test', 'performance', 'custom')),
      plant_config jsonb NOT NULL DEFAULT '{}',
      ladder_program jsonb,
      unifilar_snapshot jsonb,
      expected_results jsonb,
      tags text[] DEFAULT '{}',
      is_template boolean DEFAULT false,
      is_public boolean DEFAULT false,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_run_at timestamptz,
      last_run_result jsonb
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.test_scenarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      name text NOT NULL,
      description text,
      scenario_type text NOT NULL CHECK (scenario_type IN ('normal', 'fault_injection', 'protection_test', 'interlock_test', 'performance', 'custom')),
      plant_config jsonb NOT NULL DEFAULT '{}',
      ladder_program jsonb,
      unifilar_snapshot jsonb,
      expected_results jsonb,
      tags text[] DEFAULT '{}',
      is_template boolean DEFAULT false,
      is_public boolean DEFAULT false,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_run_at timestamptz,
      last_run_result jsonb
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_scenarios_project_id_fkey') THEN
    ALTER TABLE public.test_scenarios
      ADD CONSTRAINT test_scenarios_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_test_scenarios_project ON public.test_scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_type ON public.test_scenarios(scenario_type);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_template ON public.test_scenarios(is_template);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_public ON public.test_scenarios(is_public) WHERE is_public = true;

ALTER TABLE public.test_scenarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Project members can view scenarios" ON public.test_scenarios;
    CREATE POLICY "Project members can view scenarios" ON public.test_scenarios
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (
        (is_public = true) OR
        EXISTS (
          SELECT 1 FROM public.projects p
          JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
          WHERE p.id = test_scenarios.project_id
            AND tm.user_id = auth.uid()
        )
      );

    DROP POLICY IF EXISTS "Project members can manage scenarios" ON public.test_scenarios;
    CREATE POLICY "Project members can manage scenarios" ON public.test_scenarios
      AS PERMISSIVE FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = test_scenarios.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = test_scenarios.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_test_scenarios_updated_at ON public.test_scenarios;
CREATE TRIGGER trg_test_scenarios_updated_at BEFORE UPDATE ON public.test_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_scenarios TO authenticated;


-- 3. Tabela de execuções de cenários de teste (histórico)
-- test_scenarios é criada na seção 2 acima, então a FK é direta.
CREATE TABLE IF NOT EXISTS public.test_scenario_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.test_scenarios(id) ON DELETE CASCADE,
  run_number int NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  plant_initial_state jsonb,
  plant_final_state jsonb,
  ladder_initial_state jsonb,
  ladder_final_state jsonb,
  events jsonb,
  metrics jsonb,
  passed boolean,
  failure_reason text,
  error_details jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_scenario_runs_scenario ON public.test_scenario_runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_test_scenario_runs_status ON public.test_scenario_runs(status);

ALTER TABLE public.test_scenario_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Project members can view runs" ON public.test_scenario_runs;
    CREATE POLICY "Project members can view runs" ON public.test_scenario_runs
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.test_scenarios ts
        JOIN public.projects p ON p.id = ts.project_id
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE ts.id = test_scenario_runs.scenario_id
          AND tm.user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "Project members can create runs" ON public.test_scenario_runs;
    CREATE POLICY "Project members can create runs" ON public.test_scenario_runs
      AS PERMISSIVE FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.test_scenarios ts
        JOIN public.projects p ON p.id = ts.project_id
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE ts.id = test_scenario_runs.scenario_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));

    DROP POLICY IF EXISTS "Engineers+ can update runs" ON public.test_scenario_runs;
    CREATE POLICY "Engineers+ can update runs" ON public.test_scenario_runs
      AS PERMISSIVE FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.test_scenarios ts
        JOIN public.projects p ON p.id = ts.project_id
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE ts.id = test_scenario_runs.scenario_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.test_scenarios ts
        JOIN public.projects p ON p.id = ts.project_id
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE ts.id = test_scenario_runs.scenario_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));

    DROP POLICY IF EXISTS "Engineers+ can delete runs" ON public.test_scenario_runs;
    CREATE POLICY "Engineers+ can delete runs" ON public.test_scenario_runs
      AS PERMISSIVE FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.test_scenarios ts
        JOIN public.projects p ON p.id = ts.project_id
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE ts.id = test_scenario_runs.scenario_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_scenario_runs TO authenticated;

-- Numeração sequencial por cenário. Sem isso `run_number` manteria o DEFAULT 1
-- e todo histórico apareceria como "execução 1". SECURITY DEFINER porque a
-- leitura de max(run_number) roda durante o INSERT e não deve depender da RLS
-- de quem insere (a policy de INSERT já validou o pertencimento ao cenário).
CREATE OR REPLACE FUNCTION public.assign_test_scenario_run_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT coalesce(max(run_number), 0) + 1
    INTO NEW.run_number
    FROM public.test_scenario_runs
   WHERE scenario_id = NEW.scenario_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_test_scenario_runs_number ON public.test_scenario_runs;
CREATE TRIGGER trg_test_scenario_runs_number
  BEFORE INSERT ON public.test_scenario_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_test_scenario_run_number();


-- 4. Tabela de resultados de simulação elétrica (curto-circuito, seletividade)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects') THEN
    CREATE TABLE IF NOT EXISTS public.electrical_simulation_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      simulation_type text NOT NULL CHECK (simulation_type IN ('short_circuit', 'selectivity', 'protection_coordination', 'voltage_drop', 'arc_flash', 'harmonics', 'thermal')),
      standard text NOT NULL CHECK (standard IN ('IEC_60909', 'IEC_60947', 'IEEE_1584', 'NBR_5410', 'NBR_14039', 'NR10', 'NR12')),
      input_data jsonb NOT NULL,
      results jsonb NOT NULL,
      warnings jsonb DEFAULT '[]',
      errors jsonb DEFAULT '[]',
      computation_time_ms int,
      software_version text,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.electrical_simulation_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL,
      simulation_type text NOT NULL CHECK (simulation_type IN ('short_circuit', 'selectivity', 'protection_coordination', 'voltage_drop', 'arc_flash', 'harmonics', 'thermal')),
      standard text NOT NULL CHECK (standard IN ('IEC_60909', 'IEC_60947', 'IEEE_1584', 'NBR_5410', 'NBR_14039', 'NR10', 'NR12')),
      input_data jsonb NOT NULL,
      results jsonb NOT NULL,
      warnings jsonb DEFAULT '[]',
      errors jsonb DEFAULT '[]',
      computation_time_ms int,
      software_version text,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'electrical_simulation_results_project_id_fkey') THEN
    ALTER TABLE public.electrical_simulation_results
      ADD CONSTRAINT electrical_simulation_results_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_electrical_sim_project ON public.electrical_simulation_results(project_id);
CREATE INDEX IF NOT EXISTS idx_electrical_sim_type ON public.electrical_simulation_results(simulation_type);

ALTER TABLE public.electrical_simulation_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'projects')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Project members can view electrical sims" ON public.electrical_simulation_results;
    CREATE POLICY "Project members can view electrical sims" ON public.electrical_simulation_results
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = electrical_simulation_results.project_id
          AND tm.user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "Engineers+ can manage electrical sims" ON public.electrical_simulation_results;
    CREATE POLICY "Engineers+ can manage electrical sims" ON public.electrical_simulation_results
      AS PERMISSIVE FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = electrical_simulation_results.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects p
        JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
        WHERE p.id = electrical_simulation_results.project_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin', 'engineer')
      ));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.electrical_simulation_results TO authenticated;


-- 5. Observabilidade de schema via pg_notify (função reutilizável, sem event trigger).
--
-- Um EVENT TRIGGER exige superusuário e o papel `postgres` do Supabase não o é —
-- `CREATE EVENT TRIGGER` abortaria esta migration inteira. Deixamos apenas a
-- função pronta; o trigger pode ser criado manualmente pelo dashboard quando
-- houver um listener consumindo o canal `schema_changed`.
CREATE OR REPLACE FUNCTION public.notify_schema_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('schema_changed', json_build_object(
    'schema', 'public',
    'timestamp', now()
  )::text);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_schema_change() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_schema_change() TO service_role;


-- 6. Tabela de configuração da IA para geração elétrica
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    CREATE TABLE IF NOT EXISTS public.ai_electrical_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      config_key text NOT NULL,
      config_value jsonb NOT NULL,
      description text,
      is_active boolean DEFAULT true,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, config_key)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.ai_electrical_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      config_key text NOT NULL,
      config_value jsonb NOT NULL,
      description text,
      is_active boolean DEFAULT true,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, config_key)
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_electrical_config_tenant_id_fkey') THEN
    ALTER TABLE public.ai_electrical_config
      ADD CONSTRAINT ai_electrical_config_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Seed por tenant existente (idempotente). Pula se tenants ainda não existir:
-- FROM em tabela inexistente abortaria a migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    INSERT INTO public.ai_electrical_config (tenant_id, config_key, config_value, description)
    SELECT t.id, v.config_key, v.config_value, v.description
    FROM public.tenants t
    CROSS JOIN (VALUES
      ('electrical_standards', '["NBR_5410", "NBR_14039", "NR_10", "NR_12", "IEC_60909", "IEC_60947", "IEEE_1584"]'::jsonb, 'Normas elétricas ativas para geração'),
      ('default_voltage_levels', '[220, 380, 440, 690, 13800, 34500, 69000, 138000]'::jsonb, 'Níveis de tensão padrão (V)'),
      ('default_motor_methods', '["DOL", "SOFT", "VFD", "STAR_DELTA"]'::jsonb, 'Métodos de partida de motor padrão'),
      ('cable_types', '[{"type": "PVC", "temp": 70, "ampacity_table": "IEC_60364"}, {"type": "XLPE", "temp": 90, "ampacity_table": "IEC_60364"}, {"type": "EPR", "temp": 90, "ampacity_table": "IEC_60364"}]'::jsonb, 'Tipos de cabos suportados'),
      ('protection_curves', '[{"type": "thermal", "standard": "IEC_60947"}, {"type": "magnetic", "standard": "IEC_60947"}, {"type": "inverse_time", "standard": "IEC_60255"}]'::jsonb, 'Curvas de proteção suportadas'),
      ('ai_generation_limits', '{"max_motors_per_project": 50, "max_cable_runs": 200, "max_protection_devices": 100, "max_iterations": 3}'::jsonb, 'Limites de geração por IA')
    ) AS v(config_key, config_value, description)
    ON CONFLICT (tenant_id, config_key) DO NOTHING;
  END IF;
END $$;

ALTER TABLE public.ai_electrical_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_memberships') THEN
    DROP POLICY IF EXISTS "Tenant admins can manage AI config" ON public.ai_electrical_config;
    CREATE POLICY "Tenant admins can manage AI config" ON public.ai_electrical_config
      AS PERMISSIVE FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = ai_electrical_config.tenant_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = ai_electrical_config.tenant_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      ));

    DROP POLICY IF EXISTS "Tenant members can view AI config" ON public.ai_electrical_config;
    CREATE POLICY "Tenant members can view AI config" ON public.ai_electrical_config
      AS PERMISSIVE FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = ai_electrical_config.tenant_id
          AND tm.user_id = auth.uid()
      ));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ai_electrical_config_updated_at ON public.ai_electrical_config;
CREATE TRIGGER trg_ai_electrical_config_updated_at BEFORE UPDATE ON public.ai_electrical_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_electrical_config TO authenticated;


-- 7. Habilitar realtime para as tabelas críticas.
-- `ALTER PUBLICATION ... ADD TABLE` falha se a tabela já é membro; guardamos
-- com um DO block para tornar a migration idempotente.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'unifilar_ladder_mapping',
    'test_scenarios',
    'test_scenario_runs',
    'electrical_simulation_results',
    'ai_electrical_config'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
