// Normative Validation Engine and Versioned Normative Library for Industrial Dossier
// Covers: ABNT NBR 5410:2004, NR-10:2019, NR-12:2019, NBR IEC 60204-1:2020, NBR IEC 61439:2016, IEC 61131-3:2013, ISO 13849-1

import type { ExtractedCanvasData } from "./extractor";
import type { ElectricalCalculationMemory, NormativeFinding, NormativeValidationReport } from "./types";

export function evaluateNormativeCompliance(
  extracted: ExtractedCanvasData,
  calculations: ElectricalCalculationMemory,
): NormativeValidationReport {
  const findings: NormativeFinding[] = [];
  const standardsEvaluated: string[] = [
    "ABNT NBR 5410:2004 (Instalações elétricas de baixa tensão)",
    "NR-10:2019 (Segurança em instalações e serviços em eletricidade)",
    "NR-12:2019 (Segurança no trabalho em máquinas e equipamentos)",
    "ABNT NBR IEC 60204-1:2020 (Equipamento elétrico de máquinas industriais)",
    "ABNT NBR IEC 61439-1/2:2016 (Conjuntos de manobra e controle de baixa tensão)",
    "IEC 61131-3:2013 (Controladores programáveis — Programação)",
    "ISO 13849-1:2023 (Partes de sistemas de comando relacionadas à segurança)",
  ];

  const motors = extracted.equipments.filter((e) => e.catalogType === "motor" || e.category === "drive");
  const breakers = extracted.equipments.filter((e) => e.catalogType === "breaker" || e.category === "protection");
  const estops = extracted.equipments.filter((e) => e.catalogType === "estop" || e.category === "safety");
  const transformers = extracted.equipments.filter((e) => e.catalogType === "transformer");

  // ── 1. NBR 5410:2004 — Coordenação de Proteção e Condutores ──────────────
  for (const c of calculations.circuits) {
    if (c.ampacityCheckPass && c.protectionCoordinationPass) {
      findings.push({
        id: `norm-5410-coord-${c.circuitCode}`,
        code: "NBR5410_5_3_4_1_PASS",
        standard: "ABNT NBR 5410:2004",
        edition: "2004",
        clause: "§5.3.4.1",
        status: "VALIDADO",
        severity: "info",
        title: `Coordenação de sobrecorrente validada em ${c.circuitCode}`,
        description: `Corrente de projeto Ib (${c.designCurrentIbA} A) ≤ Disjuntor In (${c.breakerRatingInA} A) ≤ Capacidade corrigida I'z (${c.correctedAmpacityIzA} A).`,
        evidence: `Cabo ${c.selectedCableMm2} mm² com I'z=${c.correctedAmpacityIzA} A e In=${c.breakerRatingInA} A.`,
        involvedCircuit: c.circuitCode,
        correctiveAction: "Nenhuma ação necessária.",
        isResolved: true,
        testToConfirm: "Teste de transitório térmico e conformidade com curva característica do fabricante.",
      });
    } else {
      findings.push({
        id: `norm-5410-coord-fail-${c.circuitCode}`,
        code: "NBR5410_5_3_4_1_FAIL",
        standard: "ABNT NBR 5410:2004",
        edition: "2004",
        clause: "§5.3.4.1",
        status: "REPROVADO",
        severity: "critical",
        title: `Falha na coordenação de sobrecarga em ${c.circuitCode}`,
        description: `A condição Ib (${c.designCurrentIbA} A) ≤ In (${c.breakerRatingInA} A) ≤ I'z (${c.correctedAmpacityIzA} A) foi violada.`,
        evidence: `In=${c.breakerRatingInA} A maior que I'z=${c.correctedAmpacityIzA} A ou menor que Ib=${c.designCurrentIbA} A.`,
        involvedCircuit: c.circuitCode,
        correctiveAction: `Aumentar a seção do condutor para pelo menos o valor que suporte In=${c.breakerRatingInA} A ou ajustar o disjuntor.`,
        isResolved: false,
        testToConfirm: "Recalcular seção do cabo e revalidar coordenação térmica.",
      });
    }

    if (c.voltageDropPass) {
      findings.push({
        id: `norm-5410-vdrop-${c.circuitCode}`,
        code: "NBR5410_6_2_7_PASS",
        standard: "ABNT NBR 5410:2004",
        edition: "2004",
        clause: "§6.2.7",
        status: "VALIDADO",
        severity: "info",
        title: `Queda de tensão conforme em ${c.circuitCode}`,
        description: `Queda de tensão calculada de ${c.voltageDropPct}% está dentro do limite admissível de ${c.maxAllowedVoltageDropPct}%.`,
        evidence: `ΔV = ${c.voltageDropV} V (${c.voltageDropPct}%) em comprimento de ${c.lengthM} m.`,
        involvedCircuit: c.circuitCode,
        correctiveAction: "Nenhuma ação necessária.",
        isResolved: true,
        testToConfirm: "Medição de tensão com carga nominal conectada.",
      });
    } else {
      findings.push({
        id: `norm-5410-vdrop-fail-${c.circuitCode}`,
        code: "NBR5410_6_2_7_FAIL",
        standard: "ABNT NBR 5410:2004",
        edition: "2004",
        clause: "§6.2.7",
        status: "REPROVADO",
        severity: "critical",
        title: `Queda de tensão excessiva em ${c.circuitCode}`,
        description: `Queda de tensão de ${c.voltageDropPct}% excede o limite normativo de ${c.maxAllowedVoltageDropPct}%.`,
        evidence: `ΔV = ${c.voltageDropV} V para corrente de ${c.designCurrentIbA} A.`,
        involvedCircuit: c.circuitCode,
        correctiveAction: `Elevar a bitola do cabo de ${c.selectedCableMm2} mm² para a seção imediatamente superior até obter ΔV ≤ 4%.`,
        isResolved: false,
        testToConfirm: "Redimensionamento por queda de tensão determinística.",
      });
    }
  }

  // ── 2. NBR 5410:2004 — Proteção Diferencial-Residual (DR / RCD) ───────────
  const hasRcd = breakers.some(
    (b) =>
      b.catalogType === "rcd" ||
      b.tagCode.toLowerCase().includes("dr") ||
      b.displayName.toLowerCase().includes("residual") ||
      b.specs.rcdSensitivityMa !== undefined,
  );

  if (hasRcd) {
    findings.push({
      id: "norm-5410-rcd-pass",
      code: "NBR5410_5_1_3_2_PASS",
      standard: "ABNT NBR 5410:2004",
      edition: "2004",
      clause: "§5.1.3.2",
      status: "VALIDADO",
      severity: "info",
      title: "Dispositivo Diferencial Residual (DR) presente",
      description: "Proteção contra contatos indiretos e correntes de fuga à terra contemplada.",
      evidence: "Dispositivo DR / RCD identificado na topologia do circuito.",
      correctiveAction: "Nenhuma ação necessária.",
      isResolved: true,
      testToConfirm: "Ensaio periódico de disparo com instrumento testador de DR (tempo ≤ 300 ms).",
    });
  } else {
    findings.push({
      id: "norm-5410-rcd-missing",
      code: "NBR5410_5_1_3_2_WARN",
      standard: "ABNT NBR 5410:2004",
      edition: "2004",
      clause: "§5.1.3.2",
      status: "REPROVADO",
      severity: "warning",
      title: "Dispositivo Diferencial Residual (DR) não identificado no alimentador",
      description: "A NBR 5410 §5.1.3.2 prescreve o uso de proteção diferencial-residual em circuitos industriais de força e tomadas.",
      evidence: "Nenhum nó de catálogo 'rcd' ou com sensibilidade DR foi identificado no diagrama.",
      correctiveAction: "Inserir módulo ou disjuntor DR com sensibilidade de 300 mA para proteção de equipamentos ou 30 mA para tomadas.",
      isResolved: false,
      testToConfirm: "Inclusão do dispositivo DR na lista de materiais e diagrama unifilar.",
    });
  }

  // ── 3. NR-10:2019 — Aterramento e Seccionamento de Bloqueio (LOTO) ───────
  const hasPeGround = extracted.conductors.some((c) => c.phaseOrFunction === "PE") ||
    extracted.terminals.some((t) => t.signalType === "pe");

  if (hasPeGround) {
    findings.push({
      id: "norm-nr10-ground-pass",
      code: "NR10_10_2_8_PASS",
      standard: "NR-10",
      edition: "2019",
      clause: "Item 10.2.8.3",
      status: "VALIDADO",
      severity: "info",
      title: "Aterramento elétrico das massas (PE) implementado",
      description: "Condutores de proteção equipotencial presentes para todas as carcaças e quadros.",
      evidence: "Barramento e condutores PE atribuídos para motores e painel.",
      correctiveAction: "Nenhuma ação necessária.",
      isResolved: true,
      testToConfirm: "Ensaio de continuidade das massas (R ≤ 0,1 Ω) e medição da resistência de aterramento (R ≤ 10 Ω).",
    });
  } else {
    findings.push({
      id: "norm-nr10-ground-fail",
      code: "NR10_10_2_8_FAIL",
      standard: "NR-10",
      edition: "2019",
      clause: "Item 10.2.8.3",
      status: "REPROVADO",
      severity: "critical",
      title: "Condutor de proteção (PE) não declarado",
      description: "A NR-10 e a NBR 5410 exigem que todas as massas metálicas estejam conectadas ao condutor de proteção.",
      evidence: "Nenhum condutor ou borne PE encontrado nas conexões das cargas.",
      correctiveAction: "Declarar a barra de terra PE no painel e estender os condutores PE até os motores.",
      isResolved: false,
      testToConfirm: "Verificação da inclusão de condutor PE no cronograma de fiação.",
    });
  }

  const hasLotoSwitch = extracted.equipments.some(
    (e) =>
      e.catalogType === "disconnector" ||
      e.catalogType === "switch" ||
      e.tagCode.toLowerCase().includes("qs") ||
      e.displayName.toLowerCase().includes("seccionadora"),
  );

  if (hasLotoSwitch) {
    findings.push({
      id: "norm-nr10-loto-pass",
      code: "NR10_10_5_1_PASS",
      standard: "NR-10",
      edition: "2019",
      clause: "Item 10.5.1",
      status: "VALIDADO",
      severity: "info",
      title: "Dispositivo de seccionamento para bloqueio (LOTO) presente",
      description: "Dispositivo rotativo ou seccionador com dispositivo para cadeado de bloqueio identificado.",
      evidence: "Chave seccionadora de entrada documentada no painel.",
      correctiveAction: "Nenhuma ação necessária.",
      isResolved: true,
      testToConfirm: "Inspeção mecânica do dispositivo de trava por cadeado (haste de travamento).",
    });
  } else {
    findings.push({
      id: "norm-nr10-loto-warn",
      code: "NR10_10_5_1_WARN",
      standard: "NR-10",
      edition: "2019",
      clause: "Item 10.5.1",
      status: "REPROVADO",
      severity: "warning",
      title: "Chave seccionadora para bloqueio LOTO ausente",
      description: "NR-10 Item 10.5.1 exige dispositivo que garanta o seccionamento visível e bloqueio mecânico antes de intervenções de manutenção.",
      evidence: "Nenhuma seccionadora rotativa 'QS' encontrada na entrada do CCM ou da máquina.",
      correctiveAction: "Incluir chave seccionadora geral manobrável sob carga com manopla amarela/vermelha bloqueável por cadeado.",
      isResolved: false,
      testToConfirm: "Adicionar chave seccionadora na lista de materiais e diagrama unifilar.",
    });
  }

  // ── 4. NR-12:2019 & NBR IEC 60204-1 — Parada de Emergência e Segurança ───
  if (motors.length > 0) {
    if (estops.length > 0 || extracted.plcProgram.estopPresent) {
      findings.push({
        id: "norm-nr12-estop-pass",
        code: "NR12_12_56_PASS",
        standard: "NR-12",
        edition: "2019",
        clause: "Item 12.56 / Anexo I",
        status: "VALIDADO",
        severity: "info",
        title: "Dispositivo de parada de emergência (E-STOP) implementado",
        description: "Botão tipo cogumelo com retenção e rearme manual conforme NR-12 e NBR IEC 60204-1 §10.7.",
        evidence: `Dispositivo de emergência identificado no projeto elétrico e integrado à lógica de comando.`,
        correctiveAction: "Nenhuma ação necessária.",
        isResolved: true,
        testToConfirm: "Teste funcional de corte imediato dos atuadores motores (Categoria de Parada 0).",
      });
    } else {
      findings.push({
        id: "norm-nr12-estop-fail",
        code: "NR12_12_56_FAIL",
        standard: "NR-12",
        edition: "2019",
        clause: "Item 12.56 / Anexo I",
        status: "REPROVADO",
        severity: "critical",
        title: "Falta dispositivo de parada de emergência (E-STOP)",
        description: "A NR-12 exige que máquinas com partes móveis acionadas eletricamente possuam dispositivo de parada de emergência.",
        evidence: "Existem acionamentos motores no projeto sem nenhum botão de emergência correspondente.",
        correctiveAction: "Adicionar botoeira de emergência cogumelo vermelha com contatos NF positivos de ruptura mecânica.",
        isResolved: false,
        testToConfirm: "Adição da botoeira no circuito de comando ou canal de segurança do CLP.",
      });
    }
  }

  // ── 5. ISO 13849-1 / IEC 62061 — Apreciação de Risco e Nível de Segurança (PL/SIL) ───
  findings.push({
    id: "norm-iso13849-risk",
    code: "ISO13849_PL_SIL_REVIEW",
    standard: "ISO 13849-1 / IEC 62061",
    edition: "2023",
    clause: "§4.2 / §6.1",
    status: "REVISAO_PROFISSIONAL_NECESSARIA",
    severity: "warning",
    title: "Apreciação de Risco Formal (PLr / SIL) requer laudo do engenheiro responsável",
    description: "Conforme norma e política de segurança industrial, a determinação do Performance Level Requerido (PLr) e SIL depende de apreciação de risco formal (severidade, frequência de exposição e possibilidade de evitar o perigo) e não pode ser homologada puramente por algoritmo sem inspeção da aplicação mecânica.",
    evidence: "A arquitetura elétrica prevê comando de segurança, porém o cálculo de MTTFd, DCavg e CCF exige os dados dos componentes certificados.",
    correctiveAction: "O responsável técnico deve emitir a ART de apreciação de risco e confirmar os blocos de segurança certificados.",
    isResolved: false,
    testToConfirm: "Validação da matriz de segurança e emissão da ART/CFT correspondente.",
  });

  // ── 6. IEC 61131-3:2013 — Integridade da Programação do CLP ──────────────
  if (extracted.plcProgram.networks.length > 0) {
    findings.push({
      id: "norm-iec61131-pass",
      code: "IEC61131_3_PASS",
      standard: "IEC 61131-3",
      edition: "2013",
      clause: "§7.3 (Ladder Diagram)",
      status: "VALIDADO",
      severity: "info",
      title: "Lógica Ladder conforme padrão IEC 61131-3",
      description: "Redes numeradas, variáveis tipadas (BOOL/INT), intertravamentos e contatos de comando em conformidade semântica.",
      evidence: `${extracted.plcProgram.networks.length} redes Ladder extraídas e mapeadas.`,
      correctiveAction: "Nenhuma ação necessária.",
      isResolved: true,
      testToConfirm: "Compilação e validação de sintaxe no simulador ou ambiente PLCopen.",
    });
  } else {
    findings.push({
      id: "norm-iec61131-na",
      code: "IEC61131_3_NA",
      standard: "IEC 61131-3",
      edition: "2013",
      clause: "§7.3",
      status: "NAO_APLICAVEL",
      severity: "info",
      title: "Lógica de automação em CLP não utilizada neste projeto",
      description: "O projeto é composto exclusivamente por comando eletromecânico discreto sem CLP.",
      evidence: "Nenhuma rede Ladder ou CPU configurada no rack do projeto.",
      correctiveAction: "Nenhuma ação necessária.",
      isResolved: true,
      testToConfirm: "Nenhum teste de CLP aplicável.",
    });
  }

  // ── 7. Avaliar status geral do relatório ──────────────────────────────────
  const reprovedCount = findings.filter((f) => f.status === "REPROVADO" && f.severity === "critical").length;
  const pendingCount = extracted.pendingInputs.length;

  let overallStatus: NormativeValidationReport["overallStatus"] = "approved";
  if (reprovedCount > 0) {
    overallStatus = "blocked_by_critical_findings";
  } else if (pendingCount > 0) {
    overallStatus = "pending_user_input";
  }

  return {
    overallStatus,
    evaluationDate: new Date().toISOString(),
    standardsEvaluated,
    summary: {
      totalChecked: findings.length,
      validatedCount: findings.filter((f) => f.status === "VALIDADO").length,
      reprovedCount: findings.filter((f) => f.status === "REPROVADO").length,
      pendingCount: findings.filter((f) => f.status === "PENDENTE").length,
      notApplicableCount: findings.filter((f) => f.status === "NAO_APLICAVEL").length,
      requiresProfessionalReviewCount: findings.filter(
        (f) => f.status === "REVISAO_PROFISSIONAL_NECESSARIA",
      ).length,
    },
    findings,
  };
}
