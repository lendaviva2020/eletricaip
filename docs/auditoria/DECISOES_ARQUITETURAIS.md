# DECISÕES ARQUITETURAIS E DIRETRIZES TÉCNICAS — ELETRICAI

**Data:** 14 de Outubro de 2026  
**Princípio Norteador:** Aproveitar integralmente o código e as tecnologias que já funcionam no ElétricAi. Nenhuma reescrita integral ou substituição de stack é autorizada sem justificativa técnica comprovada.

---

## ADR 01: Modelo de Banco de Dados — Consolidação do DDL Canônico vs Manutenção Híbrida

### Contexto
O projeto atual possui 56 migrations locais em `supabase/migrations/`, mas as tabelas estruturais centrais (`profiles`, `projects`, `tenants`, `tenant_memberships`, `diagrams`, `plan_limits`, etc.) não possuem comandos `CREATE TABLE` no repositório. O banco remoto do app (`rvaaxvdimggztjxoktvy`) aplicou as 56 migrations com cláusulas de escape (`IF EXISTS` e blocos `EXCEPTION`), resultando em um banco incompleto onde as tabelas principais não existem.

### Opções Avaliadas
1. **Opção A (Recomendada):** Exportar o schema completo do banco de homologação vivo (`pg_dump --schema-only`) e consolidar na primeira migration `20260101000000_core_tables.sql`, garantindo que o repositório seja a única fonte da verdade e permitindo recriar o ambiente do zero com `supabase db reset`.
2. **Opção B:** Continuar criando tabelas ad-hoc no painel visual do Supabase e mantendo migrations apenas para tabelas secundárias.

### Decisão
**Adotar a Opção A.**  
A Opção B inviabiliza a recuperação de desastres (Disaster Recovery), quebra pipelines de CI/CD efêmeros e impede testes de banco automatizados.

### Impactos
- Exige validação cuidadosa da ordem de criação de chaves estrangeiras.
- Garante total reprodutibilidade da infraestrutura.

---

## ADR 02: Arquitetura de Comunicação Industrial (Modbus / OPC-UA / MQTT)

### Contexto
O software foi construído sobre uma arquitetura serverless na nuvem (Vercel). Aplicações serverless operam sob o modelo de ciclo de vida efêmero por requisição HTTP, onde sockets TCP persistentes (como exigido por Modbus TCP e sessões de subscrição OPC-UA) não podem ser mantidos abertos entre chamadas. Atualmente, o Modbus apenas abre um socket TCP cru e lê dados de um Map em memória.

### Opções Avaliadas
1. **Opção A (Recomendada):** Arquitetura com **Edge Gateway / Agente de Borda (IoT Bridge)**. A aplicação web opera na nuvem e recebe telemetria via HTTP/WebSocket seguro (`/api/public/iot/ingest`). A comunicação Modbus TCP/OPC-UA direta com os CLPs físicos é feita por um daemon leve local (em Raspberry Pi / PC Industrial) que lê o CLP no chão de fábrica e publica para a nuvem. Na interface do ElétricAi em nuvem, o modo atual é formalmente documentado como "Simulador de Bancada Virtual".
2. **Opção B:** Tentar rodar um servidor de polling Modbus em um container dedicado na nuvem abrindo conexões para IPs industriais عبر túneis VPN/SSRF.

### Decisão
**Adotar a Opção A.**  
A Opção B expõe plantas industriais a riscos graves de invasão por túneis bidirecionais mal configurados e desrespeita as normas de cibersegurança industrial (ISA/IEC 62443). O modelo de agente de borda (unidirecional da fábrica para a nuvem) é o padrão reconhecido da indústria 4.0.

### Impactos
- Protege a rede industrial contra invasões externas.
- Permite comercializar o ElétricAi com o módulo de telemetria IoT real sem prometer comunicação TCP impossível em serverless.

---

