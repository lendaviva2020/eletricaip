# Plano: otimização do loop de simulação Voltai

Objetivo: eliminar trabalho desperdiçado no tick de 50ms, tirar serialização Zod/JSON do hot path e estabilizar o `CircuitControlPanel` para não recalcular falhas a cada render.

## 1. `src/lib/voltai/store.ts` — `simulateStep`

- Em `simulateComponent`, retornar **o mesmo objeto** quando nenhum campo do `simulationState` mudou, em vez de sempre criar `{ ...component, simulationState: state }`. Comparar campos relevantes (energized, tripped, open, failed, blown, running, contactClosed, currentA, voltageV, count, output, elapsedMs, thermalMs, i2tA2s, pulseRemainingMs, timerMode) antes do spread.
- Em `simulateStep`, fazer `map` reutilizando referências; se **toda** a lista retornou as mesmas refs, fazer **early return** sem `set(...)` (zustand evita re-render quando o slice é igual, mas garantimos não tocar em `lastSimulationJson`).
- **Remover** `serializeSimulationPayload` do hot path. Em vez disso:
  - Manter `lastSimulationJson` como **getter lazy**: armazenar apenas `lastSimulationTick: number` e os componentes; expor `getSimulationPayload()` que serializa sob demanda e cacheia até o próximo tick que alterou estado.
  - Quem hoje lê `lastSimulationJson` (diagnóstico/IA) passa a chamar `useVoltaiStore.getState().getSimulationPayload()`.
- Schema Zod (`SimulationPayloadSchema`) só roda dentro do getter lazy, não a cada 50ms.

## 2. `src/lib/voltai/use-voltai-simulation.ts` — frequência do tick

- Subir o intervalo padrão de 50ms para 100ms (parâmetro `stepMs` configurável, default 100). Mantém realismo visual e corta pela metade o trabalho.
- Usar `requestAnimationFrame` com acumulador de tempo em vez de `setInterval`, para pausar automaticamente quando a aba está em background (evita drift e queima de CPU).

## 3. `src/components/canvases/circuit-control-panel.tsx` — `detectFault`

- Memoizar `detectFault` com `useMemo` cuja chave é um **hash leve** derivado só do que importa para falha:
  - assinatura por componente: `id|tripped?1:0|failed?1:0|blown?1:0|energized?1:0`
  - assinatura das edges power: já estável (só muda em edição), incluir `edges.length` + último `id`.
- Hash concatenado em string (sem JSON.stringify do objeto inteiro). Só recalcula quando algum bit de falha/energização realmente mudou.
- Subscrição ao store via seletor estreito: ler apenas `components` campos necessários via `useVoltaiStore(s => s.components, shallow)` em vez do store inteiro, evitando rerender em mudança de `lastSimulationJson` (que vai sumir do hot path mesmo assim).

## 4. Verificação

- `bunx vitest run` para garantir que `__tests__/*` continuam verdes (ladder/fbd não dependem do Voltai, mas o `simulateStep` é chamado em testes indiretos? — checar antes de mexer).
- Smoke manual via Playwright: abrir `/`, montar um circuito mínimo, ligar o play, confirmar que a lâmpada acende e que `detectFault` ainda dispara ao remover uma edge power.

## Fora de escopo (anotado para depois)

- Mover a simulação para um Web Worker dedicado: ganho real, mas exige refatorar o contrato do store (mensageria + reconciliação). Fica como item separado se a CPU continuar alta após estas correções.

## Detalhes técnicos

Assinatura proposta do getter lazy:

```ts
interface VoltaiStore {
  // ...
  lastSimulationTick: number;
  getSimulationPayload: () => string; // serializa sob demanda, cacheia por tick
}
```

Comparação rápida em `simulateComponent`:

```ts
const same =
  prev.energized === next.energized &&
  prev.tripped === next.tripped &&
  // ... demais campos relevantes
  prev.elapsedMs === next.elapsedMs;
return same ? component : { ...component, simulationState: next };
```

Hash de falha em `CircuitControlPanel`:

```ts
const faultKey = useMemo(() => {
  let s = `${edges.length}`;
  for (const c of components) {
    const f = (c.simulationState.tripped?1:0) | (c.simulationState.failed?2:0)
            | (c.simulationState.blown?4:0)   | (c.simulationState.energized?8:0);
    s += `|${c.id}:${f}`;
  }
  return s;
}, [components, edges.length]);

const fault = useMemo(() => detectFault(components, edges), [faultKey]);
```
