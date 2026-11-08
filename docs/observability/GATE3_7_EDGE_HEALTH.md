# ELÉTRICAI INDUSTRIAL OS — GATE 3.7
## DOCUMENTO 3: SAÚDE, RECURSOS E DIAGNÓSTICO DO EDGE GATEWAY

---

**Normas:** IEC 62443-4-2, NIST SP 800-82 Rev. 3  
**Foco:** Agente Edge Daemon, SQLite WAL, Telemetria de Hardware e Conectividade  

---

## 1. INDICADORES DE HARDWARE E SISTEMA OPERACIONAL

O agente Edge coleta e transmite a cada ciclo de heartbeat os seguintes indicadores físicos de saúde:

1. **Uso de CPU (%):**
   - Aviso: $\ge 80.0\%$
   - Crítico: $\ge 95.0\%$
2. **Uso de Memória RAM (%):**
   - Aviso: $\ge 85.0\%$
   - Crítico: $\ge 95.0\%$
3. **Uso de Disco (%):**
   - Aviso: $\ge 85.0\%$
   - Crítico: $\ge 92.0\%$ (Aviso severo de risco de corrupção WAL do SQLite).
4. **Desvio de Relógio (Clock Drift):**
   - Tolerância máxima: $\pm 1.000\text{ ms}$ em relação ao tempo Cloud NTP.
   - Desvio excessivo aciona estado `DEGRADED` com código `CLOCK_DRIFT_EXCEEDED` para prevenir timestamping anacrônico em séries temporais.
5. **Estado do Certificado mTLS:**
   - `VALID`: Operação nominal.
   - `EXPIRING_SOON`: Menos de 30 dias para expiração (alerta preventivo).
   - `EXPIRED`: Certificado vencido (estado `DEGRADED`).
   - `REVOKED`: Certificado explicitamente revogado (estado `UNAVAILABLE` por bloqueio de segurança).

---

## 2. TRATAMENTO DE AMBIENTES RESTRITOS (`NOT_INSTRUMENTED`)

Sistemas operacionais embarcados ou dispositivos industriais legados (ex: RTUs com RTOS proprietário) que não expõem APIs de medição de CPU ou memória RAM **NÃO** podem ter seus valores preenchidos com zero para fingir saúde perfeita.

Nesses casos, o motor de observabilidade classifica formalmente o componente como:
`state: "NOT_INSTRUMENTED"`  
`reasonCode: "HARDWARE_METRICS_UNAVAILABLE"`  
`metricValues: { isInstrumented: false }`

---

## 3. TIMEOUT DE HEARTBEAT E GESTÃO DE ESTADO OFFLINE

- Intervalo nominal de heartbeat: $5.000\text{ ms}$.
- Limiar de tolerância antes de declarar indisponibilidade: $30.000\text{ ms}$ (6 falhas consecutivas).
- Ao atingir o limiar, o estado transiciona para `UNAVAILABLE` com o código `HEARTBEAT_TIMEOUT`.
