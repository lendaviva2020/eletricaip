# 05 — Comparação: WinCC Unified, Ignition, AVEVA, FactoryTalk, SiteWise e normas

Custo arquitetural: B = baixo (usa o que existe), M = médio, A = alto.

| Referência | Recurso encontrado | Fonte | Valor para o ElétricAi | Existe hoje? | Custo | Recomendação |
|---|---|---|---|---|---|---|
| WinCC Unified | Alarmes e **registro** (arquivo ou banco), trilha de auditoria registrada | [Siemens](https://www.siemens.com/global/en/products/automation/simatic-hmi/wincc-unified/software.html), [manual de runtime](https://cache.industry.siemens.com/dl/files/707/109826707/att_1162753/v1/UnifiedRT_enUS_en-US.pdf) | Alarme e auditoria precisam sobreviver ao recarregar a página | Motor existe; não persiste | B (tabelas existem) | **Adotar** (Fase 3) |
| WinCC Unified | Cliente web HTML5; gestão de usuários local/central com direitos por função | idem | Já é web; falta permissão por função de operação | Papéis por empresa; sem permissão fina de operação | M | Adotar parcialmente |
| WinCC Unified | Servidor OPC UA e A&C | [webinar V17](https://assets.new.siemens.com/siemens/assets/api/uuid:20246010-a0d7-4c88-82d6-afec019d5273/v17-launch-webnar-wincc-unified-v17-highlight-innvovations.pdf) | — | Não | A | **Não** agora |
| Ignition | Historian: amostragem periódica ou por mudança, deadband (corredor para analógico), **tempo máximo** entre amostras, partição e expurgo | [Inductive Automation](https://docs.inductiveautomation.com/docs/8.1/ignition-modules/tag-historian/how-the-tag-historian-system-works) | O runtime já tem deadband; falta tempo máximo, origem e retenção | Parcial | M | **Adotar** (Fase 4) |
| Ignition | Consulta por intervalo com agregação para caber na janela do gráfico | idem | Tendência hoje é só 2 min em memória | Não (servidor tem `queryHistorianRange` sem uso) | B | **Adotar** |
| Ignition | Provedores de tags e arquitetura modular | idem | Base única de tags | Não (4 bases) | M | **Adotar o princípio** |
| AVEVA Plant SCADA | Modelo de equipamento que agrupa tags, eventos, alarmes, permissões e comunicação | [datasheet](https://www.aveva.cn/content/dam/aveva/documents/datasheets/Datasheet_PlantSCADA.pdf) | O ElétricAi já tem `CanonicalEquipment`; falta pendurar alarmes/histórico nele | Parcial | M | **Adotar** (Fases 1–2) |
| AVEVA Plant SCADA | Servidores de I/O, alarmes, tendências e relatórios com redundância | [docs](https://docs.aveva.com/bundle/plant-scada/page/1034677.html) | Não aplicável a SaaS multi-tenant agora | Não | A | **Adiar** |
| AVEVA Plant SCADA | Analista de processo: alarme e tendência juntos, histórico e tempo real | [datasheet](https://www.aveva.cn/content/dam/aveva/documents/datasheets/Datasheet_PlantSCADA.pdf) | Investigação de evento | Não | M | Adotar (Fase 4) |
| FactoryTalk View SE | Aplicação distribuída: servidores HMI, de dados e de alarmes; diretório para localizar servidores | [Rockwell](https://www.rockwellautomation.com/en-ca/docs/factorytalk-view/16-00-00/se-help-ditamap/factorytalk-view-site-edition-help/factorytalk-view-se-applications.html) | Conceito de servidor de alarmes central | Não | A | Só o conceito (alarme avaliado em um lugar) |
| FactoryTalk | Alarmes HMI legados descontinuados na v11 em favor de um sistema único de alarmes e eventos | idem | Evitar vários sistemas de alarme | Hoje há 4 | M | **Consolidar** |
| SiteWise Assistant | Resumo de alarmes e perguntas em linguagem natural sobre ativos e documentação | [AWS](https://docs.aws.amazon.com/iot-sitewise/latest/userguide/assistant-get-started.html) | Núcleo da IA assistiva | Não | M | **Adotar** (Fase 6), após dados confiáveis |
| ISA-101 | Hierarquia de 4 níveis; cor para anormalidade | doc 04 | Organização das telas | Parcial | M | Adotar (Fase 2) |
| ISA-18.2 | Ciclo de vida; shelving, fora de serviço, supressão por projeto | doc 04 | Alarmes úteis em vez de ruído | Parcial (só "suprimido") | M | Adotar (Fase 3) |
| ISA-112 | Ciclo de vida e terminologia de SCADA | doc 04 | Documentação do ciclo de vida | Não | B | Adotar a terminologia |
| IEC 62443 / CISA | Zonas e condutos, conexão de dentro para fora | doc 04 | O Edge já inicia a conexão | Sim (Edge) | — | **Manter** |

## Conclusão

O que mais agrega valor **e custa pouco**: persistir alarmes e auditoria, ligar a tendência ao histórico, unificar a base de tags e pendurar alarmes e histórico no equipamento canônico. Redundância de servidores, servidor OPC UA próprio e clientes distribuídos ao estilo FactoryTalk **não** se justificam agora.
