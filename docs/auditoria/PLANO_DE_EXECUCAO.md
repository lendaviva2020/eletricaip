# PLANO DE EXECUÇÃO TÉCNICA INCREMENTAL — ELETRICAI

**Data:** 14 de Outubro de 2026  
**Estratégia:** Execução estritamente sequencial e incremental, em pequenas tarefas verificáveis, preservando a base de 263 testes automatizados já existentes e evitando reescritas desnecessárias.

---

## Visão Geral das Fases e Esforço Estimado

```
[Fase 0] Diagnóstico e Baseline ✅ (Concluído nesta auditoria)
   ↓
[Fase 1] Estabilização de Build, CI e Segurança de Borda (1 a 2 dias)
   ↓
[Fase 2] Banco de Dados Canônico e Isolamento Multi-tenant (2 a 3 dias)
   ↓
[Fase 3] Saneamento de Mocks e Persistência Confiável (2 a 3 dias)
   ↓
[Fase 4] Consistência de Motores Ladder, FBD e Editor Elétrico (3 a 4 dias)
   ↓
[Fase 5] Conformidade dos Cálculos e Estudos Elétricos (NBR 5410) (2 a 3 dias)
   ↓
[Fase 6] Governança de IA e Upload Real de Briefing (2 a 3 dias)
   ↓
[Fase 7] Protocolos Industriais e SCADA Transparente (2 a 3 dias)
   ↓
[Fase 8] Responsividade, Acessibilidade e Onboarding (2 dias)
   ↓
[Fase 9] Observabilidade, Backups e Auditoria Operacional (2 dias)
   ↓
[Fase 10] Homologação Final, Testes de Regressão e Lançamento (2 dias)
```

**Estimativa Total de Esforço:** 18 a 26 dias úteis de engenharia (1 Engenheiro Sênior Fullstack / Especialista Industrial).

---

## Fase 0: Baseline e Preservação do Repositório (Concluída)
- **Status:** ✅ Executada nesta auditoria.
- **Evidências Coletadas:**
  - Repositório confirmado: `lendaviva2020/eletricaip` na branch `main`.
  - Typecheck validado: `tsc --noEmit` aprovado com 0 erros.
  - Testes validados: 32 arquivos, 263 testes aprovados em 25,8 segundos.
  - Linting validado: ESLint 9 aprovado sem violações.
  - Inventário de riscos e DDL mapeados.

---

## Fase 1: Build, CI e Bloqueios Críticos de Segurança
**Objetivo:** Eliminar exposições graves no CI e alinhar o ambiente de deploy.

### Tarefa 1.1 — Eliminar exposição de IA sem JWT no CI
- **Arquivo afetado:** `.github/workflows/ci.yml:59-65`
- **Ação:** Remover o deploy desnecessário da Edge Function órfã `ai-industrial-architect` ou substituir a flag `--no-verify-jwt` por autenticação rígida de JWT. Como as server functions já executam essa função no backend seguro, desativar a Edge Function.
- **Critério de Aceitação:** Pipeline de CI não executa deploy sem verificação de token.
- **Teste de Verificação:** Executar workflow em branch de teste e verificar logs de deploy.
- **Esforço:** 2 horas.

### Tarefa 1.2 — Alinhamento de Domínio e Vercel Preset
- **Arquivos afetados:** `vercel.json`, painel Vercel de produção.
- **Ação:** Configurar o domínio principal `eletricai.vercel.app` para apontar para a build mais recente do TanStack Start (`eletricaip.vercel.app`), desativando o antigo deploy legado em Next.js.
- **Critério de Aceitação:** Requisição para `https://eletricai.vercel.app/login` e `/dashboard` retorna HTTP 200 com a interface atual do produto.
- **Teste de Verificação:** `curl -I https://eletricai.vercel.app/login` respondendo com 200.
- **Esforço:** 2 horas.

### Tarefa 1.3 — Limpeza de Arquivos Temporários Rastreados no Git
- **Arquivos afetados:** `supabase/supabase/.temp/*`, `.gitignore`
- **Ação:** Adicionar `supabase/supabase/.temp/` ao `.gitignore` e desindexar os arquivos de cache do repositório (`git rm -r --cached supabase/supabase/.temp`).
- **Critério de Aceitação:** `git status` não exibe arquivos de configuração de ambiente da CLI Supabase.
- **Esforço:** 1 hora.

---

## Fase 2: Banco de Dados Canônico e Isolamento Multi-tenant
**Objetivo:** Garantir que o banco de dados possa ser instanciado do zero e que o isolamento RLS seja infalível.

