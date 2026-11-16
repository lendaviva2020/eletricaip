# 08 — Ciclo de vida do SCADA (ISA-112)

A ISA-112 Parte 1 (publicada em fevereiro de 2026) define ciclo de vida, terminologia e diagramas, mas o conteúdo detalhado é pago e não foi lido. Esta avaliação usa só o propósito público da norma: tratar o SCADA como sistema gerido ao longo do tempo, não como tela pronta.

## Onde o ElétricAi está no ciclo

| Etapa genérica do ciclo de vida | Situação no ElétricAi | Evidência |
|---|---|---|
| Requisitos e filosofia (o que supervisionar, quem opera) | Inexistente como artefato; os textos dos componentes citam normas sem requisitos rastreáveis | cabeçalhos de `scada-store.ts`, `scada.functions.ts` |
| Projeto (tags, alarmes, telas, comunicação) | Derivado do unifilar via ponte canônica — bom princípio | `canonical-bridge.ts` |
| Implementação | Módulos sólidos, interface desligada deles | doc 01 |
| Teste e comissionamento | 94 testes de módulo; nenhum de integração da interface; nenhum com equipamento real | doc 15 |
| Operação | Simulação apenas, com banner | — |
| Manutenção e mudança | Sem controle de versão de configuração de SCADA (alarmes/telas) | — |
| Descomissionamento | Exclusão de projeto limpa tabelas filhas (RISK-036) | AGENTS.md §10 |

## Terminologia

O código usa termos em inglês e português misturados ("Gate 1A", "Gate 2.5", "Supervisory Core v4.2", "ElétricAi Industrial OS v2.0.0"). Versões exibidas na interface (ex.: "Core v4.2", "v4.2 PRO" na lateral) não correspondem a nenhuma versão do produto (o `package.json` não tem versão). Recomendação: adotar a terminologia da ISA-112 na documentação e remover números de versão inventados da interface.

## Recomendação

- Criar `docs/scada/` com: filosofia de supervisão, filosofia de alarmes (ISA-18.2), guia de estilo de HMI (ISA-101) e registro de mudanças da configuração.
- Versionar a configuração de SCADA (alarmes, telas, mapeamento de tags) junto com o snapshot do projeto, aproveitando `project_versions`.
