-- SCADA Fase 3 (ISA-18.2): racionalização, prateleira (shelving) com prazo e
-- fora de serviço, por PONTO de alarme (categoria + tag) de um projeto.
--
-- Escrita somente pelo servidor (service role) depois de conferir papel e
-- gravar a auditoria; o cliente só lê (membro da empresa do projeto).
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.alarm_point_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  point_key text NOT NULL CHECK (char_length(point_key) BETWEEN 3 AND 200),
  tag_name text NOT NULL CHECK (char_length(tag_name) BETWEEN 1 AND 128),
  cause text CHECK (cause IS NULL OR char_length(cause) <= 1000),
  consequence text CHECK (consequence IS NULL OR char_length(consequence) <= 1000),
  corrective_action text CHECK (corrective_action IS NULL OR char_length(corrective_action) <= 1000),
  response_time_min integer CHECK (response_time_min IS NULL OR response_time_min BETWEEN 1 AND 1440),
  rationalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rationalized_at timestamptz,
  shelved_until timestamptz,
  shelved_at timestamptz,
  shelved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shelve_reason text CHECK (shelve_reason IS NULL OR char_length(shelve_reason) <= 500),
  out_of_service boolean NOT NULL DEFAULT false,
  oos_at timestamptz,
  oos_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  oos_reason text CHECK (oos_reason IS NULL OR char_length(oos_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alarm_point_settings_project_point_key UNIQUE (project_id, point_key),
  -- Prateleira sempre tem prazo e motivo; fora de serviço sempre tem motivo.
  CONSTRAINT alarm_point_settings_shelve_complete
    CHECK (shelved_until IS NULL OR (shelve_reason IS NOT NULL AND shelved_at IS NOT NULL)),
  CONSTRAINT alarm_point_settings_oos_complete
    CHECK (NOT out_of_service OR (oos_reason IS NOT NULL AND oos_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS alarm_point_settings_shelved_by_idx
  ON public.alarm_point_settings (shelved_by);
CREATE INDEX IF NOT EXISTS alarm_point_settings_oos_by_idx
  ON public.alarm_point_settings (oos_by);
CREATE INDEX IF NOT EXISTS alarm_point_settings_rationalized_by_idx
  ON public.alarm_point_settings (rationalized_by);

ALTER TABLE public.alarm_point_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alarm_point_settings_select_members" ON public.alarm_point_settings;
CREATE POLICY "alarm_point_settings_select_members"
  ON public.alarm_point_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.tenant_memberships tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = alarm_point_settings.project_id
        AND tm.user_id = (SELECT auth.uid())
    )
    OR public.is_platform_admin()
  );

-- Sem policy de INSERT/UPDATE/DELETE: cliente não escreve direto.
REVOKE INSERT, UPDATE, DELETE ON public.alarm_point_settings FROM authenticated;
REVOKE ALL ON public.alarm_point_settings FROM anon;
GRANT SELECT ON public.alarm_point_settings TO authenticated;
GRANT ALL ON public.alarm_point_settings TO service_role;

-- Indicadores ISA-18.2 leem alarm_history por projeto e período.
CREATE INDEX IF NOT EXISTS alarm_history_project_triggered_idx
  ON public.alarm_history (project_id, triggered_at DESC);
