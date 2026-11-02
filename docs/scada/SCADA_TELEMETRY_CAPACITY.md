# ELÉTRICAI INDUSTRIAL OS — SCADA HISTORIAN CAPACITY & SIZING STUDY
# GATE 2B: ESTUDO DE DIMENSIONAMENTO, VOLUME E POLÍTICA DE AQUISIÇÃO

**Documento:** `docs/scada/SCADA_TELEMETRY_CAPACITY.md`  
**Data:** 02/11/2026  
**Status:** HOMOLOGADO PARA ARQUITETURA GATE 2  
**Normas:** IEC 62443, ISA-95 (Enterprise-Control System Integration), ISA-101  

---

## 1. FÓRMULA FUNDAMENTAL DE INGESTÃO

Para amostragem periódica contínua sem compressão:

$$\text{AmostrasPorDia} = N_{\text{tags}} \times f_{\text{amostragem}} \times 86.400\,\text{s}$$

Onde:
- $N_{\text{tags}}$ é a contagem de TAGs ativas adquiridas.
- $f_{\text{amostragem}}$ é a frequência em Hertz ($\text{Hz} = \text{amostras/segundo}$).

Estimativa de payload por amostra normalizada no PostgreSQL (`tag_samples`):
- `id` (bigserial / snowflake): 8 bytes
- `project_id` (uuid): 16 bytes
- `tag_name` (text, ~16 chars): ~20 bytes
- `value` (double precision): 8 bytes
- `quality` (enum/text, ~4 chars): ~8 bytes
- `sampled_at` (timestamptz): 8 bytes
- Overhead de linha PostgreSQL (heap tuple header + index): ~32 bytes
- **Tamanho médio por amostra indexada:** $\approx 100\,\text{bytes}$

---

## 2. MATRIZ DE DIMENSIONAMENTO TEÓRICO (SEM COMPRESSÃO)

| TAGs Ativas | Freq. (Hz) | Amostras / Seg | Amostras / Dia | Amostras / Mês (30d) | Amostras / Ano (365d) | Volume / Dia | Volume / Mês | Volume / Ano |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **100** | 0,1 Hz (10s) | 10 | 864.000 | 25.920.000 | 315.360.000 | 86,4 MB | 2,59 GB | 31,5 GB |
| **100** | 1,0 Hz (1s) | 100 | 8.640.000 | 259.200.000 | 3.153.600.000 | 864 MB | 25,9 GB | 315 GB |
| **100** | 2,0 Hz (500ms) | 200 | 17.280.000 | 518.400.000 | 6.307.200.000 | 1,73 GB | 51,8 GB | 631 GB |
| **100** | 10,0 Hz (100ms) | 1.000 | 86.400.000 | 2.592.000.000 | 31.536.000.000 | 8,64 GB | 259,2 GB | 3,15 TB |
| **500** | 0,1 Hz (10s) | 50 | 4.320.000 | 129.600.000 | 1.576.800.000 | 432 MB | 12,9 GB | 158 GB |
| **500** | 1,0 Hz (1s) | 500 | 43.200.000 | 1.296.000.000 | 15.768.000.000 | 4,32 GB | 129,6 GB | 1,58 TB |
| **500** | 2,0 Hz (500ms) | 1.000 | 86.400.000 | 2.592.000.000 | 31.536.000.000 | 8,64 GB | 259,2 GB | 3,15 TB |
| **500** | 10,0 Hz (100ms) | 5.000 | 432.000.000 | 12.960.000.000 | 157.680.000.000 | 43,2 GB | 1,30 TB | 15,8 TB |
| **1.000** | 0,1 Hz (10s) | 100 | 8.640.000 | 259.200.000 | 3.153.600.000 | 864 MB | 25,9 GB | 315 GB |
| **1.000** | 1,0 Hz (1s) | 1.000 | 86.400.000 | 2.592.000.000 | 31.536.000.000 | 8,64 GB | 259,2 GB | 3,15 TB |
| **1.000** | 2,0 Hz (500ms) | 2.000 | 172.800.000 | 5.184.000.000 | 63.072.000.000 | 17,28 GB | 518,4 GB | 6,31 TB |
| **1.000** | 10,0 Hz (100ms) | 10.000 | 864.000.000 | 25.920.000.000 | 315.360.000.000 | 86,4 GB | 2,59 TB | 31,5 TB |
| **5.000** | 0,1 Hz (10s) | 500 | 43.200.000 | 1.296.000.000 | 15.768.000.000 | 4,32 GB | 129,6 GB | 1,58 TB |
| **5.000** | 1,0 Hz (1s) | 5.000 | 432.000.000 | 12.960.000.000 | 157.680.000.000 | 43,2 GB | 1,30 TB | 15,8 TB |
| **5.000** | 2,0 Hz (500ms) | 10.000 | 864.000.000 | 25.920.000.000 | 315.360.000.000 | 86,4 GB | 2,59 TB | 31,5 TB |
| **5.000** | 10,0 Hz (100ms) | 50.000 | 4.320.000.000 | 129.600.000.000 | 1.576.800.000.000 | 432 GB | 12,96 TB | 157,7 TB |
| **10.000** | 0,1 Hz (10s) | 1.000 | 86.400.000 | 2.592.000.000 | 31.536.000.000 | 8,64 GB | 259,2 GB | 3,15 TB |
| **10.000** | 1,0 Hz (1s) | 10.000 | 864.000.000 | 25.920.000.000 | 315.360.000.000 | 86,4 GB | 2,59 TB | 31,5 TB |
| **10.000** | 2,0 Hz (500ms) | 20.000 | 1.728.000.000 | 51.840.000.000 | 630.720.000.000 | 172,8 GB | 5,18 TB | 63,1 TB |
| **10.000** | 10,0 Hz (100ms) | 100.000 | 8.640.000.000 | 259.200.000.000 | 3.153.600.000.000 | 864 GB | 25,92 TB | 315,4 TB |

