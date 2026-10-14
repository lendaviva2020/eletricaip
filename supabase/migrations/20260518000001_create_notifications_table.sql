-- Idempotente: tenants pode ainda não existir (DDL central fora do repo).
-- Cria com a FK quando o alvo existe, sem a FK caso contrário, e tenta
-- anexar a FK sempre que ambos existirem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    CREATE TABLE IF NOT EXISTS public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('simulation_complete','credits_low','team_invite','alarm','export_ready','info')),
      title text NOT NULL,
      message text NOT NULL,
      data jsonb DEFAULT '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type IN ('simulation_complete','credits_low','team_invite','alarm','export_ready','info')),
      title text NOT NULL,
      message text NOT NULL,
      data jsonb DEFAULT '{}'::jsonb,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_tenant_id_fkey') THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

create index if not exists idx_notifications_tenant_user
  on public.notifications(tenant_id, user_id, created_at desc);

alter table public.notifications enable row level security;

-- Policies (idempotente: pula se profiles ainda não existir).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "Users can view their tenant notifications" ON public.notifications;
    EXECUTE $pol$
      CREATE POLICY "Users can view their tenant notifications"
        ON public.notifications FOR SELECT
        USING (
          tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
          )
        );
    $pol$;

    DROP POLICY IF EXISTS "Users can insert notifications for their tenant" ON public.notifications;
    EXECUTE $pol$
      CREATE POLICY "Users can insert notifications for their tenant"
        ON public.notifications FOR INSERT
        WITH CHECK (
          tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
          )
        );
    $pol$;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
