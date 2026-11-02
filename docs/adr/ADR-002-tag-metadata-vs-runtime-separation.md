# ADR-002: Separação entre Metadados de TAGs e Estado de Runtime

- **Status:** Aceito
- **Data:** 01 de Novembro de 2026
- **Autor:** Principal Software Architect & Industrial Systems Engineer
- **Contexto Normativo:** IEC 61131-3, ISA-18.2, OPC Unified Architecture (IEC 62541)

---

## 1. Contexto do Problema

No design anterior, a definição estática de uma TAG (endereço, escala, unidade, tipo, equipamento associado) estava acoplada ao valor numérico instantâneo recebido da simulação ou de barramento de campo. A cada ciclo de scan (100 ms), o objeto de definição era re-mutado na store, arriscando marcação do projeto como "dirty" e disparando sincronizações persistentes desnecessárias no banco de dados.

Adicionalmente, valores forçados (`FORCED`) e qualidade de comunicação (`GOOD`, `BAD`, `UNCERTAIN`, `STALE`, `NOT_CONNECTED`) não estavam formalmente desacoplados da configuração permanente da malha de automação.

---

## 2. Decisão Arquitetural

1. **Separação de Camadas (Design vs. Runtime):**
   - **Metadados Canônicos (`CanonicalTag`):** Persistidos no banco de dados relacional (PostgreSQL/Supabase) dentro de `UnifiedProjectDoc.engineering.tags`. Contêm nome, área (%I, %Q, %M, DB), tipo de dado IEC 61131-3, endereço simbólico, unidade, limites de escala e ID do equipamento vinculado.
   - **Estado Volátil de Runtime (`useRuntimeStore` / `ScadaTagDefinition.value`):** Mantido exclusivamente em memória volátil (RAM do navegador ou Edge Gateway). Não marca o projeto como alterado (`dirty: false`) e não gera tráfego de gravação de snapshot de diagrama.

2. **Qualidade e Origem Explícitas:**
   - Cada valor de processo possui carimbo de tempo da fonte (`timestamp`), carimbo de recepção, qualidade (`GOOD | BAD | UNCERTAIN | STALE | NOT_CONNECTED | FORCED`) e origem explícita (`SIMULATED | INTERNAL_RUNTIME | OPC_UA | MODBUS_TCP | MQTT | IMPORTED`).
   - Variáveis originadas do motor matemático senoidal são marcadas indelévelmente com `driver: "SIMULATION"`, `isSimulated: true`, impedindo que simulações sejam apresentadas ao operador como telemetria de campo real.

3. **Consumo Unificado por Múltiplos Widgets:**
   - Displays numéricos, gauges, alarmes, gráficos de tendência e o inspetor de equipamentos consom o mesmo `id` de TAG e o mesmo valor de runtime centralizado.

---

## 3. Consequências

### Positivas:
- Alta taxa de atualização (60 Hz / 100 ms) sem impacto na persistência do Supabase.
- Rastreabilidade total entre engenharia de projeto e tempo de execução.
- Suporte nativo a forçamento de tags com identificador de operador e qualidade `FORCED`.
