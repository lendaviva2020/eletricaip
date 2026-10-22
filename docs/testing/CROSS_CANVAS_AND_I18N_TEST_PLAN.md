# Plano de Testes Obrigatórios: Integração Cross-Canvas e Internacionalização (`pt-BR` / `en`)

> **Status:** Especificação de Testes e Homologação (Parte 7 / Fase H)  
> **Diretriz:** Inclui testes determinísticos de integração real entre módulos e testes ponta a ponta (E2E). Testes com mocks não substituem a verificação de integração real com o Supabase e a IA Gemini.

---

## 1. Matriz de Cobertura Obrigatória

| # | Requisito Auditado | Arquivo de Teste Alvo | Tipo | Critério Objetivo de Aprovação |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | Consistência de IDs ao navegar entre canvases | `src/__tests__/cross-canvas-identity.test.ts` | Integração | O mesmo equipamento (`M1`, `KM1`, `QF1`) preserva exatamente o mesmo `equipmentId` canônico em Unifilar, Multifilar, Ponte de Controle, SCADA, Simulação e Digital Twin. |
| **T2** | Propagação de alterações aos módulos dependentes | `src/__tests__/cross-canvas-propagation.test.ts` | Integração | Alterar `powerKw` de `7.5 kW` para `15 kW` no Unifilar atualiza imediatamente Multifilar, Nameplate do Digital Twin, corrente nominal na Simulação e marca Estudos dependentes como `stale`. |
| **T3** | Integridade referencial de conexões, terminais e tags | `src/__tests__/connections-and-tags-integrity.test.ts` | Integração | Renomear uma tag (`KM1_CMD` → `BOMBA1_CMD`) propaga para células Ladder, pinos FBD, tabela PLC, widgets SCADA e vínculos Digital Twin sem quebrar referências (`tagId` imutável). |
| **T4** | Conversões válidas e rejeição de conversões ambíguas | `src/__tests__/canvas-conversion-contracts.test.ts` | Integração | (a) Ramo completo `QF1 → KM1 → F1 → M1` gera Multifilar 3F+PE e Rung Ladder válidos; (b) Motor DOL sem contator ou carga 3F em disjuntor 1F é **rejeitado** com `ModelDiagnostic` (`requiresUserIntervention: true`) sem inventar nós ou tags. |
| **T5** | Salvamento e recuperação do estado completo (Round-Trip) | `src/__tests__/persistence-full-roundtrip.test.ts` | Integração + Supabase | `loadProject(saveProject(doc))` restaura 100% de equipamentos, terminais, conexões, Unifilar, Multifilar, Ladder, FBD, rack PLC, SCADA, Digital Twin, Estudos e Diagnósticos (`expect(restored).toEqual(original)`). |
| **T6** | Controle de concorrência e detecção de conflitos | `src/__tests__/persistence-concurrency-conflict.test.ts` | Integração + Supabase | Dois clientes editando a mesma versão `v` do projeto: o segundo `saveProject` com `expectedVersion: v` recebe erro tipado `VERSION_CONFLICT` sem sobrescrever silenciosamente a versão `v+1`. |
| **T7** | Ausência de loops de renderização e autosaves em simulação | `src/__tests__/no-render-loops-or-sim-autosave.test.ts` | Integração | (a) Carregar um projeto dispara `0` chamadas a `saveProject`; (b) Rodar simulação Ladder/FBD/Planta por 50 ciclos de scan (60 Hz) mantém `dirty === false` e dispara `0` autosaves; (c) Alternar entre abas `Ladder ↔ PLC ↔ FBD` não perde rungs nem causa loop de `useEffect`. |
| **T8** | Consistência em malha fechada: Simulação ↔ Ladder/FBD ↔ SCADA ↔ Twin | `src/__tests__/closed-loop-simulation-scada-twin.test.ts` | Integração | Acionar botão de partida no SCADA (`boundTagId`) fecha contato no Ladder (`OB1`), energiza bobina `KM1` (`%Q0.0`), fecha circuito elétrico, acelera motor `M1` na Planta e atualiza RPM/Corrente no SCADA e Digital Twin. |
| **T9** | Funcionamento integral e paridade de catálogos `pt-BR` e `en` | `src/__tests__/i18n-catalog-parity.test.ts` | Unitário + Tipo | (a) Conjunto de chaves de `pt-BR` e `en` é 100% idêntico; (b) Nenhum valor vazio ou igual a placeholder quebrado; (c) Interpolação de parâmetros `{name}`, `{count}` idêntica nos dois idiomas. |
| **T10** | Ausência de textos visíveis não traduzidos na UI | `src/__tests__/i18n-ui-rendering.test.tsx` | Integração UI | Renderizar rotas críticas, barra lateral, topbar, paletas, propriedades, modais e estados vazios com `locale = "en"` não aciona o detector de chaves faltantes nem exibe rótulos fixos em português. |
| **T11** | Persistência da preferência de idioma (Visitante vs Autenticado) | `src/__tests__/i18n-persistence.test.ts` | Integração + Supabase | (a) Padrão inicial é `pt-BR`; (b) Visitante salva em `localStorage`; (c) Usuário autenticado persiste e recupera de `profiles.locale` no Supabase; (d) Trocar idioma com projeto aberto preserva 100% do estado dos canvases sem reload destrutivo. |
| **T12** | Preservação de identificadores técnicos, cálculos e normas ao mudar idioma | `src/__tests__/i18n-engineering-invariance.test.ts` | Integração | Executar dimensionamento NBR 5410, curto-circuito IEC 60909, compilação FBD→ST e validação NR-12 em `pt-BR` e em `en` produz **exatamente os mesmos valores numéricos**, códigos de equipamentos (`QF1`, `KM1`, `M1`), endereços (`%I0.0`, `%Q0.0`) e normas aplicadas. |
| **T13** | Exportação de relatórios PDF/DXF e respostas da IA no idioma escolhido | `src/__tests__/i18n-exports-and-ai.test.ts` | Integração + E2E | (a) `exportProjectPdf` e `exportDiagramDxf` geram títulos, seções e legendas em `pt-BR` quando `locale="pt-BR"` e em `en` quando `locale="en"`; (b) Gemini responde explicações no idioma solicitado mantendo `AiDiagramPatch` estruturalmente válido. |

