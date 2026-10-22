// Endurecimento do escopo global do worker SCADA (Fase 7.2).
// Congela intrínsecos (construtores + protótipos) para que scripts hostis não
// consigam poluir protótipos (Object.prototype.x = ...) nem persistir estado
// entre requisições do worker reutilizado. Deve rodar uma única vez, ANTES de
// qualquer script de usuário ser avaliado.

/** Timeout rígido (ms) por execução; o host termina o worker ao estourar. */
export const SCADA_SCRIPT_TIMEOUT_MS = 100;

export const FROZEN_INTRINSICS = [
  "Object",
  "Function",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "BigInt",
  "RegExp",
  "Date",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "Promise",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "JSON",
  "Math",
  "Reflect",
] as const;

/**
 * Congela cada intrínseco (e seu `prototype`) presente em `scope`.
 * Retorna os nomes efetivamente congelados.
 */
export function freezeIntrinsics(scope: Record<string, unknown>): string[] {
  const frozen: string[] = [];
  for (const name of FROZEN_INTRINSICS) {
    const target = scope[name];
    if (target === null || (typeof target !== "object" && typeof target !== "function")) continue;
    try {
      const proto = (target as { prototype?: unknown }).prototype;
      if (proto && typeof proto === "object") Object.freeze(proto);
      Object.freeze(target);
      frozen.push(name);
    } catch {
      /* intrínseco não congelável neste runtime — segue os demais */
    }
  }
  return frozen;
}
