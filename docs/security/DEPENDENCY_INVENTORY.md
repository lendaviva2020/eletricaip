# ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
# INVENTÁRIO COMPLETO DE DEPENDÊNCIAS, WORKSPACES E CAMINHOS DE VULNERABILIDADE (FASE ZERO)

## 1. Metadados da Auditoria e Ambiente

- **Data da Auditoria:** `2026-11-08`
- **Scanner:** `Trivy v0.76.2`
- **Vulnerability DB:** `SchemaVersion: 2`, `UpdatedAt: 2026-11-08T12:51:20Z`, `NextUpdate: 2026-11-09T12:51:20Z`
- **Invariante Industrial de Segurança:** `IS_PHYSICAL_CONTROL_ALLOWED = false` (`isPhysicalControlAllowed: false`)

---

## 2. Mapeamento de Repositórios e Workspaces

| Workspace | Caminho Relativo | Branch / HEAD | Gerenciador Efetivo | Manifests & Lockfiles | Escopo |
|---|---|---|---|---|---|
| **ElétricAi Industrial OS (Principal)** | `eletricaip/` | `main` (`2b9c380`, `origin/main`) | `bun@1.3.3` (`bun 1.4.2`) | `eletricaip/package.json`, `eletricaip/bun.lock` | Aplicação principal Cloud + Edge Daemon + SCADA + Observabilidade + Diagnósticos |
| **ECC Universal Control Plane** | `ECC/` | `main` (`76aaa77d`, `origin/main`) | `yarn@4.9.2` & `npm` | `ECC/package.json`, `ECC/package-lock.json`, `ECC/yarn.lock`, `ECC/.opencode/package-lock.json` | Ferramental auxiliar de automação e plugins |
| **ECC 2.0 Rust TUI** | `ECC/ecc2/` | `main` (`76aaa77d`) | `cargo 1.96.0` | `ECC/ecc2/Cargo.toml`, `ECC/ecc2/Cargo.lock` | CLI / TUI em Rust |
| **Demo & E2E Video Suite** | `eletricai-demo-video/` | Diretório local | `bun` | `eletricai-demo-video/package.json`, `eletricai-demo-video/bun.lock` | Scripts Playwright de captura e homologação visual |

---

## 3. Inventário de Pacotes Vulneráveis, Caminhos de Dependência e Reachability

### 3.1 Grafo Principal (`eletricaip/bun.lock`) — 39 Ocorrências de Produção (78 com Dev-Deps) no Baseline

