# PLANO DE TESTES E QUALIDADE DE SOFTWARE — ELETRICAI

**Data:** 14 de Outubro de 2026  
**Status Atual da Cobertura Automatizada:** 32 arquivos de teste / 263 testes unitários aprovados (Vitest 4 + Testing Library + jsdom).  
**Objetivo:** Estruturar a estratégia abrangente de validação contínua e garantia de qualidade para levar o ElétricAi à produção sem regressões.

---

## 1. Pirâmide e Estratégia de Testes

```
             / \
            / E2E \          -> Playwright (Jornadas completas de usuário)
           /-------\
          /  Integ  \        -> Vitest + Supabase Test Containers / Server Functions
         /-----------\
        /   Unitário  \      -> Vitest (Scan Ladder, Motores FBD, Cálculos Elétricos)
       /---------------\
      / Análise Estática \   -> TypeScript Strict, ESLint 9, Zod Runtime Validation
     /-------------------\
```

---

## 2. Matriz de Cobertura por Módulo

### 2.1 Engenharia Elétrica e Cálculos de Potência
| Tipo | Suíte de Teste | Escopo / Cenários | Ferramenta | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| **Unitário** | `src/__tests__/electrical-calc.test.ts` | Corrente nominal ($I_n$), partida ($I_{start}$), corrente de demanda e transformador. | Vitest | ✅ Aprovado (7 testes) |
| **Unitário** | `src/__tests__/electrical-sim.test.ts` | Curto-circuito IEC 60909 ($I''_k, i_p$), seletividade IEC 60947, arco IEEE 1584, esforço térmico de motor ($I^2t$). | Vitest | ✅ Aprovado (26 testes) |
| **Unitário** | `src/__tests__/multifilar.test.ts` | Dedução de condutores de fase/neutro/terra a partir do grafo unifilar e memorial descritivo. | Vitest | ✅ Aprovado (6 testes) |
| **Unitário (Novo)** | `src/__tests__/nbr5410-ampacity.test.ts` | Capacidade de condução de corrente por método de instalação (A1..F), fatores $k_t$ e $k_g$ segundo NBR 5410. | Vitest | ⏳ A implementar (Fase 5) |
| **Unitário (Novo)** | `src/__tests__/voltage-drop-reactance.test.ts` | Queda de tensão em cabos de $35\text{ mm}^2$ a $300\text{ mm}^2$ comparando modelo puramente resistivo vs com reatância indutiva. | Vitest | ⏳ A implementar (Fase 5) |

### 2.2 Automação, CLPs e Lógica Industrial
| Tipo | Suíte de Teste | Escopo / Cenários | Ferramenta | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| **Unitário** | `src/__tests__/ladder-runtime.test.ts` | Execução pura de rungs em scan determinístico (`scan-core.ts`), contatos série/paralelo e bobinas. | Vitest | ✅ Aprovado (11 testes) |
| **Unitário** | `src/__tests__/ladder-tof-tp.test.ts` | Comportamento temporal de temporizadores TOF (Off-Delay) e TP (Pulse) segundo a IEC 61131-3. | Vitest | ✅ Aprovado (4 testes) |
| **Unitário** | `src/__tests__/ladder-rung-cols.test.ts` | Redimensionamento dinâmico de colunas de rungs preservando a bobina na última célula. | Vitest | ✅ Aprovado (5 testes) |
| **Unitário** | `src/__tests__/ladder-import.test.ts` | Parser de importação e exportação de programas Instruction List (IL) e Structured Text (ST). | Vitest | ✅ Aprovado (6 testes) |
| **Unitário** | `src/__tests__/ladder-estop-verify.test.ts` | Injeção de falha em E-STOP e validação de desenergização imediata da saída do motor. | Vitest | ✅ Aprovado (3 testes) |
| **Unitário** | `src/__tests__/plc-rack-validation.test.ts` | Validação de bastidor de CLP: limite de slots, consumo de corrente de alimentação da CPU e I/O. | Vitest | ✅ Aprovado (9 testes) |
| **Unitário** | `src/__tests__/fbd-engine-*.test.ts` | Compilação de grafo FBD para IR, propagação EN/ENO, ordenação topológica e runtime determinístico. | Vitest | ✅ Aprovado (36 testes) |
| **Integração** | `src/__tests__/fbd-scada-bridge.test.ts` | Ponte de tags entre o motor FBD e o sinótico de supervisão SCADA com telemetria. | Vitest | ✅ Aprovado (3 testes) |
| **Integração** | `src/__tests__/unifilar-ladder-bridge.test.ts` | Mapeamento automático de partidas de motores no diagrama elétrico para rungs de controle Ladder. | Vitest | ✅ Aprovado (8 testes) |

### 2.3 Simulação de Processos e Gêmeo Digital
| Tipo | Suíte de Teste | Escopo / Cenários | Ferramenta | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| **Unitário** | `src/__tests__/plant-engine.test.ts` | Dinâmica da planta industrial 8M+2EX: rampa de velocidade, aquecimento térmico, histerese e parada. | Vitest | ✅ Aprovado (14 testes) |
| **Unitário** | `src/__tests__/twin-what-if.test.ts` | Avaliação de cenários hipotéticos de telemetria ("What-If") com forçamento de variáveis. | Vitest | ✅ Aprovado (5 testes) |
| **Integração** | `src/__tests__/twin-telemetry-flush.test.ts` | Agrupamento em lote e envio atômico de amostras de telemetria 3D para o banco de dados. | Vitest | ✅ Aprovado (4 testes) |

