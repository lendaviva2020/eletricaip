# Fase 0 — Architecture Decision Records (ADRs)

**Projeto:** ElétricAi — Módulo `eletric Studio` (feature flag `logoStudio`, constante `PRODUCT_NAME`)  
**Data:** 2026-11-12  
**Status:** Proposto para aprovação antes da Fase 1.

---

## ADR-001: Modelo Canônico Único e Estratégia de Visualização Dual (FBD ↔ LAD)

### Contexto
Hoje o ElétricAi possui quatro estruturas paralelas para lógica de controle (`src/lib/fbd/types.ts`, `src/lib/fbd/engine/model.ts`, `src/lib/ladder/types.ts` e `src/lib/studio/canonical/types.ts`), armazenando FBD e Ladder de forma independente em `useEditorStore`. Os requisitos **D3**, **D4** e **E** exigem que FBD e LAD sejam duas visões sobre o mesmo modelo canônico único, preservando a lógica semântica e impedindo "tradução silenciosa com perda".

### Decisão Proposta
1. Adotar um **Grafo Canônico de Redes/Blocos Tipado (`CompactProgramGraph`)** como única fonte da verdade do programa, estruturado em:
   - `Program` → `Page[]` (múltiplas páginas nomeadas com dimensões configuráveis) → `NetworkNode[]` (blocos padrão, blocos analógicos/temporizadores/relógios, UDFs, terminais de E/S, constantes e conectores inter-página) + `TypedConnection[]` (com tipo explícito `BOOL | INT | REAL | TIME | ...` e flags de inversão de pino/borda).
   - Metadados puramente visuais (`positionFbd`, `positionLad`, `waypoints`, comentários gráficos) ficam segregados em mapas por visualização (`layout.fbd`, `layout.lad`) para que **arrastar ou formatar nunca altere a semântica nem invalide a compilação**.
2. Toda persistência reside dentro do `UnifiedProjectDoc` (`Schema v3` evoluído com bloco opcional/versionado `compactStudio` e sincronizado com `projects.functions.ts` no Supabase, sem banco separado).
3. A constante de marca fica isolada em `PRODUCT_NAME` (nenhuma ocorrência fixa de marcas de terceiros) e toda a experiência atrás da feature flag `logoStudio` via `tenant_settings`.

### Consequências
- **Positivas:** Elimina divergência entre FBD e LAD; permite mover blocos a 60fps sem recompilar IR; garante persistência única no Supabase + `UnifiedProjectStore`.
- **Negativas / Cuidados:** Requer camada de projeção bidirecional pura (`Domain <-> ViewFbd`, `Domain <-> ViewLad`) e adaptadores de compatibilidade com os testes existentes de `FbdDocument` e `LadderRung`.

---

## ADR-002: Estratégia de Conversão Bidirecional FBD ↔ LAD Sem Perda Silenciosa

### Contexto
No mercado de CLPs compactos, redes booleanas combinacionais e contatos/bobinas simples têm equivalência direta em FBD (`AND`, `OR`, `NOT`, `XOR`, `SR`, `RS`) e LAD (contatos em série/paralelo, bobinas `=`, `S`, `R`). Porém, blocos especiais (Relógio Semanal/Anual, PI Analógico, Multiplexador Analógico, Data Log, UDFs multi-saída, realimentações entre ramos com memórias intermediárias) ou topologias FBD com fan-out compartilhado nem sempre possuem decomposição pura em contatos/bobinas Ladder clássicos.

### Decisão Proposta
Implementar a conversão **estritamente sobre o Modelo Canônico / AST** (nunca por geometria ou desenho) usando um **pipeline de 3 níveis**:
1. **Nível 1 — Normalização Estrutural:** Extrair árvores/DAGs booleanos conectados a cada saída (`Q`, `M`, `Set`/`Reset`).
2. **Nível 2 — Projeção Estendida IEC 61131-3:**
   - Redes booleanas (série/paralelo, contatos NA/NF, bordas, `SR`/`RS`, bobinas) convertem-se **explicitamente** para contatos e ramos paralelos em LAD (e para portas `AND`/`OR`/`NOT`/`XOR`/`R_TRIG`/`F_TRIG` em FBD).
   - Funções especiais e blocos com múltiplas saídas ou entradas analógicas mantêm representação canônica em LAD como **Caixa de Bloco Funcional IEC (EN/ENO)** conectada aos barramentos de energia/variáveis — sem descarte nem aproximação.
