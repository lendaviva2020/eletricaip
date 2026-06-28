## Próxima tarefa do plano: #TWIN-04 — Motor "E-se?" no Digital Twin

Seguindo a ordem da auditoria (`docs/sdd/12-auditoria-status.md`), a próxima entrega é o motor de simulação hipotética que permite ao operador alterar valores de tags manualmente e ver o impacto visual nos hotspots do gêmeo digital, sem afetar a telemetria real persistida.

### Objetivo
Permitir overrides manuais em tags do `useDigitalTwinStore` (modo "What-if"), com isolamento total da telemetria real, indicação visual clara e capacidade de reverter.

### Entregáveis

1. **Store — `src/lib/digital-twin/store.ts`**
   - Novo slice `whatIf`: `{ enabled: boolean; overrides: Record<tagId, number|boolean|string>; baseline: snapshot }`.
   - Ações: `enableWhatIf()`, `setOverride(tagId, value)`, `clearOverride(tagId)`, `resetWhatIf()`.
   - Seletor `getEffectiveTagValue(tagId)` que aplica override quando ativo, senão valor real.

2. **Isolamento da persistência**
   - `useTwinTelemetryPersistence` (hook existente) deve ignorar amostras enquanto `whatIf.enabled === true` para nunca contaminar `tag_samples`.

3. **UI — `src/components/digital-twin/what-if-panel.tsx`**
   - Painel lateral com toggle "Modo E-se?", lista de tags editáveis (input numérico/switch), botão "Resetar".
   - Badge global no header de `/digital-twin` quando ativo (cor de aviso).
   - Hotspots renderizados consomem `getEffectiveTagValue` e ganham contorno distinto quando overriden.

4. **Cenários salvos (mínimo viável)**
   - `whatIfScenarios` em `localStorage` (chave por `projectId`) — salvar/carregar conjuntos de overrides.
   - Sem persistência em DB nesta entrega (escopo enxuto).

5. **Testes — `src/__tests__/twin-what-if.test.ts`**
   - Override aplica e reverte corretamente.
   - Flush de telemetria não envia amostras com What-if ativo.
   - Cenários round-trip via localStorage.

6. **Documentação**
   - Marcar #TWIN-04 ✅ em `docs/sdd/12-auditoria-status.md` e remover o item da seção "pendentes".

### Detalhes técnicos
- Sem mudanças de schema Supabase nesta tarefa.
- Sem novas dependências.
- Respeita Zustand + seletores existentes; nada de `any`.

### Próxima tarefa após #TWIN-04
Conforme solicitado, ao concluir avisarei a próxima — sequência prevista: **#AI-03** (agregações reais de `ai_credit_costs` em `/analytics`), depois **#WGL-07** (decommission do Voltai shim).
