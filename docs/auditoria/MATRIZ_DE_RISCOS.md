# MATRIZ DE RISCOS TÉCNICOS E OPERACIONAIS — ELETRICAI

**Data:** 14 de Outubro de 2026  
**Metodologia de Classificação:**
- **Probabilidade:** Baixa (1), Média (2), Alta (3)
- **Impacto:** Baixo (1), Médio (2), Alto (3), Crítico (4)
- **Severidade:**
  - **P0 — Crítico:** Risco iminente de perda de dados, vazamento massivo, comprometimento de infraestrutura ou dano elétrico grave. Bloqueador de lançamento.
  - **P1 — Alto:** Falha grave de autorização, isolamento de dados quebrado ou funcionalidade essencial corrompida.
  - **P2 — Médio:** Inconsistência de cálculo, simulação falha ou limitação que compromete a experiência comercial.
  - **P3 — Baixo:** Refinamento visual, otimização ou ajuste secundário.

---

## 1. Matriz Consolidada de Riscos

| ID | Categoria | Descrição do Risco | Prob. | Imp. | Prioridade | Ação de Mitigação Obrigatória | Risco Residual |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| **RISK-014** | Banco de Dados | **Inexistência de DDL das tabelas centrais no repositório.** O banco novo (`rvaaxvdimggztjxoktvy`) não possui tabelas centrais; recuperação de desastre é inviável. | Alta | Crítico | **P0** | Exportar DDL limpo (`pg_dump --schema-only`) do banco de homologação e consolidar na migration base `00000000000000_core_tables.sql`. | Baixo |
| **SEC-001** | Custos / Segurança | **Edge Function de IA sem autenticação no CI.** Deploy com `--no-verify-jwt` expõe o endpoint `ai-industrial-architect` a chamadas anônimas que consomem créditos DeepSeek. | Alta | Crítico | **P0** | Remover a flag `--no-verify-jwt` no `.github/workflows/ci.yml:61` ou descontinuar a Edge Function, já que o app usa server functions. | Inexistente |
| **ENG-001** | Engenharia | **Dimensionamento de cabos sem tabelas da NBR 5410.** Uso de tabela simplificada e ausência de fatores $k_t$ e $k_g$ gera risco de subdimensionamento térmico de condutores. | Alta | Alto | **P1** | Implementar tabelas 36, 37 e 38 da NBR 5410 em `electrical-calc.ts`, exigindo método de instalação, temperatura e agrupamento. | Baixo |
| **ENG-002** | Engenharia | **Queda de tensão ignora reatância indutiva.** O cálculo em `electrical-calc.ts` usa apenas resistência de cobre; para cabos $\ge 35\text{ mm}^2$, erro de cálculo é severo. | Média | Alto | **P1** | Integrar impedância complexa $\Delta V = \sqrt{3} \cdot I \cdot (R \cos\varphi + X \sin\varphi)$ para cabos de potência. | Baixo |
| **UI-001** | Confiabilidade / UX | **Upload de briefing (PDF/CSV) no chat de IA é falso (Mock).** O sistema simula análise e injeta sempre o mesmo circuito fixo, quebrando a confiança do cliente. | Alta | Alto | **P1** | Implementar parser real (extração de texto/tabelas no backend e envio ao DeepSeek) ou remover temporariamente o botão de upload da interface. | Baixo |
| **UI-002** | Confiabilidade / UX | **Paleta Ladder com ~30 instruções decorativas que travam no grid.** Usuário arrasta bloco de comparação/matemática e recebe erro de instrução não suportada. | Alta | Alto | **P1** | Ocultar ou desabilitar na paleta as instruções que o motor `scan-core.ts` não suporta, mantendo visíveis apenas as 9 operacionais. | Baixo |
| **SEC-002** | Autenticação | **Tokens de sessão armazenados em `localStorage`.** Vulnerabilidade a sequestro de conta em caso de XSS por biblioteca de terceiros. | Média | Alto | **P1** | Migrar armazenamento de sessão para cookies `httpOnly` via Supabase SSR Helpers. | Baixo |
| **SEC-003** | Autorização / RLS | **Policies de leitura de `invoices`/`subscriptions` sem checagem de papel.** Qualquer membro do tenant (inclusive `viewer`) pode ler dados de faturamento. | Alta | Médio | **P2** | Ajustar policies RLS restringindo o `SELECT` de faturamento para `role IN ('owner', 'admin')`. | Baixo |
| **SEC-004** | Autenticação | **Ausência de Rate Limiting nas rotas de login e reset.** Ataques de força bruta e enumeração de e-mails de clientes não são contidos na aplicação. | Média | Médio | **P2** | Intermediar login e recuperação por server functions conectadas ao bucket `auth` do Upstash rate limiter (5 tentativas / 15 min). | Baixo |
| **IND-001** | SCADA / Protocolos | **Modbus TCP sem implementação de protocolo.** Abertura de socket TCP cru sem envio de MBAP e leitura de Map em memória não comunica com equipamentos reais. | Alta | Médio | **P2** | Rotular formalmente como "Simulação em Nuvem" ou integrar driver Modbus TCP com serialização de PDU/ADU em gateway de borda. | Baixo |
| **IND-002** | SCADA / Protocolos | **OPC-UA e MQTT anunciados sem suporte de execução.** Conexão real OPC-UA lança exceção em runtime e MQTT inexiste na camada de rede. | Alta | Médio | **P2** | Desativar os seletores de rede na interface ou classificar explicitamente como "Em Desenvolvimento / Roadmap Q1". | Inexistente |
| **SEC-005** | Segurança / Sandbox | **Sandbox de scripts SCADA depende de regex.** Expressões com construtores encadeados podem evadir o filtro em `scada-worker.ts`. | Baixa | Médio | **P2** | Substituir `new Function` por interpretador seguro isolado em WebAssembly (ex.: QuickJS em Wasm) ou parser AST restrito. | Baixo |
| **DAT-001** | Integridade / LGPD | **Histórico do Git contém e-mail pessoal e chaves antigas.** Dados pessoais (PII) e chaves revogadas permanecem no histórico de commits passados. | Média | Baixo | **P2** | Executar sanitização do histórico (`git filter-repo`) antes de tornar o repositório público ou transferi-lo a novos colaboradores. | Baixo |
| **OPS-001** | Operação / Deploy | **Divergência de domínio de produção.** `eletricai.vercel.app` serve versão estática antiga com erros 404, enquanto o app real está em `eletricaip.vercel.app`. | Alta | Médio | **P2** | Apontar o domínio comercial oficial no painel da Vercel diretamente para o projeto correto do TanStack Start. | Inexistente |
| **ARC-001** | Arquitetura | **Duplicação de compiladores FBD no repositório.** O canvas de PLC usa o compilador legado para gerar ST, divergindo do motor de blocos novo. | Média | Médio | **P2** | Unificar o pipeline de geração de ST para que o PLC consuma a Representação Intermediária (IR) do `fbd/engine`. | Baixo |
| **AI-001** | Inteligência Artificial | **Sanitização de prompt injection baseada em blocklist regex.** Injeções em português ou com codificações alternativas evadem o filtro estático. | Média | Médio | **P2** | Tratar os dados de contexto com delimitação rígida de escopo e instruir o system prompt a ignorar ordens contidas no bloco de dados. | Baixo |

