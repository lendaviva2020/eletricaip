# 00 — Avaliação executiva do SCADA

Auditoria somente leitura feita em 2026-11-16 sobre o commit `82918fc`. Nenhum arquivo de código, migration ou dado foi alterado. Fontes: leitura do código (`file:linha` citados em cada documento), consultas de leitura ao banco `rvaaxvdimggztjxoktvy`, execução dos 17 arquivos de teste do SCADA (94 testes, todos passando) e as telas capturadas durante a gravação do vídeo do hero.

## Veredito

O SCADA do ElétricAi hoje é **um painel de demonstração bem acabado sobre uma base técnica boa e desconectada**.

- A **base técnica existe e é de boa qualidade**: runtime de tags com proveniência, deadband e detecção de dado velho (`lib/scada/tag-runtime.ts`), motor de alarmes determinístico com histerese, atraso e supressão (`lib/scada/alarm-engine.ts`), verificador de trilha de auditoria encadeada (`lib/scada/audit-verifier.ts`), autorização multi-tenant no servidor (`lib/scada/scada.functions.ts`), drivers Edge somente leitura (Modbus TCP, OPC UA, Sparkplug B) com testes de homologação, e tabelas com RLS no banco (`tag_samples`, `alarm_configs`, `alarm_history`, `audit_logs`, `trend_configs`).
- A **interface não usa essa base**. Das 9 funções de servidor do SCADA, a interface chama 2 (resolver contexto e listar projetos). Histórico, persistência de alarmes, auditoria, relatórios e ingestão do Edge **não têm nenhum consumidor** na interface.
- Em **projeto de cliente**, o SCADA **fabrica valores** a partir do nome do tag e exibe **indicadores fixos** como se fossem medidos. Isso viola a regra central do projeto: nada exibido como leitura real pode ser inventado.

## Os 10 achados mais graves

| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| 1 | Valores de tag fabricados pelo nome: "CORRENTE" → 26,5 A, "POTENCIA" → 11,2, "TEMP" → 48,5 °C, "VAZAO" → 85, com oscilação senoidal | `scada-store.ts:727-736` | Crítica |
| 2 | Alarme de sobrecorrente criado com limites fixos de 30/40 A para qualquer tag com "CORRENTE" no nome, sem relação com o equipamento | `scada-store.ts:257-282` | Crítica |
| 3 | KPIs "Disponibilidade 99,2 %, OEE 91,4 %, MTBF 420 h, MTTR 18 min" fixos no código, rotulados "Tempo Real", exibidos para todo projeto | `scada-overview-view.tsx:327-370` | Crítica |
| 4 | Status de comunicação fixo: OPC UA e Modbus "CONNECTED" em endereços inventados; "Drivers 100% OK" fixo na barra e na lateral | `scada-store.ts:162-190`, `scada-os-status-bar.tsx:55`, `scada-sidebar.tsx:121` | Crítica |
| 5 | Histórico grava amostra simulada no `tag_samples` sem coluna de origem: simulado fica indistinguível de real | `scada.functions.ts:263-334`; banco: `tag_samples` sem `source` | Alta |
| 6 | Envio do histórico nunca é chamado; o buffer cresce a cada segundo sem limite (vazamento de memória) | `scada-store.ts:804`, `flushHistoricalSamples` sem chamador | Alta |
| 7 | Projeto de cliente aberto direto em `/scada` abre vazio: o servidor devolve o diagrama e o layout o ignora | `scada-layout.tsx:155-163`, `scada.functions.ts:202-229` | Alta |
| 8 | Projeto de demonstração do CCM ("Linha de Separação de Metais") exibe a planta da ETE | `scada-layout.tsx:118-125`, `scada-store.ts:225-248` | Média |
| 9 | Aba Sinóticos desenha o P&ID da ETE (1.496 linhas fixas) para qualquer projeto | `scada-synoptics-view.tsx:141` | Média |
| 10 | Quatro bases de tags e quatro sistemas de alarme paralelos (SCADA, editor HMI, simulação, CCM), contra o princípio de fonte única | doc 09 | Alta (arquitetura) |

## O que funciona de verdade e deve ficar

- Autorização no servidor por projeto/empresa/papel (`authorizeProjectAccess`, `scada.functions.ts:59-115`).
- CCM de motores derivado do unifilar, com motor de proteção puro e testado (`lib/simulation/motor-*`), marcado como simulação.
- Runtime de tags, motor de alarmes, verificador de auditoria, calculadora de energia: bons módulos, faltando só a ligação com a interface e com o banco.
- Drivers Edge somente leitura com homologação e trava de escrita física.
- O navegador guarda só preferências de tela; nenhum dado operacional fica no `localStorage` (`scada-store.ts:1098-1103`).
- Trava de controle físico: nenhum caminho do SCADA escreve em equipamento (`commandEquipment` só muda estado simulado, `scada-store.ts:462-470`).

## Recomendação

Não reescrever o SCADA. A ordem proposta (doc 17) é:

1. **Fase 0:** remover tudo que é fabricado ou fixo e mostrar "sem fonte de dados" (honestidade antes de beleza).
2. **Fase 1:** ligar a interface aos módulos e tabelas que já existem (histórico, alarmes, auditoria) e unificar a base de tags.
3. **Fases seguintes:** só então evoluir a interface (hierarquia ISA-101), o ciclo de vida de alarmes (ISA-18.2) e, por fim, a IA assistiva, que depende de dados confiáveis para não "explicar" números inventados.

**IA assistiva:** não existe hoje no SCADA (nenhuma chamada a modelo em `components/scada` ou `lib/scada`). Ressalva: o provedor Gemini **está configurado** no app (`GEMINI_API_KEY` na Vercel, usado pelo arquiteto e pelo chat). A informação de que "não há chave de API" não confere com o ambiente; ver doc 11.

## Limitações desta auditoria

- Não testei o SCADA com uma sessão real de cliente (o ambiente de teste só tem o modo demonstração local); os comportamentos de projeto de cliente foram confirmados pela leitura do código.
- Não verifiquei drivers contra equipamento real.
- As normas ISA/IEC são pagas; usei apenas resumos públicos. A página da ISA proíbe inserir propriedade intelectual da ISA em ferramentas de IA sem permissão, então nenhum texto das normas foi usado.