---

## 2. Especificação Detalhada dos Cenários de Teste

### 2.1 Testes de Consistência Cross-Canvas e Contratos (`T1`–`T4`, `T8`)

#### Cenário `T1/T2`: Ciclo de Vida de um Acionamento Industrial Completo
1. Criar no Unifilar (`WebglCanvas` / `useUnifiedProjectStore`) o ramo: Transformador `TR1` ($500\text{ kVA}$) $\rightarrow$ Barramento `QGBT1` $\rightarrow$ Disjuntor `QF1` ($32\text{ A}$, curva C) $\rightarrow$ Contator `KM1` $\rightarrow$ Relé Térmico `F1` $\rightarrow$ Motor `M1` ($11\text{ kW}$, $380\text{ V}$).
2. Executar a expansão **Unifilar → Multifilar**:
   - Verificar que `views.multifilar.nodes[M1.id]` aponta para o mesmo `M1.id`.
   - Mover manualmente a posição de `M1` no Multifilar para $(x=420, y=580)$.
   - Alterar a potência de `M1` no Unifilar de $11\text{ kW}$ para $15\text{ kW}$.
   - **Asserção:** `M1` no Multifilar reflete $15\text{ kW}$ imediatamente e sua posição $(420, 580)$ permanece intacta.
3. Executar a **Ponte Unifilar → Controle (Ladder/FBD)**:
   - Verificar que `analyzeUnifilarForLadder` enxerga os equipamentos criados no WebGL e gera os vínculos `ControlBinding` para `KM1` (bobina e selo) e `F1` (contato NF 95-96) referenciando `KM1.id` e `F1.id`.
