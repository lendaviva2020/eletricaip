/**
 * Fonte única da trava de segurança física (auditoria Fase 1 / F1.4).
 *
 * O ElétricAi é estritamente observacional: nenhum caminho de código pode
 * escrever em CLP físico, forçar saídas reais ou acionar motores/válvulas.
 * Os módulos que antes declaravam a própria constante agora reexportam esta,
 * para que a invariante não possa divergir entre camadas.
 *
 * NUNCA altere este valor.
 */
export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;
