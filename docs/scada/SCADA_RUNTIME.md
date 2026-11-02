# SCADA SUPERVISÓRIO — Motor de Execução Runtime

**Documento:** Especificação do Loop de Execução e Integração  
**Taxa de Varredura:** 100 ms (10 Hz nominal, desacoplado da renderização de 60 Hz)

---

## 1. Desacoplamento Arquitetural

O motor de execução do SCADA foi implementado de forma estritamente desacoplada da camada de persistência:
- **Zero Dirty Project**: Atualizações em tempo real de telemetria não marcam o projeto como `dirty` e não disparam requisições ao Supabase.
- **Isolamento de Estado**: O estado do runtime é armazenado em memória via Zustand no `useScadaStore`, espelhando variáveis vitais para o `useRuntimeStore`.
- **Sincronização Bidirecional**: Mudanças efetuadas nos diagramas Unifilar ou Multifilar refletem instantaneamente no inventário do SCADA e vice-versa.

---

## 2. Ciclo de Varredura (Scan Cycle)

A cada tick do motor:
1. **Verificação de E-STOP**:
   - Se o E-STOP estiver atuado, o fluxo de água e as potências das bombas permanecem em zero.
2. **Cálculo da Dinâmica de Fluidos**:
   - As vazões nominais das bombas P-01 (92,4 m³/h) e P-02 (90,3 m³/h) são somadas, resultando na vazão total de 182,7 m³/h com flutuações harmônicas determinísticas.
   - Os níveis dos tanques (T-101: 75,2%, T-102: 62,0%, T-105: 81,0%) respondem à taxa de entrada e saída.
3. **Cálculo Elétrico**:
   - O consumo ativo do quadro QM-01 é calculado pela soma das cargas mecânicas ativas mais consumo auxiliar da planta (248,5 kW nominal com fator de potência 0,94).
4. **Buffer do Historiador**:
   - A amostra é injetada no ring buffer `trendHistory` (mantendo até 120 pontos recentes para os gráficos multi-pen).
5. **Avaliação de Regras de Alarme ISA-18.2**:
   - Se qualquer grandeza ultrapassar os setpoints definidos, o alarme correspondente é acionado.
