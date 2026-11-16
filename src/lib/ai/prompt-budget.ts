// Orçamento de prompt do chat de IA do canvas.
//
// O servidor (`generateDiagramPatch`) valida `prompt` com `max(32000)`. Projetos
// grandes têm dezenas de violações normativas e o lote de reparo pode ser longo;
// sem orçamento o envio falhava com "Too big: expected string to have <=32000".
// Aqui o pedido do usuário tem prioridade; o contexto de violações é deduplicado,
// ordenado por gravidade e cortado para caber, com aviso explícito do corte.

export const MAX_AI_PROMPT_CHARS = 32000;
/** Folga para o template (cabeçalhos/instruções) e diferenças de contagem. */
const TEMPLATE_RESERVE = 1200;
const TRUNCATION_MARKER = "\n[…conteúdo truncado para caber no limite do provedor…]";

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(0, max - TRUNCATION_MARKER.length);
  return text.slice(0, room) + TRUNCATION_MARKER;
}

/**
 * Mantém as linhas de violação (já ordenadas pelo chamador) que cabem em
 * `budget`, removendo duplicatas e anexando um resumo do que foi omitido.
 */
export function fitViolationLines(lines: readonly string[], budget: number): string {
  const unique = Array.from(new Set(lines.map((l) => l.trim()).filter(Boolean)));
  const kept: string[] = [];
  let used = 0;
  for (const line of unique) {
    const cost = line.length + 1;
    if (used + cost > budget) break;
    kept.push(line);
    used += cost;
  }
  const omitted = unique.length - kept.length;
  if (omitted > 0) {
    kept.push(`- (+${omitted} violações adicionais omitidas por limite de tamanho)`);
  }
  return kept.join("\n");
}

/**
 * Compõe o prompt final garantindo `<= MAX_AI_PROMPT_CHARS`.
 * `wrap` recebe o bloco de violações (possivelmente vazio) e o pedido já
 * limitados e devolve o texto final.
 */
export function buildBoundedPrompt(
  userRequest: string,
  violationLines: readonly string[],
  wrap: (violations: string, request: string) => string,
  max: number = MAX_AI_PROMPT_CHARS,
): string {
  // O pedido do usuário pode ocupar até ~75% do orçamento; o restante é contexto.
  const request = truncateText(userRequest, Math.floor((max - TEMPLATE_RESERVE) * 0.75));
  const violationBudget = Math.max(0, max - TEMPLATE_RESERVE - request.length);
  const violations = violationLines.length
    ? fitViolationLines(violationLines, violationBudget)
    : "";
  const composed = violations ? wrap(violations, request) : request;
  // Rede de segurança: nunca exceder o limite do servidor.
  return truncateText(composed, max);
}
