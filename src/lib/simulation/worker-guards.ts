// Guardas do canal de mensagens do worker SCADA.
// Neutraliza globais que um script malicioso usaria para sequestrar o canal
// de mensagens (postMessage) ou persistir estado entre requisições
// (addEventListener/removeEventListener). A defesa é sobre a REFERÊNCIA real,
// não sobre o texto do script — cobre self["postMessage"] e aliases indiretos.

export const MESSAGE_CHANNEL_GLOBALS = [
  "postMessage",
  "addEventListener",
  "removeEventListener",
] as const;

/**
 * Captura a referência confiável de postMessage ANTES de neutralizá-la.
 * Deve ser chamada antes de qualquer script rodar e antes de
 * `neutralizeMessageChannelGlobals`.
 */
export function captureTrustedPostMessage(
  host: Record<string, unknown>,
): ((message: unknown) => void) | null {
  const fn = host["postMessage"];
  if (typeof fn !== "function") return null;
  return (fn as (message: unknown) => void).bind(host);
}

/**
 * Neutraliza (define como undefined) os globais do canal de mensagens no host.
 * Só chamar DEPOIS de registrar o único listener confiável e de capturar o
 * postMessage confiável. Propriedades não-configuráveis são ignoradas.
 */
export function neutralizeMessageChannelGlobals(host: Record<string, unknown>): void {
  for (const k of MESSAGE_CHANNEL_GLOBALS) {
    try {
      host[k] = undefined;
    } catch {
      /* noop — global não-configurável */
    }
  }
}

/**
 * Auditoria F0.9: atribuir `self.fetch = undefined` só cria uma propriedade
 * própria que SOMBREIA o método herdado; o original continua acessível pela
 * cadeia de protótipos (ex.: `Object.getPrototypeOf(self).fetch`,
 * `WorkerGlobalScope.prototype.fetch`). Esta função redefine o nome como
 * `undefined`, não gravável e não configurável, no host E em cada protótipo
 * da cadeia que o possua como propriedade própria, e remove os construtores
 * globais de rede. Retorna os locais neutralizados, para auditoria e teste.
 */
export function neutralizeGlobalsOnPrototypeChain(
  host: object,
  names: readonly string[],
): string[] {
  const neutralized: string[] = [];
  const chain: object[] = [];
  for (let obj: object | null = host; obj; obj = Object.getPrototypeOf(obj) as object | null) {
    if (obj === Object.prototype) break;
    chain.push(obj);
  }
  chain.forEach((obj, depth) => {
    for (const name of names) {
      const isHost = depth === 0;
      if (!isHost && !Object.prototype.hasOwnProperty.call(obj, name)) continue;
      try {
        Object.defineProperty(obj, name, {
          value: undefined,
          writable: false,
          configurable: false,
          enumerable: false,
        });
        neutralized.push(`${depth}:${name}`);
      } catch {
        try {
          // Propriedade não configurável: ao menos tenta removê-la/sobrescrevê-la.
          delete (obj as Record<string, unknown>)[name];
          (obj as Record<string, unknown>)[name] = undefined;
        } catch {
          /* noop — CSP do worker (connect-src 'none') segue como barreira final */
        }
      }
    }
  });
  return neutralized;
}