3. **Nível 3 — Sinalização Explícita de Não-Representabilidade:**
   - Caso um constructo específico de uma notação não possa ser representado na forma pura da outra notação (ex.: topologia em malha com múltiplos fan-outs cruzados sem variável auxiliar nomeada, ou elemento exclusivo de uma visualização sem bloco equivalente), o compilador **não** converte em silêncio: marca os nós envolvidos com diagnóstico explícito (`CONVERSION_LOSS_RISK` / `NON_REPRESENTABLE_IN_PURE_LAD`), explica o motivo em pt-BR e oferece ao usuário manter encapsulado como **Bloco Funcional / Rede Mista** ou criar variável auxiliar explícita (`M_x`) rastreável.
4. **Oráculo de Equivalência:** Compilar o modelo original e o modelo convertido para o **mesmo IR determinístico** (`src/lib/fbd/engine/compiler.ts` unificado) e executar suíte de simulação comparativa (exaustiva em circuitos pequenos `<= 5` entradas e aleatória/property-based com clock simulado em circuitos maiores).

### Consequências
- Preserva 100% do comportamento lógico e atende literalmente ao requisito E e ao critério global de aceite #2.

---

## ADR-003: Runtime Determinístico Único Executado em Web Worker (Zero `eval` / Zero Main-Thread Freeze)

### Contexto
Hoje:
- `FbdSimulation` e `scanRungs` executam na main thread com `setInterval` e referências diretas a `performance.now()` (`ladder/runtime.ts`), travando a interface se o diagrama crescer ou houver muitos ciclos.
- O módulo `src/lib/workers/worker-manager.ts` já existe com gestão segura (`new Worker(new URL(..., import.meta.url), { type: "module" })`, timeout, single-flight, fallback em SSR).
- O `IECTaskScheduler` (`src/lib/studio/`) e o `FbdRuntime` (`src/lib/fbd/engine/`) hoje rodam de forma desconectada.

### Decisão Proposta
1. **Unificação do Motor de Execução:** Adotar e evoluir o núcleo puro do `src/lib/fbd/engine/` (compilador tipado + IR baseado em slots + `BlockRegistry` + `FbdRuntime`) integrado por adaptador de `IR`/variáveis ao `useRuntimeStore` e `CanonicalDataService`, garantindo **um único motor de execução** para FBD, LAD e blocos compactos (desativando gradualmente o motor legado `src/lib/fbd/runtime.ts` após testes de caracterização).
2. **Injeção de Relógio Simulado (`SimulatedClock`):**
   - Nenhuma lógica de temporizador, horímetro, rampa, gerador de pulsos ou relógio semanal/anual lerá `Date.now()` ou `performance.now()`.
   - Cada ciclo `step(dtMs, clockNowMs)` recebe incremento determinístico e instante simulado (suportando velocidade `0.25x..10x`, pausa, passo único `1 scan`, salto no tempo para testar relógios anuais/semanais e gravação/reprodução determinística).
3. **Execução Fora da Thread da UI:**
   - Criar `src/lib/compact-studio/runtime/compact-runtime-worker.ts` orquestrado por `WorkerManager` (`src/lib/workers/worker-manager.ts`), com loteamento de frames de telemetria (~30–60 Hz para UI) e execução de scans independentes na thread do Worker.
   - Em ambiente SSR / testes unitários Node/Vitest sem `Worker`, o mesmo núcleo puro executa de forma síncrona e idêntica (paridade bit-a-bit).
   - **Proibição absoluta** de `eval()`, `new Function()` ou `Blob` URLs dinâmicos.

### Consequências
- Interface sempre responsiva mesmo com 1.000+ blocos ou ciclos de alta frequência.
- Reprodutibilidade determinística de 100%: mesmas entradas + mesmo relógio simulado = saídas idênticas em browser, Worker e Node/Vitest.

---

## ADR-004: Catálogo de Hardware Orientado a Dados Versionado e Rastreável

### Contexto
Atualmente `HARDWARE_CATALOG` em `src/lib/plc/types.ts` é um array fixo no código TypeScript com apenas 4 CPUs S7 e módulos genéricos sem origem, sem data de verificação e sem suporte à classe de controladores lógicos compactos (módulos base 8 E/4 S, variantes com e sem display/relógio/Ethernet, expansões digitais DM, expansões analógicas AM, fontes, módulos de comunicação e acessórios).

