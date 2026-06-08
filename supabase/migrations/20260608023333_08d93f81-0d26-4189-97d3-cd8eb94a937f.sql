ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS invited_name text,
  ADD COLUMN IF NOT EXISTS invited_sector text;