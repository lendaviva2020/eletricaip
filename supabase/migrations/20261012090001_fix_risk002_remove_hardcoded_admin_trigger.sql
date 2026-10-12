-- RISK-002: remover o grant automático de platform admin por e-mail hardcoded.
--
-- Contexto: a migration 20260518170000 criou a função SECURITY DEFINER
-- public.sync_known_platform_admin_email() e um trigger em auth.users que
-- re-concede role='admin' em public.platform_admins para um e-mail pessoal
-- fixo em todo INSERT/UPDATE de e-mail. Isso torna o privilégio permanente
-- (mesmo removido manualmente, o trigger o recria) e expõe PII no repo.
--
-- Esta migration remove o trigger e a função. As linhas já existentes em
-- public.platform_admins são PRESERVADAS de propósito para não derrubar o
-- acesso administrativo legítimo.
--
-- Ação manual obrigatória após aplicar (auditoria de admins):
--   SELECT user_id, role, created_at, updated_at FROM public.platform_admins;
-- Remover linhas desconhecidas e gerenciar admins apenas via DML auditada
-- em public.platform_admins, sem triggers automáticos.

DROP TRIGGER IF EXISTS sync_known_platform_admin_email_on_auth_users ON auth.users;
DROP FUNCTION IF EXISTS public.sync_known_platform_admin_email();