---

## 2. Detalhamento dos Riscos de Maior Impacto

### RISK-014: Inexistência de DDL Estrutural do Banco de Dados
- **Módulo Afetado:** Banco de Dados / Supabase / Migrations
- **Evidência:** `supabase/migrations/20260906072900_baseline_rls_consolidation.sql` aplica policies a tabelas que não constam em nenhum arquivo `CREATE TABLE` do repositório.
- **Causa Raiz:** O projeto foi iniciado via interface do Supabase/Lovable, e as tabelas centrais foram criadas remotamente sem versionamento de código no Git.
- **Impacto para o Negócio:** Se o banco de dados remoto for corrompido ou precisar ser recriado em outra região, o sistema fica totalmente inoperante. Nenhum novo ambiente de staging ou desenvolvimento local pode ser instanciado do zero.
- **Plano de Remediação:**
  1. Conectar ao banco remoto de referência via pg_dump e gerar o DDL completo (`--schema-only --no-owner --no-privileges`).
  2. Isolar as tabelas centrais em uma migration canônica inicial.
  3. Validar a execução da migration em um container PostgreSQL limpo via `supabase db reset`.

### SEC-001: Exposição de Edge Function de IA sem Autenticação
- **Módulo Afetado:** Inteligência Artificial / Custos / CI
- **Evidência:** `.github/workflows/ci.yml:59-64`:
  ```yaml
  supabase functions deploy ai-industrial-architect \
    --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} \
    --no-verify-jwt
  ```
- **Causa Raiz:** Flag `--no-verify-jwt` adicionada no CI para contornar falha de handshake de token em chamadas externas.
- **Impacto para o Negócio:** Abuso financeiro. Script automatizado externo pode enviar requisições contínuas, esgotando o saldo da conta DeepSeek do proprietário em poucos minutos.
- **Plano de Remediação:**
  1. Alterar o workflow de CI para remover o deploy da função ou exigir `--verify-jwt`.
  2. Como o frontend já utiliza as server functions seguras (`src/lib/ai-architect.functions.ts`), desativar o deploy dessa Edge Function desnecessária.

### ENG-001: Dimensionamento Térmico de Condutores Fora de Norma
- **Módulo Afetado:** Engenharia Elétrica / Dimensionamento de Circuitos
- **Evidência:** `src/lib/electrical-calc.ts:53-57`:
  ```typescript
  export function pickCable_mm2(currentA: number, factor = 1.25): number {
    const target = currentA * factor;
    for (const [s, a] of AMPACITY) if (a >= target) return s;
    return 300;
  }
  ```
- **Causa Raiz:** Implementação preliminar usando tabela única de 3 condutores em PVC a 30°C.
- **Impacto para o Negócio:** Risco legal e técnico grave. Caso um engenheiro utilize o memorial da ferramenta para instalar cabos em leito agrupado com 6 circuitos a 40°C, a corrente admissível real é até 50% menor do que a calculada pelo software, gerando superaquecimento e risco de incêndio.
- **Plano de Remediação:**
  1. Adicionar ao modelo parâmetros obrigatórios de instalação: Método de Instalação (NBR 5410 Tabela 33), Temperatura Ambiente e Número de Circuitos Agrupados.
  2. Calcular a capacidade corrigida: $I'_z = I_z \cdot k_t \cdot k_g$.
  3. Garantir a condição normativa: $I_b \le I_n \le I'_z$.
