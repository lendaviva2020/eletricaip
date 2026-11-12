# GATE 4.3.1 — ARQUITETURA CLOUD–EDGE–OT & ISOLAMENTO DE PROTOCOLOS

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`  
**Invariante Permanente:** `IS_PHYSICAL_CONTROL_ALLOWED = false as const`

---

## 1. Fronteira Arquitetural Obrigatória

```text
[ Navegador / UI ElétricAi ]
          │ HTTPS (RPC tipado / Zod)
          ▼
[ ElétricAi Cloud (TanStack Start SSR / Server Functions) ]
   - Zero `node:dns`, Zero `node:net`, Zero `net.Socket()`
   - Modo `SIMULATOR` -> exclusivamente alvo lógico `simulation` / `opc.tcp://simulation:4840`
   - Modo `EDGE_READ_ONLY` -> valida tenant/planta/allowlist em gateway persistido + lê snapshots ingeridos
          ▲
          │ HTTPS / mTLS + Token SHA-256 Digest + Deduplicação + Sequência Monotônica
[ Edge Gateway Local (Rede do Cliente / Planta) ]
   - Política de allowlist (`src/lib/edge/edge-network-allowlist.ts`)
   - Somente leitura (`FC1..4` Modbus, Browse/Read/Subscribe OPC-UA, NBIRTH/DBIRTH/NDATA/DDATA Sparkplug B)
          │
          ▼ (Bloqueio permanente de escrita física)
[ Rede OT / CLPs / IEDs (RFC1918) ]
```

---

## 2. Remoção Completa de Conexões Diretas Cloud -> OT

1. **`src/lib/modbus-server.functions.ts` & `src/lib/edge/modbus-handlers.server.ts`:**
   - Removidos imports de `node:dns` e `net` (`connectRealModbus` eliminado).
   - Removido atalho inseguro `data.host === "192.168.1.100" || data.host.includes("simulation")`.
   - `mode: "SIMULATOR" | "EDGE_READ_ONLY"` é explícito. Alvos RFC1918 ou DNS em modo `SIMULATOR` são rejeitados com `SIMULATOR_TARGET_MISMATCH`.
2. **`src/lib/opcua-server.functions.ts` & `src/lib/edge/opcua-handlers.server.ts`:**
   - Removido fallback implícito `data.endpoint.includes("localhost") || data.endpoint.includes("simulation")`.
   - Rejeição explícita de credenciais embutidas na URL (`opc.tcp://user:pass@...`), loopback, metadata IMDS e esquemas não-`opc.tcp://`.
3. **Política Compartilhada (`src/lib/edge/protocol-classification.ts` + `src/lib/edge/cloud-protocol-guard.server.ts`):**
   - `authorizeCloudToEdgeReadTarget` valida formato/SSRF -> valida escopo de modo -> exige `gatewayId` registrado no tenant do ator em `EDGE_READ_ONLY` -> verifica `authorizedEndpoints` do gateway.
   - `guardProtocolWriteAttempt` bloqueia incondicionalmente escrita em qualquer sessão `EDGE_READ_ONLY` com `PHYSICAL_CONTROL_BLOCKED` + registro crítico em `security_audit`, enquanto sessões `SIMULATOR` rotulam explicitamente escritas virtuais com `provenance: "FORCED_SIMULATED"`.

---

## 3. Evidências Executadas

- Análise estática em [`gate-4-3-1-cloud-edge-ot.test.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/__tests__/gate-4-3-1-cloud-edge-ot.test.ts): zero referências a `node:dns`, `node:net`, `net.Socket`, `.includes("simulation")` ou `.includes("localhost")` em ambos `.functions.ts`.
- Testes de regressão SSRF ([`modbus-ssrf-guard.test.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/__tests__/modbus-ssrf-guard.test.ts)): `25/25` aprovados após migração de `isHostAllowed` e `resolveToAllowedIPv4` para `@/lib/edge/edge-network-allowlist`.
- UI [`settings.protocols.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/settings.protocols.tsx): seletor explícito `SIMULATOR` vs `EDGE_READ_ONLY`, entrada de `Edge Gateway ID` em modo `EDGE_READ_ONLY`, exibição de proveniência (`SIMULATED`, `PHYSICAL_READ_ONLY`, `STALE`, `NOT_CONNECTED`) e tabela de classificação arquitetural verificados via Playwright E2E e inspeção de navegador.
