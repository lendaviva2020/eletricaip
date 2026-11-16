# 03 — Análise das imagens de referência

As 5 imagens anexadas foram examinadas. Nenhuma identidade visual, marca ou desenho proprietário deve ser copiado; o que se aproveita são padrões de informação e operação.

## Imagem 1 — "Machine Overview" (estilo Siemens, planta de água gelada de data center)

- **Propósito:** visão de uma área (laços de água de resfriamento e água gelada, 3 chillers, 2 tanques TES, 6 servidores).
- **Hierarquia:** barra superior de estado da máquina (Power ON, Mode Production, State Execute, Operator) com botões Start/Stop/Reset/Ack; faixa de mensagem do sistema; processo ocupando quase toda a tela; menu lateral de ícones.
- **Equipamentos:** válvulas e bombas com tag (C1V1, CT1P), estado por cor da etiqueta (verde/vermelho), valores com unidade junto ao equipamento (°C, L/s, rpm).
- **O que aproveitar:** (1) estado da máquina e operador sempre visíveis no topo; (2) **valor + unidade colado ao instrumento**; (3) tubulação codificada por função (quente/frio), não por estética; (4) barra de mensagem única do sistema.
- **Cuidado:** cores saturadas (vermelho/azul fortes) para tubulação competem com a cor de alarme. Na abordagem ISA-101, cor forte fica reservada para anormalidade.

## Imagem 2 — "Water Treatment Plant" (integrador, tema escuro)

- **Propósito:** visão geral de uma ETA em 10 etapas numeradas.
- **Hierarquia:** cabeçalho com relógio/operador, contadores de alarme e aviso, "All systems normal", modo AUTO e vazão total; processo no centro; coluna direita com resumo da planta, estado dos equipamentos (2/2, 5/6) e níveis de tanque; navegação inferior por área (Overview, Pumps, Tanks, Trends, Alarms, Reports, Settings).
- **O que aproveitar:** (1) **etapas numeradas na ordem do processo**; (2) resumo "equipamentos disponíveis / total" por tipo; (3) navegação por área no rodapé; (4) indicação RUN/STANDBY de bombas redundantes A/B.
- **Cuidado:** gráficos 3D/fotorrealistas e fundo com muitas cores atrapalham a detecção de anormalidade (contra os princípios de HMI de alto desempenho). O ElétricAi hoje segue esse estilo no sinótico da ETE.

## Imagem 3 — ClearSCADA / ViewX "NorthSide WTP"

- **Propósito:** ambiente de operação e engenharia: árvore de banco de dados à esquerda, "mimic" no centro, lista de alarmes embaixo.
- **O que aproveitar:** (1) **árvore de ativos/objetos** navegável (hierarquia como espinha do sistema); (2) **banner de alarmes fixo embaixo** com severidade, hora, origem e mensagem, e contador grande de alarmes ativos; (3) atalhos no próprio desenho para "Plant Alarms", "Flow Summary", "Level Trend"; (4) alarmes de **comunicação** ("Communications state - Failed") tratados como alarmes de primeira classe.
- **Relevância direta:** o ElétricAi não tem árvore de ativos no SCADA nem alarme de falha de comunicação real.

## Imagem 4 — "Pre-Bottling Overview" (rockwellautomation.com)

- **Propósito:** linha de pré-envase de vinho: tanques, filtros, dosagem, duas linhas de produção.
- **O que aproveitar:** (1) **botão "Trend" ao lado de cada variável** (acesso de 1 clique ao histórico do ponto); (2) blocos de "Actual vs Setpoint" por linha; (3) estado da etapa de produção ("Production Step 10", "Working").
- **Cuidado:** densidade alta e fundo azul saturado.

## Imagem 5 — Sala de controle (fotografia)

- **Propósito:** ilustra o ambiente de uso: parede de vídeo com visões gerais e operadores com telas de detalhe.
- **Observação:** é uma imagem ilustrativa; os textos das telas não são legíveis, então não serve como referência de conteúdo.
- **O que aproveitar:** o conceito de **duas escalas**: visão geral para a sala inteira (Nível 1) e telas de detalhe por operador (Níveis 2–3). O SCADA web do ElétricAi deve funcionar em monitor grande e em notebook.

## Síntese para o ElétricAi

| Padrão | Presente hoje? | Prioridade |
|---|---|---|
| Valor + unidade + qualidade junto ao equipamento | Parcial (valores fabricados) | Fase 0/2 |
| Árvore de ativos navegável | Não | Fase 2 |
| Banner de alarmes fixo com contador | Parcial (alarmes não persistidos) | Fase 3 |
| Alarme de falha de comunicação | Não (status fixo "CONNECTED") | Fase 0/5 |
| Tendência a 1 clique por variável | Não (tendência só de 2 min em memória) | Fase 4 |
| Disponíveis/total por tipo de equipamento | Não | Fase 2 |
| Hierarquia de telas (visão geral → área → equipamento) | Parcial (só setores da ETE demo) | Fase 2 |
| Paleta neutra com cor só para anormalidade | Não (tema escuro saturado) | Fase 2 |
