# ELÉTRICAI INDUSTRIAL OS — SCADA SUPERVISÓRIO
## MANUAL DE IMPLEMENTAÇÃO DO HISTORIADOR PERSISTENTE

**Documento:** SCADA_HISTORIAN_IMPLEMENTATION.md  
**Status:** APROVADO — GATE 2  
**Normas:** OPC UA Historical Data Access (Part 11), IEC 62443, ISO 27001

---

## 1. MODELO DE DADOS E ESQUEMA RELACIONAL

O armazenamento das séries temporais de telemetria industrial reside na tabela `tag_samples`, particionada mensalmente por data da coleta (`sampled_at`).

### 1.1 Estrutura da Tabela `tag_samples`
```sql
CREATE TABLE public.tag_samples (
    id BIGSERIAL NOT NULL,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    tag_name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    quality VARCHAR(32) NOT NULL DEFAULT 'GOOD',
    sampled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (id, sampled_at)
) PARTITION BY RANGE (sampled_at);
```

### 1.2 Índices Otimizados para Séries Temporais
Para viabilizar consultas em sub-segundo em milhões de registros:
```sql
CREATE INDEX idx_tag_samples_project_tag_time 
ON public.tag_samples (project_id, tag_name, sampled_at DESC);
```

---

## 2. ARQUITETURA DE INGESTÃO (STORE & FORWARD)

Ingestões diretas síncronas HTTP a cada 100ms são inviáveis em ambientes industriais distribuídos. Por isso, a arquitetura emprega o padrão **Store-and-Forward**:

1. **Buffer Local em Memória (`bufferedHistoricalSamples`):**
   - Coleta amostras processadas pelo `IndustrialTagRuntime`.
   - Aplica filtro de banda morta (`deadband`) para descarte de ruídos.
   - Amostras retidas temporariamente em ring-buffer com limite máximo de segurança.

2. **Descarga Periódica em Lote (`ingestTagSamplesBatch`):**
   - Executada a cada 5 segundos ou quando o buffer atinge 50 amostras.
   - Chamada serverless autenticada via TanStack Start e protegida por RLS.
   - Multi-tenant enforcement: rejeita qualquer inserção cujo `project_id` não pertença à organização do operador.

---

## 3. CONSULTAS ANALÍTICAS E DOWNSAMPLING

A função de servidor `queryHistorianRange` provê consultas de alto desempenho sobre o histórico persistido.

### 3.1 Parâmetros de Entrada
- `projectId`: UUID do projeto auditado.
- `tagNames`: Lista de TAGs a recuperar (ou vazio para todas as TAGs do projeto).
- `startTime`: Timestamp ISO inicial.
- `endTime`: Timestamp ISO final.
- `downsampleMinutes`: Intervalo de bucket para agrupamento (ex: 1, 5, 15, 60 minutos).
- `limit`: Teto máximo de pontos para preservação de memória no cliente.

### 3.2 Algoritmo de Agregação e Estatísticas
Para cada TAG solicitada, o motor calcula:
- **Mínimo:** $\min_{i=1}^n \{v_i\}$
- **Máximo:** $\max_{i=1}^n \{v_i\}$
- **Média Aritmética:** $\mu = \frac{1}{n} \sum_{i=1}^n v_i$
- **Desvio Padrão Amostral:** $\sigma = \sqrt{\frac{1}{n} \sum_{i=1}^n (v_i - \mu)^2}$
- **Distribuição de Qualidade:** Identificação de proporções de amostras `GOOD`, `UNCERTAIN` e `STALE`.

---

## 4. EXPORTAÇÃO COMPLETA DE TELEMETRIA (CSV)

O console de tendências (`src/components/scada/views/scada-trends-view.tsx`) implementa a geração de arquivos CSV de telemetria contendo:
- `Timestamp_ISO`: Data/hora formatada em UTC/ISO 8601.
- `Epoch_ms`: Timestamp em milissegundos para ferramentas de análise numérica (MATLAB, Python/Pandas).
- Colunas dedicadas para cada variável com respectiva unidade de engenharia (ex: `M-01_CORRENTE_A`, `P-01_VAZAO_m3h`).
