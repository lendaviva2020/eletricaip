/**
 * Troca de provedor de IA conversando no chat (puro, roda no cliente e no
 * servidor). O usuário não configura chave: a plataforma paga DeepSeek e
 * Gemini; ele só escolhe com qual quer falar.
 *
 * Reconhece pedidos curtos e explícitos ("usa o gemini", "troca pra deepseek",
 * "quero falar com o Gemini") e perguntas sobre qual IA está em uso. Frases
 * longas que só citam o nome ("compare deepseek e gemini para...") NÃO trocam.
 */

export const AI_PROVIDERS = ["deepseek", "gemini"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABEL: Record<AiProviderId, string> = {
  deepseek: "DeepSeek",
  gemini: "Google Gemini",
};

export type ProviderIntent =
  { readonly kind: "switch"; readonly provider: AiProviderId } | { readonly kind: "which" } | null;

const SWITCH_VERBS =
  /\b(usa|use|usar|utilize|utilizar|troca|troque|trocar|muda|mude|mudar|alterna|alterne|alternar|passa|passe|passar|quero|prefiro|volta|volte|voltar|switch|change|use)\b/;
const WHICH =
  /\b(qual|que)\b.*\b(ia|ai|modelo|provedor|intelig[eê]ncia)\b.*\b(usa|usando|est[aá]|é|e|voc[eê])\b|\bwhich (ai|model)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectProviderIntent(raw: string): ProviderIntent {
  if (typeof raw !== "string") return null;
  const text = normalize(raw);
  // Pedido de troca é curto; texto longo é pergunta de engenharia.
  if (!text || text.length > 80) return null;
  const words = text.split(" ").length;
  const mentions = AI_PROVIDERS.filter((p) => text.includes(p));
  if (mentions.length === 1 && words <= 10 && SWITCH_VERBS.test(text)) {
    return { kind: "switch", provider: mentions[0] };
  }
  if (mentions.length === 0 && WHICH.test(text)) return { kind: "which" };
  return null;
}

export function isAiProviderId(v: unknown): v is AiProviderId {
  return typeof v === "string" && (AI_PROVIDERS as readonly string[]).includes(v);
}

export function switchConfirmation(
  provider: AiProviderId,
  available: readonly AiProviderId[],
): string {
  const label = AI_PROVIDER_LABEL[provider];
  if (!available.includes(provider)) {
    return `Anotei sua preferência pelo ${label}, mas ele não está disponível agora. Enquanto isso, sigo com ${available.map((p) => AI_PROVIDER_LABEL[p]).join(" ou ") || "a IA disponível"}.`;
  }
  return `Pronto: a partir de agora você está falando com o ${label}. Para voltar, é só pedir.`;
}

export function whichProviderAnswer(
  preferred: AiProviderId,
  available: readonly AiProviderId[],
): string {
  const active = available.includes(preferred) ? preferred : available[0];
  if (!active) return "A IA está temporariamente indisponível.";
  const others = AI_PROVIDERS.filter((p) => p !== active && available.includes(p));
  const tip = others.length
    ? ` Se quiser trocar, peça "use o ${AI_PROVIDER_LABEL[others[0]]}".`
    : "";
  return `Você está falando com o ${AI_PROVIDER_LABEL[active]}.${tip}`;
}
