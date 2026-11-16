# 14 — Arquitetura-alvo do SCADA

Princípio: **nenhum serviço novo onde um existente atende**. Sem segundo banco de tags, segundo runtime, segundo sistema de projetos ou de autenticação.

```
 FONTES (todas rotuladas por origem)
 ├─ Edge somente leitura (Modbus TCP / OPC UA / Sparkplug B) ── conexão de dentro para fora ─┐
 ├─ IoT por chave de API (ESP32) e bancada Arduino (Web Serial → servidor) ───────────────────┤
 └─ Simulação explícita (CCM, planta 8M+2EX, ETE demo) ── origem "simulação:<motor>" ─────────┤
                                                                                              ▼
 INGESTÃO (server functions já existentes, endurecidas)
   ingestEdgeTelemetryBatch · ingest_bench_telemetry · ingest_iot_reading · ingestTagSamplesBatch
   → validação Zod, lote máximo, empresa/papel/plano no banco, origem obrigatória
                                                                                              ▼
 MODELO ÚNICO DO PROJETO (unified-schema)
   CanonicalEquipment ── tags canônicas (com origem e endereço) ── hierarquia =planta+local-tag
                                                                                              ▼
 RUNTIME NO NAVEGADOR (tag-runtime.ts existente)
   qualidade (GOOD / UNCERTAIN / STALE / NOT_CONNECTED / FORCED), deadband, tempo máximo
                                                                                              ▼
 SERVIÇOS DO PROJETO
   ├─ Alarmes: alarm-engine.ts + alarm_configs/alarm_history (um serviço; ack, shelving, OOS)
   ├─ Histórico: tag_samples (+ origem/unidade) + queryHistorianRange com agregação
   ├─ Auditoria: audit_logs com cadeia de hash + audit-verifier.ts
   └─ Relatórios: generateOperationalReportData
                                                                                              ▼
 INTERFACE (hierarquia ISA-101)
   Nível 1 visão geral (desvios) · Nível 2 áreas (=planta+local) · Nível 3 faceplate do equipamento
   · Nível 4 diagnóstico (comunicação real, tags, eventos) · CCM · Editor HMI (mesma base)
                                                                                              ▼
 IA ASSISTIVA (somente leitura, Gemini já configurado, créditos e limites existentes)
   contexto citável → fatos / correlações / hipóteses / verificações → nunca comanda

 TRAVA: IS_PHYSICAL_CONTROL_ALLOWED = false (constante) — nenhum caminho escreve em campo.
```

## Decisões-chave

1. **Origem em todo valor.** Sem origem, o valor não aparece como leitura; aparece "sem fonte".
2. **Simulação é uma fonte como outra**, rotulada, nunca misturada com real no histórico sem marcação.
3. **O CCM e a bancada Arduino viram fontes** do SCADA (hoje são ilhas).
4. **Uma base de tags e um serviço de alarmes por projeto**, consumidos por SCADA, editor HMI, modo Alarmes e Simulação.
5. **Persistência usa as tabelas existentes**, com uma migration pequena para a origem em `tag_samples` (sob aprovação).
6. **Banco de séries temporais dedicado, redundância e servidor OPC UA ficam adiados** até haver volume ou contrato que justifique.
