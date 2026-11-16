# 06 — HMI frente aos princípios da ISA-101

Avaliação baseada nos resumos públicos da ISA-101 (doc 04) e nas telas do app capturadas em 2026-11-16 (modo demonstração).

## Hierarquia de telas

| Nível | Esperado | No ElétricAi hoje | Lacuna |
|---|---|---|---|
| 1 — Visão geral | Área inteira, só desvios | "Visão Geral": KPIs, sinótico da ETE, alarmes, tendências e cards na MESMA tela | Mistura níveis 1, 2 e 4; KPIs fixos (`scada-overview-view.tsx:337-370`) |
| 2 — Área/unidade | Operação de uma área | Setores só existem para a ETE de demonstração (`scada-overview-view.tsx:78`) | Projeto de cliente não tem áreas |
| 3 — Equipamento | Faceplate | `equipment-inspector-drawer.tsx` e detalhe do CCM | Bom ponto de partida |
| 4 — Diagnóstico | Comunicação, tags, eventos | Abas Comunicação, Tags, Eventos | Comunicação mostra constante |

## Cor e estado

- O tema é escuro e saturado (azuis, verdes, laranja). O sinótico da ETE usa tanques coloridos e tubulação colorida, como nas imagens 2 e 4.
- Pela abordagem de HMI de alto desempenho, cor forte fica reservada para anormalidade. Hoje o verde "Tempo Real" e os KPIs coloridos competem com os alarmes.
- O CCM segue melhor a regra: cinza parado, verde ligado, vermelho piscando em falha não reconhecida, hachura com `prefers-reduced-motion` (AGENTS.md §13).

## Fidelidade do dado exibido

Um HMI que mostra valor fabricado é pior que um HMI vazio: o operador confia no número.

| Elemento | Situação |
|---|---|
| Valores de tag de cliente | Fabricados pelo nome do tag (`scada-store.ts:727-736`) |
| KPIs de confiabilidade | Fixos, rotulados "Tempo Real" |
| Status de drivers | Fixo "CONNECTED"/"100% OK" |
| Qualidade do tag | Sempre "GOOD" ao carregar, sem fonte (`canonical-bridge.ts:94`) |
| Banner de simulação | ✅ presente e obrigatório |

## Navegação e layout

- ✅ Barra superior com relógio, E-STOP virtual, áudio, modo simulação; lateral com 12 visões; barra de status.
- ⚠️ Não há árvore de ativos (imagem 3) nem acesso de 1 clique à tendência de uma variável (imagem 4).
- ⚠️ A "Visão Geral" mistura tudo; não há banner de alarmes fixo no rodapé com contador (imagem 3).
- ✅ Responsividade não foi testada em celular nesta auditoria; o layout usa grades com quebra (não verificado).

## Recomendação (Fase 2)

1. Visão Geral só com desvios e estado por área; KPIs só quando houver fonte calculável (ex.: disponibilidade a partir do histórico de estados), senão "sem dados".
2. Áreas derivadas da hierarquia do projeto (`=planta+local` da Documentação EletricAI) em vez de setores fixos da ETE.
3. Faceplate único por equipamento canônico, com tags, alarmes, tendência e documentos.
4. Paleta neutra com cor reservada a alarme e falha de comunicação.
