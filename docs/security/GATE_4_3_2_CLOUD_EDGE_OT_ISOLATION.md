# GATE 4.3.2 — CLOUD–EDGE–OT ISOLATION & PHYSICAL CONTROL LOCK

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Invariante Permanente:** **`IS_PHYSICAL_CONTROL_ALLOWED = false as const`**  
**Status:** `VERIFIED`

---

## 1. Isolamento Estrutural Cloud -> OT

1. **Zero Sockets / DNS em Cloud Handlers e RPCs:**
   - Varredura estática e de testes automatizados confirma **zero imports** de `node:net`, `node:dns` ou `node:dgram` em [`cloud-protocol-guard.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/cloud-protocol-guard.server.ts), [`modbus-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/modbus-handlers.server.ts), [`opcua-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/opcua-handlers.server.ts), [`fleet-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-handlers.server.ts), [`fleet-supabase-store.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-supabase-store.server.ts) e [`fleet-runtime.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts).
   - O workflow de CI ([`ci.yml`](file:///c:/Users/98911/Desktop/eletric/eletricaip/.github/workflows/ci.yml)) foi expandido para falhar em qualquer ocorrência de `node:dns`/`node:net` também em `src/lib/edge/*.server.ts`.

## 2. Descoberta e Remediação P0 no Gate 4.3.2 (`enqueueIotCommand` / `/realtime`)

Durante a auditoria de todos os pontos de entrada servidor que utilizam `supabaseAdmin`, identificou-se que:
- [`enqueueIotCommand`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/iot.functions.ts) permitia inserir registros em `iot_command_log` sem validar `IS_PHYSICAL_CONTROL_ALLOWED`.
- O painel `<CommandPanel>` em [`realtime.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/realtime.tsx) mantinha controles ativos de envio de comando para PLC/CLP.

**Correção Aplicada:**
- `enqueueIotCommand` agora verifica `!IS_PHYSICAL_CONTROL_ALLOWED` imediatamente na entrada do handler, registra evento crítico de segurança (`PHYSICAL_CONTROL_BLOCKED`) e retorna erro `{ ok: false, error: "PHYSICAL_CONTROL_BLOCKED: Envio de comandos físicos para PLCs/CLPs está permanentemente bloqueado (IS_PHYSICAL_CONTROL_ALLOWED = false)." }` antes de qualquer escrita em banco.
- `<CommandPanel>` em [`realtime.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/realtime.tsx) exibe explicitamente o selo `IS_PHYSICAL_CONTROL_ALLOWED = false` com controles bloqueados em modo *Read-Only*.
