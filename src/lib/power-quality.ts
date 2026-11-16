// Qualidade de energia — harmônicas (puro, determinístico, sem I/O).
//
// Referências:
//  • IEEE 519-2014 §3 e Tabela 2 — THD, TDD e limites de distorção de corrente
//    para 120 V ≤ V ≤ 69 kV em função da razão Isc/IL.
//  • IEEE C57.110 / UL 1561 — fator K para transformadores que alimentam cargas não lineares.
//  • NBR 5410 §6.2.6.2 e Anexo F — neutro com 3ª harmônica e múltiplas (triplen).

export interface HarmonicComponent {
  /** Ordem harmônica (2..50). */
  order: number;
  /** Corrente eficaz desta harmônica (A). */
  current_A: number;
}

export interface HarmonicAnalysis {
  /** THD de corrente em relação à fundamental (%). */
  thd_pct: number;
  /** TDD em relação à corrente de demanda máxima IL (%) — base dos limites IEEE 519. */
  tdd_pct: number;
  /** Corrente eficaz total √(I1² + Σ Ih²) (A). */
  rms_A: number;
  /** Fator K (IEEE C57.110): Σ (Ih/Irms)² · h², incluindo a fundamental. */
  kFactor: number;
  /** Menor classe padronizada de transformador K-rated que atende (K-1, 4, 9, 13, 20, 30, 40, 50). */
  kRatedTransformer: number;
  /** Corrente de neutro por triplens em sistema 3F+N equilibrado: 3·√(Σ I(3k)²) (A). */
  neutralTriplen_A: number;
  /** Limite IEEE 519 de TDD para a razão Isc/IL informada (%). */
  tddLimit_pct: number;
  tddCompliant: boolean;
  /** NBR 5410: 3ª harmônica > 33 % exige neutro dimensionado pela corrente de neutro. */
  thirdHarmonic_pct: number;
}

const K_CLASSES = [1, 4, 9, 13, 20, 30, 40, 50] as const;

/** Limite de TDD (IEEE 519-2014, Tabela 2, 120 V–69 kV) pela razão Isc/IL. */
export function ieee519TddLimit(iscOverIl: number): number {
  if (!Number.isFinite(iscOverIl) || iscOverIl < 20) return 5;
  if (iscOverIl < 50) return 8;
  if (iscOverIl < 100) return 12;
  if (iscOverIl < 1000) return 15;
  return 20;
}

/**
 * Análise de distorção de corrente.
 * @param fundamental_A corrente eficaz da fundamental (A), > 0
 * @param harmonics componentes harmônicas (ordens repetidas são somadas quadraticamente)
 * @param demandCurrent_A corrente de demanda máxima IL (A); padrão = fundamental
 * @param iscOverIl razão curto-circuito/carga no ponto de acoplamento comum (PCC)
 */
export function analyzeHarmonics(
  fundamental_A: number,
  harmonics: readonly HarmonicComponent[],
  demandCurrent_A: number = fundamental_A,
  iscOverIl = 20,
): HarmonicAnalysis {
  if (!Number.isFinite(fundamental_A) || fundamental_A <= 0) {
    throw new Error("fundamental_must_be_positive");
  }
  const IL =
    Number.isFinite(demandCurrent_A) && demandCurrent_A > 0 ? demandCurrent_A : fundamental_A;
  const byOrder = new Map<number, number>();
  for (const h of harmonics) {
    const order = Math.round(h.order);
    if (order < 2 || order > 50 || !Number.isFinite(h.current_A) || h.current_A < 0) {
      throw new Error(`invalid_harmonic_order_${h.order}`);
    }
    byOrder.set(order, Math.sqrt((byOrder.get(order) ?? 0) ** 2 + h.current_A ** 2));
  }
  let sumH2 = 0;
  let sumTriplen2 = 0;
  for (const [order, I] of byOrder) {
    sumH2 += I * I;
    if (order % 3 === 0) sumTriplen2 += I * I;
  }
  const rms = Math.sqrt(fundamental_A * fundamental_A + sumH2);
  let k = (fundamental_A / rms) ** 2; // h = 1
  for (const [order, I] of byOrder) k += (I / rms) ** 2 * order * order;
  const kRated = K_CLASSES.find((c) => c >= k - 1e-9) ?? K_CLASSES[K_CLASSES.length - 1];
  const tdd = (Math.sqrt(sumH2) / IL) * 100;
  const limit = ieee519TddLimit(iscOverIl);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    thd_pct: r2((Math.sqrt(sumH2) / fundamental_A) * 100),
    tdd_pct: r2(tdd),
    rms_A: r2(rms),
    kFactor: r2(k),
    kRatedTransformer: kRated,
    neutralTriplen_A: r2(3 * Math.sqrt(sumTriplen2)),
    tddLimit_pct: limit,
    tddCompliant: tdd <= limit + 1e-9,
    thirdHarmonic_pct: r2(((byOrder.get(3) ?? 0) / fundamental_A) * 100),
  };
}
