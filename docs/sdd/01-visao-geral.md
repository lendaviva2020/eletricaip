---
status: done
owner: equipe
last_review: 2026-05-25
---

# 01 · Visão Geral

**EletricAI Industrial OS** — SaaS multi-tenant para engenheiros elétricos industriais brasileiros. Unifica CAD elétrico, programação de CLPs, supervisão SCADA, Digital Twin e geração de projetos via IA em um workspace baseado em browser.

## Proposta de valor

- Diagramas conformes (NBR 5410, NR-10, NR-12, IEC 61131-3)
- Simulação de lógica CLP (Ladder, FBD, ST) antes de deploy em hardware real
- Supervisão SCADA + OPC-UA / Modbus TCP em tempo real
- Geração de projetos a partir de briefing em linguagem natural

## Usuários-alvo

- Engenheiros de automação e painéis elétricos
- Empresas de engenharia que entregam projetos normatizados
- Integradores OPC-UA / Modbus

## Princípios de produto

1. **Browser-first** — zero instalação local
2. **Determinístico** — simulações reprodutíveis (mesmo seed → mesmo output)
3. **Normativo** — validação contínua contra NBRs e IEC
4. **Reversível** — toda mutação via Command Pattern (undo/redo completo)
5. **Multi-tenant** — isolamento estrito via RLS

## Gaps

Nenhum nesta camada.