### 2.4 Segurança, Isolamento e Autenticação
| Tipo | Suíte de Teste | Escopo / Cenários | Ferramenta | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| **Unitário** | `src/__tests__/safe-redirect.test.ts` | Prevenção de Open Redirect validando caminhos relativos em parâmetros de URL de login. | Vitest | ✅ Aprovado (5 testes) |
| **Unitário** | `src/__tests__/modbus-ssrf-guard.test.ts` | Validação de SSRF bloqueando loopback, link-local (169.254.x.x), multicast e cloud metadata. | Vitest | ✅ Aprovado (25 testes) |
| **Unitário** | `src/__tests__/scada-sandbox-guards.test.ts` | Bloqueio de acesso a `fetch`, `WebSocket`, `importScripts`, `localStorage` em scripts SCADA. | Vitest | ✅ Aprovado (12 testes) |
| **Integração** | `src/__tests__/iot-ingest-rate-limit.test.ts` | Limite de taxa (Rate Limiting) no endpoint público de IoT com chave de API e resposta 429. | Vitest | ✅ Aprovado (7 testes) |
| **Integração** | `src/__tests__/deletion.test.ts` | Exclusão em cascata de projetos e isolamento LGPD sem deixar registros órfãos no banco. | Vitest | ✅ Aprovado (9 testes) |
| **Segurança (Novo)**| `src/__tests__/rls-tenant-isolation.test.ts` | Tentativa de leitura cruzada (IDOR) entre organizações em `projects`, `diagrams` e `invoices`. | Vitest + Supabase | ⏳ A implementar (Fase 2) |
| **Segurança (Novo)**| `src/__tests__/auth-rate-limit.test.ts` | Submissão de 6 tentativas de login inválidas em 15 minutos e bloqueio com código HTTP 429. | Vitest | ⏳ A implementar (Fase 2) |

---

## 3. Protocolos de Testes Automatizados E2E (Ponta a Ponta)

Os testes de ponta a ponta devem ser executados com Playwright cobrindo os seguintes cenários críticos:

### Cenário E2E 01: Ciclo de Vida do Diagrama Elétrico
1. Usuário faz login com perfil Engenheiro.
2. Cria novo projeto com título "Planta de Moagem".
3. Insere nó de Transformador 500 kVA, Barramento 380V, Disjuntor-Motor e Motor 15 kW.
4. Conecta os componentes com condutor de força.
5. Abre o painel de Estudos Elétricos e executa o cálculo de curto-circuito.
6. Valida que o resultado do curto-circuito na barra principal é de aproximadamente $14,4\text{ kA}$.
7. Clica em "Gerar Multifilar" e confirma a criação dos condutores $3F+N+PE$.
8. Exporta o projeto em PDF e confirma que o download foi concluído com sucesso.

### Cenário E2E 02: Projeto e Simulação de Intertravamento Ladder
1. Acessa o modo Ladder no workspace.
2. Insere um rung com contato normalmente fechado (XIO) vinculado à tag de emergência `E_STOP` em série com o contato normalmente aberto (XIC) `BOTAO_LIGA`, energizando a bobina (OTE) `MOTOR_K1`.
3. Inicia o modo de simulação (Play).
4. Força a tag `BOTAO_LIGA` para TRUE; verifica que a bobina `MOTOR_K1` fica verde (energizada).
5. Força a tag `E_STOP` para TRUE; valida que `MOTOR_K1` desliga imediatamente no mesmo ciclo de scan.

### Cenário E2E 03: Governança de IA com Autocorreção
1. Abre o assistente de IA no workspace.
2. Digita o prompt: "Adicione uma esteira com motor trifásico de 7,5 kW sem botão de emergência".
3. A IA gera a proposta de patch; o validador normativo interno rejeita a ausência de E-STOP.
4. O loop de autocorreção é acionado automaticamente pela IA (Rodada 1), adicionando o botão de emergência NR-12 e o relé de segurança.
5. O preview exibe as alterações com destaque visual verde e vermelho.
6. O usuário clica em "Aplicar Patch" e o diagrama é atualizado no canvas sem recarregar a página.

---

## 4. Procedimento de Testes Manuais de Homologação (Pré-Deploy)

Antes de qualquer liberação de versão para o ambiente de produção:
1. **Verificação de Responsividade:**
   - Testar o workspace em tela Desktop 1920x1080 (Chrome e Firefox).
   - Testar em Laptop 1366x768 com redimensionamento de painéis laterais.
   - Testar em Tablet iPad Pro 12.9" e iPad Mini em orientação paisagem.
2. **Conexão Intermitente (Offline Resilience):**
   - Abrir o workspace e cortar a conexão de rede por 30 segundos enquanto edita o diagrama.
   - Verificar se o indicador de status exibe "Salvando offline / Tentando reconectar" sem perder as últimas alterações no canvas.
3. **Auditoria Visual de Mocks:**
   - Conferir se nenhum botão na interface exibe notificações falsas de simulação ("Simulado em demo") quando conectado à conta comercial real.
