// Valores nominais NÃO confirmados pelo engenheiro — PURO.
//
// Todo valor nominal que o sistema escolhe (padrão da biblioteca, sugestão da
// IA, migração de projeto antigo) fica listado em `params.unconfirmed` até o
// engenheiro informar o dado de placa/catálogo (editar o campo) ou confirmar
// explicitamente. O diagnóstico avisa (`defaults_*`) e a emissão da revisão é
// bloqueada enquanto houver pendência.

/** Parâmetros que não são dado nominal (não precisam de confirmação). */
export const NON_RATING_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "tag",
  "notes",
  "manufacturer",
  "model",
  "cpu",
  "protocol",
  "unconfirmed",
]);

/** Limite do schema (`ParamsBase.unconfirmed`). */
const MAX_UNCONFIRMED = 20;

type Params = Record<string, unknown>;
type WithPending<T> = T & { unconfirmed?: string[] };

function isRatingValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

/** Chaves de dado nominal presentes nos parâmetros. */
export function ratingKeysOf(params: Params): string[] {
  return Object.keys(params).filter((k) => !NON_RATING_KEYS.has(k) && isRatingValue(params[k]));
}

/** Pendências atuais de confirmação. */
export function unconfirmedKeysOf(params: Params | undefined): string[] {
  const raw = params?.unconfirmed;
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}

function withPending<T extends Params>(params: T, keys: Iterable<string>): WithPending<T> {
  const present = new Set(ratingKeysOf(params));
  const pending = [...new Set(keys)].filter((k) => present.has(k)).slice(0, MAX_UNCONFIRMED);
  const out: Params = { ...params };
  if (pending.length > 0) out.unconfirmed = pending;
  else delete out.unconfirmed;
  return out as WithPending<T>;
}

/** Marca TODOS os valores nominais como não confirmados (equipamento criado pelo sistema/IA). */
export function markAllUnconfirmed<T extends Params>(params: T): WithPending<T> {
  return withPending(params, [...unconfirmedKeysOf(params), ...ratingKeysOf(params)]);
}

/**
 * Atualização feita pelo sistema/IA: as chaves cujo valor MUDOU ficam pendentes,
 * somadas às pendências que o equipamento já tinha. Valor que o engenheiro já
 * confirmou e a IA manteve igual continua confirmado.
 */
export function markChangedUnconfirmed<T extends Params>(
  previous: Params,
  next: T,
): WithPending<T> {
  const changed = ratingKeysOf(next).filter(
    (k) => JSON.stringify(previous[k]) !== JSON.stringify(next[k]),
  );
  return withPending(next, [...unconfirmedKeysOf(previous), ...changed]);
}

/** Confirmação explícita pelo engenheiro: remove todas as pendências. */
export function confirmAllValues<T extends Params>(params: T): WithPending<T> {
  return withPending(params, []);
}

/** Confirmação de um campo editado pelo engenheiro. */
export function confirmValue<T extends Params>(params: T, key: string): WithPending<T> {
  return withPending(
    params,
    unconfirmedKeysOf(params).filter((k) => k !== key),
  );
}
