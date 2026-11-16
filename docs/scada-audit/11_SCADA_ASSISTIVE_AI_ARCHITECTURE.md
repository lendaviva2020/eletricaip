# 11 — Arquitetura da IA assistiva no SCADA

## Situação atual

- **Não existe IA no SCADA.** Nenhum arquivo de `components/scada` ou `lib/scada` chama modelo de IA (verificado por busca).
- **O provedor existe no app.** O ElétricAi usa o Google Gemini no servidor (`lib/ai/gemini-client.server.ts`), com `GEMINI_API_KEY` configurada na Vercel (confirmado em sessão anterior), créditos (`consume_ai_credits`, corrigido em `4fe0304`), limites de taxa e sanitização de contexto (`lib/ai/context-sanitizer.ts`). A afirmação de que "não há chave de IA configurada" não confere com o ambiente atual. Se o pedido é usar **outro** provedor, isso precisa ser definido.
- Nada da sessão do Claude é ou será usado como credencial do ElétricAi.

## Pré-requisito que bloqueia hoje

A IA explicaria números inventados. Enquanto o SCADA fabricar valores (doc 09), não persistir alarmes (doc 07) nem ter histórico com origem (doc 10), qualquer "diagnóstico" seria sobre dado falso. **A Fase 6 depende das Fases 0, 1, 3 e 4.**

## Arquitetura proposta (sem segundo sistema)

```
Pergunta do operador (painel lateral do SCADA, com o equipamento/alarme em foco)
  → server function aiScadaAssist (requireSupabaseAuth + requireAiQuota + requireBurstLimit)
      → autorização do projeto (authorizeProjectAccess já existente)
      → montagem de contexto SOMENTE LEITURA, limitada e citável:
          • equipamento canônico + cadeia do ramal (motor-fleet)
          • estado e qualidade dos tags do equipamento (com origem)
          • alarmes persistidos na janela (alarm_history), em ordem temporal
          • histórico agregado (queryHistorianRange)
          • topologia do unifilar e documentos do projeto
      → sanitizePromptText em todo texto vindo de usuário/banco
      → Gemini (modelo rápido) com saída estruturada validada por Zod:
          { fatos: [...com referência], correlacoes: [...], hipoteses: [...com evidência e confiança],
            verificacoes_recomendadas: [...], limites: "o que não foi possível verificar" }
  → painel mostra fato, correlação, hipótese e recomendação em seções separadas,
    com o selo "Análise assistida — não executa comandos"
```

## Regras inegociáveis

1. Somente leitura: nenhuma ferramenta da IA escreve tag, força valor, comanda equipamento ou altera configuração (`IS_PHYSICAL_CONTROL_ALLOWED` permanece `false`; AGENTS.md regra 21).
2. Distinguir **fato observado**, **correlação temporal**, **hipótese** e **causa confirmada**. A IA nunca afirma causa confirmada.
3. Toda afirmação cita o tag, alarme ou documento de origem; sem fonte, não afirma.
4. Dado simulado aparece marcado como simulado no contexto e na resposta.
5. Escopo pelo projeto e papel do usuário; nenhum dado de outra empresa no contexto.
6. Custo controlado por créditos e limite de contexto.

## Níveis de inteligência (proposta do proprietário, mantida)

| Nível | Entrega | Depende de |
|---|---|---|
| 1 Supervisão | O que está acontecendo | Fases 0–2 |
| 2 Diagnóstico assistido | O que pode estar acontecendo, com evidências | Fases 3–4 + IA |
| 3 Engenharia assistida | Propostas de lógica/parâmetro/manutenção para revisão humana | Nível 2 + fluxo de aprovação (patches já existem no unifilar) |

## Cenário de referência sugerido

Fábrica de óleo e farinha (proposta do proprietário): modelar como projeto de demonstração separado, com unifilar, CCM e tags simulados **rotulados**, para validar o fluxo completo antes de qualquer cliente real. Exige ID de demonstração isolado (padrão de `demo-ete-seed.ts`).
