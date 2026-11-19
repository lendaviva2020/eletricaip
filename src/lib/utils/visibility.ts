/**
 * Guarda de visibilidade para laços de SIMULAÇÃO.
 *
 * Laços de `requestAnimationFrame` já são pausados pelo navegador quando a aba
 * fica oculta; os de `setInterval` não. Para não gastar CPU/bateria simulando o
 * que ninguém está vendo, os passos de simulação pulam o corpo quando a aba está
 * oculta. (Não usar em laços de I/O/persistência — esses devem continuar.)
 *
 * SSR-safe: sem `document`, nunca considera oculto.
 */
export function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
}
