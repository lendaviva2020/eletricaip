# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# CONTRATO FORMAL DE TAG INDUSTRIAL (`GATE3_6_TAG_CONTRACT.md`)

## 1. Estrutura Canônica da `IndustrialTag`

Definida em `src/lib/industrial/types.ts` (`IndustrialTagSchema`), toda tag industrial possui contrato tipado e validado:

- **Identidade e Escopo:** `tagId` (imutável), `tenantId`, `plantId`, `equipmentId` (opcional, validado no mesmo tenant/planta).
- **Nomenclatura:** `canonicalName` (`^[A-Za-z0-9_.:\-/]+$`, único por planta) e `displayName`.
- **Tipagem e Engenharia:**
  - `dataType`: `"BOOL" | "INT" | "DINT" | "REAL" | "STRING"`
  - `engineeringUnit`: unidade de engenharia de apresentação (ex.: `"A"`, `"V"`, `"kW"`, `"bar"`, `"°C"`).
  - `rawUnit`: unidade nativa do instrumento/registrador (pode ser sobrescrita por `GatewayTagSource.rawUnit`).
  - `scale` (fator multiplicativo linear, padrão `1.0`) e `offset` (deslocamento aditivo linear, padrão `0.0`).
  - `precision`: casas decimais (`0..9`).
  - `minimumValue` e `maximumValue`: limites operacionais de engenharia (`minimumValue < maximumValue`).
  - `deadband`, `sampleIntervalMs`, `staleAfterMs`, `retentionClass` (`HIGH_FREQ_7D | STANDARD_90D | COMPLIANCE_5Y`).
  - `sourceKind`: `"PHYSICAL" | "SIMULATED" | "INTERNAL_RUNTIME" | "CALCULATED"`.
  - `revision` e `configurationVersion`.

---

## 2. Pipeline Determinístico de Transformação (`transformRawValue`)

Implementado em `src/lib/industrial/tag-contract.ts` e `src/lib/industrial/units.ts`:

$$\text{scaled} = \text{rawValue} \times \text{scale} + \text{offset}$$

$$\text{engineeringValue} = \text{round}\big(\text{scaled} \times \text{unitFactor} + \text{unitOffset},\; \text{precision}\big)$$

### Regras de Validação e Qualidade

1. **Preservação do Valor Bruto:** `rawValue` nunca é sobrescrito; o Historian armazena simultaneamente `rawValue`, `engineeringValue` e o objeto `transformation` completo (`scale`, `offset`, `rawUnit`, `engineeringUnit`, `unitFactor`, `unitOffset`, `precision`, `clampedOrRejected`).
2. **Rejeição de Valores Não Finitos (`NaN`, `+Infinity`, `-Infinity`):**
   - `engineeringValue = null`
   - `quality = "BAD"`
   - `transformation.clampedOrRejected = "NON_FINITE"`
   - `rejectionReason = "NON_FINITE"`
3. **Verificação Dimensional de Unidades (`getUnitConversion`):**
   - Suporta conversão dentro da mesma grandeza física: Tensão (`mV`, `V`, `kV`), Corrente (`mA`, `A`, `kA`), Potência (`W`, `kW`, `MW`), Energia (`Wh`, `kWh`, `MWh`), Temperatura (`°C`, `K`, `°F`), Pressão (`Pa`, `mbar`, `kPa`, `bar`, `psi`), Vazão (`m³/h`, `L/s`, `L/min`), Frequência (`Hz`), Percentual (`%`), Rotação (`rpm`).
   - Se `rawUnit` e `engineeringUnit` pertencerem a grandezas incompatíveis (ex.: `"bar"` → `"°C"`), a transformação retorna `engineeringValue = null`, `quality = "BAD"` e `rejectionReason = "UNIT_INCOMPATIBLE"`.
4. **Avaliação de Faixa Operacional (`minimumValue` / `maximumValue`):**
   - Valores fora da faixa **não são mascarados/grampeados silenciosamente**: o valor calculado é preservado em `engineeringValue`, a qualidade é rebaixada para `"UNCERTAIN"` (salvo se já for `"BAD"`) e `clampedOrRejected = "OUT_OF_RANGE"`.

---

## 3. Classificação Estrita de Proveniência (`DataProvenance`)

| Proveniência | Condição de Atribuição | Pode ser exibida como medição física real? |
| :--- | :--- | :--- |
| `PHYSICAL_DATA` | `sourceKind === "PHYSICAL"` + `GatewayTagSource` ativo na allowlist + amostra autenticada de `CanonicalGateway` válido + `quality !== "BAD"` + idade $\le$ `staleAfterMs` | **SIM** |
| `SIMULATED_DATA` | `sourceKind === "SIMULATED"` ou driver de simulação | **NÃO** |
| `INTERNAL_RUNTIME` | `sourceKind === "INTERNAL_RUNTIME"` (memória interna CLP/runtime) | **NÃO** |
| `CALCULATED_DATA` | `sourceKind === "CALCULATED"` (variável derivada por fórmula) | **NÃO** |
| `FORCED_DATA` | Tag forçada manualmente por operador autorizado no supervisório | **NÃO** |
| `STALE_DATA` | `now - sourceTimestamp > staleAfterMs` | **NÃO** (exibe último valor válido + idade) |
| `BAD_QUALITY` | `quality === "BAD"` (`NON_FINITE`, `UNIT_INCOMPATIBLE`, falha de sensor) | **NÃO** |
| `NOT_CONNECTED` | Gateway offline, tag sem amostra inicial ou tag `PHYSICAL` sem `GatewayTagSource` ativo | **NÃO** |
