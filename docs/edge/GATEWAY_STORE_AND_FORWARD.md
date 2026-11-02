# ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
## GATEWAY STORE-AND-FORWARD & TRANSACTIONAL BUFFER SPECIFICATION

**Padrão de Confiabilidade:** ACID Transactional Durability, At-Least-Once Delivery with Idempotency  
**Módulo Responsável:** `src/lib/edge/buffer/sqlite-outbox.ts`

---

## 1. OBJETIVO DO BUFFER OFFLINE

Garantir que falhas de conectividade de rede externa (queda de link de fibra, instabilidade de 4G/5G industrial ou manutenção de provedor de internet) não resultem em perda de amostras de telemetria, dados de consumo de energia ou registros de eventos operacionais.

---

## 2. MECANISMO TRANSACIONAL OUTBOX

1. **Ingestão Local:** Amostras adquiridas pelos drivers industriais são gravadas na fila persistente do Gateway antes de qualquer tentativa de envio pela rede.
2. **Ciclo de Estados da Amostra:**
   - `PENDING`: Amostra armazenada no buffer local aguardando envio.
   - `IN_FLIGHT`: Lote de amostras enviado para a nuvem aguardando confirmação (ACK).
   - `ACKNOWLEDGED`: A nuvem confirmou o recebimento e gravação no Historian; a amostra é expurgada do disco do Gateway.
   - `DROPPED_SATURATION`: Registrado caso o buffer atinja a capacidade máxima configurada.

```
       ┌──────────┐
       │ PENDING  │◄─────────────┐ (Timeout / Falha de Envio)
       └────┬─────┘              │
            │ (Peek Batch)       │
            ▼                    │
       ┌───────────┐             │
       │ IN_FLIGHT ├─────────────┘
       └────┬──────┘
            │ (ACK da Cloud)
            ▼
      [ACKNOWLEDGED] -> (Expurgado do Buffer)
```

---

## 3. IDEMPOTÊNCIA E RECONCILIAÇÃO TEMPORAL

- **Chave de Idempotência:** Cada amostra recebe um identificador determinístico gerado no Edge (`id`), composto por UUID ou monotonic sequence number.
- **Inserção Segura no Historian Cloud:** O backend utiliza `ON CONFLICT (id) DO NOTHING` ou verificação por timestamp e TAG, impedindo que reenvios causados por quedas de pacotes gerem amostras duplicadas no banco de dados corporativo.
- **Diferenciação de Timestamps:**
  - `sourceTimestamp`: Hora exata em que o CLP/sensor realizou a leitura. Preservada intacta durante todo o ciclo.
  - `edgeReceivedAt`: Hora em que o Gateway recebeu a leitura no barramento industrial.
  - `cloudReceivedAt`: Hora em que a nuvem recebeu o lote descarregado.
  - `isDelayedReplay`: Flag booleana marcada como `true` para amostras que foram descarregadas após reconexão da rede.

---

## 4. POLÍTICAS DE SATURAÇÃO E CAPACIDADE DE DISCO

- **Capacidade Padrão:** 50.000 amostras em memória/disco (equivalente a mais de 8 horas de retenção para 100 TAGs a 1 Hz com 80% de supressão por deadband).
- **Limite de Disco:** 100 MB configurável.
- **Aviso de Alarme de Espaço:** Quando o buffer atinge 80% da capacidade, o indicador `isNearLimit: true` é emitido na telemetria de saúde e aciona o alarme de supervisão `Buffer Near Limit`.
- **Política de Descarte (Sobrecarga Extrema):**
  - `DROP_OLDEST_NON_CRITICAL`: Descarta os pontos mais antigos de telemetria analógica suave para preservar os eventos de alarme e dados críticos recentes.
  - `DROP_NEWEST_WITH_ALARM`: Bloqueia novas ingestões e dispara alarme crítico de saturação.