| Pacote | Versão Anterior | Versão Corrigida | Tipo | Caminho de Dependência (`bun.lock`) | Uso Real no Código & Bundles (`reachability`) |
|---|---:|---:|---|---|---|
| `dompurify` | `3.4.13` | `3.4.17` | Direta (`dependencies`) e Transitiva (`jspdf@4.2.1` optional) | `eletricaip -> dompurify@3.4.17` e `eletricaip -> jspdf@4.2.1 -> dompurify@3.4.17` | **Alcançável (Client/SSR):** Usado em sanitização de HTML/SVG (`src/lib/security/sanitization-guard.ts`, `src/lib/security/safe-html-sanitizer.ts`) e exportação PDF (`jspdf`). |
| `proxy-addr` | `2.0.7` | `2.0.8` | Transitiva (`dependencies`) | `eletricaip -> @lovable.dev/mcp-js -> @modelcontextprotocol/sdk -> express@5.2.1 -> proxy-addr@2.0.8` | **Transitiva (Server/Dev MCP):** Dependência de `express` dentro do SDK MCP; endurecido com `src/lib/security/network-proxy-guard.ts` e `src/lib/security/client-ip-guard.ts`. |
| `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.2` | Transitiva (`dependencies`) | `eletricaip -> @lovable.dev/mcp-js@3.1.0 -> @modelcontextprotocol/sdk@1.32.2` (e optional peer de `@google/genai@2.30.0`) | **Transitiva (MCP Tooling):** Não incluída no bundle estático do navegador; endurecida com `src/lib/security/mcp-security-guard.ts` e `src/lib/security/mcp-session-guard.ts`. |
| `@modelcontextprotocol/server` | `2.0.0` | `2.4.0` | Transitiva (`dependencies`) | `eletricaip -> @lovable.dev/mcp-js@3.1.0 -> @modelcontextprotocol/server@2.4.0` | **Transitiva (MCP Tooling):** Endurecida com isolamento estrito por sessão HTTP e validação de `aud` em `src/lib/security/mcp-security-guard.ts`. |
| `@xmldom/xmldom` | `0.8.13` | `0.8.15` | Transitiva (`dependencies`) | `eletricaip -> pixi.js@8.19.0 -> @xmldom/xmldom@0.8.15` | **Alcançável (Client/Importer):** Usado transitivamente pelo `pixi.js` e validado por `src/lib/security/xml-guard.ts` e `src/lib/importer/security-validator.ts`. |
| `body-parser` | `2.3.0` | `2.4.0` | Transitiva (`dependencies`) | `eletricaip -> @lovable.dev/mcp-js -> @modelcontextprotocol/sdk -> express@5.2.1 -> body-parser@2.4.0` | **Transitiva (Server/MCP):** Endurecida com `src/lib/security/payload-guard.ts` para descompressão segura e limite de payload. |
| `js-yaml` | `4.3.1` | `4.3.2` | Transitiva (`dependencies` & `devDependencies`) | `eletricaip -> @tanstack/start-plugin-core -> xmlbuilder2@4.0.3 -> js-yaml@4.3.2` e `@eslint/eslintrc@3.3.6 -> js-yaml@4.3.2` | **Alcançável (Importer/Build):** Endurecida em `src/lib/importer/adapters/yaml-adapter.ts` (bloqueio de âncoras/aliases/merge keys e limite de profundidade). |
| `ip-address` | `10.7.0` | `10.7.6` | Transitiva (`dependencies`) | `eletricaip -> @modelcontextprotocol/sdk -> express-rate-limit@8.7.0 -> ip-address@10.7.6` | **Alcançável (Server Rate Limit / Proxy Guard):** Usado e validado em `src/lib/security/network-proxy-guard.ts`. |
| `hono` | `4.13.7` | `4.13.17` | Transitiva (`dependencies`) | `eletricaip -> @modelcontextprotocol/sdk -> hono@4.13.17` | **Transitiva (Server/MCP):** Endurecida com normalização anti-double-encoding em `src/lib/security/data-pipeline-guard.ts`. |
| `@hono/node-server` | `1.19.17` | `2.1.6` | Transitiva (`dependencies`) | `eletricaip -> @modelcontextprotocol/sdk@1.32.2 -> @hono/node-server@2.1.6` | **Transitiva (Server/MCP):** Compatível com `@modelcontextprotocol/sdk@1.32.2` (`^1.19.9 \|\| ^2.0.5`); endurecida contra double path decoding (`CVE-2026-118663`). |
| `seroval` | `1.6.8` | `1.6.12` | Transitiva (`dependencies`) | `eletricaip -> @tanstack/react-start -> @tanstack/router-core / @tanstack/start-client-core / @tanstack/start-server-core -> seroval@1.6.12` | **Alcançável (SSR/Client Serialization):** Usada pelo TanStack Start/Router; endurecida com `validateSafeSerializableValue` em `src/lib/security/data-pipeline-guard.ts`. |
| `qs` | `6.16.0` | `6.17.1` | Transitiva (`dependencies`) | `eletricaip -> express@5.2.1 / body-parser@2.4.0 -> qs@6.17.1` | **Transitiva (Server/MCP):** Endurecida com `parseSafeQueryString` em `src/lib/security/data-pipeline-guard.ts`. |
| `source-map-js` | `1.2.1` | `1.2.2` | Transitiva (`dependencies` & `devDependencies`) | `eletricaip -> @tailwindcss/node / postcss / css-tree -> source-map-js@1.2.2` | **Build/Dev Tooling:** Usada no pipeline CSS/build; validada por `validateSafeSourceMap` em `src/lib/security/data-pipeline-guard.ts`. |
| `xlsx` -> `@e965/xlsx` | `0.18.5` | `0.20.3` | Direta (`dependencies`) | `eletricaip -> @e965/xlsx@0.20.3` | **Alcançável (Client/Dossier/Catalog Import):** Substituído `xlsx@0.18.5` (não mantido no npm desde 0.18.5) por `@e965/xlsx@0.20.3` (distribuição npm oficial do SheetJS CE 0.20.3 com semver válido) e encapsulado por `src/lib/security/spreadsheet-guard.ts` e `src/lib/security/safe-xlsx.ts`. |
| `fast-uri` | `3.1.7` | `3.1.9` | Transitiva (`dependencies`) | `eletricaip -> @modelcontextprotocol/sdk -> ajv@8.20.0 -> fast-uri@3.1.9` | **Transitiva (Schema Validation):** Atualizado para `3.1.9` via `overrides`. |
| `vite` | `7.3.6` | `7.3.7` | Direta (`devDependencies`) | `eletricaip -> vite@7.3.7` | **Dev/Build Tooling:** Atualizado para `7.3.7`. |
| `vitest` & `@vitest/mocker` | `4.1.10` | `4.1.12` | Direta (`devDependencies`) | `eletricaip -> vitest@4.1.12 -> @vitest/mocker@4.1.12` | **Test Tooling:** Atualizado para `4.1.12`. |
| `undici` | `7.29.0` | `7.30.2` | Transitiva (`devDependencies`) | `eletricaip -> jsdom@29.1.1 -> undici@7.30.2` | **Test Tooling:** Atualizado para `7.30.2`. |
| `launch-editor` & `shell-quote` | `2.14.1` / `1.10.0` | `2.14.2` / `1.12.0` | Transitiva (`devDependencies`) | `eletricaip -> @tanstack/devtools-bundler-core -> launch-editor@2.14.2 -> shell-quote@1.12.0` | **Dev Tooling:** Atualizados via `overrides`. |
| `nanoid` | `3.3.17` | `3.3.20` | Transitiva (`devDependencies`) | `eletricaip -> postcss -> nanoid@3.3.20` | **Build Tooling:** Atualizado para `3.3.20`. |