## ADR 03: Tratamento de Instruções Ladder Avançadas (IEC 61131-3)

### Contexto
A barra lateral de elementos Ladder exibe mais de 40 blocos IEC (comparadores, operadores matemáticos, movimentação MOVE, bordas de transição). No entanto, o grid de rungs e o motor de scan puro (`scan-core.ts`) só executam 9 instruções elementares (`XIC`, `XIO`, `OTE`, `OTL`, `OTU`, `TON`, `TOF`, `TP`, `CTU`). Ao arrastar qualquer bloco avançado, a célula exibe um erro de instrução não suportada.

### Opções Avaliadas
1. **Opção A (Recomendada no Curto Prazo):** Ajustar o filtro de renderização da barra lateral (`editor-ladder-sidebar.tsx`) para exibir apenas as 9 instruções que o motor executa com perfeição, marcando as demais como "Em Implementação". Em paralelo, planejar a expansão incremental do `scan-core.ts` para suportar comparações (EQ, GT, LT) na próxima sprint.
2. **Opção B:** Manter todos os elementos visíveis e permitir que sejam inseridos como "blocos cegos" decorativos sem execução no scan.

### Decisão
**Adotar a Opção A.**  
A Opção B gera frustração imediata no cliente profissional e passa a impressão de software quebrado. É preferível entregar uma ferramenta com 9 instruções 100% funcionais e determinísticas do que uma biblioteca falsa.

---

## ADR 04: Unificação dos Compiladores de FBD

### Contexto
Existem atualmente duas implementações de compilador FBD no repositório:
- O compilador legado em `src/lib/fbd/compiler.ts`, que converte nós simples em texto Structured Text (ST).
- O motor moderno em `src/lib/fbd/engine/*`, que possui AST, tipos de dados estritos, propagação de EN/ENO e ordenação topológica determinística.
O editor visual utiliza o motor moderno, mas a tela de PLC (`src/components/canvases/plc-canvas.tsx:39`) importa o compilador legado para gerar ST.

### Opções Avaliadas
1. **Opção A (Recomendada):** Adicionar um gerador de código ST ao motor moderno (`fbd/engine/codegen-st.ts`) e atualizar o canvas de PLC para consumi-lo, excluindo a pasta legada `src/lib/fbd/compiler.ts`.
2. **Opção B:** Manter os dois compiladores em paralelo.

### Decisão
**Adotar a Opção A.**  
Manter compiladores paralelos duplica o custo de manutenção e causa divergência de código onde o bloco desenhado na tela não corresponde ao código ST compilado para o CLP.

---

## ADR 05: Sandbox de Execução de Scripts SCADA

### Contexto
Usuários podem escrever scripts em JavaScript para animar elementos no sinótico SCADA. Atualmente, esses scripts executam dentro de um Web Worker isolado (`scada-worker.ts`), utilizando `new Function` protegido por uma regex de pre-scan (`DANGEROUS_PATTERNS`) e um Proxy defensivo. Conforme apontado no RISK-011, filtros por regex em expressões JavaScript podem ser contornados por abordagens como acesso dinâmico de chaves (`this["constructor"]`).

### Opções Avaliadas
1. **Opção A (Recomendada):** Endurecer o Web Worker existente congelando (`Object.freeze`) o protótipo de `Object`, `Function` e limpando o escopo antes da primeira execução, mantendo o limite rígido de tempo de 100 ms com terminação do worker em caso de lentidão.
2. **Opção B:** Substituir por um interpretador de JavaScript restrito em WebAssembly (ex.: QuickJS compilado em Wasm).
3. **Opção C:** Permitir apenas expressões matemáticas simples sem código JS livre.

### Decisão
**Adotar a Opção A no curto prazo** e planejar a migração para QuickJS-Wasm (Opção B) na Fase 7 da evolução arquitetural. A Opção A é suficiente para conter riscos imediatos sem quebrar os scripts existentes.
