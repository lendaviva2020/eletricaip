/**
 * Compilador FBD Oficial e Unificado — IEC 61131-3.
 *
 * Conforme estabelecido no Master Engineering Execution Plan (Seção 10),
 * o compilador legado foi unificado e padronizado na árvore oficial do motor
 * `@/lib/fbd/engine/compiler`.
 *
 * Todos os tipos, diagnósticos e AST derivam do motor determinístico oficial.
 */

export * from "./engine/compiler";
export { generateStructuredText, type StGeneratorResult } from "./engine/st-generator";