---

### 3.2 Workspaces `ECC` e `ECC/ecc2`

| Workspace / Lockfile | Pacote | Versão Anterior | Versão Corrigida | Tipo | Caminho de Dependência |
|---|---|---:|---:|---|---|
| `ECC/package-lock.json` & `ECC/yarn.lock` | `fast-uri` | `3.1.8` | `3.1.9` | Transitiva (`dependencies`) | `ecc-universal -> ajv@8.20.0 -> fast-uri@3.1.9` |
| `ECC/package-lock.json` & `ECC/yarn.lock` | `markdown-it` | `14.3.1` | `14.3.3` | Transitiva (`devDependencies`) | `ecc-universal -> markdownlint-cli@0.49.1 -> markdownlint -> markdown-it@14.3.3` |
| `ECC/package-lock.json` & `ECC/yarn.lock` | `toml` | `4.3.0` | `5.0.1` | Transitiva (`devDependencies`) | `ecc-universal -> markdownlint-cli -> rc-config-loader -> toml@5.0.1` |
| `ECC/package-lock.json` & `ECC/yarn.lock` | `glob` | `13.0.6` | `14.0.2` | Transitiva (`devDependencies`) | `ecc-universal -> markdownlint-cli / c8 -> glob@14.0.2` |
| `ECC/package-lock.json` & `ECC/yarn.lock` | `minimatch` | `10.2.5` / `10.2.6` | `11.0.1` | Transitiva (`devDependencies`) | `ecc-universal -> eslint / glob -> minimatch@11.0.1` |
| `ECC/yarn.lock` | `undici` | `6.29.0` | `6.29.1` | Transitiva (`devDependencies`) | `ecc-universal -> @opencode-ai/plugin -> undici@6.29.1` |
| `ECC/ecc2/Cargo.lock` | `rustls` | `0.23.45` | `0.23.46` | Transitiva (`dependencies`) | `ecc-tui -> ureq@3 -> rustls@0.23.46` (resolve todos os 4 advisories: `GHSA-c8m5-c952-6cm4`, `GHSA-h2v8-394m-p7vv`, `GHSA-vp88-798v-h67f`, `GHSA-w44r-93j7-qv28`) |