### Decisão Proposta
1. Armazenar o catálogo em **artefato de dados estruturado e versionado** (`data/compact-hardware-catalog.v1.json` ou tabela `compact_hardware_catalog` no Supabase + fallback estático validado em build por **Zod**), **nunca hardcoded na lógica de negócio**.
2. Todo item de hardware no catálogo obrigatoriamente conterá:
   - `id`, `partCode` (genérico ou referência pública), `family` (`BASE_COMPACT`, `EXPANSION_DI_DO`, `EXPANSION_AI`, `EXPANSION_AO`, `COMM_MODULE`, `POWER_SUPPLY`, `ACCESSORY`), `schemaVersion`.
   - Capacidades elétricas e limites reais: `digitalInputs`, `digitalOutputs`, `outputKind` (`RELAY` | `TRANSISTOR_PNP`), `analogInputs` (0..10V, 0/4..20mA, PT100/PT1000), `analogOutputs`, `supplyVoltage` (`12/24VDC` | `24VAC/DC` | `115/230VAC`), `highSpeedInputsCount`, `ethernetPorts`, `hasRealtimeClock`, `maxBlocks`, `retentiveMemoryBytes`, `maxMemoryLayoutBytes`.
   - Rastreabilidade de fonte pública (requisito G): `sourceUrlOrDoc`, `verifiedAt` (`YYYY-MM-DD`), `verificationStatus` (`VERIFIED_PUBLIC_DOC` | `UNVERIFIED_ESTIMATE`). Qualquer item sem verificação é sinalizado explicitamente na UI e nos relatórios.
3. Regras de compatibilidade, cálculo de limites de barramento (ex.: máx. 24 DI / 20 DO / 8 AI / 8 AO típicos da classe V8), endereçamento automático (`I1..I24`, `Q1..Q20`, `AI1..AI8`, `AQ1..AQ8`) e compatibilidade de tensão passam por **motor de regras puro**, alimentando o gerador de BOM (`src/lib/dossier/bom.ts`) e os diagnósticos em tempo real.

---

## ADR-005: Persistência Unificada, Segurança, Feature Flag e Escalabilidade de Canvas (1.000+ Blocos)

### Contexto
O `UnifiedProjectDoc` e o `SnapshotSchema` (`src/lib/projects.functions.ts`) controlam o armazenamento multi-tenant no Supabase com RLS. Já `ReactFlow` na implementação atual de `FbdCanvas` renderiza todos os blocos no DOM e recompila o JSON inteiro em todo movimento.

### Decisão Proposta
1. **Persistência & Migrações:**
   - Eliminar `z.any()` nos campos do novo módulo dentro de `SnapshotSchema` (esquema Zod estrito + `compactSchemaVersion` com funções puras de migração `v1 -> vN` testadas).
   - Se tabelas auxiliares dedicadas forem criadas (ex.: biblioteca versionada compartilhada por tenant ou registros de auditoria de escrita em dispositivo), criar migrations SQL reversíveis em `supabase/migrations/` com `ENABLE ROW LEVEL SECURITY` e testes automatizados de isolamento entre `tenant_a` e `tenant_b`.
2. **Escalabilidade > 1.000 blocos:**
   - Ativar `onlyRenderVisibleElements` no ReactFlow ou adotar canvas híbrido/virtualizado por página + Level-of-Detail (LOD: simplificar pinos quando zoom < 0.35), memoização estrita por `blockId` e separação de estado `dragPosition` vs `programGraph`.
   - Limites de importação (CSV de E/S, PLCopen XML, bundles): reaproveitar `security-validator.ts` (`validatePayloadSize`, `MAX_OBJECT_DEPTH`, `validateXmlSecurity`) e `safe-xlsx.ts` (sanitização de fórmulas `=+-@` no CSV).
3. **Fronteira Física (Segurança Industrial):**
   - Manter `IS_PHYSICAL_CONTROL_ALLOWED = false as const` inalterado até aprovação expressa de arquitetura (Fase 10) com dupla confirmação, trava de segurança, RBAC e trilha de auditoria imutável (`fleet_audit_chain` / `security_audit_log`).
4. **Identidade Limpa (Clean Room):**
   - Toda simbologia visual dos blocos, hardware modular e esquema elétrico será desenhada em SVG puro autoral seguindo o Design System do ElétricAi e IEC 60617 / IEC 61131-3. Nenhuma imagem, ícone, código ou texto protegido de terceiros será utilizado.