### Tarefa 2.1 — Consolidar o DDL Canônico das Tabelas Centrais
- **Arquivos afetados:** `supabase/migrations/`
- **Ação:** Extrair o DDL completo das tabelas estruturais (`profiles`, `projects`, `tenants`, `tenant_memberships`, `plan_limits`, `diagrams`, `iot_devices`, etc.) do banco vivo de homologação e versionar como uma migration consolidada e ordenada (`20260101000000_core_schema.sql`).
- **Critério de Aceitação:** Comando `supabase db reset` em ambiente de container local executa todas as 57 migrations sequencialmente sem pular nenhuma policy por ausência de tabela.
- **Teste de Verificação:** Criar container PostgreSQL local e subir todo o schema do zero com sucesso.
- **Esforço:** 1,5 dias.

### Tarefa 2.2 — Regeneração dos Tipos TypeScript do Banco
- **Arquivos afetados:** `src/integrations/supabase/types.ts`
- **Ação:** Executar `supabase gen types typescript` contra o banco com o schema consolidado, incluindo as tabelas recém-criadas (`unifilar_ladder_mapping`, `test_scenarios`, etc.), e remover os casts de escape `untyped()` espalhados pelo código.
- **Critério de Aceitação:** `src/integrations/supabase/types.ts` atualizado e código compilando sem `untyped()`.
- **Teste de Verificação:** `bun run typecheck` aprovado.
- **Esforço:** 4 horas.

### Tarefa 2.3 — Correção das Policies de Faturamento (RISK-005)
- **Arquivos afetados:** Migration SQL / `supabase/migrations/`
- **Ação:** Restringir as policies RLS de `SELECT` nas tabelas `invoices` e `subscriptions` para exigir papel de proprietário ou administrador (`role IN ('owner', 'admin')`).
- **Critério de Aceitação:** Consulta SQL com usuário com papel de `viewer` retorna 0 linhas em `invoices`.
- **Teste de Verificação:** Teste de integração automatizado com usuário não-admin.
- **Esforço:** 3 horas.

---

## Fase 3: Saneamento de Mocks e Persistência Confiável
**Objetivo:** Remover comportamentos simulados enganosos da interface e assegurar persistência verdadeira.

### Tarefa 3.1 — Saneamento do Chat de IA (Upload Mockado)
- **Arquivo afetado:** `src/components/canvas-ai-chat.tsx:208-230`
- **Ação:** Remover a rotina simulada com timeout que injeta o circuito estático de bombagem. Implementar leitura do arquivo de texto/CSV ou ocultar o botão de anexo até a conclusão da esteira real de OCR.
- **Critério de Aceitação:** Nenhum arquivo enviado pelo usuário injeta dados falsos predefinidos no projeto.
- **Teste de Verificação:** Enviar arquivo no chat e verificar que o sistema processa o conteúdo real ou informa indisponibilidade do recurso.
- **Esforço:** 4 horas.

### Tarefa 3.2 — Saneamento de Métricas Sintéticas em Analytics
- **Arquivo afetado:** `src/routes/analytics.tsx:30-32`
- **Ação:** Substituir a geração de OEE e kWh via `Math.random()` e `Math.sin()` por agregação real de leituras da tabela `iot_readings` ou, quando sem dados, exibir estado vazio explícito ("Nenhum equipamento conectado").
- **Critério de Aceitação:** Gráficos exibem dados reais dos dispositivos ou mensagem informativa clara de ausência de dados.
- **Teste de Verificação:** Testar página de Analytics com tenant vazio e com tenant contendo telemetria real.
- **Esforço:** 4 horas.

### Tarefa 3.3 — Tratamento Transparente de Falhas em Billing e Team
- **Arquivos afetados:** `src/routes/settings.billing.tsx`, `src/routes/settings.team.tsx`
- **Ação:** Remover a troca silenciosa para "modo demo" com faturas falsas e membros fictícios. Em caso de falha de conexão com o banco ou gateways de pagamento, exibir mensagem de erro real com opção de tentar novamente.
- **Critério de Aceitação:** Nenhuma fatura fictícia (`inv_demo_1`) ou membro falso (`demo-1`) é renderizado ao usuário em produção.
- **Teste de Verificação:** Simular erro de API e conferir exibição de banner de erro.
- **Esforço:** 1 dia.

---

## Fase 4: Consistência dos Motores Ladder, FBD e Editor Elétrico
**Objetivo:** Alinhar os editores visuais com as reais capacidades dos motores de execução.

### Tarefa 4.1 — Alinhamento da Paleta Ladder (IEC 61131-3)
- **Arquivos afetados:** `src/components/editor/sidebars/editor-ladder-sidebar.tsx`, `src/lib/ladder/definitions.ts`
- **Ação:** Ocultar da paleta as instruções que o `scan-core.ts` não suporta, ou marcar com badge "Em Breve (Q1)", garantindo que todo elemento arrastável para o rung seja aceito e executado pelo motor de simulação sem toast de erro.
- **Critério de Aceitação:** Nenhum elemento disponível na barra lateral gera erro de incompatibilidade ao ser solto em uma rung.
- **Teste de Verificação:** Teste de arrastar e soltar de cada item da paleta para uma célula vazia.
- **Esforço:** 1 dia.

