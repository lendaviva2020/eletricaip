# Plano de implementação

Vou dividir em 4 frentes. Como há muito código novo (biblioteca de 18+ componentes com SVG IEC, simulação em tempo real, motor Zustand), preciso confirmar 1 ponto crítico antes de começar.

---

## 1. IA — resolver 401 DeepSeek + diagnóstico

**Problema:** a chave `DEEPSEEK_API_KEY` está inválida e o app trava sem feedback claro.

**Proposta (recomendada):** migrar o motor de IA para o **Lovable AI Gateway** (Gemini 3 Flash / GPT-5), que:

- Não exige você gerenciar chave (provisionada automaticamente).
- Tem tool-calling compatível, então o schema atual do "design_industrial_system" continua funcionando.
- Remove o ponto de falha 401.

**Alternativa:** manter DeepSeek e só melhorar mensagens de erro (você precisará gerar nova chave).

**Independente da escolha, vou implementar:**

- Validação no startup da edge function: checa se chave existe e tem prefixo esperado, loga erro claro.
- Mapeamento de 401 → mensagem amigável no chat ("Chave de IA inválida. Verifique nas configurações…") sem expor a chave.
- Nova rota `**/settings/ai-status**` com:
  - Indicador "Chave configurada" (verde/vermelho)
  - Último teste (timestamp + sucesso/falha)
  - Contador de erros 401 nas últimas 24h
  - Botão "Revalidar agora" → faz ping na edge function

## 2. Correções de UI rápidas

- **SCADA Canvas + Digital Twin Canvas:** habilitar zoom/pan no Konva (`draggable` no Stage + handler de wheel para zoom).
- **Botão Salvar Projeto:** adicionar no Topbar do workspace, salva snapshot manual em `project_versions` com label "manual".
- **Menu hambúrguer escondido:** corrigir `z-index` do drawer (`z-50`) e backdrop, garantir que sobreponha o conteúdo do dashboard.

## 3. Biblioteca de componentes unifilares (IEC 60617)

**Arquivo `src/lib/component-definitions.ts**` com 18 tipos:
QF, QS, DR, FU, SPD, KM, KA, F/FR, M (motores), SS, VFD, TR, PS, PLC, KT, CT, BC, Sensores (PT/TT/LT/FT).

Cada definição contém:

```ts
interface ComponentDefinition {
  code: string;          // "QF"
  name: string;
  category: "power" | "control" | "signal" | "protection";
  symbol: SVGSymbol;     // gerador SVG IEC 60617
  terminals: Terminal[]; // { id, type, side, color }
  defaults: Record<string, ParamSpec>; // tipo + unidade + min/max
  simulate?: (state, dt) => state;     // física do componente
}
```

**Cores dos bornes:** potência `#E53E3E`, controle `#D4A017`, sinal `#2563EB`, neutro `#6B7280`.

**Painel de propriedades:** ao selecionar um componente, painel lateral direito mostra todos os parâmetros editáveis com unidade, com botão "Restaurar padrão de fábrica".

**Paleta de componentes:** sidebar esquerdo no canvas Unifilar com busca + drag & drop dos 18 componentes.

**Motor de simulação (`src/lib/simulation-engine.ts`):**

- Loop a cada 50ms via `requestAnimationFrame` controlado.
- Cada nó tem estado runtime (corrente, tensão, temperatura, contagem, timer).
- Propaga energia pelas edges (power), avalia proteções (térmico, magnético, DR, fusível I²t), atualiza KT (delays), CT (contadores).
- Eventos de falha (sobrecorrente, perda de fase, fusível rompido) viram alarmes no painel inferior.

**IA edita biblioteca:** o prompt do architect ganha contexto da `ComponentDefinition` para poder sugerir "trocar QF de 100A por 125A" com cálculo de custo estimado (`+R$ XXX`).

## 4. Ordem de execução

1. Migrar/validar IA (frente 1) → desbloqueia testes do architect
2. Correções rápidas SCADA/Twin/Salvar/Menu (frente 2)
3. Biblioteca + painel de propriedades (frente 3, base estática)
4. Motor de simulação (frente 3, dinâmico)
5. Integração IA ↔ biblioteca (sugestões com custo)

---

## ❓ Pergunta única antes de começar

**Sobre o motor de IA**, você prefere: manter deepseek, criar nova chave! E no motor da IA, deixe a ia pesquisar fora do nosso sistema caso ela não consiga gerar ou criar o cálculo correto, pesquisar na web por mais que demore!

**(A)** Migrar para **Lovable AI Gateway** — sem gerenciar chave, sem 401, modelo Gemini 3 Flash por padrão (recomendado, mais barato e estável).

**(B)** Continuar com **DeepSeek** — você gera nova chave em platform.deepseek.com e atualiza o secret; eu só melhoro o tratamento de erros. 

Responda **A** ou **B** e eu sigo direto com toda a implementação acima.