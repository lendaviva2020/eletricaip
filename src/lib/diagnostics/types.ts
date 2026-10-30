/**
 * Módulo de Contratos e Tipos Canônicos de Diagnósticos Normativos do ElétricAi.
 *
 * Princípio Central de Engenharia:
 * O motor determinístico decide; a IA apenas escolhe entre propostas já
 * validadas pelo motor e explica em português. A IA nunca gera valores
 * numéricos de projeto, nunca cita itens de norma de memória e nunca
 * altera o diagrama diretamente.
 *
 * Conformidade: ABNT NBR 5410:2004.
 */

export type Severity = "ok" | "warning" | "error";

export interface NormReference {
  /** Identificação formal da norma técnica (ex.: "ABNT NBR 5410:2004"). */
  readonly standard: string;
  /** Cláusula ou seção normativa tabelada (provém do catálogo, nunca da IA). */
  readonly clause: string;
  /** Status da referência normativa. */
  readonly reviewStatus: "pending-human-review" | "reviewed";
}

export interface DiagnosticMeasurement {
  readonly value: number;
  readonly unit: string;
}

export interface Diagnostic {
  /** Identificador estável e determinístico no formato `${ruleId}:${elementId}`. */
  readonly id: string;
  /** Identificador da regra no catálogo normativo. */
  readonly ruleId: string;
  /** Nível de severidade calculado determinísticamente pela margem técnica. */
  readonly severity: Severity;
  /** Identificadores dos elementos do diagrama relacionados a este diagnóstico. */
  readonly elementIds: readonly string[];
  /** Valor mensurado/calculado pelo motor de engenharia. */
  readonly measured: DiagnosticMeasurement;
  /** Limite regulamentar estabelecido pela norma aplicável. */
  readonly limit: DiagnosticMeasurement;
  /** Razão entre o valor medido e o limite normativo (measured / limit). */
  readonly marginRatio: number;
  /** Premissas adotadas quando parâmetros não estiverem explícitos no projeto. */
  readonly assumptions: readonly string[];
  /** Referência formal à norma técnica. */
  readonly reference: NormReference;
  /** Contexto de dados tipados do diagnóstico. */
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Classifica a severidade de um diagnóstico pela razão entre a grandeza medida e o limite.
 *
 * Regras:
 * - Dados não finitos (NaN, Infinity, -Infinity) ou negativos resultam estritamente em "error".
 * - Razão >= 1.0 (violação direta da norma) resulta em "error".
 * - Razão >= warnAt (faixa de atenção preventiva) resulta em "warning".
 * - Razão < warnAt resulta em "ok".
 *
 * @param ratio - Razão calculada (measured / limit).
 * @param warnAt - Limiar de margem técnica para aviso preventivo (ex.: 0.9 para 90% do limite).
 * @returns Severidade estrita ("ok" | "warning" | "error").
 */
export function classifyMargin(ratio: number, warnAt: number): Severity {
  if (!Number.isFinite(ratio) || ratio < 0) return "error";
  if (ratio >= 1) return "error";
  return ratio >= warnAt ? "warning" : "ok";
}
