# ELÉTRICAI INDUSTRIAL OS — GATE 3.7
## DOCUMENTO 2: SAÚDE E CONFIABILIDADE DOS SERVIÇOS CLOUD

---

**Normas:** SRE Google, IEC 62443-4-2, RFC 7231  
**Responsabilidade:** Avaliação Contínua da Camada Central ElétricAi Cloud  

---

## 1. ESCOPO DA AVALIAÇÃO CLOUD

A camada Cloud do ElétricAi é avaliada determinística e continuamente em seus três componentes essenciais:
1. **APIs e Server Functions:** Endpoints de ingestão telemétrica e chamadas RPC TanStack Start.
2. **Banco de Dados (PostgreSQL / Supabase):** Conectividade do pool, latência de transação e integridade RLS.
3. **Serviços Dependentes Upstream:** APIs de inteligência artificial (Google Gemini) e serviços externos.

---

## 2. REGRAS DE CLASSIFICAÇÃO DETERMINÍSTICA

```mermaid
flowchart TD
    Start["Sonda de Saúde Cloud"] --> Maint{"Manutenção Registrada?"}
    Maint -->|Sim| S_Maint["Estado: MAINTENANCE\nSeveridade: INFO"]
    Maint -->|Não| DBPing{"Ping Banco OK?"}
    DBPing -->|Não| S_UnavailDB["Estado: UNAVAILABLE\nMotivo: DATABASE_CONNECTION_LOST\nSeveridade: CRITICAL"]
    DBPing -->|Sim| HttpCode{"Status HTTP"}
    HttpCode -->|>= 500 ou Off| S_UnavailHttp["Estado: UNAVAILABLE\nMotivo: HTTP_5XX_OUTAGE\nSeveridade: HIGH"]
    HttpCode -->|< 500| DepFail{"Falha Upstream?"}
    DepFail -->|Sim| S_DegrDep["Estado: DEGRADED\nMotivo: EXTERNAL_DEPENDENCY_DEGRADED\nSeveridade: MEDIUM"]
    DepFail -->|Não| LatencyCheck{"Latência da Resposta"}
    LatencyCheck -->|>= 5000ms| S_CritLat["Estado: DEGRADED\nMotivo: LATENCY_CRITICAL\nSeveridade: HIGH"]
    LatencyCheck -->|>= 1500ms| S_WarnLat["Estado: DEGRADED\nMotivo: LATENCY_HIGH\nSeveridade: MEDIUM"]
    LatencyCheck -->|< 1500ms| Hysteresis{"Histerese (3x OK?)"}
    Hysteresis -->|Ainda não| S_Stabilizing["Estado anterior retido\nMotivo: HYSTERESIS_STABILIZING"]
    Hysteresis -->|Sim| S_Healthy["Estado: HEALTHY\nMotivo: NOMINAL_OPERATION\nSeveridade: INFO"]
```

---

## 3. THRESHOLDS E INDICADORES OPERACIONAIS

| Métrica | Limiar de Alerta | Limiar Crítico | Ação Operacional |
| :--- | :--- | :--- | :--- |
| **Latência HTTP p95** | $\ge 1.500\text{ ms}$ | $\ge 5.000\text{ ms}$ | Diagnosticar pool de conexões e rotas lentas. |
| **Taxa de Erro 5xx** | $> 0.1\%$ | $> 1.0\%$ | Acionar incidente automático de infraestrutura. |
| **Latência de Pool DB** | $\ge 100\text{ ms}$ | $\ge 500\text{ ms}$ | Verificar saturação de workers e locks residuais. |
| **Upstream AI Outage** | 1 falha de timeout | 3 falhas consecutivas | Isolar dependência sem derrubar os serviços industriais. |
