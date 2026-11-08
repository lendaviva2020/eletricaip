# ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
# INVENTÁRIO COMPLETO DE DEPENDÊNCIAS E CADEIA DE SUPRIMENTOS (SUPPLY CHAIN INVENTORY)

**Classificação:** EMERGENCY SECURITY REMEDIATION (P0 — CRITICAL / HIGH)  
**Data:** 2026-11-08  
**Repositório Principal:** `eletricaip/` (Branch `main`, HEAD `2b9c3805507c2346df649c4c9159f070be7546db`)  
**Gerenciador de Pacotes Principal:** `bun@1.3.3` (`eletricaip/bun.lock`)  
**Diretórios Auxiliares no Workspace:** `ECC/` (`yarn@4.9.2` / `npm`), `eletricai-demo-video/` (`bun`)

---

## 1. Mapeamento de Lockfiles no Workspace

| Lockfile | Tipo | Escopo no Workspace | Vulnerabilidades Inicial (`prod`) | Vulnerabilidades Inicial (`--include-dev-deps`) | Vulnerabilidades Pós-Remediação (`prod` e `dev`) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `eletricaip/bun.lock` | `bun` | Aplicação principal ElétricAi Industrial OS (Cloud + Edge Daemon + UI + SSR) | **23** (2 CRITICAL, 21 HIGH) | **30** (2 CRITICAL, 28 HIGH) | **0** |
| `ECC/yarn.lock` | `yarn` | Subdiretório auxiliar de harness/skills (`ecc-universal`) | **2** (2 HIGH) | **6** (6 HIGH) | **0** |
| `ECC/package-lock.json` | `npm` | Lockfile npm complementar do diretório auxiliar `ECC` | **0** | **6** (6 HIGH) | **0** |
| `ECC/.opencode/package-lock.json` | `npm` | Plugin OpenCode interno do diretório auxiliar `ECC` | **0** | **0** | **0** |
| `ECC/ecc2/Cargo.lock` | `cargo` | Binário Rust auxiliar do diretório `ECC` | **0** | **0** | **0** |
| `eletricai-demo-video/bun.lock` | `bun` | Projeto independente de geração de vídeo demonstrativo | **0** | **0** | **0** |

---

## 2. Inventário Detalhado de Pacotes Vulneráveis Remediados em `eletricaip/bun.lock`

### 2.1 Dependências de Produção (Diretas e Transitivas)

| Pacote | Classificação | Caminho de Dependência (Origem) | Versão Anterior | Versão Remediada | Advisories / CVEs Corrigidos |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `dompurify` | Direta (`dependencies`) & Transitiva (`jspdf`) | `eletricaip/package.json` (`dompurify`), `jspdf@4.2.1` | `3.4.13` | `3.4.17` | `GHSA-cg2g-xh64-v4q7` (**CRITICAL**), `GHSA-mrv2-3pqr-j5jr` (**HIGH**) |
| `proxy-addr` | Transitiva (`dependencies`) | `@lovable.dev/mcp-js@3.1.0` → `@modelcontextprotocol/sdk` → `express@5.2.1` → `proxy-addr` | `2.0.7` | `2.0.8` | `CVE-2026-90711` (**CRITICAL**) |
| `@modelcontextprotocol/sdk` | Transitiva (`dependencies`) | `@lovable.dev/mcp-js@3.1.0` → `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.2` | `CVE-2026-104850` (**HIGH**), `CVE-2026-111767` (**HIGH**), `CVE-2026-111768` (**HIGH**), `GHSA-f897-62hf-6gxq` (**HIGH**) |
| `@modelcontextprotocol/server` | Transitiva (`dependencies`) | `@lovable.dev/mcp-js@3.1.0` → `@modelcontextprotocol/server` | `2.0.0` | `2.4.0` | `CVE-2026-111768` (**HIGH**), `CVE-2026-111770` (**HIGH**), `GHSA-f897-62hf-6gxq` (**HIGH**) |
| `@xmldom/xmldom` | Transitiva (`dependencies`) | `pixi.js@8.19.0` → `@xmldom/xmldom` | `0.8.13` | `0.8.15` | `CVE-2026-83605`, `CVE-2026-83607`, `CVE-2026-83608`, `CVE-2026-83613`, `CVE-2026-83614`, `CVE-2026-83615`, `CVE-2026-83616`, `CVE-2026-83619` (8 **HIGH**) |
| `body-parser` | Transitiva (`dependencies`) | `@lovable.dev/mcp-js@3.1.0` → `@modelcontextprotocol/sdk` → `express@5.2.1` → `body-parser` | `2.3.0` | `2.4.0` | `CVE-2026-111181` (**HIGH**) |
| `js-yaml` | Transitiva (`dependencies`) | `@tanstack/start-plugin-core@1.171.49` → `xmlbuilder2@4.0.3` → `js-yaml` | `4.3.1` | `4.3.2` | `CVE-2026-84375` (**HIGH**) |
| `source-map-js` | Transitiva (`dependencies`) | `@tailwindcss/node@4.3.3`, `postcss@8.5.25`, `css-tree@3.2.1` → `source-map-js` | `1.2.1` | `1.2.2` | `CVE-2026-93749` (**HIGH**) |
| `xlsx` → `@e965/xlsx` | Direta (`dependencies`) | `eletricaip/package.json` (`@e965/xlsx` + wrapper `src/lib/security/safe-xlsx.ts`) | `0.18.5` | `0.20.3` | `CVE-2023-30533` (**HIGH**), `CVE-2024-22363` (**HIGH**) |

