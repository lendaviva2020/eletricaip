# ADR-001: Identidade Canônica Única de Equipamentos Industriais (Single Source of Truth)

- **Status:** Aceito
- **Data:** 01 de Novembro de 2026
- **Autor:** Principal Software Architect & Industrial Systems Engineer
- **Contexto Normativo:** IEC 61131-3, IEC 60617, ISA-101, ANSI/ISA-5.1

---

## 1. Contexto do Problema

A auditoria forense do Gate 0 (`SCADA_INDEPENDENT_AUDIT_2026-11-01.md`) revelou uma falha de engenharia arquitetural classificada como bloqueio P1 (**RSK-P1-01**):
O módulo SCADA operava sobre fixtures isoladas em memória (`INITIAL_EQUIPMENTS`), completamente desconectado dos diagramas Unifilar, Multifilar, Ladder, FBD e Digital Twin. Componentes criados pelo engenheiro nos diagramas de potência não existiam na supervisão, e o SCADA inventava seus próprios equipamentos da planta ETE.

Em uma plataforma de engenharia de missão crítica (ElétricAi Industrial OS), um motor, transformador ou disjuntor não pode ter três identidades divergentes.

---

## 2. Decisão Arquitetural

1. **Separação Rígida entre Entidade Canônica e Representação Gráfica:**
   Adota-se a entidade `CanonicalEquipment` (Schema v3 em `src/lib/model/unified-schema.ts`) como fonte única da verdade para todos os equipamentos do projeto.
   - Um equipamento possui um identificador estável único (`id` em formato ULID ou slug unívoco de engenharia).
   - O símbolo gráfico no Unifilar (`UnifilarNodeLayout`), a representação no Multifilar (`MultifilarNodeLayout`), o bloco de processo no FBD e a telemetria no SCADA (`EquipmentTelemetry`) são **projeções** da mesma entidade canônica.
   - A remoção de um nó gráfico no diagrama visual **NÃO** remove o equipamento físico canônico nem suas TAGs ou histórico.

2. **Ponte Canônica para o SCADA (`canonical-bridge.ts`):**
   O SCADA consome a função determinística `canonicalToScadaTelemetry(eq, linkedTags)`, derivando status, modo, grandezas elétricas nominais (`powerKw`, `voltageV`, `currentA`, `powerFactor`) e TAGs vinculadas diretamente do `UnifiedProjectDoc`.

3. **Isolamento de Seeds Demonstrativos:**
   A planta da ETE deixa de ser o estado default do aplicativo e é migrada para `src/lib/scada/demo-ete-seed.ts`. Projetos de clientes reais iniciam estritamente vazios de equipamentos até que sejam criados no unifilar/multifilar ou importados.

---

## 3. Consequências

### Positivas:
- Consistência de 100% dos identificadores entre Unifilar, Multifilar, Ladder, FBD, Twin e SCADA.
- Eliminação de duplicações e referências órfãs.
- Alterações em parâmetros de placa de motores (kW, FP, corrente) refletem imediatamente na telemetria supervisória sem necessidade de recadastro.

### Negativas / Mitigações:
- Exige que qualquer nova representação gráfica registre a chave `equipmentId` apontando para o registro canônico.
