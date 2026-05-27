CREATE TABLE IF NOT EXISTS public.runtime_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  channel TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runtime_logs_user_created ON public.runtime_logs(user_id, created_at DESC);

ALTER TABLE public.runtime_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own runtime_logs" ON public.runtime_logs;
CREATE POLICY "Users view own runtime_logs" ON public.runtime_logs
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own runtime_logs" ON public.runtime_logs;
CREATE POLICY "Users insert own runtime_logs" ON public.runtime_logs
FOR INSERT WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.runtime_logs;