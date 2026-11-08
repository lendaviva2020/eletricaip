# ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2.1
# INDEPENDENT CVE & ADVISORY RECONCILIATION REPORT

- **Data da Reconciliação:** `2026-11-08`
- **Scanner de Referência:** `Trivy v0.76.2` (`Vulnerability DB v2`, `UpdatedAt: 2026-11-08 12:51:20 UTC`)
- **Evidência Primária Baseline (Produção — 54 ocorrências):** `trivy-head-baseline.json` (Commit `eletricaip@2b9c3805507c2346df649c4c9159f070be7546db` / `ECC@76aaa77dcf5f7b405a61f61f658246bc2e8065dc`)
- **Evidência Primária Baseline (c/ Dev-Deps — 114 ocorrências):** `trivy-head-baseline-dev.json`
- **Evidência Primária Pós-Remediação (Atual — 0 ocorrências):** [`docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json`](file:///c:/Users/98911/Desktop/eletric/docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json) (`SHA-256: FB62FC4314E9EFE222B7471C6FEB1327755A7F186A8A046E771A64FEF894AFC8`)

---

## 1. Investigação Forense Obrigatória das 5 CVEs Questionadas (Seção 3)

A auditoria independente cruzou os 5 identificadores listados no resumo textual pós-compactação (`GATE3_8_2_SECURITY_REMEDIATION_ACCEPTANCE.md`) contra o **NVD (NIST)**, **CVE.org**, **GitHub Advisory Database (GHSA)** e a **Vulnerability DB v2 do Trivy**:

| Identificador Investigado | Associação Incorreta no Resumo TXT | Produto Real Afetado (NVD / CVE.org / GHSA) | Severidade Real & Descrição Oficial (NVD / CVE.org) | Advisories Reais da Biblioteca no Workspace (Trivy DB v2) |
| :--- | :--- | :--- | :--- | :--- |
| **`CVE-2026-108915`** | `@modelcontextprotocol/sdk` (`1.26.0` -> `1.32.2`) | **Edimax BR-6208AC** (Firmware `1.32`) | **CRITICAL (CVSS 9.9):** Stack-based buffer overflow no endpoint `/goform/formWlanMP` via manipulação do argumento `ateBW` em roteador doméstico Edimax. **Nenhuma relação com Node.js ou MCP SDK.** | Em `@modelcontextprotocol/sdk` (`1.28.0` -> `1.32.2`): `CVE-2026-104850` (HIGH), `CVE-2026-111767` (HIGH), `CVE-2026-111768` (HIGH), `GHSA-f897-62hf-6gxq` (HIGH), `CVE-2026-111769` (MEDIUM), `CVE-2026-111771` (MEDIUM). |
| **`CVE-2026-84509`** | `dompurify` (`3.3.1` -> `3.4.17`) | **Apple macOS** (SMB Client — corrigido no macOS Sequoia `15.8`, Tahoe `26.7`, Golden Gate `27`) | **MEDIUM (CVSS 6.5):** Out-of-bounds read no cliente SMB do macOS ao conectar a um servidor SMB malicioso, causando encerramento inesperado do sistema. **Nenhuma relação com DOMPurify.** | Em `dompurify` (`3.4.13` -> `3.4.17`): `GHSA-cg2g-xh64-v4q7` (CRITICAL), `GHSA-mrv2-3pqr-j5jr` (HIGH), `GHSA-6688-9rhm-gjv2` (LOW), `GHSA-c6gr-qvv4-5v3f` (LOW), `GHSA-p98j-92pf-mc4p` (LOW). |
| **`CVE-2026-106441`** | `seroval` (`1.4.0` -> `1.6.12`) | **Hydra (`hydra-core` / `hydra-ecosystem/hydra`)** Python (`< 1.3.6`, `< 1.4.0`) | **HIGH (CVSS 7.8):** Code Injection (CWE-94) ao repassar configuração de logging Python diretamente para `logging.config.dictConfig()` sem validar a política de targets do Hydra. **Nenhuma relação com `seroval`.** | Em `seroval` (`1.6.8` -> `1.7.10`): `CVE-2026-116582` (MEDIUM — XSS via serialização imprópria de `RegExp`) e `CVE-2026-116583` (MEDIUM — execução arbitrária via propriedades `constructor` de `TypedArray`). |
| **`CVE-2026-106442`** | `seroval` (`1.4.0` -> `1.6.12`) | **Hydra (`hydra-core` / `hydra-ecosystem/hydra`)** Python (`< 1.3.6`, `< 1.4.0`) | **HIGH:** Bypass da blacklist de `_target_` no framework Python Hydra permitindo instanciação de classes arbitrárias. **Nenhuma relação com `seroval`.** | Em `seroval` (`1.6.8` -> `1.7.10`): `CVE-2026-116582` (MEDIUM) e `CVE-2026-116583` (MEDIUM). |
| **`CVE-2026-123501`** | `toml` (`3.0.0` -> `5.0.1`) | **Vikunja (`go-vikunja/vikunja`)** (`< 2.7.1`) | **HIGH (CVSS 7.1):** Denial of Service por exaustão de memória na decodificação irrestrita de imagens na aplicação Go Vikunja. **Nenhuma relação com o pacote npm `toml`.** | Em `toml` (`4.3.0` -> `5.0.1`): `CVE-2026-114141` (HIGH), `CVE-2026-114142` (HIGH), `CVE-2026-114143` (HIGH), `CVE-2026-114144` (HIGH). |

---

## 2. Expurgo Completo de Associações Incorretas Entre Relatórios

### 2.1 Causa Raiz da Divergência Entre os Relatórios
1. **Relatório no Repositório ([`GATE_3_8_2_SECURITY_REMEDIATION.md`](file:///c:/Users/98911/Desktop/eletric/eletricaip/docs/security/GATE_3_8_2_SECURITY_REMEDIATION.md)):** Foi construído antes da compactação de contexto diretamente sobre o JSON de saída do Trivy (`trivy-head-baseline.json`). Todos os 54 identificadores de produção neste arquivo correspondem **100%** ao scanner real.
2. **Resumo Textual no Chat / Artefato `GATE3_8_2_SECURITY_REMEDIATION_ACCEPTANCE.md`:** Foi gerado **após** a compactação de contexto da conversa (`11:44:37`), quando o resumo de contexto continha apenas os totais (`39 + 4 + 4 + 7 = 54`) e os nomes dos pacotes, sem a lista de CVEs. Em vez de reler `GATE_3_8_2_SECURITY_REMEDIATION.md`, o resumo textual preencheu a tabela com identificadores CVE e versões anteriores sintéticas/incorretas.
3. **Relatório Preliminar [`GATE3_8_2_DEPENDENCY_INVENTORY.md`](file:///c:/Users/98911/Desktop/eletric/eletricaip/docs/security/GATE3_8_2_DEPENDENCY_INVENTORY.md):** Na seção 2.1 (produção) usou os IDs corretos (porém filtrados apenas para `HIGH/CRITICAL`), mas na seção 2.2 (`devDependencies`, linhas 45 e 47–50) listou 6 CVEs incorretas (`CVE-2026-109128`, `CVE-2026-109130`, `CVE-2026-110212`, `CVE-2026-104856`, `CVE-2026-86431`, `CVE-2026-89049`).

### 2.2 Lista de Identificadores Expurgados (Proibidos de Uso Futuro)
- **Expurgados do resumo pós-compactação (`GATE3_8_2_SECURITY_REMEDIATION_ACCEPTANCE.md`):**
  - Falsamente atribuídos a `dompurify`: `CVE-2026-80085`, `CVE-2026-84509`, `CVE-2026-103978`, `CVE-2026-115555`, `CVE-2026-119712`, `CVE-2026-66200`, `CVE-2026-73301`, `CVE-2026-98311`, `CVE-2026-103979`, `CVE-2026-73302` (os reais são `GHSA-cg2g-xh64-v4q7`, `GHSA-mrv2-3pqr-j5jr`, `GHSA-6688-9rhm-gjv2`, `GHSA-c6gr-qvv4-5v3f`, `GHSA-p98j-92pf-mc4p`).
  - Falsamente atribuídos a `@modelcontextprotocol/sdk`: `CVE-2026-108915`, `CVE-2026-118219`, `CVE-2026-108916` (os reais são `CVE-2026-104850`, `CVE-2026-111767`, `CVE-2026-111768`, `GHSA-f897-62hf-6gxq`, `CVE-2026-111769`, `CVE-2026-111771`).
  - Falsamente atribuídos a `seroval`: `CVE-2026-106441`, `CVE-2026-106442` (os reais são `CVE-2026-116582`, `CVE-2026-116583`).
  - Falsamente atribuídos a `@hono/node-server` e `hono`: `CVE-2026-114308`, `CVE-2026-114309`, `CVE-2026-117408`, `CVE-2026-117409`, `CVE-2026-117410` (os reais são `CVE-2026-118663` em `@hono/node-server` e `CVE-2026-111757` em `hono`).
  - Falsamente atribuídos a `@xmldom/xmldom`: `CVE-2026-123109`, `CVE-2026-100231`, `CVE-2026-101500` (os reais são `CVE-2026-83605`, `83607`, `83608`, `83610`, `83611`, `83613`, `83614`, `83615`, `83616`, `83619`).
  - Falsamente atribuídos a `qs`: `CVE-2026-124400`, `GHSA-7r86-cg39-jmmj` (o real no baseline `qs@6.16.0` é `CVE-2026-110816`).
  - Falsamente atribuídos a `source-map-js`, `js-yaml`, `body-parser`, `fast-uri`, `undici`, `nanoid`: `CVE-2026-99102`, `CVE-2026-104888`, `CVE-2026-116002`, `CVE-2026-120801`, `CVE-2026-120802`, `CVE-2026-121900`, `CVE-2026-121901`, `CVE-2026-125500` (os reais são `CVE-2026-93749`, `CVE-2026-84375`, `CVE-2026-111181`, `CVE-2026-110180`/`110306`/`110095`/`110725`/`86472`, `CVE-2026-109383` et al., `CVE-2026-67213`).
  - Falsamente atribuídos a `rustls`, `markdown-it`, `toml`: `CVE-2026-119801..119804`, `CVE-2026-122001..122002`, `CVE-2026-123501` (os reais são `GHSA-c8m5-c952-6cm4`, `GHSA-h2v8-394m-p7vv`, `GHSA-vp88-798v-h67f`, `GHSA-w44r-93j7-qv28` em `rustls`; `CVE-2026-111758`, `111759`, `111766` em `markdown-it`; `CVE-2026-114141..114144` em `toml`).
- **Expurgados da sub-tabela 2.2 de `GATE3_8_2_DEPENDENCY_INVENTORY.md`:**
  - `CVE-2026-109128`, `CVE-2026-109130` (`vite` — os reais são `CVE-2026-112942..112946`), `CVE-2026-110212` (`nanoid` — o real é `CVE-2026-67213`), `CVE-2026-104856` (`launch-editor` — os reais são `CVE-2026-112942..112944`), `CVE-2026-86431` (`shell-quote` — o real é `CVE-2026-102422`), `CVE-2026-89049` (`brace-expansion` — os reais são `CVE-2026-102276..102278`).

---

## 3. Inventário Reconstruído das 54 Vulnerabilidades de Produção (Extraído Diretamente do Scanner e Advisories Oficiais)

Todas as 54 ocorrências abaixo foram extraídas sem edição manual de `trivy-head-baseline.json` (gerado por `trivy fs --scanners vuln` sobre os lockfiles de `eletricaip@2b9c380` e `ECC@76aaa77d`) e verificadas com **`0` ocorrências** em [`GATE_3_8_2_1_TRIVY_EVIDENCE.json`](file:///c:/Users/98911/Desktop/eletric/docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json):

| # | Target (Lockfile) | VulnerabilityID | Pacote | Versão Instalada (Baseline) | Versão Corrigida (Advisory) | Versão Instalada Atual (Lockfile) | Severidade | Título Oficial do Advisory (NVD / GHSA / Trivy DB v2) |
|---:|---|---|---|---:|---:|---:|---|---|
| 1 | `ECC/ecc2/Cargo.lock` | `GHSA-c8m5-c952-6cm4` | `rustls` | `0.23.45` | `0.23.46, 0.24.0-dev.2` | `0.23.46` | `MEDIUM` | Rustls: Session Debug formatting exposes TLS master secrets and resumption PSKs |
| 2 | `ECC/ecc2/Cargo.lock` | `GHSA-h2v8-394m-p7vv` | `rustls` | `0.23.45` | `0.23.46, 0.24.0-dev.2` | `0.23.46` | `LOW` | Rustls: Brotli certificate decompression can allocate an attacker-controlled amount of memory up to 1 GiB before authentication |
| 3 | `ECC/ecc2/Cargo.lock` | `GHSA-vp88-798v-h67f` | `rustls` | `0.23.45` | `0.23.46, 0.24.0-dev.2` | `0.23.46` | `LOW` | rustls: ECH rejection can expose buffered application data to authenticated outer server before `ech_required` alert |
| 4 | `ECC/ecc2/Cargo.lock` | `GHSA-w44r-93j7-qv28` | `rustls` | `0.23.45` | `0.23.46, 0.24.0-dev.2` | `0.23.46` | `LOW` | rustls: An unauthenticated ServerHello poisons the per-name key-exchange record, so later ClientHellos carry only a classical X25519 share |
| 5 | `ECC/package-lock.json` | `CVE-2026-110180` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Security policy bypass via improper host canonicalization |
| 6 | `ECC/package-lock.json` | `CVE-2026-110306` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Cross-Site Scripting via improper URI scheme decoding |
| 7 | `ECC/package-lock.json` | `CVE-2026-110095` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Path traversal via improper relative URI normalization |
| 8 | `ECC/package-lock.json` | `CVE-2026-110725` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Cross-site scripting via unescaped colon in relative URI paths |
| 9 | `ECC/yarn.lock` | `CVE-2026-110180` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Security policy bypass via improper host canonicalization |
| 10 | `ECC/yarn.lock` | `CVE-2026-110306` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Cross-Site Scripting via improper URI scheme decoding |
| 11 | `ECC/yarn.lock` | `CVE-2026-110095` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Path traversal via improper relative URI normalization |
| 12 | `ECC/yarn.lock` | `CVE-2026-110725` | `fast-uri` | `3.1.8` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Cross-site scripting via unescaped colon in relative URI paths |
| 13 | `ECC/yarn.lock` | `CVE-2026-111758` | `markdown-it` | `14.3.1` | `14.3.3, 15.0.3` | `14.3.3` | `HIGH` | markdown-it: Denial of Service via unclosed link reference definitions |
| 14 | `ECC/yarn.lock` | `CVE-2026-111759` | `markdown-it` | `14.3.1` | `15.0.2, 14.3.2` | `14.3.3` | `HIGH` | markdown-it: Denial of Service via mismatched quote parsing |
| 15 | `ECC/yarn.lock` | `CVE-2026-111766` | `markdown-it` | `14.3.1` | `14.3.3, 15.0.3` | `14.3.3` | `LOW` | markdown-it: Denial of Service via repeated unterminated inline HTML constructs |
| 16 | `eletricaip/bun.lock` | `CVE-2026-118663` | `@hono/node-server` | `1.19.17` | `2.1.3` | `2.1.6` | `MEDIUM` | node-server: Security middleware bypass via double path decoding in serveStatic |
| 17 | `eletricaip/bun.lock` | `CVE-2026-104850` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.31.0` | `1.32.2` | `HIGH` | MCP TypeScript SDK: Information disclosure via unbound OAuth credentials |
| 18 | `eletricaip/bun.lock` | `CVE-2026-111767` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.0` | `1.32.2` | `HIGH` | @modelcontextprotocol/sdk: Unauthorized cross-session task access via taskStore |
| 19 | `eletricaip/bun.lock` | `CVE-2026-111768` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.0` | `1.32.2` | `HIGH` | Model Context Protocol TypeScript SDK: Denial of service via memory exhaustion from crafted HTTP requests |
| 20 | `eletricaip/bun.lock` | `GHSA-f897-62hf-6gxq` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.30.1` | `1.32.2` | `HIGH` | MCP TypeScript SDK: HTTP server transports and handlers did not limit request body size or JSON-RPC batch length |
| 21 | `eletricaip/bun.lock` | `CVE-2026-111769` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.0` | `1.32.2` | `MEDIUM` | Model Context Protocol TypeScript SDK: Sensitive information disclosure via cross-origin redirects |
| 22 | `eletricaip/bun.lock` | `CVE-2026-111771` | `@modelcontextprotocol/sdk` | `1.28.0` | `1.32.0` | `1.32.2` | `MEDIUM` | Model Context Protocol TypeScript SDK: Authentication bypass via missing token audience validation |
| 23 | `eletricaip/bun.lock` | `CVE-2026-111768` | `@modelcontextprotocol/server` | `2.0.0` | `2.3.0` | `2.4.0` | `HIGH` | Model Context Protocol TypeScript SDK: Denial of service via memory exhaustion from crafted HTTP requests |
| 24 | `eletricaip/bun.lock` | `CVE-2026-111770` | `@modelcontextprotocol/server` | `2.0.0` | `2.3.0` | `2.4.0` | `HIGH` | @modelcontextprotocol/server: Information disclosure via shared HTTP transport instance |
| 25 | `eletricaip/bun.lock` | `GHSA-f897-62hf-6gxq` | `@modelcontextprotocol/server` | `2.0.0` | `2.1.0` | `2.4.0` | `HIGH` | MCP TypeScript SDK: HTTP server transports and handlers did not limit request body size or JSON-RPC batch length |
| 26 | `eletricaip/bun.lock` | `CVE-2026-111771` | `@modelcontextprotocol/server` | `2.0.0` | `2.3.0` | `2.4.0` | `MEDIUM` | Model Context Protocol TypeScript SDK: Authentication bypass via missing token audience validation |
| 27 | `eletricaip/bun.lock` | `CVE-2026-83605` | `@xmldom/xmldom` | `0.8.13` | `0.9.11, 0.8.14` | `0.8.15` | `HIGH` | xmldom: Attribute injection allows client-side script execution |
| 28 | `eletricaip/bun.lock` | `CVE-2026-83607` | `@xmldom/xmldom` | `0.8.13` | `0.9.11, 0.8.14` | `0.8.15` | `HIGH` | xmldom: Cross-site scripting via unvalidated element name injection |
| 29 | `eletricaip/bun.lock` | `CVE-2026-83608` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `HIGH` | xmldom: XML Markup Injection via DocType Name Bypass |
| 30 | `eletricaip/bun.lock` | `CVE-2026-83613` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `HIGH` | xmldom: Denial of Service due to quadratic-time attribute processing |
| 31 | `eletricaip/bun.lock` | `CVE-2026-83614` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `HIGH` | xmldom: Denial of Service via quadratic-time XML parsing |
| 32 | `eletricaip/bun.lock` | `CVE-2026-83615` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `HIGH` | xmldom: Denial of Service via quadratic memory consumption |
| 33 | `eletricaip/bun.lock` | `CVE-2026-83616` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `HIGH` | xmldom: XML Structure Injection via Unvalidated Processing Instruction Targets |
| 34 | `eletricaip/bun.lock` | `CVE-2026-83619` | `@xmldom/xmldom` | `0.8.13` | `0.8.15` | `0.8.15` | `HIGH` | @xmldom/xmldom: Denial of Service via crafted XML input |
| 35 | `eletricaip/bun.lock` | `CVE-2026-83610` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `MEDIUM` | xmldom: XML fragment injection via invalid EntityReference serialization |
| 36 | `eletricaip/bun.lock` | `CVE-2026-83611` | `@xmldom/xmldom` | `0.8.13` | `0.8.15, 0.9.12` | `0.8.15` | `MEDIUM` | xmldom: Malformed XML end tag parsing leads to content discard and security bypass |
| 37 | `eletricaip/bun.lock` | `CVE-2026-111181` | `body-parser` | `2.3.0` | `2.4.0, 1.20.9` | `2.4.0` | `HIGH` | body-parser: Denial of Service via unhandled decompression stream error |
| 38 | `eletricaip/bun.lock` | `GHSA-cg2g-xh64-v4q7` | `dompurify` | `3.4.13` | `3.4.17` | `3.4.17` | `CRITICAL` | DOMPurify SAFE_FOR_TEMPLATES bypass: split template expressions survive in attached shadow root content on DOM output modes |
| 39 | `eletricaip/bun.lock` | `GHSA-mrv2-3pqr-j5jr` | `dompurify` | `3.4.13` | `3.4.17` | `3.4.17` | `HIGH` | DOMPurify IN_PLACE: hook that removes a parent or sibling leaves the detached subtree's event handlers armed (incomplete fix for GHSA-p98j-92pf-mc4p) |
| 40 | `eletricaip/bun.lock` | `GHSA-6688-9rhm-gjv2` | `dompurify` | `3.4.13` | `3.4.16` | `3.4.17` | `LOW` | DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes |
| 41 | `eletricaip/bun.lock` | `GHSA-c6gr-qvv4-5v3f` | `dompurify` | `3.4.13` | `3.4.17` | `3.4.17` | `LOW` | DOMPurify: SMIL attributeName=href guard is skipped when PARSER_MEDIA_TYPE is application/xhtml+xml |
| 42 | `eletricaip/bun.lock` | `GHSA-p98j-92pf-mc4p` | `dompurify` | `3.4.13` | `3.4.16` | `3.4.17` | `LOW` | DOMPurify: IN_PLACE: node-removing afterSanitize hook leaves detached subtree event handlers armed, causing DOM XSS |
| 43 | `eletricaip/bun.lock` | `CVE-2026-111757` | `hono` | `4.13.7` | `4.13.11` | `4.13.17` | `MEDIUM` | hono: Information disclosure via malformed percent-encoded paths in serveStatic |
| 44 | `eletricaip/bun.lock` | `CVE-2026-101911` | `ip-address` | `10.7.0` | `10.7.1` | `10.7.6` | `MEDIUM` | ip-address: Denial of Service via unbounded IPv6 address parsing |
| 45 | `eletricaip/bun.lock` | `CVE-2026-101912` | `ip-address` | `10.7.0` | `10.7.1` | `10.7.6` | `MEDIUM` | ip-address: Access control bypass via cross-family subnet comparison |
| 46 | `eletricaip/bun.lock` | `CVE-2026-111997` | `ip-address` | `10.7.0` | `10.7.4` | `10.7.6` | `MEDIUM` | ip-address: Denial of Service via excessive percent characters in IPv6 address input |
| 47 | `eletricaip/bun.lock` | `CVE-2026-84375` | `js-yaml` | `4.3.1` | `4.3.2, 3.15.2` | `4.3.2` | `HIGH` | js-yaml: Denial of Service vulnerability in YAML parsing |
| 48 | `eletricaip/bun.lock` | `CVE-2026-90711` | `proxy-addr` | `2.0.7` | `2.0.8` | `2.0.8` | `CRITICAL` | proxy-addr: proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet |
| 49 | `eletricaip/bun.lock` | `CVE-2026-110816` | `qs` | `6.16.0` | `6.16.1` | `6.17.1` | `MEDIUM` | qs: Denial of Service via unhandled exception during array serialization |
| 50 | `eletricaip/bun.lock` | `CVE-2026-116582` | `seroval` | `1.6.8` | `1.6.10, 1.0.0` | `1.7.10` | `MEDIUM` | seroval: Cross-site scripting via improper regular expression serialization |
| 51 | `eletricaip/bun.lock` | `CVE-2026-116583` | `seroval` | `1.6.8` | `1.6.11` | `1.7.10` | `MEDIUM` | seroval: Arbitrary code execution via untrusted typed array constructor properties |
| 52 | `eletricaip/bun.lock` | `CVE-2026-93749` | `source-map-js` | `1.2.1` | `1.2.2` | `1.2.2` | `HIGH` | source-map-js: Denial of Service via malformed indexed source maps |
| 53 | `eletricaip/bun.lock` | `CVE-2023-30533` | `xlsx` -> `@e965/xlsx` | `0.18.5` | `0.19.3` | `0.20.3` | `HIGH` | Prototype Pollution in sheetJS |
| 54 | `eletricaip/bun.lock` | `CVE-2024-22363` | `xlsx` -> `@e965/xlsx` | `0.18.5` | `0.20.2` | `0.20.3` | `HIGH` | SheetJS Regular Expression Denial of Service (ReDoS) |

---

## 4. Inventário Reconstruído das 60 Vulnerabilidades de `devDependencies` (`114` Totais no Baseline -> `0` Atuais)

Extraído diretamente de `trivy-head-baseline-dev.json` (`trivy fs --scanners vuln --include-dev-deps`):

| # | Target (Lockfile) | VulnerabilityID | Pacote | Versão Instalada (Baseline) | Versão Corrigida (Advisory) | Versão Instalada Atual | Severidade | Título Oficial do Advisory |
|---:|---|---|---|---:|---:|---:|---|---|
| 55 | `ECC/package-lock.json` | `CVE-2026-118773` | `glob` | `13.0.6` | `14.0.2` | `14.0.2` | `MEDIUM` | glob: Denial of Service (DoS) via incomplete traversal cancellation |
| 56 | `ECC/package-lock.json` | `CVE-2026-111758` | `markdown-it` | `14.3.1` | `14.3.3, 15.0.3` | `14.3.3` | `HIGH` | markdown-it: Denial of Service via unclosed link reference definitions |
| 57 | `ECC/package-lock.json` | `CVE-2026-111759` | `markdown-it` | `14.3.1` | `15.0.2, 14.3.2` | `14.3.3` | `HIGH` | markdown-it: Denial of Service via mismatched quote parsing |
| 58 | `ECC/package-lock.json` | `CVE-2026-111766` | `markdown-it` | `14.3.1` | `14.3.3, 15.0.3` | `14.3.3` | `LOW` | markdown-it: Denial of Service via repeated unterminated inline HTML constructs |
| 59 | `ECC/package-lock.json` | `CVE-2026-118764` | `minimatch` | `10.2.5` | `11.0.1` | `11.0.1` | `MEDIUM` | minimatch: Denial of Service via crafted glob pattern expansion |
| 60 | `ECC/package-lock.json` | `CVE-2026-114141` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml: Denial of Service via crafted array-of-tables headers |
| 61 | `ECC/package-lock.json` | `CVE-2026-114142` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Prototype pollution: parsing a TOML document can write to Object.prototype |
| 62 | `ECC/package-lock.json` | `CVE-2026-114143` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Denial of Service via long dotted keys in TOML input |
| 63 | `ECC/package-lock.json` | `CVE-2026-114144` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Denial of Service via unbounded integer parsing |
| 64 | `ECC/yarn.lock` | `CVE-2026-118773` | `glob` | `13.0.6` | `14.0.2` | `14.0.2` | `MEDIUM` | glob: Denial of Service (DoS) via incomplete traversal cancellation |
| 65 | `ECC/yarn.lock` | `CVE-2026-118764` | `minimatch` | `10.2.5` | `11.0.1` | `11.0.1` | `MEDIUM` | minimatch: Denial of Service via crafted glob pattern expansion |
| 66 | `ECC/yarn.lock` | `CVE-2026-118764` | `minimatch` | `10.2.6` | `11.0.1` | `11.0.1` | `MEDIUM` | minimatch: Denial of Service via crafted glob pattern expansion |
| 67 | `ECC/yarn.lock` | `CVE-2026-114141` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml: Denial of Service via crafted array-of-tables headers |
| 68 | `ECC/yarn.lock` | `CVE-2026-114142` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Prototype pollution: parsing a TOML document can write to Object.prototype |
| 69 | `ECC/yarn.lock` | `CVE-2026-114143` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Denial of Service via long dotted keys in TOML input |
| 70 | `ECC/yarn.lock` | `CVE-2026-114144` | `toml` | `4.3.0` | `5.0.1` | `5.0.1` | `HIGH` | toml-node: Denial of Service via unbounded integer parsing |
| 71 | `ECC/yarn.lock` | `CVE-2026-109383` | `undici` | `6.29.0` | `6.29.1, 7.30.1, 8.12.2` | `6.29.1` | `HIGH` | undici: Certificate validation bypass via dropped TLS options in Agent |
| 72 | `ECC/yarn.lock` | `CVE-2026-109869` | `undici` | `6.29.0` | `6.29.1, 7.30.1, 8.12.2` | `6.29.1` | `HIGH` | undici: Denial of Service via unhandled stream error on excessive content encodings |
| 73 | `ECC/yarn.lock` | `CVE-2026-87018` | `undici` | `6.29.0` | `6.29.1, 7.30.1, 8.12.2` | `6.29.1` | `HIGH` | undici: Denial of Service via TLS renegotiation with mismatched certificate |
| 74 | `ECC/yarn.lock` | `CVE-2026-109924` | `undici` | `6.29.0` | `6.29.1, 7.30.1, 8.12.2` | `6.29.1` | `MEDIUM` | undici: Denial of Service via memory exhaustion in EventSource client |
| 75 | `ECC/yarn.lock` | `CVE-2026-109932` | `undici` | `6.29.0` | `6.29.1, 7.30.1, 8.12.2` | `6.29.1` | `MEDIUM` | undici: Denial of Service via unbounded WebSocket PONG buffering |
| 76 | `eletricaip/bun.lock` | `CVE-2026-112949` | `@vitest/mocker` | `4.1.10` | `4.1.12, 5.0.3` | `4.1.12` | `MEDIUM` | Vitest: Cross-site scripting via unescaped mock module URL |
| 77 | `eletricaip/bun.lock` | `CVE-2026-84373` | `@vitest/mocker` | `4.1.10` | `4.1.11, 5.0.0-rc.2` | `4.1.12` | `MEDIUM` | Vitest: Arbitrary File Read via Path Traversal in HMR WebSocket |
| 78 | `eletricaip/bun.lock` | `CVE-2026-102276` | `brace-expansion` | `1.1.18` | `5.0.10, 3.0.7, 2.1.5, 1.1.19` | `1.1.21` | `HIGH` | brace-expansion: Denial of Service via stack exhaustion from crafted brace patterns |
| 79 | `eletricaip/bun.lock` | `CVE-2026-102278` | `brace-expansion` | `1.1.18` | `5.0.11, 3.0.8, 2.1.6, 1.1.20` | `1.1.21` | `HIGH` | brace-expansion: Denial of Service via uncontrolled recursion in nested brace patterns |
| 80 | `eletricaip/bun.lock` | `CVE-2026-102277` | `brace-expansion` | `1.1.18` | `5.0.12, 3.0.9, 2.1.7, 1.1.21` | `1.1.21` | `MEDIUM` | brace-expansion: Denial of Service via crafted brace patterns |
| 81 | `eletricaip/bun.lock` | `CVE-2026-110180` | `fast-uri` | `3.1.7` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Security policy bypass via improper host canonicalization |
| 82 | `eletricaip/bun.lock` | `CVE-2026-110306` | `fast-uri` | `3.1.7` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `MEDIUM` | fast-uri: Cross-Site Scripting via improper URI scheme decoding |
| 83 | `eletricaip/bun.lock` | `CVE-2026-86472` | `fast-uri` | `3.1.7` | `2.4.7, 3.1.8, 4.1.5` | `3.1.9` | `MEDIUM` | fast-uri: Security bypass due to inconsistent host case normalization |
| 84 | `eletricaip/bun.lock` | `CVE-2026-110095` | `fast-uri` | `3.1.7` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Path traversal via improper relative URI normalization |
| 85 | `eletricaip/bun.lock` | `CVE-2026-110725` | `fast-uri` | `3.1.7` | `2.4.8, 3.1.9, 4.2.3` | `3.1.9` | `LOW` | fast-uri: Cross-site scripting via unescaped colon in relative URI paths |
| 86 | `eletricaip/bun.lock` | `CVE-2026-112942` | `launch-editor` | `2.14.1` | `2.14.2` | `2.14.2` | `HIGH` | launch-editor: Command injection via improper file path validation |
| 87 | `eletricaip/bun.lock` | `CVE-2026-112943` | `launch-editor` | `2.14.1` | `2.14.2` | `2.14.2` | `MEDIUM` | launch-editor: Arbitrary code execution via improper argument escaping on Windows |
| 88 | `eletricaip/bun.lock` | `CVE-2026-112944` | `launch-editor` | `2.14.1` | `2.14.2` | `2.14.2` | `MEDIUM` | launch-editor: Arbitrary command execution via improper filename handling |
| 89 | `eletricaip/bun.lock` | `CVE-2026-67213` | `nanoid` | `3.3.17` | `3.3.18, 5.1.6` | `3.3.20` | `HIGH` | nanoid: Denial of Service via infinite loop in random ID generation |
| 90 | `eletricaip/bun.lock` | `CVE-2026-102422` | `shell-quote` | `1.10.0` | `1.11.0` | `1.12.0` | `CRITICAL` | shell-quote: Arbitrary command execution via improper line terminator handling |
| 91 | `eletricaip/bun.lock` | `CVE-2026-109383` | `undici` | `7.29.0` | `6.29.1, 7.30.1, 8.12.2` | `7.30.2` | `HIGH` | undici: Certificate validation bypass via dropped TLS options in Agent |
| 92 | `eletricaip/bun.lock` | `CVE-2026-109829` | `undici` | `7.29.0` | `7.30.1, 8.12.2` | `7.30.2` | `HIGH` | undici: Cache poisoning and information disclosure via improper cross-origin redirect caching |
| 93 | `eletricaip/bun.lock` | `CVE-2026-109869` | `undici` | `7.29.0` | `6.29.1, 7.30.1, 8.12.2` | `7.30.2` | `HIGH` | undici: Denial of Service via unhandled stream error on excessive content encodings |
| 94 | `eletricaip/bun.lock` | `CVE-2026-19534` | `undici` | `7.29.0` | `6.28.1, 7.29.1, 8.10.2` | `7.30.2` | `HIGH` | undici: Denial of Service via unrequested WebSocket subprotocol |
| 95 | `eletricaip/bun.lock` | `CVE-2026-84961` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `HIGH` | undici: TLS certificate validation bypass in BalancedPool via dropped connect options |
| 96 | `eletricaip/bun.lock` | `CVE-2026-87018` | `undici` | `7.29.0` | `6.29.1, 7.30.1, 8.12.2` | `7.30.2` | `HIGH` | undici: Denial of Service via TLS renegotiation with mismatched certificate |
| 97 | `eletricaip/bun.lock` | `CVE-2026-109841` | `undici` | `7.29.0` | `7.30.1, 8.12.2` | `7.30.2` | `MEDIUM` | undici: Subresource Integrity bypass via non-lowercase algorithm tokens |
| 98 | `eletricaip/bun.lock` | `CVE-2026-109924` | `undici` | `7.29.0` | `6.29.1, 7.30.1, 8.12.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via memory exhaustion in EventSource client |
| 99 | `eletricaip/bun.lock` | `CVE-2026-109932` | `undici` | `7.29.0` | `6.29.1, 7.30.1, 8.12.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via unbounded WebSocket PONG buffering |
| 100 | `eletricaip/bun.lock` | `CVE-2026-18149` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service due to orphaned response body in retry handler |
| 101 | `eletricaip/bun.lock` | `CVE-2026-84890` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via unbounded decompression of compressed responses |
| 102 | `eletricaip/bun.lock` | `CVE-2026-84933` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `MEDIUM` | undici: Cross-user cookie disclosure via Set-Cookie caching |
| 103 | `eletricaip/bun.lock` | `CVE-2026-85014` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via WebSocketStream unclean close |
| 104 | `eletricaip/bun.lock` | `CVE-2026-85024` | `undici` | `7.29.0` | `6.28.1, 7.29.1, 8.10.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via unhandled error in WebSocket permessage-deflate decompression |
| 105 | `eletricaip/bun.lock` | `CVE-2026-87029` | `undici` | `7.29.0` | `7.30.1, 8.12.2` | `7.30.2` | `MEDIUM` | undici: Denial of Service via unhandled exception in decompress interceptor |
| 106 | `eletricaip/bun.lock` | `CVE-2026-18540` | `undici` | `7.29.0` | `6.28.1, 7.29.1, 8.10.2` | `7.30.2` | `LOW` | undici: HTTP response splitting via retry interceptor |
| 107 | `eletricaip/bun.lock` | `CVE-2026-84947` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `LOW` | Undici: Response truncation and connection termination |
| 108 | `eletricaip/bun.lock` | `CVE-2026-85008` | `undici` | `7.29.0` | `7.29.1, 8.10.2` | `7.30.2` | `LOW` | undici: Integrity failure due to caching of unsafe HTTP method responses |
| 109 | `eletricaip/bun.lock` | `CVE-2026-112942` | `vite` | `7.3.6` | `8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4` | `7.3.7` | `HIGH` | launch-editor: Command injection via improper file path validation |
| 110 | `eletricaip/bun.lock` | `CVE-2026-112943` | `vite` | `7.3.6` | `8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4` | `7.3.7` | `MEDIUM` | launch-editor: Arbitrary code execution via improper argument escaping on Windows |
| 111 | `eletricaip/bun.lock` | `CVE-2026-112944` | `vite` | `7.3.6` | `8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4` | `7.3.7` | `MEDIUM` | launch-editor: Arbitrary command execution via improper filename handling |
| 112 | `eletricaip/bun.lock` | `CVE-2026-112946` | `vite` | `7.3.6` | `8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4` | `7.3.7` | `MEDIUM` | Vite: Information disclosure via improper module path handling |
| 113 | `eletricaip/bun.lock` | `CVE-2026-112945` | `vite` | `7.3.6` | `8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4` | `7.3.7` | `LOW` | vite: Arbitrary script execution via improper URL handling during HTML transformation |
| 114 | `eletricaip/bun.lock` | `CVE-2026-84373` | `vitest` | `4.1.10` | `4.1.11, 5.0.0-rc.2` | `4.1.12` | `MEDIUM` | Vitest: Arbitrary File Read via Path Traversal in HMR WebSocket |
