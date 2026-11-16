# Plano de execução — EletricAI (2026-11-16)

Levantamento feito no código e no banco de produção (`rvaaxvdimggztjxoktvy`), com
evidência de arquivo:linha. Regra: **nada exibido como real pode ser inventado**.
Simulação é permitida apenas quando a tela declara que é simulação.

Legenda: ✅ funcional com dados reais · 🟡 funcional com lacunas · 🔴 dado falso exibido como real · ⚪ não existe

---

## 1. Estado de cada editor

| Editor | Estado | O que funciona de verdade | Lacunas |
|---|---|---|---|
| Unifilar | ✅ | Canvas Pixi, terminais IEC 60947, reparo de conexões, IA com patch validado, numeração IEC 81346, verificação ao vivo (Documentação EletricAI) | Folhas/páginas múltiplas; cabeçalho/carimbo por folha |
| Multifilar | ✅ | Gerado do unifilar com cores NBR 5410 e réguas `-X1` | Edição manual de bornes pontes/jumpers |
| Ladder | ✅ | Runtime de varredura puro (contatos, bobinas, TON/TOF/TP/TONR, CTU/CTD/CTUD, comparadores, matemática, lógica, MOVE, conversões — `lib/ladder/scan-core.ts:439-650`), IL/ST, validador, verificação de E-STOP | Referência cruzada bobina ↔ contatos dentro do editor |
| FBD | ✅ | Motor IEC (AST → IR, EN/ENO), 308 blocos, simulação | 🔴 **busca da paleta não filtrava** (corrigido nesta rodada) |
| PLC | 🟡 | Rack com validação, variáveis, blocos, ST, PLCopen XML | 🔴 **barra lateral era uma árvore fictícia fixa** (`editor-plc-sidebar.tsx:4-8`, corrigido); sem download para CLP físico (bloqueado de propósito — regra 21) |
| SCADA/HMI | ✅ | Telas, tags, alarmes ISA-18.2, sandbox de scripts, CCM de motores | Curvas senoidais só no projeto de demonstração rotulado (aceitável); 🔴 busca de widgets inoperante (corrigido) |
| Simulação | 🟡 | Planta determinística, cenários, ponte Unifilar→Ladder, estudos elétricos | 🔴 **gráficos inventavam ~1200 rpm/12 A quando um runtime REAL conectado informava 0** (`sim-canvas.tsx:212-221`, corrigido); 🔴 simulador local emitia alarme fixo "Sobrecorrente M-02" em qualquer projeto e ciclo OB1 aleatório (`runtime-client.ts:172-187`, corrigido) |
| Studio IEC (Elétric Studio) | ✅ | Programa gerado do unifilar, blocos compactos corrigidos, execução | — |
| Cálculos (`/calculations`) | ✅ | Motor, queda de tensão, curto IEC 60909, demanda, harmônicas, aterramento | — |
| Dossiê / Exportação | ✅ | Memorial, BOM, documentação de painel (dispositivos, fios, bornes, cabos, referência cruzada), Excel saneado, PLCopen | — |

## 2. Telas fora dos editores

| Tela | Estado | Observação |
|---|---|---|
| Dashboard | ✅ | Projetos, créditos e telemetria reais (`getDashboardTelemetry`) |
| Analytics | ✅ | Uso de IA e telemetria reais |
| Faturamento | 🟡 | 🔴 **gráfico "Consumo (7 dias)" era um vetor de zeros fixo** (`settings.billing.tsx:129-141`, corrigido com `ai_usage_events` real) |
| Métricas da plataforma | ✅ | RPC agregada real |
| Equipe, clientes, notificações, segurança, MFA | ✅ | Dados do banco |
| Centro de operações | ✅ | Funções de servidor reais |
| Realtime/IoT | ✅ | Depende de dispositivos cadastrados (hoje 0 no banco) |
| Catálogo | ✅ | **Catálogo da empresa** (`tenant_catalog_items`, RLS por organização) começa vazio; o cliente escolhe: cadastro manual, planilha CSV/XLSX ou busca na API gratuita da Mouser (preço/estoque reais, reconsultados no servidor, botão "Atualizar preços"). Ativar a Mouser: `MOUSER_API_KEY` na Vercel. Catálogo global da plataforma segue vazio e só aparece quando tiver itens |
| IA (arquiteto/chat) | 🟡 | 🔴 **base normativa vazia** (`normative_chunks` = 0) e busca que **nunca encontrava palavras acentuadas** (`ai-architect.functions.ts:406-420`) — corrigido nesta rodada |
| Documentos/manuais | ⚪ | Tabelas `knowledge_*` existem, sem tela de upload |

## 3. Executado nesta rodada

1. Simulação: removidos os valores inventados; com runtime real, mostra exatamente o que o runtime envia.
2. Simulador local: alarme de sobrecorrente só para motores que existem no projeto e quando a corrente simulada passa do limite; ciclo OB1 medido de verdade.
3. Faturamento: gráfico de 7 dias com chamadas e créditos reais por dia.
4. PLC: barra lateral com hardware, variáveis e blocos **do projeto aberto**, navegação por clique e busca.
5. Busca funcionando nas barras de PLC, FBD e SCADA.
6. IA: base normativa EletricAI (resumos técnicos próprios, sem reproduzir texto de norma) e busca insensível a acento.

## 4. Próximas etapas (ordem recomendada)

| # | Item | Por quê | Depende de você? |
|---|---|---|---|
| 1 | ~~Catálogo real~~ — feito (2026-11-16): catálogo por empresa + Mouser. Pendente: criar a chave gratuita da Mouser e configurar `MOUSER_API_KEY`; ligar o BOM ao catálogo da empresa | BOM com preço real | Só a chave da Mouser |
| 2 | Referência cruzada dentro do editor Ladder | Ver contatos de cada bobina enquanto programa | Não |
| 3 | Unifilar com várias folhas e carimbo | Projetos grandes e documentação de entrega | Não |
| 4 | Tela de documentos/manuais (upload + busca) | Usa as tabelas `knowledge_*` já existentes | Não |
| 5 | Política RLS exigindo `aal2` para quem tem MFA | Fecha o MFA no acesso direto ao banco | Não |
| 6 | Proteção contra senhas vazadas | Exige plano Pro do Supabase | **Sim** — plano |
| 7 | Fusão das 57 regras RLS duplicadas, tabela por tabela | Desempenho, sem mudar quem vê o quê | Não |
| 8 | Regenerar `types.ts` do banco e remover `untyped()` | Tipagem real das tabelas novas | Não |
