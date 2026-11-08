# ELÉTRICAI INDUSTRIAL OS — GATE 3.8.2
# VALIDAÇÃO TÉCNICA POR ADVISORY E DEFESA EM PROFUNDIDADE

**Classificação:** EMERGENCY SECURITY REMEDIATION (P0 — CRITICAL / HIGH)  
**Data:** 2026-11-08  
**Suíte de Validação Automatizada:** [`src/__tests__/gate3_8_2_supply_chain_security.test.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/__tests__/gate3_8_2_supply_chain_security.test.ts)

---

## 1. `dompurify` (`3.4.13` → `3.4.17`)

### Advisories
- **`GHSA-cg2g-xh64-v4q7` (CRITICAL):** Bypass de `SAFE_FOR_TEMPLATES` quando expressões de template estão divididas em conteúdo de Shadow Root anexado (`<template shadowrootmode="...">`).
- **`GHSA-mrv2-3pqr-j5jr` (HIGH):** Bypass quando um hook `IN_PLACE` remove nós pais ou irmãos em elementos sem `parentNode`.

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacote:** Atualizado em [`package.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/package.json) e [`bun.lock`](file:///c:/Users/98911/Desktop/eletric/eletricaip/bun.lock) para `3.4.17`.
2. **Hardening em Código ([`src/lib/security/safe-html-sanitizer.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/safe-html-sanitizer.ts)):**
   - Pré-sanitização remove blocos `<template>` antes da construção do DOM (eliminando Declarative Shadow DOM).
   - Configuração determinística `SAFE_FOR_TEMPLATES: true`, `IN_PLACE: false`, `RETURN_DOM: false`, `RETURN_DOM_FRAGMENT: false`.
   - Bloqueio explícito de tags (`script`, `iframe`, `object`, `embed`, `template`, `slot`, `foreignObject`) e atributos (`on*`, `shadowroot*`, `xlink:href`).
   - Pós-processamento remove padrões residuais `{{...}}`, `<%...%>` e `${...}`.
   - `sanitizeDomNodeSafely()` serializa nós destacados em container próprio sem mutação `IN_PLACE` em nós órfãos.

---

## 2. `proxy-addr` (`2.0.7` → `2.0.8`)

### Advisory
- **`CVE-2026-90711` (CRITICAL):** Spoofing de endereço IP via sub-rede de confiança IPv4-mapped IPv6 (`::ffff:a.b.c.d` / `::ffff:7f00:1`).

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacote:** `proxy-addr` atualizado para `2.0.8` via `overrides` em [`package.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/package.json).
2. **Hardening em Código ([`src/lib/security/client-ip-guard.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/client-ip-guard.ts)):**
   - `normalizeIpAddress()` converte qualquer endereço IPv4-mapped IPv6 (tanto em formato decimal pontilhado `::ffff:127.0.0.1` quanto hexadecimal `::ffff:7f00:1`) para IPv4 canônico antes de avaliar a sub-rede de confiança.
   - `resolveTrustedClientIp()` só avalia `X-Forwarded-For` se o peer imediato (`socketPeerIp`) pertencer estritamente à lista de proxies confiáveis após a normalização canônica.

---

## 3. `@modelcontextprotocol/sdk` (`1.28.0` → `1.32.2`) & `@modelcontextprotocol/server` (`2.0.0` → `2.4.0`)

### Advisories
- **`CVE-2026-104850` (HIGH):** Vazamento de respostas entre sessões via reutilização de transporte compartilhado.
- **`CVE-2026-111767` (HIGH):** DoS por erro não tratado em `StreamableHTTPServerTransport`.
- **`CVE-2026-111768` / `GHSA-f897-62hf-6gxq` (HIGH):** Vazamento cross-session / cross-client via instância de servidor MCP compartilhada.
- **`CVE-2026-111770` (HIGH):** Envio de credenciais de cliente para servidores não confiáveis via URL de metadados OAuth.

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacotes:** `@modelcontextprotocol/sdk` atualizado para `1.32.2` e `@modelcontextprotocol/server` para `2.4.0`.
2. **Arquitetura Existente + Hardening ([`src/lib/mcp/supabase.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/mcp/supabase.ts) e [`src/lib/security/mcp-session-guard.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/mcp-session-guard.ts)):**
   - `supabaseForUser(ctx)` instancia um novo cliente Supabase isolado por requisição usando `persistSession: false` e o token OAuth verificado da chamada atual.
   - `McpSessionIsolationGuard` garante vínculo imutável `(sessionId, userId, tenantId, tokenHash)` e bloqueia qualquer tentativa de reutilização cross-session ou cross-tenant.
   - `validateTrustedMcpOAuthEndpoint()` exige `https:`, proíbe credenciais embutidas, bloqueia IPs privados/loopback/metadata (`169.254.169.254`, `127.0.0.0/8`, `10.0.0.0/8`, `::1`, `::ffff:*`) e valida o hostname contra allowlist explícita.

---

## 4. `@xmldom/xmldom` (`0.8.13` → `0.8.15`)

### Advisories
- **`CVE-2026-83605` (HIGH):** DoS por complexidade quadrática na validação de atributos.
- **`CVE-2026-83607` (HIGH):** Injeção de XML via validação incompleta de Processing Instructions (`<?...?>`).
- **`CVE-2026-83608` (HIGH):** Injeção de marcação via validação de seção CDATA (`]]>`).
- **`CVE-2026-83613`, `83614`, `83615`, `83616`, `83619` (HIGH):** Injeção de atributos e mutação silenciosa na serialização XML.

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacote:** `@xmldom/xmldom` atualizado para `0.8.15` (corrige todas as 8 CVEs mantendo compatibilidade com `pixi.js@8.19.0`).
2. **Hardening em Código ([`src/lib/importer/security-validator.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/importer/security-validator.ts)):**
   - `validateXmlSecurity()` proíbe `<!DOCTYPE`, `<!ENTITY`, `SYSTEM`, `PUBLIC`, `XInclude`, Processing Instructions além de `<?xml ...?>` e limita a quantidade de atributos por elemento a no máximo `64` (bloqueando `CVE-2026-83605`).