### Tarefa 4.2 — Unificação dos Compiladores FBD
- **Arquivos afetados:** `src/components/canvases/plc-canvas.tsx:39`, `src/lib/fbd/`
- **Ação:** Fazer o canvas de PLC consumir o compilador do motor moderno (`src/lib/fbd/engine/*`) para geração de Structured Text, deprecando e removendo `src/lib/fbd/compiler.ts` legado.
- **Critério de Aceitação:** Código ST gerado no PLC reflete exatamente a AST e as variáveis do editor FBD.
- **Teste de Verificação:** Rodar a suíte de testes de FBD e validar compilação de grafo no canvas de PLC.
- **Esforço:** 1 dia.

---

## Fase 5: Conformidade dos Cálculos e Estudos Elétricos (NBR 5410) ✅ (Concluída)
**Objetivo:** Elevar os cálculos de dimensionamento ao padrão exigido pelas normas técnicas brasileiras.

### Tarefa 5.1 — Dimensionamento de Condutores Conforme NBR 5410 ✅
- **Arquivo afetado:** `src/lib/electrical-calc.ts`, `src/lib/electrical-sim.ts`, `src/lib/norm-validator.ts`
- **Ação:** Implementar as tabelas canônicas de capacidade de condução de corrente da NBR 5410 (Tabelas 36, 37 e 38):
  - Seleção por método de instalação (A1, A2, B1, B2, C, D, E, F) e isolação (PVC 70 °C, EPR/XLPE 90 °C, 2 e 3 condutores carregados).
  - Fator de correção de temperatura ambiente ($k_t$ — Tabelas 40 e 41).
  - Fator de agrupamento de circuitos ($k_g$ — Tabela 42).
  - Verificação da coordenação de sobrecarga: $I_b \le I_n \le I'_z$ e $I_2 \le 1,45 \cdot I'_z$ (§5.3.4.1).
- **Critério de Aceitação:** O cálculo de seção do condutor varia conforme o método de instalação e o agrupamento informados.
- **Teste de Verificação:** Testes unitários em `src/__tests__/nbr5410-ampacity.test.ts` com casos de referência do livro de Instalações Elétricas (Mamede / Creder).
- **Esforço:** 2 dias.

### Tarefa 5.2 — Queda de Tensão com Reatância Indutiva ✅
- **Arquivo afetado:** `src/lib/electrical-calc.ts`, `src/lib/electrical-sim.ts`, `src/lib/electrical-sim.functions.ts`
- **Ação:** Expandir e unificar a fórmula de queda de tensão para incluir a reatância dos cabos:
  $$\Delta V = \sqrt{3} \cdot I \cdot (R \cdot \cos\varphi + X_L \cdot \sin\varphi)$$
  adotando $X_L = 0,08\text{ m}\Omega/\text{m}$ para condutores de seção $\ge 35\text{ mm}^2$.
- **Critério de Aceitação:** Comparação de queda de tensão em circuitos de alta potência com erro inferior a 1% em relação ao cálculo de engenharia (`src/__tests__/voltage-drop-reactance.test.ts`).
- **Esforço:** 1 dia.

---

## Fase 6: Governança de IA e Upload Real de Briefing
**Objetivo:** Assegurar que a IA opere como apoio auditável sem risco de custos descontrolados.

### Tarefa 6.1 — Pipeline de Processamento Real de Documentos de Briefing
- **Arquivos afetados:** `src/lib/ai-architect.functions.ts`, `src/components/canvas-ai-chat.tsx`
- **Ação:** Integrar extração de texto no servidor (usando parser estruturado) para arquivos CSV/TXT/PDF de briefing e concatenar os requisitos reais ao prompt do Arquiteto de IA, passando pelo Zod e pelo validador normativo.
- **Critério de Aceitação:** Envio de lista de motores em CSV gera exatamente o circuito correspondente à lista enviada.
- **Teste de Verificação:** Submissão de CSV com 3 motores e validação do snapshot gerado.
- **Esforço:** 2 dias.

### Tarefa 6.2 — Endurecimento de Prompt Injection
- **Arquivo afetado:** `src/lib/ai/context-sanitizer.ts`
- **Ação:** Isolar as entradas do usuário em blocos de citação estritos (`<<<USER_BRIEFING>>>`) com instrução explícita no System Prompt para tratar qualquer comando de sistema contido no bloco como dado descritivo, não executável.
- **Critério de Aceitação:** Prompt contendo "Ignore all previous instructions" não altera a persona nem as regras de conformidade da IA.
- **Esforço:** 1 dia.