---

## 3. CONCLUSÕES ARQUITETURAIS DO DIMENSIONAMENTO

1. **Inviabilidade de Gravação Contínua Pura a 10 Hz no Navegador / HTTP:**
   - 1.000 TAGs a 1 Hz geram 1.000 inserts/s e ~8,6 GB/dia.
   - Requisições HTTP individuais a partir do cliente web esgotariam conexões e causariam saturação do navegador.
   - **Solução Mandatória:** Ingestão obrigatória em **lotes (batching)** com periodicidade configurável (ex: a cada 2s a 5s, ou ao atingir lote de 100 a 500 amostras), e uso de **Deadband por Exceção (Change-Based Sampling)**.

2. **Impacto do Deadband e Amostragem por Exceção:**
   - Variáveis térmicas, níveis de reservatórios e status de motores raramente variam significativamente a cada segundo.
   - Com deadband configurável ($\Delta V \ge \text{Deadband}$ ou batimento cardíaco máximo de 60s), o volume de dados ingerido cai entre **70% e 92%** em plantas industriais normais, sem perda de resolução de eventos.
   - Variáveis que mudam de qualidade (`GOOD` $\to$ `BAD` $\to$ `STALE`) são persistidas imediatamente com prioridade zero-drop.

3. **Arquitetura de Três Camadas de Armazenamento:**
   - **Tier 1 (Hot - Memória / Zustand Ring Buffer):** Últimas 500 a 1.000 amostras por TAG para renderização de tendências em tempo real e gráficos instantâneos (latência $< 16\,\text{ms}$).
   - **Tier 2 (Warm - PostgreSQL / Supabase `tag_samples` particionado mensalmente):** Amostras brutas gravadas em lote via `batch_insert_tag_samples` com retenção configurável (7 a 30 dias).
   - **Tier 3 (Cold / Aggregated):** Rollups de 1 minuto e 1 hora para consultas de longo prazo (relatórios operacionais e tendências históricas de 24h a 1 ano).

---

## 4. CONTRATO DO EDGE GATEWAY (STORE-AND-FORWARD)

Para comunicação com o futuro **ElétricAi Edge Gateway**:
- Buffer em disco local no dispositivo de borda (SQLite ou WAL persistente).
- Em caso de desconexão WAN, as amostras continuam sendo carimbadas com `sourceTimestamp` original e `quality = "GOOD"`.
- No restabelecimento do link, o gateway despacha lotes ordenados por timestamp com token de idempotência (`sequenceNumber`), prevenindo duplicação ou distorção temporal no Historian central.
