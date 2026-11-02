# ADR-005: Historiador Persistente Particionado e Motor Determinístico de Alarmes ISA-18.2

**Status:** Aprovado  
**Data:** 02 de Novembro de 2026  
**Decisores:** Antigravity Autonomous Systems Architecture Team, ElétricAi Industrial Engineering  
**Contexto:** ElétricAi Industrial OS — SCADA Supervisório — Gate 2

---

## 1. Contexto do Problema

O SCADA Supervisório necessitava evoluir de sua estrutura inicial em memória para uma infraestrutura industrial robusta, capaz de atender aos seguintes requisitos fundamentais:

1. **Volume e Retenção de Telemetria:** Suportar taxas de varredura industriais (100ms a 10s) para centenas a milhares de variáveis de processo sem sobrecarregar a largura de banda de rede nem degradar o banco de dados relacional.
2. **Gerenciamento de Alarmes Normativo (ISA-18.2):** Garantir que disparos, reconhecimentos, histerese, temporizações e condições transitórias sigam estritamente o ciclo de vida da norma internacional ANSI/ISA-18.2.
3. **Isolamento Estrito Multi-Tenant:** Garantir que clientes industriais distintos nunca acessem séries temporais, alarmes ou registros de auditoria pertencentes a outros tenants.
4. **Integridade da Trilha de Auditoria:** Oferecer garantias criptográficas de não repúdio e detecção de adulteração em logs operacionais.

---

## 2. Decisões de Arquitetura

### Decisão 1: Particionamento Mensal da Tabela `tag_samples`
Adotou-se o particionamento nativo por intervalo de tempo (`RANGE (sampled_at)`) na tabela `tag_samples`.
- **Justificativa:** Permite descarte instantâneo de dados legados via `DROP TABLE` de partições expiradas (evitando `DELETE` massivo com locks prolongados de tabela), além de permitir que consultas com filtro de data realizem partition pruning imediato.

### Decisão 2: Arquitetura Store-and-Forward no Cliente/Gateway com Filtro de Deadband
Implementou-se no `IndustrialTagRuntime` um buffer de retenção local combinado com deadband configurável.
- **Justificativa:** Micro-variações de processo inferiores ao threshold de ruído não geram novas amostras no banco de dados, reduzindo o volume de I/O em até 70% sem perda de precisão de engenharia. Amostras significativas são enviadas em lotes compactos a cada 5 segundos.

### Decisão 3: Motor de Alarmes Determinístico com Clock Injetável
O `DeterministicAlarmEngine` foi implementado como uma máquina de estados pura com suporte a injeção de provedor de tempo (`timeProvider`).
- **Justificativa:** Garante previsibilidade matemática, ausência de condições de corrida e viabiliza testes unitários determinísticos de temporizadores (`delayOnMs` / `delayOffMs`) e chattering sem necessidade de sleeps reais.

### Decisão 4: Cadeia de Hash Criptográfica (SHA-256) na Trilha de Auditoria
Cada registro em `audit_logs` calcula seu hash unindo o hash anterior do tenant, dados da ação e carimbo de data/hora.
- **Justificativa:** Atende aos requisitos rigorosos de conformidade (21 CFR Part 11 e ISO 27001), permitindo que qualquer tentativa de exclusão ou alteração de registros em banco de dados seja detectada como quebra de encadeamento.

---

## 3. Consequências e Resultados

### Positivas
- **Desempenho Estável:** Ingestão de telemetria desacoplada do ciclo de renderização React, mantendo a interface fluida em 60 FPS.
- **Auditabilidade Integral:** Todos os comandos de forçamento, disparos e reconhecimentos de alarme possuem proveniência rastreável (`operator`, `source`, `timestamp`).
- **Resiliência a Falhas de Rede:** Perda de conexão dispara alarme de comunicação `COMMUNICATION` sem apagar os alarmes de processo pré-existentes.

### Negativas / Trade-offs
- Requer gerenciamento periódico de criação de partições no PostgreSQL (automatizável via pg_partman ou cron job de infraestrutura).
- Leituras forçadas por operadores exigem atenção rigorosa da equipe de supervisão para não mascarar anomalias prolongadas de campo.
