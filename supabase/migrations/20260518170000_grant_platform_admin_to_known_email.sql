-- [NEUTRALIZADA em 2026-11-15]
-- Esta migration concedia platform admin a um e-mail pessoal fixo e instalava um
-- trigger em auth.users para re-aplicar o grant (RISK-002). O trigger e a função
-- foram removidos por 20261012090001_fix_risk002_remove_hardcoded_admin_trigger.sql
-- e o e-mail foi retirado do repositório. Gestão de admins: tabela
-- public.platform_admins via procedimento auditado (sem identidade hardcoded).
-- Mantida como no-op para preservar a numeração do histórico de migrations.
SELECT 1;
