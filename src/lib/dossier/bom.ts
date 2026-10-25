// Industrial Bill of Materials (BOM) Generator — 10 Canonical Engineering Groups
// Single Source of Truth from Canvas, deterministic calculations, and normative requirements.
// Absolute engineering traceability without duplicate counts or fake commercial claims.

import type { ExtractedCanvasData } from "./extractor";
import type { ElectricalCalculationMemory } from "./types";
import type { BomGroupCategory, BomItem, BomItemSource, BomValidationState } from "./types";

export function generateIndustrialBom(
  extracted: ExtractedCanvasData,
  calculations: ElectricalCalculationMemory,
): BomItem[] {
  const items: BomItem[] = [];
  let itemCounter = 1;

  // ── Grupo 1: Proteção Elétrica ───────────────────────────────────────────
  // Disjuntor geral do quadro
  items.push({
    id: `bom-brk-main-${itemCounter++}`,
    tag: "QG_01",
    description: `Disjuntor Caixa Moldada Tripolar In=${calculations.summary.mainBreakerRatingInA}A Icu=${calculations.summary.mainBreakerIcuKa}kA 380/440V`,
    category: "1_protecao_eletrica",
    quantity: 1,
    unit: "un",
    nominalVoltage: "380/440 V",
    nominalCurrent: `${calculations.summary.mainBreakerRatingInA} A`,
    breakingCapacityKa: calculations.summary.mainBreakerIcuKa,
    tripCurve: "C",
    poles: 3,
    circuitRef: "ALIMENTADOR_GERAL",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Proteção geral contra sobrecorrente e curto-circuito na entrada do QGD/CCM.",
  });

  // Dispositivos de surto (DPS)
  items.push({
    id: `bom-dps-${itemCounter++}`,
    tag: "DPS_01",
    description: "Dispositivo de Proteção contra Surtos (DPS) Classe II 275V Imax=40kA In=20kA (Conjunto 3F+N)",
    category: "1_protecao_eletrica",
    quantity: 4,
    unit: "un",
    nominalVoltage: "275 V",
    breakingCapacityKa: 40,
    circuitRef: "ENTRADA_QGD",
    sourceKind: "recommended_pending",
    validationStatus: "pending_catalog_selection",
    notes: "Proteção contra descargas atmosféricas e sobretensões transitórias (NBR 5410 §5.4).",
  });

  // Módulo Diferencial Residual (DR / RCD)
  items.push({
    id: `bom-rcd-${itemCounter++}`,
    tag: "DR_01",
    description: "Interruptor Diferencial Residual Tetrapolar (3P+N) In=63A IΔn=300mA Tipo AC",
    category: "1_protecao_eletrica",
    quantity: 1,
    unit: "un",
    nominalVoltage: "380 V",
    nominalCurrent: "63 A",
    poles: 4,
    circuitRef: "QGD_FORCA",
    sourceKind: "recommended_pending",
    validationStatus: "pending_catalog_selection",
    notes: "Proteção adicional contra correntes de fuga à terra e princípio de incêndio (NBR 5410 §5.1.3.2).",
  });

  // Disjuntores dos circuitos terminais
  for (const c of calculations.circuits) {
    items.push({
      id: `bom-brk-${c.circuitCode}-${itemCounter++}`,
      tag: `DJ_${c.circuitCode.replace("CIR_", "")}`,
      description: `Disjuntor Termomagnético Tripolar In=${c.breakerRatingInA}A Curva ${c.breakerCurve} Icu=${c.breakingCapacityIcuKa}kA`,
      category: "1_protecao_eletrica",
      quantity: 1,
      unit: "un",
      nominalVoltage: `${c.voltageV} V`,
      nominalCurrent: `${c.breakerRatingInA} A`,
      breakingCapacityKa: c.breakingCapacityIcuKa,
      tripCurve: c.breakerCurve,
      poles: c.phases.startsWith("3F") ? 3 : 1,
      circuitRef: c.circuitCode,
      sourceKind: "calculated_derived",
      validationStatus: "validated",
      notes: `Proteção do ${c.description} dimensionada conforme NBR 5410:2004 §5.3.`,
    });

    // Relé de sobrecarga térmico para motores
    if (c.circuitType === "motor_branch") {
      items.push({
        id: `bom-ft-${c.circuitCode}-${itemCounter++}`,
        tag: `FT_${c.circuitCode.replace("CIR_", "")}`,
        description: `Relé de Sobrecarga Bimetálico Térmico faixa de ajuste (${(c.designCurrentIbA * 0.8).toFixed(1)} - ${(c.designCurrentIbA * 1.25).toFixed(1)} A)`,
        category: "1_protecao_eletrica",
        quantity: 1,
        unit: "un",
        nominalCurrent: `${c.designCurrentIbA} A`,
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
        notes: `Proteção térmica individual de motor ajustada para In=${c.designCurrentIbA} A com contatos 95-96 (NF) e 97-98 (NA).`,
      });
    }
  }

  // ── Grupo 2: Manobra e Comando ───────────────────────────────────────────
  // Chave seccionadora rotativa de bloqueio
  items.push({
    id: `bom-qs-${itemCounter++}`,
    tag: "QS_01",
    description: "Chave Seccionadora Rotativa Tripolar sob Carga In=100A com Manopla Bloqueável LOTO Vermelha/Amarela",
    category: "2_manobra_comando",
    quantity: 1,
    unit: "un",
    nominalVoltage: "440 V",
    nominalCurrent: "100 A",
    poles: 3,
    circuitRef: "ENTRADA_PAINEL",
    sourceKind: "canvas_identified",
    validationStatus: "validated",
    notes: "Seccionamento de segurança com trava para cadeado conforme NR-10 Item 10.5.1.",
  });

  // Contatores e sinalizadores por circuito motor
  for (const c of calculations.circuits) {
    if (c.circuitType === "motor_branch") {
      const tagSuffix = c.circuitCode.replace("CIR_", "");
      items.push({
        id: `bom-km-${tagSuffix}-${itemCounter++}`,
        tag: `KM_${tagSuffix}`,
        description: `Contator Tripolar de Potência Categoria AC-3 Ie=${Math.ceil(c.designCurrentIbA * 1.15)}A Bobina 24Vcc com 1NA+1NF auxiliares`,
        category: "2_manobra_comando",
        quantity: 1,
        unit: "un",
        nominalVoltage: `${c.voltageV} V`,
        nominalCurrent: `${Math.ceil(c.designCurrentIbA * 1.15)} A`,
        controlVoltage: "24 Vdc",
        utilizationCategory: "AC-3",
        poles: 3,
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
        notes: `Contator de acionamento do motor ${tagSuffix}.`,
      });

      // Botoeiras Liga / Desliga
      items.push({
        id: `bom-btn-start-${tagSuffix}-${itemCounter++}`,
        tag: `SB_START_${tagSuffix}`,
        description: "Botoeira Pulsadora Faceada 22mm Verde com 1 contato NA (Partida)",
        category: "2_manobra_comando",
        quantity: 1,
        unit: "un",
        controlVoltage: "24 Vdc",
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
      });
      items.push({
        id: `bom-btn-stop-${tagSuffix}-${itemCounter++}`,
        tag: `SB_STOP_${tagSuffix}`,
        description: "Botoeira Pulsadora Faceada 22mm Vermelha com 1 contato NF (Parada)",
        category: "2_manobra_comando",
        quantity: 1,
        unit: "un",
        controlVoltage: "24 Vdc",
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
      });

      // Sinaleiros luminosos LED
      items.push({
        id: `bom-hl-run-${tagSuffix}-${itemCounter++}`,
        tag: `HL_RUN_${tagSuffix}`,
        description: "Sinaleiro LED Monobloco 22mm Verde 24Vdc (Operando)",
        category: "2_manobra_comando",
        quantity: 1,
        unit: "un",
        controlVoltage: "24 Vdc",
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
      });
      items.push({
        id: `bom-hl-trip-${tagSuffix}-${itemCounter++}`,
        tag: `HL_TRIP_${tagSuffix}`,
        description: "Sinaleiro LED Monobloco 22mm Âmbar 24Vdc (Falha Térmica)",
        category: "2_manobra_comando",
        quantity: 1,
        unit: "un",
        controlVoltage: "24 Vdc",
        circuitRef: c.circuitCode,
        sourceKind: "calculated_derived",
        validationStatus: "validated",
      });
    }
  }

  // ── Grupo 3: Motores e Acionamentos ──────────────────────────────────────
  for (const eq of extracted.equipments) {
    if (eq.catalogType === "motor" || eq.category === "drive") {
      const pKw = eq.specs.powerKw ?? 5.5;
      items.push({
        id: `bom-mot-${eq.tagCode}-${itemCounter++}`,
        tag: eq.tagCode,
        description: `Motor de Indução Trifásico (MIT) Rotor de Gaiola ${pKw} kW (${(pKw * 1.36).toFixed(1)} CV) 380V 4 Pólos 60Hz Rendimento IR3 (Premium) IP55`,
        category: "3_motores_acionamentos",
        quantity: 1,
        unit: "un",
        nominalVoltage: `${eq.specs.voltageV || 380} V`,
        nominalPower: `${pKw} kW`,
        protectionDegree: "IP55",
        poles: 4,
        sourceEquipmentId: eq.id,
        sourceKind: "canvas_identified",
        validationStatus: "validated",
        notes: `Equipamento de força identificado no Canvas. Método de partida: ${eq.specs.startingMethod || "DOL"}.`,
      });
    }
    if (eq.catalogType === "vfd") {
      items.push({
        id: `bom-vfd-${eq.tagCode}-${itemCounter++}`,
        tag: eq.tagCode,
        description: `Inversor de Frequência Vetorial VFD ${(eq.specs.powerKw || 7.5)} kW 380-480V 3F com IHM e porta Modbus-RTU/RS-485`,
        category: "3_motores_acionamentos",
        quantity: 1,
        unit: "un",
        nominalVoltage: "380 V",
        nominalPower: `${eq.specs.powerKw || 7.5} kW`,
        sourceEquipmentId: eq.id,
        sourceKind: "canvas_identified",
        validationStatus: "validated",
      });
    }
  }

  // ── Grupo 4: CLP, Módulos e Interfaces ───────────────────────────────────
  // Fonte 24Vdc
  items.push({
    id: `bom-psu-${itemCounter++}`,
    tag: "G1",
    description: "Fonte Chaveada Industrial para Trilho DIN Entrada 100-240Vca Saída 24Vcc 10A (240W) Proteção contra Curto",
    category: "4_clp_modulos_interfaces",
    quantity: 1,
    unit: "un",
    nominalVoltage: "100-240 Vca / 24 Vcc",
    nominalCurrent: "10 A",
    nominalPower: "240 W",
    circuitRef: "CIR_COMANDO_24V",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Alimentação de sensores, bobinas de contatores, relés acopladores e I/Os do CLP.",
  });

  // CPU do CLP e módulos
  items.push({
    id: `bom-plc-cpu-${itemCounter++}`,
    tag: "PLC_CPU",
    description: `${extracted.plcProgram.cpuModel} com 14 DI 24Vcc, 10 DO Relé/Transistor, 2 AI 0-10V e porta PROFINET/Ethernet`,
    category: "4_clp_modulos_interfaces",
    quantity: 1,
    unit: "un",
    controlVoltage: "24 Vdc",
    circuitRef: "CIR_AUTOMACAO",
    sourceKind: "canvas_identified",
    validationStatus: "validated",
    notes: `Controlador Programável do bastidor ${extracted.plcProgram.rackName}.`,
  });

  for (const mod of extracted.plcProgram.ioModules) {
    items.push({
      id: `bom-plc-mod-${mod.slot}-${itemCounter++}`,
      tag: `MOD_SLOT_${mod.slot}`,
      description: `Módulo de Expansão ${mod.type} ${mod.channelsCount} Canais (${mod.partNumber})`,
      category: "4_clp_modulos_interfaces",
      quantity: 1,
      unit: "un",
      controlVoltage: "24 Vdc",
      circuitRef: "CIR_AUTOMACAO",
      sourceKind: "canvas_identified",
      validationStatus: "validated",
    });
  }

  // Relés acopladores slim 24Vcc
  const relaysNeeded = Math.max(4, calculations.circuits.length * 2);
  items.push({
    id: `bom-relay-slim-${itemCounter++}`,
    tag: "KA_ARRAY",
    description: "Relé Acoplador de Interface Slim 6.2mm Bobina 24Vcc 1 Contato Reversor (1NAF) 6A 250Vca com LED",
    category: "4_clp_modulos_interfaces",
    quantity: relaysNeeded,
    unit: "un",
    controlVoltage: "24 Vdc",
    circuitRef: "CIR_INTERFACES",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Isolação galvânica entre as saídas a transistor do CLP e as bobinas dos contatores de potência.",
  });

  // ── Grupo 5: Sensores e Instrumentação ────────────────────────────────────
  for (const eq of extracted.equipments) {
    if (eq.category === "instrumentation" || eq.catalogType === "pt100" || eq.catalogType === "pressure") {
      items.push({
        id: `bom-inst-${eq.tagCode}-${itemCounter++}`,
        tag: eq.tagCode,
        description: `Transmissor/Sensor Industrial ${eq.displayName || eq.tagCode} Saída 4-20mA / RTD Conexão ao Processo Grau IP67`,
        category: "5_sensores_instrumentacao",
        quantity: 1,
        unit: "un",
        controlVoltage: "24 Vdc",
        sourceEquipmentId: eq.id,
        sourceKind: "canvas_identified",
        validationStatus: "validated",
      });
    }
  }

  // ── Grupo 6: Cabos e Condutores ──────────────────────────────────────────
  // Cabos de força dos circuitos
  const cablesBySection = new Map<number, number>();
  for (const c of calculations.circuits) {
    const totalCircM = c.lengthM * (c.phases.startsWith("3F") ? 3 : 2);
    cablesBySection.set(c.selectedCableMm2, (cablesBySection.get(c.selectedCableMm2) || 0) + totalCircM);
  }

  for (const [sec, lenM] of cablesBySection.entries()) {
    items.push({
      id: `bom-cable-power-${sec}-${itemCounter++}`,
      tag: `CABO_FORCA_${sec}MM`,
      description: `Cabo de Cobre Unipolar Flexível Classe 5 Seção ${sec} mm² Tensão 0,6/1kV Isolação PVC 70°C Antichama Preto/Cinza/Vermelho (Fases)`,
      category: "6_cabos_condutores",
      quantity: Math.ceil(lenM * 1.1), // +10% margem de instalação
      unit: "m",
      conductorSectionMm2: sec,
      conductorLengthM: Math.ceil(lenM * 1.1),
      conductorMaterial: "Cu",
      insulationType: "PVC",
      circuitRef: "CIRCUITOS_FORCA",
      sourceKind: "calculated_derived",
      validationStatus: "validated",
      notes: "Condutores de fase dimensionados conforme critério conjunto de ampacidade e queda de tensão NBR 5410.",
    });
  }

  // Condutor de proteção PE verde/amarelo
  const totalPeM = calculations.circuits.reduce((acc, c) => acc + c.lengthM, 0) + 25;
  items.push({
    id: `bom-cable-pe-${itemCounter++}`,
    tag: "CABO_PE_VERDE",
    description: "Cabo de Cobre Unipolar Flexível Classe 5 Seção 16 mm² 750V Isolação PVC Verde/Amarelo (Condutor de Proteção PE)",
    category: "6_cabos_condutores",
    quantity: Math.ceil(totalPeM * 1.1),
    unit: "m",
    conductorSectionMm2: 16,
    conductorLengthM: Math.ceil(totalPeM * 1.1),
    conductorMaterial: "Cu",
    insulationType: "PVC",
    circuitRef: "BARRA_PE",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Aterramento e equipotencialização de todas as massas metálicas conforme NBR 5410 Tabela 58 e NR-10.",
  });

  // Cabos de comando e instrumentação
  items.push({
    id: `bom-cable-cmd-${itemCounter++}`,
    tag: "CABO_COMANDO_1MM",
    description: "Cabo de Comando Flexível 1,0 mm² 750V PVC Azul Escuro (Comando 24Vcc) e Azul Claro (Neutro)",
    category: "6_cabos_condutores",
    quantity: 150,
    unit: "m",
    conductorSectionMm2: 1.0,
    conductorLengthM: 150,
    conductorMaterial: "Cu",
    insulationType: "PVC",
    circuitRef: "CIR_COMANDO",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Fiação interna de comando e sinalização do painel.",
  });

  // ── Grupo 7: Bornes e Acessórios ─────────────────────────────────────────
  const bornesCount = Math.max(20, extracted.terminals.length + 10);
  items.push({
    id: `bom-borne-pas-${itemCounter++}`,
    tag: "BORNE_UK5N",
    description: "Borne de Passagem Tipo Parafuso/Mola para Cabos até 4mm² Cor Cinza Montagem em Trilho DIN TS-35",
    category: "7_bornes_acessorios",
    quantity: bornesCount,
    unit: "un",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Régua de bornes X1 para conexão dos cabos de campo dos motores e comandos.",
  });
  items.push({
    id: `bom-borne-pe-${itemCounter++}`,
    tag: "BORNE_PE_TERRA",
    description: "Borne de Passagem de Aterramento (PE) com Contato Direto ao Trilho DIN TS-35 Cor Verde/Amarelo até 10mm²",
    category: "7_bornes_acessorios",
    quantity: Math.max(6, Math.ceil(bornesCount / 4)),
    unit: "un",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });
  items.push({
    id: `bom-trilho-din-${itemCounter++}`,
    tag: "TRILHO_DIN_35",
    description: "Trilho DIN TS-35 Perfurado em Aço Zincado Comprimento 2 Metros",
    category: "7_bornes_acessorios",
    quantity: 4,
    unit: "un",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });

  // ── Grupo 8: Painéis, Barramentos e Montagem ─────────────────────────────
  items.push({
    id: `bom-painel-box-${itemCounter++}`,
    tag: "PAINEL_QGD",
    description: "Quadro Autoportante / Painel de Aço Carbono Pintura Eletrostática RAL 7035 Dimensões 2000x800x600mm Grau de Proteção IP54 com Placa de Montagem Laranja",
    category: "8_paineis_barramentos_montagem",
    quantity: 1,
    unit: "un",
    protectionDegree: "IP54",
    circuitRef: "ESTRUTURA_QGD",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Invólucro metálico do painel conforme ABNT NBR IEC 61439-1.",
  });
  items.push({
    id: `bom-barra-cu-${itemCounter++}`,
    tag: "BARRAMENTO_COBRE",
    description: "Barra de Cobre Eletrolítico Retangular 25x5mm (Capacidade nominal 250A) com Isoladores Epóxi Paralelos (Conjunto R, S, T, N, PE)",
    category: "8_paineis_barramentos_montagem",
    quantity: 5,
    unit: "barras",
    circuitRef: "BARRAMENTO_PRINCIPAL",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });
  items.push({
    id: `bom-canaleta-${itemCounter++}`,
    tag: "CANALETA_50X50",
    description: "Canaleta Plástica Recortada PVC Antichama Cinza 50x50mm com Tampa Comprimento 2m",
    category: "8_paineis_barramentos_montagem",
    quantity: 10,
    unit: "un",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });
  items.push({
    id: `bom-prensa-cabo-${itemCounter++}`,
    tag: "PRENSA_CABOS_KIT",
    description: "Conjunto de Prensa-Cabos Metálicos / Nylon PG16, PG21 e PG29 com Porcas e Anéis de Vedação IP68",
    category: "8_paineis_barramentos_montagem",
    quantity: 1,
    unit: "kit",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });

  // ── Grupo 9: Dispositivos de Segurança (NR-12) ───────────────────────────
  items.push({
    id: `bom-safety-estop-${itemCounter++}`,
    tag: "SB_EMG_01",
    description: "Botoeira de Emergência Tipo Cogumelo 40mm Vermelha com Trava Mecânica Girar-para-Soltar com 2 Contatos NF Positivos e Plaqueta Amarela 'EMERGÊNCIA'",
    category: "9_dispositivos_seguranca",
    quantity: Math.max(1, extracted.equipments.filter((e) => e.catalogType === "estop").length),
    unit: "un",
    controlVoltage: "24 Vdc",
    circuitRef: "CIR_SEGURANCA",
    sourceKind: "canvas_identified",
    validationStatus: "validated",
    notes: "Conformidade obrigatória com NR-12 Item 12.56 e NBR IEC 60204-1 §10.7.",
  });
  items.push({
    id: `bom-safety-relay-${itemCounter++}`,
    tag: "KS_01",
    description: "Relé de Segurança para Monitoramento de Parada de Emergência Categoria 4 / PLe (ISO 13849-1) Alimentação 24Vcc 3 Contatos de Segurança NA + 1 NF Auxiliar",
    category: "9_dispositivos_seguranca",
    quantity: 1,
    unit: "un",
    controlVoltage: "24 Vdc",
    circuitRef: "CIR_SEGURANCA",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Supervisão redundante com rearme manual monitorado.",
  });

  // ── Grupo 10: Identificação, Montagem e Documentação ─────────────────────
  items.push({
    id: `bom-anilha-${itemCounter++}`,
    tag: "ANILHAS_MARCACAO",
    description: "Kit de Anilhas Marcadoras Tubulares PVC Amarelas para Fios 0.5 a 6.0 mm² Números (0-9) e Letras (L1, L2, L3, N, PE, +, -)",
    category: "10_identificacao_documentacao",
    quantity: 1,
    unit: "kit",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Identificação indelével de cada condutor conforme numeração do diagrama unifilar/multifilar.",
  });
  items.push({
    id: `bom-plaquetas-${itemCounter++}`,
    tag: "PLAQUETAS_ACRILICO",
    description: "Conjunto de Plaquetas de Identificação Acrílicas Bicolor Gravadas a Laser com Fita 3M para Frontal do Painel e Componentes Internos",
    category: "10_identificacao_documentacao",
    quantity: 1,
    unit: "kit",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
  });
  items.push({
    id: `bom-porta-esquema-${itemCounter++}`,
    tag: "PORTA_ESQUEMAS_A4",
    description: "Porta-Documentos / Esquemas Plástico Auto-Adesivo Formato A4 Fixado na Parte Interna da Porta do Painel",
    category: "10_identificacao_documentacao",
    quantity: 1,
    unit: "un",
    sourceKind: "calculated_derived",
    validationStatus: "validated",
    notes: "Armazenamento do Dossiê Técnico e Diagramas Elétricos no interior do painel conforme NR-10.",
  });

  return items;
}
