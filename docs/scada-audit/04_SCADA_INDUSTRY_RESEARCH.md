# 04 — Pesquisa técnica independente

Pesquisa feita em 2026-11-16 em fontes públicas. As normas ISA/IEC são pagas e não foram lidas na íntegra; aqui estão apenas resumos públicos, sinalizados como tal. A página da ISA proíbe inserir propriedade intelectual da ISA em ferramentas de IA sem permissão, então nenhum texto de norma foi usado.

## Normas

**ANSI/ISA-112.00.01-2025 — SCADA Systems, Part 1: Lifecycle, Diagrams and Terminology.** Publicada pela ISA em fevereiro de 2026. Arcabouço neutro de fornecedor para ciclo de vida, terminologia e diagramas de SCADA; Partes 2 (processos de trabalho do ciclo de vida) e 3 (arquiteturas) planejadas. Um modelo de "11 camadas" aparece em uma única fonte secundária — não confirmado. Fontes: [ISA — produto](https://www.isa.org/products/ansi-isa-112-00-01-2025-scada-systems-part-1), [ISA — comunicado](https://www.isa.org/news-press-releases/2026/february/isa-announces-publication-of-new-standard-for-scad), [Control Engineering](https://www.controleng.com/new-scada-lifecycle-standard-supports-system-modernization/), [Control Global](https://www.controlglobal.com/industry-news/news/55364442/isa-publishes-ansi-isa-1120001-2025-scada-systemspart-1-scada-lifecycle-diagrams-and-terminology).

**ANSI/ISA-101.01-2015 — HMI.** Hierarquia de telas em até 4 níveis: 1 visão geral da área de controle (mostrando desvios), 2 área/unidade de operação, 3 detalhe de equipamento, 4 suporte/diagnóstico. A hierarquia pode ser reduzida; misturar níveis (detalhe na visão geral) é falha comum. Fontes secundárias: [Control Global](https://www.controlglobal.com/articles/2018/how-to-design-effective-hmis), [Control.com — Going Gray](https://control.com/technical-articles/going-gray/), [Automation.com — Level 1](https://www.automation.com/article/modern-dcs-graphics-level-1-overview-displays).

**ANSI/ISA-18.2 — Gerenciamento de alarmes.** Ciclo de vida contínuo (filosofia, identificação, racionalização, projeto, implementação, operação, manutenção, monitoramento, gestão de mudança, auditoria). Três mecanismos de supressão distintos: **shelving** (temporário, pelo operador, com lista de alarmes em shelving), **fora de serviço** (manutenção, com lista própria) e **supressão por projeto** (por estado da planta). O modelo de 7 estados citado por desenvolvedores não foi confirmado contra o texto da norma. Fontes: [ISA InTech — ciclo de vida](https://www.isa.org/intech-home/2018/march-april/features/alarm-management-life-cycle), [Process Online — parte 2](https://www.processonline.com.au/content/software-it/article/improving-alarm-management-with-isa-18-2-part-2-1141142642), [WinCC OA — shelving](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/alarmshelving/topics/alarm_shelving_overview.html).

**IEC 62443 e orientação CISA/NSA.** Segmentação em zonas e condutos definida por avaliação de risco (62443-3-2); acesso remoto como conduto em DMZ; preferência por conexões **iniciadas de dentro para fora** na fronteira OT. Fontes: [CISA — boas práticas ICS](https://CISA.gov/sites/default/files/publications/Cybersecurity_Best_Practices_for_Industrial_Control_Systems.pdf), [Cisco — 62443-3-3](https://cisco.com/c/en/us/products/collateral/security/isaiec-62443-3-3-wp.html), [CSO — orientação CISA/NSA](https://www.csoonline.com/article/3674832/us-cisa-nsa-release-new-ot-ics-security-guidance-reveal-5-steps-threat-actors-take-to-compromise-as.html). A recomendação de "somente saída" vem de cobertura secundária; conferir a redação original da CISA.

## Produtos

Detalhes e comparação no doc 05. Fontes principais: [Siemens WinCC Unified](https://www.siemens.com/global/en/products/automation/simatic-hmi/wincc-unified/software.html), [Ignition — Tag Historian](https://docs.inductiveautomation.com/docs/8.1/ignition-modules/tag-historian/how-the-tag-historian-system-works), [AVEVA Plant SCADA — docs](https://docs.aveva.com/bundle/plant-scada/page/1034687.html), [Rockwell FactoryTalk View SE — aplicações](https://www.rockwellautomation.com/en-ca/docs/factorytalk-view/16-00-00/se-help-ditamap/factorytalk-view-site-edition-help/factorytalk-view-se-applications.html).

## IA na supervisão industrial

**AWS IoT SiteWise Assistant** (lançado em novembro de 2024): assistente de IA generativa que combina dados de IoT, modelos de ativos e documentação para **resumir eventos e alarmes** e responder perguntas de diagnóstico; acessível por painel e por API; usa base de conhecimento (Amazon Kendra). Exemplo de parceiro (Cognizant) descreve a IA escolhendo máquinas, sensores, janelas de tempo e procedimentos para investigar a causa raiz. Não encontrei dados públicos de desempenho de causa raiz. Fontes: [AWS — anúncio](https://aws.amazon.com/about-aws/whats-new/2024/11/aws-iot-sitewise-generative-ai-powered-industrial-assistant), [AWS — documentação](https://docs.aws.amazon.com/iot-sitewise/latest/userguide/assistant-get-started.html), [AWS for Industries — exemplo de parceiro](https://aws.amazon.com/blogs/industries/powering-intelligent-factory-operations-with-cognizants-apex-factory-whisperer-and-aws).

## Distinção exigida

| Categoria | Exemplos |
|---|---|
| Disponível em produtos (documentado) | Resumo de alarmes por IA e perguntas em linguagem natural (SiteWise Assistant); historian com deadband, tempo máximo e agregação (Ignition); modelo de equipamento que agrupa tags, alarmes e permissões (AVEVA) |
| Possível para o ElétricAi (a desenvolver) | Assistente sobre tags/alarmes/histórico/topologia do próprio projeto, usando o Gemini já configurado |
| Depende de dados ainda inexistentes | Diagnóstico de equipamento real (exige telemetria real persistida com origem); correlação temporal (exige alarmes persistidos com carimbo de tempo); manutenção preditiva (exige histórico longo) |
