-- tag_samples.id (bigint NOT NULL) não tinha valor automático: TODA gravação
-- do histórico falhava com 23502 (visto nos logs de produção). Só aditivo.
CREATE SEQUENCE IF NOT EXISTS public.tag_samples_id_seq AS bigint OWNED BY public.tag_samples.id;
SELECT setval(
  'public.tag_samples_id_seq',
  GREATEST(COALESCE((SELECT max(id) FROM public.tag_samples), 0), 1),
  (SELECT max(id) IS NOT NULL FROM public.tag_samples)
);
ALTER TABLE public.tag_samples ALTER COLUMN id SET DEFAULT nextval('public.tag_samples_id_seq');
GRANT USAGE, SELECT ON SEQUENCE public.tag_samples_id_seq TO authenticated, service_role;
