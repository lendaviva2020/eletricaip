# Como a IA do EletricAI trabalha em cada editor

> Fonte única das regras de engenharia ensinadas à IA:
> `src/lib/ai/knowledge/engineering-rules.ts`. Todos os prompts (patch do canvas,
> Arquiteto e chat) são montados a partir dele. Teste-guarda:
> `src/__tests__/ai-knowledge-map.test.ts`.

## Princípio de arquitetura

A IA **propõe**; motores **determinísticos** decidem o que é verificável. A ordem
é sempre a mesma:

```
pedido do usuário
  → IA gera patch (JSON validado por Zod)
  → saneamento (IDs, ligações pendentes, troca de tipo, equipamento duplicado)
  → reparo de ligações (topologia)
  → layout (criação) ou só posicionar o novo (correção)
  → numeração IEC 81346 (Q1..Qn, K1..Kn…)
  → dimensionamento de cabos NBR 5410
  → validação de topologia + relatório ao usuário
```

Três regras valem em todo o app:

1. **Nada inventado.** Dado de obra (comprimento de cabo, corrente medida,
   endereço físico de E/S) só entra se o usuário informou. Sem dado →
   pendência nominal ("informe o comprimento de F2 → M1").
2. **Correção ajusta, não recria.** Diagrama existente: a IA só adiciona o que
   falta, ajusta parâmetros e remove o errado; não reposiciona o desenho do
   usuário.
3. **Simulação nunca vira comando em campo** (AGENTS.md, regra 21).

## Mapa por editor

| Editor | Onde a IA entra | O que ela faz | Motores que rodam depois (não dependem da IA) |
| --- | --- | --- | --- |
| **Unifilar** | Chat do canvas (`canvas-ai-chat.tsx`) → `generateDiagramPatch` (`lib/diagram/ai.functions.ts`); botões "Corrigir com IA" | Cria circuito do zero ou corrige o existente (modo correção automático quando há diagrama) | `sanitizeAiPatch`, `repairDiagramConnections`, `autoLayoutIndustrialDiagram` / `placeAddedNodes` + `routeDiagramEdges`, `normalizeDeviceTags`, `sizeDiagramCables`, `validateElectricalTopology` |
| **Multifilar** | Nenhuma — é **derivado** do unifilar | — | `lib/diagram/multifilar.ts` (fases, cores NBR 5410, polos), Documentação EletricAI (bornes -X1/-X2) |
| **Ladder** | Arquiteto (`/ai`, `ai-architect.functions.ts`) gera `plcLogic.rungs` | Rungs de comando com selo e intertravamentos | `verifyEstopInterlock` (simula o rung), referência cruzada (`lib/ladder/cross-reference.ts`) |
| **FB Electric Studio** | Arquiteto (página "Lógica FBD (IA)"); botão "Gerar do unifilar" é determinístico | Blocos FBD/LAD por página | `unifilar-motor-program.ts` (RS reset dominante, NF fail-safe), compilador ST |
| **SCADA / HMI** | Editor HMI → `hmi-ai.functions.ts` (gera código da tela) | Tela de processo a partir da descrição da planta | Parser da DSL (mesmo do editor), runtime de simulação; alarmes ISA-18.2 |
| **Chat** (`/chat`) | `ai-chat.functions.ts` | Responde dúvidas sobre todos os editores com o mapa completo | — |

## Unifilar — regras que a IA segue

- **Entrada:** transformador → disjuntor geral **Q0** → seccionadora / DR geral
  (em série, quando existirem) → barramento. O motor de reparo encadeia esses
  dispositivos em série (`connection-repair-engine.ts`, passo 0) e nunca liga o
  Q0 direto no barramento se houver algo entre eles.
- **Ramais:** partida direta/estrela-triângulo = disjuntor → contator → relé
  térmico (obrigatório) → motor; inversor/soft = disjuntor → acionamento →
  motor; tomada = disjuntor → DR 30 mA → tomada.
- **Cabos ficam na ligação** (`edge.cable`), nunca como equipamento. A IA altera
  cabo existente por `updateEdges[].cable`.
- **Tags** IEC 81346-2: Q, F, K, T, W, M, X, B, S. O sistema renumera em
  sequência por tipo (Q1, Q2…); Q0 é o geral.

### Cabos (NBR 5410)

`lib/diagram/connection/cable-sizing.ts` (puro, testado em `cable-sizing.test.ts`):

- **Ib** = soma das cargas a jusante; **In** = primeiro relé térmico ou disjuntor
  a montante; seção pela `sizeConductorNBR5410` garantindo
  **Ib ≤ In ≤ I'z**; ramal de um motor com **I'z ≥ 1,25·In**.
- Seção do usuário só é trocada se não coordenar com a proteção (relatado).
- Método de instalação não informado → **B1**, declarado como premissa no
  relatório e gravado no cabo (`installation`).
- **Comprimento nunca é preenchido.** Só o cabo de campo (painel → carga) e o
  alimentador (fonte externa → painel) precisam dele; a fiação interna do
  painel não é cobrada no diagnóstico.
- Sem gastar crédito: painel "Documentação EletricAI" → **Dimensionar cabos
  (NBR 5410)** (um comando, Ctrl+Z desfaz).

## Ladder — convenção fail-safe (única no app)

- Parada, E-STOP e relé térmico são **contatos NF físicos**: a entrada do CLP
  fica em 1 quando está tudo OK. No ladder entram com **XIC em série**
  (operandos `S0_OK`, `F1_OK`…). Fio rompido = 0 = desliga.
- Partida com **selo**: a bobina (ou auxiliar) do contator em paralelo com o
  botão de partida; os contatos de segurança se repetem em cada linha.
- `verifyEstopInterlock` detecta a polaridade no próprio rung: XIC é simulado
  como fail-safe; XIO ("1 = acionado") ainda interlocka, mas gera aviso de que
  a botoeira teria de ser NA (fio rompido não para).
- A emergência é **circuito físico cabeado**; o rung no CLP é intertravamento
  adicional.

## Como estender

1. Regra nova de engenharia → `engineering-rules.ts` (nos dois idiomas).
2. Se a regra é verificável, implemente o motor determinístico e chame-o no
   pipeline de `generateDiagramPatch` (ou no verificador do Arquiteto).
3. Atualize este documento e o teste-guarda.