---

## 5. `body-parser` (`2.3.0` → `2.4.0`)

### Advisory
- **`CVE-2026-111181` (HIGH):** Denial of Service via erro não tratado em stream de descompressão HTTP.

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacote:** `body-parser` atualizado para `2.4.0`.
2. **Hardening em Código ([`src/lib/security/payload-guard.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/payload-guard.ts)):**
   - `safeDecodeHttpPayload()` aplica limites estritos de bytes comprimidos (`2 MB`), bytes descomprimidos (`10 MB` via `maxOutputLength` nativo do `zlib`), allowlist de `Content-Encoding` (`identity`, `gzip`, `deflate`) e captura determinística de erros de stream corrompidos retornando HTTP `400` ou `413` sem jamais derrubar o processo.

---

## 6. `js-yaml` (`4.3.1` → `4.3.2`)

### Advisory
- **`CVE-2026-84375` (HIGH):** Denial of Service durante parsing de estruturas YAML maliciosas.

### Análise de Uso e Remediação no ElétricAi
1. **Atualização de Pacote:** `js-yaml` atualizado para `4.3.2`.
2. **Hardening em Código ([`src/lib/importer/adapters/yaml-adapter.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/importer/adapters/yaml-adapter.ts)):**
   - `safeParseYaml()` proíbe tags executáveis (`!tag`), âncoras/aliases/merge keys (`&anchor`, `*alias`, `<<:`), limita a profundidade de aninhamento a `20` níveis e bloqueia chaves de Prototype Pollution (`__proto__`, `constructor`, `prototype`).

---

## 7. `source-map-js` (`1.2.1` → `1.2.2`)

### Advisory
- **`CVE-2026-93749` (HIGH):** Denial of Service via source maps indexados malformados.

### Análise de Uso e Remediação no ElétricAi
- `source-map-js` é utilizado exclusivamente em tempo de build por `@tailwindcss/node`, `postcss` e `css-tree`.
- Atualizado para `1.2.2` via `overrides` em [`package.json`](file:///c:/Users/98911/Desktop/eletric/eletricaip/package.json).

---

## 8. `xlsx` (`0.18.5`) → `@e965/xlsx` (`0.20.3`) + Wrapper Defensivo

### Advisories
- **`CVE-2023-30533` (HIGH):** Prototype Pollution ao processar planilhas специально construídas (corrigido em `>= 0.19.3`).
- **`CVE-2024-22363` (HIGH):** Regular Expression Denial of Service (ReDoS) (corrigido em `>= 0.20.2`).

### Análise de Uso e Remediação no ElétricAi
1. **Substituição Controlada de Pacote:** Como o pacote `xlsx` no registro público npm estagnou na versão `0.18.5`, foi migrado para a distribuição oficial mantida no npm `@e965/xlsx@0.20.3` (SheetJS `0.20.3`), que incorpora os patches para `CVE-2023-30533` e `CVE-2024-22363`.
2. **Hardening em Código ([`src/lib/security/safe-xlsx.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/safe-xlsx.ts)):**
   - Todos os pontos de consumo ([`src/lib/dossier/export-spreadsheets.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/dossier/export-spreadsheets.ts) e [`src/routes/settings.catalog-import.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/settings.catalog-import.tsx)) utilizam `safe-xlsx.ts`.
   - `safeReadXlsxWorkbook()` valida limite de arquivo (`10 MB`), máximo de abas (`20`), máximo de linhas (`25.000`), máximo de colunas (`200`) e desativa `cellFormula`, `cellHTML`, `cellNF` e `cellStyles`.
   - `safeSheetToJson()` e `sanitizeSpreadsheetRecord()` bloqueiam chaves `__proto__`, `constructor` e `prototype`, limitam o tamanho de cada célula (`8.192` caracteres) e neutralizam Formula Injection (`=`, `+`, `-`, `@`, `|`).
