// Planta de DEMONSTRAÇÃO para o CCM supervisório — documento unifilar real.
//
// Não é fixture acoplada à inicialização (AGENTS.md §11.1 item 3): só é
// carregada por ação explícita do usuário ("Carregar planta de demonstração")
// e usa ID isolado. Ao ser carregada vira um unifilar comum: o multifilar,
// o CCM, a ponte Unifilar→Ladder e o BOM derivam dela como de qualquer projeto.
//
// Linha de processo de referência: separação de metais / digestor contínuo
// (misturadores MG, roscas RT, bomba MB, soprador BL, válvula rotativa TR).
import {
  DIAGRAM_DOC_VERSION,
  DiagramDocSchema,
  type DiagramDoc,
  type DiagramEdge,
  type DiagramNode,
  type NodeParams,
} from "@/lib/diagram/schema";
import { defaultBreakerFor } from "./motor-fleet";
import { motorNominalCurrent } from "@/lib/electrical-calc";

export const MCC_DEMO_DOC_ID = "00000000-0000-4000-8000-0000000000cc";

interface DemoMotor {
  tag: string;
  label: string;
  power_kW: number;
  start: "DOL" | "VFD" | "SOFT";
}

export const MCC_DEMO_MOTORS: readonly DemoMotor[] = [
  { tag: "MG-201", label: "Misturador caixa separação", power_kW: 7.5, start: "DOL" },
  { tag: "RT-201", label: "Rosca transportadora 201", power_kW: 3, start: "VFD" },
  { tag: "RT-202", label: "Rosca transportadora 202", power_kW: 3, start: "VFD" },
  { tag: "RT-203", label: "Rosca transportadora 203", power_kW: 2.2, start: "DOL" },
  { tag: "RT-204", label: "Rosca transportadora 204", power_kW: 2.2, start: "DOL" },
  { tag: "MB-201", label: "Bomba de massa 201", power_kW: 5.5, start: "DOL" },
  { tag: "TR-201", label: "Válvula rotativa 201", power_kW: 1.5, start: "DOL" },
  { tag: "MG-202", label: "Misturador 202", power_kW: 7.5, start: "DOL" },
  { tag: "BL-201", label: "Soprador 201", power_kW: 11, start: "SOFT" },
];

/** Monta o documento unifilar (validado por DiagramDocSchema). */
export function buildMccDemoDiagram(nowIso: string = new Date().toISOString()): DiagramDoc {
  const nodes: Record<string, DiagramNode> = {};
  const edges: Record<string, DiagramEdge> = {};
  const add = (id: string, x: number, y: number, label: string, params: NodeParams) => {
    nodes[id] = { id, sheet: "unifilar", position: { x, y }, rotation: 0, label, params };
  };
  const link = (
    id: string,
    source: string,
    target: string,
    sourcePort?: string,
    targetPort?: string,
    section_mm2 = 2.5,
    length_m = 30,
  ) => {
    edges[id] = {
      id,
      sheet: "unifilar",
      source,
      target,
      sourcePort,
      targetPort,
      kind: "power",
      circuitConfig: "3F+N+PE",
      cable: { section_mm2, length_m, insulation: "PVC", installation: "B1" },
    };
  };

  const spacing = 175;
  const width = (MCC_DEMO_MOTORS.length - 1) * spacing;
  add("demo_tr", width / 2, 0, "TRAFO 300 kVA", {
    kind: "transformer",
    tag: "TR-01",
    kVA: 300,
    primary_V: 13800,
    secondary_V: 380,
    vector: "Dyn11",
  });
  add("demo_qgbt", width / 2, 150, "QGBT — Disjuntor geral", {
    kind: "breaker",
    tag: "Q0",
    in_A: 500,
    curve: "C",
    poles: 3,
    icc_kA: 25,
  });
  add("demo_bus", width / 2, 275, "Barramento CCM 380 V", {
    kind: "busbar",
    tag: "BB-CCM",
    current_A: 630,
    voltage_V: 380,
  });
  link("demo_e_tr_q0", "demo_tr", "demo_qgbt", undefined, "1/L1", 185, 10);
  link("demo_e_q0_bus", "demo_qgbt", "demo_bus", "2/T1", undefined, 185, 5);

  MCC_DEMO_MOTORS.forEach((m, i) => {
    const x = i * spacing;
    const n = String(i + 1);
    const In = motorNominalCurrent({ id: m.tag, power_kW: m.power_kW });
    const q = `demo_q${n}`;
    const k = `demo_k${n}`;
    const f = `demo_f${n}`;
    const d = `demo_d${n}`;
    const mot = `demo_m${n}`;
    add(q, x, 425, `Q${n} ${m.tag}`, {
      kind: "breaker",
      tag: `Q${n}`,
      in_A: defaultBreakerFor(In),
      curve: "D",
      poles: 3,
      icc_kA: 25,
    });
    link(`demo_e_bus_${n}`, "demo_bus", q, undefined, "1/L1", 4, 3);
    if (m.start === "VFD" || m.start === "SOFT") {
      add(
        d,
        x,
        575,
        `${m.start === "VFD" ? "Inversor" : "Soft-starter"} ${m.tag}`,
        m.start === "VFD"
          ? { kind: "vfd", tag: `U${n}`, power_kW: m.power_kW, voltage_V: 380 }
          : { kind: "softstarter", tag: `U${n}`, power_kW: m.power_kW },
      );
      // Contator de isolamento a montante do acionamento (comando do CLP).
      add(k, x, 500, `K${n}`, {
        kind: "contactor",
        tag: `K${n}`,
        in_A: Math.max(9, Math.ceil(In * 1.2)),
        coil_V: 24,
      });
      link(`demo_e_q_k_${n}`, q, k, "2/T1", "1/L1");
      link(`demo_e_k_d_${n}`, k, d, "2/T1", undefined);
      link(`demo_e_d_m_${n}`, d, mot, undefined, "U1", 2.5, 40);
    } else {
      add(k, x, 525, `K${n}`, {
        kind: "contactor",
        tag: `K${n}`,
        in_A: Math.max(9, Math.ceil(In * 1.2)),
        coil_V: 24,
      });
      add(f, x, 625, `F${n}`, {
        kind: "thermal_relay",
        tag: `F${n}`,
        // Topo da faixa de ajuste do relé (ex.: 9–13 A); ajustado em In na partida.
        in_A: Math.ceil(In * 1.25),
        trip_class: "10A",
      });
      link(`demo_e_q_k_${n}`, q, k, "2/T1", "1/L1");
      link(`demo_e_k_f_${n}`, k, f, "2/T1", "1/L1");
      link(`demo_e_f_m_${n}`, f, mot, "2/T1", "U1", 2.5, 40);
    }
    add(mot, x, 775, `${m.tag} ${m.label}`, {
      kind: "motor",
      tag: m.tag,
      power_kW: m.power_kW,
      voltage_V: 380,
      startMethod: m.start,
    });
  });

  return DiagramDocSchema.parse({
    version: DIAGRAM_DOC_VERSION,
    id: MCC_DEMO_DOC_ID,
    metadata: {
      title: "Demonstração — CCM Linha de Separação de Metais",
      norms: ["NBR 5410", "IEC 60947-4-1", "NR-10", "NR-12"],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    sheets: ["unifilar"],
    nodes,
    edges,
  });
}
