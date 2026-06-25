# #TWIN-02 — Persistência de telemetria do Digital Twin

## Objetivo
Gravar as amostras geradas em `pushTelemetry` do `useDigitalTwinStore` na hypertable particionada `public.tag_samples` via RPC `batch_insert_tag_samples`, com flush em lote, respeitando tenant/projeto ativo e RLS.

## Entregas

### 1. Server function `flushTwinTelemetry`
Arquivo novo: `src/lib/digital-twin.functions.ts`
- `createServerFn({ method: 'POST' })` + `.middleware([requireSupabaseAuth])`.
- Input (Zod): `{ projectId: string, samples: Array<{ tag_name, value, quality? }> }` (máx 500 por chamada).
- Valida que o `projectId` pertence ao tenant do usuário (`projects.tenant_id = profile.tenant_id`) — usa `context.supabase` (RLS já bloqueia, mas faz check explícito para erro claro).
- Garante partição do mês via `select create_monthly_tag_samples_partition()` antes do insert (idempotente).
- Chama `rpc('batch_insert_tag_samples', { p_project_id, p_samples })`.
- Retorna `{ inserted: n }`.

### 2. Hook de flush no cliente
Arquivo novo: `src/hooks/use-twin-telemetry-persistence.ts`
- Lê `currentProjectId` de `useProjectStore` e `telemetryBuffers` de `useDigitalTwinStore`.
- Mantém um buffer pendente em ref (`Array<{ tag_name, value, quality, ts }>`) alimentado por uma subscription a `useDigitalTwinStore` que detecta novas amostras via `lastRealtimeUpdate`.
- Flush a cada 5s (configurável) ou quando buffer ≥ 200 amostras, usando `useServerFn(flushTwinTelemetry)`.
- Drop silencioso (com `console.warn`) se não houver `projectId` ou usuário não autenticado.
- Cleanup em unmount; cancela timer pendente.

### 3. Wire no Digital Twin
- `src/routes/digital-twin.tsx`: chamar `useTwinTelemetryPersistence()` no componente da rota (já é `_authenticated` na prática — verificar; se for público gate via `useAuth`).
- Sem mudanças no `digital-twin-store.ts` além de manter `lastRealtimeUpdate` (já existe).

### 4. Verificação RLS de `tag_samples`
- Confirmar policies via `supabase--read_query` antes de migration. Se faltar policy de INSERT para `authenticated` scoped por tenant do projeto, criar migration adicional. (Esperado: já existe — só validar.)

### 5. Testes
- `src/__tests__/twin-telemetry-flush.test.ts`: mocka `useServerFn`, dispara 250 `pushTelemetry`, verifica que flush envia em batches corretos e respeita debounce.

### 6. Documentação
- Atualizar `docs/sdd/12-auditoria-status.md`: #TWIN-02 ✅, atualizar seção "Itens pendentes".

## Detalhes técnicos
- `tag_samples` é particionada por mês; `create_monthly_tag_samples_partition()` cria o próximo mês. Chamamos no servidor antes do insert (custo desprezível, idempotente).
- Quality default `GOOD`. Para tags binárias (status), gravar 0/1 como `double precision`.
- Não removemos amostras do buffer local — Zustand mantém apenas últimos 60 para gráfico; persistência é write-only.
- Nada de `supabaseAdmin`: usuário escreve com sua própria sessão, RLS valida tenant via `projects`.

## Fora de escopo
- #TWIN-03 (upload GLB) e #TWIN-04 (E se?) — próximas iterações.
- Backfill histórico ou retenção/rollup.