4. Abrir a aba **PLC** (`PlcCanvas`) e alternar entre `OB1`, `FC1` e voltar para a aba **Ladder**:
   - **Asserção:** Os rungs gerados em `OB1` permanecem 100% preservados (sem sobrescrita por array vazio).

#### Cenário `T4`: Rejeição Determinística de Conversões Ambíguas
1. Criar no Unifilar um motor `M2` ($7.5\text{ kW}$, partida `DOL`) ligado diretamente ao barramento `QGBT1` **sem contator e sem disjuntor**.
2. Invocar a geração automática de controle Ladder para `M2`.
3. **Asserção:**
   - Nenhum rung ou tag `KM_M2` fictícia é criada silenciosamente.
   - O array `diagnostics` recebe `CONTROL_BRIDGE_MISSING_CONTACTOR` e `CONTROL_BRIDGE_MISSING_PROTECTION` com `entityIds: [M2.id]` e `requiresUserIntervention: true`.

---

### 2.2 Testes de Persistência, Concorrência e Anti-Loop (`T5`–`T7`)

#### Cenário `T7`: Garantia de Zero Autosave em Load e em Simulação
1. Montar `useProjectPersistence(projectId)` com spy na server function `saveProject`.
2. Aguardar a resolução de `loadProject` e avançar timers em `5000 ms` (incluindo `queueMicrotask`).
   - **Asserção:** `expect(saveProjectSpy).toHaveBeenCalledTimes(0)`.
3. Iniciar a simulação em `RungGrid` (`running = true`) e `useFbdEngine` (`running = true`) e avançar `10.000 ms` (100 ciclos de scan).
   - **Asserção:** `useRuntimeStore` atualiza o estado de energização a cada tick, mas `useUnifiedProjectStore.getState().dirty` permanece `false` e `expect(saveProjectSpy).toHaveBeenCalledTimes(0)`.

---

### 2.3 Testes de Internacionalização e Homologação Bilíngue (`T9`–`T13`)

#### Verificação Estática e Automatizada de Traduções (`T9` & `T10`)
- **Typecheck (`tsc --noEmit`)**: O catálogo `en` implementa a interface literal exata derivada de `pt-BR` (`satisfies TranslationCatalog`). Qualquer chave adicionada em `pt-BR` sem correspondente em `en` (ou vice-versa) quebra a compilação.
- **Scanner de Textos Fixos (`src/__tests__/i18n-hardcoded-scan.test.ts`)**:
  - Varre a AST/JSX dos componentes de UI garantindo que não restem strings visíveis em português hardcoded fora dos catálogos `src/lib/i18n/catalogs/`.
  - Garante que o detector `missingKeyDetector` registre `0` ocorrências ao renderizar todas as telas com `locale = "pt-BR"` e `locale = "en"`.

#### Protocolo de Homologação Real (Sem Mocks para Supabase e Gemini)
Para considerar a Fase H homologada em ambiente real de staging/produção:
1. **Teste Real Supabase (`profiles.locale` & `diagrams` v3)**:
   - Autenticar com usuário real no Supabase, alternar idioma para `en` em `/settings/profile` ou `/settings/appearance`, criar um projeto completo com todos os 7 canvases preenchidos, aguardar autosave (`Salvo` / `Saved`), recarregar o navegador (`F5`) e validar que o idioma `en` e todos os 7 canvases voltam idênticos.
2. **Teste Real Gemini (`generateDiagramPatch` em `pt-BR` e `en`)**:
   - Com `locale = "en"`, enviar prompt no `CanvasAiChat`: *"Add a 15 kW 3-phase motor protected by a 32A breaker and contactor"*.
   - Verificar que o resumo textual (`summary`) retorna em inglês, o patch aplica os componentes canônicos com `type` válido do catálogo, e nenhuma chave técnica (`disjuntor_3p`, `contator`, `motor_3p`) foi corrompida pela tradução.
