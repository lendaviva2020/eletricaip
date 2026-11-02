# ELÉTRICAI — PLANO DE REMEDIAÇÃO EXECUTADO DO GATE 1
# P0 SECURITY REMEDIATION + CANONICAL EQUIPMENT SINGLE SOURCE OF TRUTH

- **Data de Conclusão:** 01 de Novembro de 2026
- **Status do Gate:** `APROVADO (GATE 1A & GATE 1B)`
- **Auditoria de Origem:** `docs/scada/SCADA_INDEPENDENT_AUDIT_2026-11-01.md`
- **Módulos Afetados:** SCADA Supervisório, Single Source of Truth, Segurança Operacional, Roteamento TanStack

---

## 1. RESUMO EXECUTIVO DA REMEDIAÇÃO

O Gate 1 teve como missão primária sanar os dois riscos críticos P0 (**RSK-P0-01** e **RSK-P0-02**) e o bloqueio de integração P1 (**RSK-P1-01**) identificados na auditoria independente forense. 

Nenhuma funcionalidade de driver físico (OPC UA / Modbus / MQTT) ou historiador de séries temporais foi adicionada antecipadamente nesta fase, cumprindo a diretriz de **construir primeiro uma fundação segura e unificada de dados antes de avançar na conectividade de rede**.

### Tabela de Status dos Riscos do Gate 1:

| ID | Prioridade | Descrição do Risco | Causa Raiz | Remediação Executada | Status Pós-Gate 1 |
|---|---|---|---|---|---|
| **RSK-P0-01** | **P0** | E-STOP exclusivamente em software e simulação gerando falsa percepção de desarme físico. | Ação alterava apenas flags de simulação em memória no Zustand sem avisos da NR-10/NR-12. | Tipagem rígida dos 4 estados de parada; botão rotulado como `PARADA DA SIMULAÇÃO (VIRTUAL)`; banner permanente de segurança; bloqueio `isPhysicalControlAllowed: false`. | **RESOLVIDO (VERIFIED)** |
| **RSK-P0-02** | **P0** | Rota `/scada` ignorava `projectId`, operando em memória sem isolamento multi-tenant. | `ScadaLayout` descartava prop `projectId` e usava fixtures locais sem validação no Supabase. | Server function `resolveScadaProjectContext` com validação de `tenant_memberships` (403 se não autorizado); preservação de search param `projectId`; reset completo da store na troca de projetos. | **RESOLVIDO (VERIFIED)** |
| **RSK-P1-01** | **P1** | Desconexão entre os modelos do Canvas (`CanonicalEquipment`) e os equipamentos do SCADA. | SCADA dependia de `INITIAL_EQUIPMENTS` estático dedicado à ETE. | Ponte canônica `canonical-bridge.ts` conectando `UnifiedProjectDoc` ao SCADA; isolamento do seed demonstrativo em `demo-ete-seed.ts`. | **RESOLVIDO (VERIFIED)** |

---

## 2. DETALHAMENTO DA IMPLEMENTAÇÃO POR GATE

### Gate 1A — Segurança e Contexto (P0)

1. **Hierarquia de 4 Níveis de Parada (`SafetyActionLevel`):**
   - Criada enumeração em `src/lib/scada/types.ts`:
     - `SIMULATION_HALT`: Ação em memória no modelo de simulação.
     - `OPERATIONAL_STOP_REQUEST`: Solicitação de processo para parada via CLP.
     - `PHYSICAL_EMERGENCY_STOP`: Botão cogumelo físico cabeado.
     - `VALIDATED_SAFETY_FUNCTION`: Malha certificada ISO 13849-1 / IEC 62061.
2. **Remediação do Botão e Notificações (`scada-header.tsx`):**
   - Rótulo: `PARADA DA SIMULAÇÃO (VIRTUAL)` / `Rearmar Simulação`.
   - Banner de advertência permanente visível em todas as telas:
     *"AVISO DE SEGURANÇA OPERACIONAL (NR-10 / NR-12): Este supervisório opera em modo de simulação/engenharia. Comandos virtuais de parada não substituem o botão físico de parada de emergência e relés de segurança certificados cabeados em campo."*
   - Status bar inferior exibe badge: `CONTROLE FÍSICO BLOQUEADO`.
3. **Resolução de Projeto no Servidor (`scada.functions.ts`):**
   - `resolveScadaProjectContext`: Endpoint seguro com `requireSupabaseAuth`.
   - Consulta tabela `projects` e valida contra `tenant_memberships`.
   - Rejeição imediata com `403 Forbidden` caso o projeto pertença a outro tenant ou se o usuário estiver anônimo.
4. **Isolamento de Estado na Troca de Projeto (`scada-store.ts`):**
   - `setProjectContext`: Limpa completamente arrays de equipamentos, TAGs, alarmes e logs anteriores.
   - Zero persistência residual entre workspaces distintos.

### Gate 1B — Single Source of Truth & Canonical Equipment (P1)

1. **Separação entre Equipamento Canônico e Representação Gráfica:**
   - Adotado o modelo `CanonicalEquipment` e `CanonicalTag` do Schema v3.
   - Símbolos gráficos nos diagramas Unifilar e Multifilar apenas apontam para o `id` canônico.
   - A exclusão de um símbolo visual do unifilar preserva a entidade canônica e suas leituras no SCADA.
2. **Ponte Reativa (`canonical-bridge.ts`):**
   - `canonicalToScadaTelemetry`: Converte entidades unificadas em telemetria SCADA preservando grandezas de placa (kW, V, A, FP).
   - `canonicalToScadaTag`: Separa metadados da TAG de seus valores voláteis de runtime.
   - `syncUnifiedDocToScada`: Projeta o documento de engenharia para a supervisão sem duplicações.
3. **Desacoplamento de Dados de Demonstração (`demo-ete-seed.ts`):**
   - Fixtures estáticas da Estação de Tratamento de Efluentes movidas para arquivo dedicado de demonstração.
   - Identificador `DEMO_ETE_PROJECT_ID` (`00000000-0000-4000-8000-000000000001`) marcado explicitamente como `isDemo: true`, `driver: "SIMULATION"`.
   - Projetos comuns de clientes iniciam sem a ETE demonstrativa.

---

## 3. VERIFICAÇÃO E QUALITY GATES

1. `bun run typecheck`: **0 erros** (Compilação completa sem emit).
2. `bun run format:check`: **100% dos arquivos em conformidade com o Prettier**.
3. `bunx eslint`: **0 erros, 0 warnings** em todos os arquivos SCADA.
4. Vitest SCADA Suites: **32 testes aprovados** em 5 arquivos (`scada-gate1a-security-and-multitenancy.test.ts`, `scada-gate1b-canonical-equipment.test.ts`, `scada-supervisory-system.test.ts`, `scada-sandbox-guards.test.ts`, `scada-sandbox-hardening.test.ts`).
5. `bun run build`: **Build de produção Client e SSR aprovado em 43.39s**.
