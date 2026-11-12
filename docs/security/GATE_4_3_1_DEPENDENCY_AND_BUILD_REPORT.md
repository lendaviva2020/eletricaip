# GATE 4.3.1 — AUDITORIA DE DEPENDÊNCIAS, BUILD DE PRODUÇÃO & CI/CD

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`

---

## 1. Eliminação da Vulnerabilidade HIGH do Zod (`GHSA-mrhx-c7xc-m3w5`)

- **Antes (Gate 4.3):** `bun audit` apontava **3 vulnerabilidades** (`1` HIGH: `zod@3.25.76` / `4.6.4` `<4.6.6` — DoS por exaustão de memória ao validar coleções restritas de tamanho elevado; `1` MODERATE: `minimatch@3.1.5, 10.2.6` em cadeia `eslint`; `1` LOW: `esbuild@0.27.7, 0.28.1` em servidor de dev no Windows).
- **Ação Realizada:**
  1. Atualizada dependência direta `"zod": "^4.6.6"` + `"overrides": { "zod": "^4.6.6" }` em [`package.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/package.json), instalando **`zod@4.6.7`** (com atualização determinística de [`bun.lock`](file:///c:/Users/98911/Desktop/eletric/eletricaip/bun.lock)).
  2. Ajustadas assinaturas Zod 4 em [`property-schemas.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/editor/property-schemas.ts), [`right-property-panel.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/components/editor/right-property-panel.tsx), [`fbd/engine/model.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/fbd/engine/model.ts), [`observability/types.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/observability/types.ts), [`projects.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/projects.functions.ts), [`scada.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/scada/scada.functions.ts), [`studio/canonical/types.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/studio/canonical/types.ts), [`diagnostics/contract.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/diagnostics/contract.ts), [`scada.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/scada.tsx) e [`workspace.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/workspace.tsx), preservando compatibilidade integral de UUIDs sintéticos PostgreSQL/demo (`z.guid()`) e `Record<string, ...>` (`z.record(z.string(), ...)`).
- **Depois (Pós-Gate 4.3.1):**
  - `bun audit --audit-level=high`: **0 vulnerabilidades (`checked 910 packages, 2 below --audit-level=high`)**.
  - `trivy fs --scanners vuln,secret,misconfig --severity "CRITICAL,HIGH" . --quiet`: **0 vulnerabilidades CRITICAL/HIGH**, **0 segredos**, **0 misconfigs**.
  - SBOM CycloneDX atualizado gerado em [`docs/security/GATE_4_3_1_SBOM.cdx.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/docs/security/GATE_4_3_1_SBOM.cdx.json).

---

## 2. Separação Client/Server no Build Vite/Nitro & Memória

- Durante a auditoria de build com `NODE_OPTIONS="--max-old-space-size=4096"`, foi detectado que exportar funções auxiliares diretamente em `.functions.ts` fazia o Rollup incluir `fleet-audit.ts` / `node:crypto` e módulos `.server.ts` na transformação client.
- **Correção estrutural:** toda lógica Node/SQLite/Ed25519 foi isolada exclusivamente em `modbus-handlers.server.ts`, `opcua-handlers.server.ts` e `fleet-handlers.server.ts`, carregados dinamicamente dentro de `.handler(...)` nos arquivos `.functions.ts`, e `fleet-audit.ts` passou a usar `sha256Hex` isomórfico.
- **Resultado do Build de Produção (`vite build`):**
  - Build concluído com sucesso em **`47.41s`** gerando `.vercel/output/nitro.json`.
  - Varredura integral de `.vercel/output/static/**` confirmou **`279` arquivos estáticos**, **`0` arquivos `.map`**, e **`0` ocorrências** de segredos ou built-ins Node (`DatabaseSync`, `fleet-persistent-store`, `node:sqlite`, `SERVICE_ROLE_KEY`, etc.).

---

## 3. Hardening do Pipeline CI ([`.github/workflows/ci.yml`](file:///c:/Users/98911/Desktop/eletric/eletricaip/.github/workflows/ci.yml))

1. Gatilhos `push` e `pull_request` expandidos para incluir `"gate-*"` além de `main` e `develop`.
2. Adicionada verificação automática proibindo `node:dns` / `node:net` em [`modbus-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/modbus-server.functions.ts) e [`opcua-server.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/opcua-server.functions.ts), bem como verificação de `ELETRICAI_RELEASE_PRIVATE_KEY` no bundle estático.
3. Definido `NODE_OPTIONS: "--max-old-space-size=4096"` na etapa `bun run build`.
4. Adicionado job `e2e-browser` para executar `tests/e2e/05-security-barrier-and-fleet.spec.ts` com Chromium em CI.
5. `deploy-supabase` e `deploy-vercel` continuam estritamente condicionados a `github.ref == 'refs/heads/main'` e agora dependem de `[quality, e2e-browser]`.
