# 13 — Registro de Dívida Técnica

| ID | Prioridade | Item | Evidência | Impacto |
|---|---|---|---|---|
| P1-TYPE-036 | P1 | 25 erros de typecheck; a branch reprova no CI | doc 11 | Contratos de IA quebrados e ocultos |
| P2-LINT-040 | P2 | 29 erros de lint e 7 arquivos fora do prettier | doc 11 | CI vermelho |
| P2-TYPE-041 | P2 | 330 ocorrências de `any` em código de produção (grep `: any`, `as any`, `<any>`), por exemplo `requireTenantAdmin(supabase: any, …)` em `tenants.functions.ts:241` | grep | Perda de tipagem em fronteiras de dados |
| P2-ARCH-001 | P2 | `IS_PHYSICAL_CONTROL_ALLOWED` duplicado em 6 módulos | doc 03 | Risco de divergência da invariante |
| P2-ARCH-018 | P2 | Dois webhooks Stripe | doc 03 | Lógica divergente |
| P2-ARCH-037 | P2 | Stores paralelas | doc 03 | SSOT incerta |
| P2-DB-007 | P2 | Policies legadas sobrepostas | doc 08 | Semântica RLS imprevisível |
| P3-CLEAN-039 | P3 | `types.ts` gerado ainda referencia tabelas do Digital Twin | grep (5 refs) | Tipos desatualizados (regenerar) |
| P3-SEC-003 | P3 | Project ref e anon key hardcoded | `env.ts:21-25` | Acoplamento do build a um projeto |
| INFO | — | Só 2 marcadores TODO/FIXME/HACK em `src/` (não test) | grep | Os marcadores não refletem o estado real; incompletudes não são sinalizadas no código |
| INFO | — | `Math.random` só em ids, decoração (`neural-bg`) e jitter; motores de simulação declaram determinismo | grep | — |
| P3-CFG-042 | P3 | `vite.config.ts:11` comenta o `mcpPlugin` "para corrigir build no Windows" | código | Diferença entre o ambiente dev e o de produção |
