// Deterministic Generator for the 28,000+ line Industrial Project Fixture
// Produces a realistic, norm-compliant industrial facility with Substations, CCMs, Feeders, PLC I/O, and Ladder Rungs.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
  type BundleEdge,
  type BundleLadderRung,
  type BundleNode,
  type BundleTag,
  type EletricAiCanvasBundle,
} from "../../lib/importer/types";

export function generate28kIndustrialBundle(): EletricAiCanvasBundle {
  const nodes: BundleNode[] = [];
  const edges: BundleEdge[] = [];
  const tags: BundleTag[] = [];
  const rungs: BundleLadderRung[] = [];

  // 1. Subestação Principal e Entrada de Energia
  nodes.push({
    id: "SUBESTACAO-13KV",
    type: "transformer",
    label: "Transformador MT/BT 13.8kV/380V - 1000kVA",
    position: { x: 500, y: 50 },
    rotation: 0,
    properties: {
      tag: "TR-01",
      power_kVA: 1000,
      primary_kV: 13.8,
      secondary_V: 380,
      impedance_percent: 5.5,
      cooling: "ONAN",
      protection: "Buchholz + Termômetro",
    },
  });

  nodes.push({
    id: "DJ-GERAL-QGBT",
    type: "breaker",
    label: "Disjuntor Aberto Geral BT 1600A",
    position: { x: 500, y: 180 },
    properties: {
      tag: "QG-01",
      In: 1600,
      Icu_kA: 65,
      poles: 3,
      tripUnit: "Eletrônica Micrologic 5.0",
      standard: "IEC 60947-2",
    },
  });

  edges.push({
    id: "edge-tr01-qg01",
    source: "SUBESTACAO-13KV",
    target: "DJ-GERAL-QGBT",
    kind: "power",
    circuitConfig: "3F+N+PE",
  });

  nodes.push({
    id: "BARRA-GERAL-QGBT",
    type: "busbar",
    label: "Barramento Geral de Cobre 2000A",
    position: { x: 500, y: 300 },
    properties: {
      tag: "BARRA-BT-01",
      voltage_V: 380,
      In_A: 2000,
      Icw_kA: 65,
      material: "Cobre Eletrolítico",
    },
  });

  edges.push({
    id: "edge-qg01-barragbt",
    source: "DJ-GERAL-QGBT",
    target: "BARRA-GERAL-QGBT",
    kind: "power",
    circuitConfig: "3F+N+PE",
  });

  // 2. 6 Painéis / CCMs Setoriais (Centros de Controle de Motores)
  const ccmNames = [
    { id: "CCM-01-UTILIDADES", name: "CCM 01 - Utilidades & Água", feedersCount: 45 },
    { id: "CCM-02-MOAGEM", name: "CCM 02 - Moagem & Trituração", feedersCount: 50 },
    { id: "CCM-03-MISTURA", name: "CCM 03 - Mistura & Reatores", feedersCount: 45 },
    { id: "CCM-04-TRANSPORTE", name: "CCM 04 - Correias & Elevadores", feedersCount: 50 },
    { id: "CCM-05-ENVASE", name: "CCM 05 - Envase & Embalagem", feedersCount: 40 },
    { id: "CCM-06-HVAC", name: "CCM 06 - Ventilação & Chillers", feedersCount: 35 },
  ];

  let motorIndex = 1;

  for (let c = 0; c < ccmNames.length; c++) {
    const ccm = ccmNames[c];
    const ccmX = 150 + c * 350;

    // Disjuntor de Alimentação do CCM
    const djCcmId = `DJ-ENTRADA-${ccm.id}`;
    nodes.push({
      id: djCcmId,
      type: "breaker",
      label: `Disjuntor Caixa Moldada 400A - ${ccm.name}`,
      position: { x: ccmX, y: 450 },
      properties: {
        tag: `Q-${ccm.id}`,
        In: 400,
        poles: 3,
        Icu_kA: 36,
        curve: "C",
      },
    });

    edges.push({
      id: `edge-barragbt-${djCcmId}`,
      source: "BARRA-GERAL-QGBT",
      target: djCcmId,
      kind: "power",
      circuitConfig: "3F+N+PE",
    });

    // Barramento do CCM
    const barraCcmId = `BARRA-${ccm.id}`;
    nodes.push({
      id: barraCcmId,
      type: "busbar",
      label: `Barramento 630A ${ccm.name}`,
      position: { x: ccmX, y: 580 },
      properties: {
        tag: `BARRA-${ccm.id}`,
        voltage_V: 380,
        In_A: 630,
      },
    });

    edges.push({
      id: `edge-${djCcmId}-${barraCcmId}`,
      source: djCcmId,
      target: barraCcmId,
      kind: "power",
      circuitConfig: "3F+N+PE",
    });

    // Alimentadores individuais de motores para este CCM
    for (let f = 1; f <= ccm.feedersCount; f++) {
      const mNum = motorIndex++;
      const tagPrefix = `M${String(mNum).padStart(3, "0")}`;
      const kw = (mNum % 7 === 0) ? 45 : (mNum % 5 === 0) ? 30 : (mNum % 3 === 0) ? 15 : (mNum % 2 === 0) ? 7.5 : 3.7;
      const inA = parseFloat((kw * 1.9).toFixed(1));
      const djIn = Math.ceil(inA * 1.25);
      const isVfd = (mNum % 4 === 0);
      const isSoftStarter = (mNum % 6 === 0);

      const fX = ccmX + (f % 5 - 2) * 50;
      const fY = 700 + f * 90;

      // Disjuntor-Motor do alimentador
      const djId = `DJ-${tagPrefix}`;
      nodes.push({
        id: djId,
        type: "breaker",
        label: `Disjuntor-Motor ${djIn}A (${tagPrefix})`,
        position: { x: fX, y: fY },
        properties: {
          tag: `QM_${tagPrefix}`,
          In: djIn,
          poles: 3,
          curve: "D",
          thermalRange: `${(inA * 0.9).toFixed(1)}-${(inA * 1.15).toFixed(1)}A`,
        },
      });

      edges.push({
        id: `edge-${barraCcmId}-${djId}`,
        source: barraCcmId,
        target: djId,
        kind: "power",
        circuitConfig: "3F+PE",
      });

      // Manobra: Inversor de Frequência, Softstarter ou Contator
      let starterId = `KM-${tagPrefix}`;
      let starterType = "contactor";
      let starterLabel = `Contator 3P ${Math.ceil(inA * 1.2)}A (${tagPrefix})`;

      if (isVfd) {
        starterId = `INV-${tagPrefix}`;
        starterType = "vfd";
        starterLabel = `Inversor de Frequência ${kw}kW (${tagPrefix})`;
      } else if (isSoftStarter) {
        starterId = `SS-${tagPrefix}`;
        starterType = "softstarter";
        starterLabel = `Soft-Starter ${kw}kW (${tagPrefix})`;
      }

      nodes.push({
        id: starterId,
        type: starterType,
        label: starterLabel,
        position: { x: fX, y: fY + 60 },
        properties: {
          tag: starterId,
          power_kW: kw,
          voltage_V: 380,
          controlVoltage_V: 24,
        },
      });

      edges.push({
        id: `edge-${djId}-${starterId}`,
        source: djId,
        target: starterId,
        kind: "power",
        circuitConfig: "3F+PE",
      });

      // Motor de indução trifásico
      const motorId = `MOTOR-${tagPrefix}`;
      nodes.push({
        id: motorId,
        type: "motor",
        label: `Motor ${kw}kW 380V (${tagPrefix})`,
        position: { x: fX, y: fY + 120 },
        properties: {
          tag: tagPrefix,
          power_kW: kw,
          voltage_V: 380,
          in_A: inA,
          poles: 4,
          rpm: 1750,
          powerFactor: 0.86,
          efficiency: 0.92,
          serviceFactor: 1.15,
        },
      });

      edges.push({
        id: `edge-${starterId}-${motorId}`,
        source: starterId,
        target: motorId,
        kind: "power",
        circuitConfig: "3F+PE",
      });

      // Instrumentação e Sensores para cada motor
      const pt100Id = `PT100-${tagPrefix}`;
      nodes.push({
        id: pt100Id,
        type: "pt100",
        label: `Sensor Temp Mancal ${tagPrefix}`,
        position: { x: fX + 40, y: fY + 120 },
        properties: {
          tag: `TI_${tagPrefix}`,
          type: "Pt100 3 Fios",
          range: "0-150°C",
        },
      });

      edges.push({
        id: `edge-${motorId}-${pt100Id}`,
        source: motorId,
        target: pt100Id,
        kind: "signal",
      });

      // Tags de automação e I/O
      const byteOffset = Math.floor((mNum - 1) / 8);
      const bitOffset = (mNum - 1) % 8;

      tags.push({
        name: `CMD_START_${tagPrefix}`,
        type: "BOOL",
        address: `%QX${byteOffset}.${bitOffset}`,
        initialValue: false,
        description: `Comando Liga Motor ${tagPrefix}`,
      });

      tags.push({
        name: `STS_RUN_${tagPrefix}`,
        type: "BOOL",
        address: `%IX${byteOffset}.${bitOffset}`,
        initialValue: false,
        description: `Feedback Funcionamento Motor ${tagPrefix}`,
      });

      tags.push({
        name: `ALM_FAULT_${tagPrefix}`,
        type: "BOOL",
        address: `%IX${byteOffset + 50}.${bitOffset}`,
        initialValue: false,
        description: `Alarme de Falha Disjuntor ${tagPrefix}`,
      });

      tags.push({
        name: `TEMP_VAL_${tagPrefix}`,
        type: "REAL",
        address: `%IW${100 + mNum * 2}`,
        initialValue: 45.0,
        description: `Temperatura (°C) Motor ${tagPrefix}`,
      });

      // Rung de controle Ladder para cada motor
      rungs.push({
        id: `RUNG_${String(mNum).padStart(4, "0")}`,
        comment: `Controle de Intertravamento Motor ${tagPrefix} (${kw}kW)`,
        output: {
          kind: "OTE",
          operand: `CMD_START_${tagPrefix}`,
        },
        branches: [
          [
            { kind: "XIC", operand: `CMD_START_${tagPrefix}_PB` },
            { kind: "XIO", operand: `CMD_STOP_${tagPrefix}_PB` },
            { kind: "XIO", operand: `ALM_FAULT_${tagPrefix}` },
            { kind: "XIO", operand: "ESTOP_GERAL" },
          ],
          [
            { kind: "XIC", operand: `STS_RUN_${tagPrefix}` },
            { kind: "XIO", operand: `CMD_STOP_${tagPrefix}_PB` },
            { kind: "XIO", operand: `ALM_FAULT_${tagPrefix}` },
            { kind: "XIO", operand: "ESTOP_GERAL" },
          ],
        ],
      });
    }
  }

  // PLC Rack de alta capacidade
  const plcConfig = {
    vendor: "Siemens S7-1500 / Rockwell ControlLogix Compatible",
    rackName: "RACK-CENTRAL-01",
    cpuModel: "CPU 1518F-4 PN/DP",
    modules: [
      { slot: 0, type: "DI" as const, channelsCount: 32, label: "Entradas Digitais Remotas - DI 32x24VDC" },
      { slot: 1, type: "DI" as const, channelsCount: 32, label: "Entradas Digitais Remotas - DI 32x24VDC" },
      { slot: 2, type: "DO" as const, channelsCount: 32, label: "Saídas Digitais Remotas - DO 32x24VDC" },
      { slot: 3, type: "DO" as const, channelsCount: 32, label: "Saídas Digitais Remotas - DO 32x24VDC" },
      { slot: 4, type: "AI" as const, channelsCount: 16, label: "Entradas Analógicas - AI 16xRTD/Pt100" },
      { slot: 5, type: "AO" as const, channelsCount: 8, label: "Saídas Analógicas - AO 8x4-20mA" },
    ],
  };

  return {
    format: CANVAS_BUNDLE_FORMAT,
    schemaVersion: CURRENT_BUNDLE_VERSION,
    project: {
      name: "Planta Industrial Integrada - 28k Linhas Benchmark",
      diagramType: "hybrid",
      standards: ["NBR_5410", "NBR_14039", "NR-10", "NR-12", "IEC_60947", "IEC_61131_3"],
      systemVoltageV: 380,
      frequencyHz: 60,
      units: "metric",
      description:
        "Projeto de referência de larga escala com subestação 13.8kV/380V, 6 CCMs, 265 alimentadores motorizados, sensores de temperatura, 1060 tags de automação e 265 rungs de controle ladder.",
    },
    nodes,
    edges,
    ladder: {
      rungs,
    },
    plc: plcConfig,
    tags,
    metadata: {
      author: "ElétricAi Industrial Benchmark Engine",
      generator: "eletricai.scale-generator",
      generatedAt: new Date().toISOString(),
      notes: "Suíte de verificação de escala industrial (>= 28.000 linhas) sem truncamento silencioso.",
    },
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain || process.argv.includes("--run")) {
  const bundle = generate28kIndustrialBundle();
  const jsonStr = JSON.stringify(bundle, null, 2);
  const outPath = path.resolve(__dirname, "benchmark-project-28k.json");
  fs.writeFileSync(outPath, jsonStr, "utf-8");
  const lines = jsonStr.split(/\r?\n/).length;
  const sizeMb = (Buffer.byteLength(jsonStr, "utf-8") / (1024 * 1024)).toFixed(2);
  console.log(`[OK] Gerado arquivo de referência 28k:`);
  console.log(`  Arquivo: ${outPath}`);
  console.log(`  Linhas: ${lines.toLocaleString()}`);
  console.log(`  Tamanho: ${sizeMb} MB`);
  console.log(`  Nós: ${bundle.nodes.length}`);
  console.log(`  Edges: ${bundle.edges.length}`);
  console.log(`  Ladder Rungs: ${bundle.ladder?.rungs.length}`);
  console.log(`  Tags: ${bundle.tags?.length}`);
}
