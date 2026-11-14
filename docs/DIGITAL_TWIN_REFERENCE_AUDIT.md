# DIGITAL TWIN REFERENCE AUDIT REPORT

**Data:** 2026-11-14  
**Comando Executado:**
```powershell
git grep -in "digital[-_ ]twin|digitalTwin|LazyTwin3DViewer|twin_model_path|twin_hotspots" -- src/ tests/ package.json vite.config.ts supabase/
git grep -in "what-if|twin-3d|twin-canvas|twinTelemetry|digitalTwin|@react-three|three/examples" -- src/ package.json vite.config.ts
```

---

## 1. Matriz de Auditoria por Camada

| Camada / Diretório | Resultado da Varredura | Status |
| :--- | :--- | :--- |
| **`src/routes/` e `src/routeTree.gen.ts`** | `0` ocorrências (`digital-twin.tsx` removido, roteador regenerado). | **LIMPO** |
| **`src/components/` e `src/hooks/`** | `0` ocorrências (componentes 3D, painéis What-If, atalhos e sidebar removidos). | **LIMPO** |
| **`src/lib/` (stores, server functions, seeding)** | `0` ocorrências de código Digital Twin. Schemas PLC em `src/lib/studio/` utilizam exclusivamente `ControllerShadow*`. | **LIMPO** |
| **`tests/e2e/` e `src/__tests__/`** | `0` ocorrências (testes unitários/E2E limpos e atualizados). | **LIMPO** |
| **`package.json` & `vite.config.ts`** | `0` ocorrências (`three`, `@types/three`, `@react-three/fiber`, `@react-three/drei` e chunk `vendor-3d` removidos). | **LIMPO** |
| **`src/integrations/supabase/types.ts`** | 5 linhas residuais de tipos gerados automaticamente do PostgreSQL (`twin_model_path` nas linhas 1995/2009/2023; `twin_hotspots` nas linhas 2741/2801). | **RETIDO INTENCIONALMENTE ATÉ APLICAÇÃO DA MIGRAÇÃO REMOTA** |
| **`supabase/migrations/`** | Histórico imutável de migrações anteriores (`20260515171049_*`, `20261012090000_*`, `20261014201000_*`, `20261112140000_*`) + nova migração reversível [`20261114150000_drop_digital_twin_module.sql`](supabase/migrations/20261114150000_drop_digital_twin_module.sql). | **GOVERNANÇA HISTÓRICA + MIGRAÇÃO PRONTA** |

---

## 2. Conclusão de Auditoria

Não existe mais nenhuma rota ativa, componente React, estado Zustand, dependência npm, chunk de build ou chamada de servidor vinculada ao módulo Digital Twin na aplicação cliente ou servidor Node/Nitro. As únicas referências existentes permanecem estritamente restritas a histórico imutável de migrações SQL, à nova migração reversível de limpeza e à definição gerada [`src/integrations/supabase/types.ts`](src/integrations/supabase/types.ts) aguardando a execução controlada da migration no ambiente Supabase alvo.