### 2.2 Dependências de Desenvolvimento e Build (`devDependencies` / Transitivas de Build)

| Pacote | Classificação | Caminho de Dependência (Origem) | Versão Anterior | Versão Remediada | Advisories / CVEs Corrigidos |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `vite` | Direta (`devDependencies`) | `eletricaip/package.json` (`vite`) | `7.3.6` | `7.3.7` | `CVE-2026-109128` (**HIGH**), `CVE-2026-109130` (**HIGH**) |
| `undici` | Transitiva (`devDependencies`) | `jsdom@29.1.1` → `undici` | `7.29.0` | `7.30.2` | `CVE-2026-109383` (**HIGH**), `CVE-2026-109869` (**HIGH**), `CVE-2026-87018` (**HIGH**) |
| `nanoid` | Transitiva (`devDependencies`) | `postcss@8.5.25` → `nanoid` | `3.3.17` | `3.3.20` | `CVE-2026-110212` (**HIGH**) |
| `launch-editor` | Transitiva (`devDependencies`) | `@tanstack/devtools-bundler-core@0.1.1` → `launch-editor` | `2.14.1` | `2.14.2` | `CVE-2026-104856` (**HIGH**) |
| `shell-quote` | Transitiva (`devDependencies`) | `launch-editor` → `shell-quote` | `1.10.0` | `1.12.0` | `CVE-2026-86431` (**HIGH**) |
| `brace-expansion` | Transitiva (`devDependencies`) | `minimatch@3.1.5` (`1.1.x`) e `@typescript-eslint/typescript-estree` → `minimatch@10.2.6` (`5.0.x`) | `1.1.18` / `5.0.9` | `1.1.21` / `5.0.12` | `CVE-2026-89049` (**HIGH**) |

---

## 3. Inventário de Pacotes Remediados no Segundo Lockfile (`ECC/yarn.lock` e `ECC/package-lock.json`)

| Pacote | Classificação em `ECC` | Caminho de Dependência | Versão Anterior | Versão Remediada | Advisories / CVEs Corrigidos |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `markdown-it` | Transitiva de `markdownlint-cli@0.49.1` (fixada em `overrides`/`resolutions`) | `ECC/package.json` → `markdownlint-cli` → `markdown-it` | `14.3.1` | `14.3.3` | `CVE-2026-111758` (**HIGH**), `CVE-2026-111759` (**HIGH**) |
| `toml` | Transitiva de `@opencode-ai/plugin` → `effect` | `ECC/package.json` → `@opencode-ai/plugin` → `effect` → `toml` | `4.3.0` | `5.0.1` | `CVE-2026-114141`, `CVE-2026-114142`, `CVE-2026-114143`, `CVE-2026-114144` (4 **HIGH**) |
| `undici` | Transitiva de `ECC/yarn.lock` | `overrides` / `resolutions` | `6.29.0` | `6.29.1` | `CVE-2026-109383`, `CVE-2026-109869`, `CVE-2026-87018` (3 **HIGH**) |