---

## Fase 7: Protocolos Industriais e SCADA Transparente
**Objetivo:** Corrigir a representação dos protocolos de campo e proteger a execução de scripts.

### Tarefa 7.1 — Transparência e Rotulação dos Protocolos Industriais
- **Arquivos afetados:** `src/lib/modbus-server.functions.ts`, `opcua-server.functions.ts`, `settings.protocols.tsx`
- **Ação:**
  - Identificar explicitamente o modo Modbus atual como "Ambiente de Simulação / Mock de Nuvem".
  - Desativar a opção de conexão OPC-UA física ou incluir a dependência necessária em um container de borda (Edge Gateway), documentando a arquitetura de conexão local.
  - Ocultar MQTT da interface de configurações até a implementação do cliente MQTT over WebSockets.
- **Critério de Aceitação:** Usuário não é induzido a acreditar que o software está comunicando diretamente com CLPs de fábrica a partir da nuvem pública sem um gateway de borda configurado.
- **Esforço:** 1 dia.

### Tarefa 7.2 — Endurecimento do Sandbox SCADA
- **Arquivo afetado:** `src/lib/simulation/scada-worker.ts`
- **Ação:** Bloquear acesso a propriedades de protótipo através de congelamento do escopo global do worker (`Object.freeze`) antes de avaliar scripts e adicionar timeout rígido de 100 ms com encerramento forçado do worker (`worker.terminate()`) caso ocorra loop infinito.
- **Critério de Aceitação:** Script hostil tentando evasão de sandbox é abortado sem afetar a thread da UI.
- **Esforço:** 1 dia.

---

## Fase 8: Responsividade, Acessibilidade e Onboarding
**Objetivo:** Garantir usabilidade em tablets e computadores de campo.

### Tarefa 8.1 — Ajustes de Responsividade nos Canvases
- **Arquivos afetados:** `src/components/canvases/*`, `industrial-workspace.tsx`
- **Ação:** Otimizar o redimensionamento das barras laterais retráteis em telas com resolução a partir de 1024x768 (tablets industriais), garantindo área útil de desenho e controles de zoom acessíveis via toque.
- **Critério de Aceitação:** Workspace navegável e utilizável em tablet iPad / Galaxy Tab em orientação paisagem.
- **Esforço:** 1,5 dias.

### Tarefa 8.2 — Acessibilidade e Estados de Carregamento
- **Arquivos afetados:** `src/routes/signup.tsx`, componentes de formulário.
- **Ação:** Consolidar os atributos `role="alert"` e `role="status"` em mensagens de erro e sucesso em formulários de autenticação (aplicando a alteração pendente de `signup.tsx`).
- **Critério de Aceitação:** Leitores de tela anunciam erros de validação em formulários.
- **Esforço:** 4 horas.

---

## Fase 9: Observabilidade, Backups e Procedimentos Operacionais
**Objetivo:** Estabelecer infraestrutura de monitoramento contínuo e planos de contingência.

### Tarefa 9.1 — Integração de Rastreamento de Erros (Sentry ou equivalente)
- **Arquivos afetados:** `src/lib/error-capture.ts`, `src/routes/__root.tsx`
- **Ação:** Integrar captura de exceções em tempo real no cliente e no servidor, garantindo mascaramento prévio de tokens e senhas.
- **Critério de Aceitação:** Erros de runtime em produção disparam alertas com rastreamento completo da pilha.
- **Esforço:** 1 dia.

### Tarefa 9.2 — Rotina de Backup Automatizado do Banco de Dados
- **Ação:** Configurar rotina diária de backup lógico (pg_dump) com retenção de 30 dias em bucket de armazenamento seguro independente (AWS S3 ou Cloudflare R2), com procedimento documentado de restauração.
- **Critério de Aceitação:** Script de restore validado em banco de dados secundário de teste.
- **Esforço:** 1 dia.

---

## Fase 10: Homologação Final e Lançamento
**Objetivo:** Verificação exaustiva antes da abertura para clientes pagantes.

### Tarefa 10.1 — Bateria de Testes de Regressão de Ponta a Ponta (E2E)
- **Ação:** Executar testes E2E cobrindo a jornada completa: Cadastro → Onboarding → Criação de Projeto → Desenho Unifilar → Dimensionamento de Cabos → Estudo de Curto-Circuito → Lógica Ladder → Exportação PDF/DXF.
- **Critério de Aceitação:** Jornada executada sem erros de console e com persistência comprovada no banco.
- **Esforço:** 1,5 dias.

### Tarefa 10.2 — Validação Final do Checklist de Produção
- **Ação:** Auditoria item a item do `CHECKLIST_DE_LANCAMENTO.md` e assinatura técnica de liberação.
- **Esforço:** 4 horas.
