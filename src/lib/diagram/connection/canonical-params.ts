// Canonical Parameter & Metadata Normalizer for Diagram Nodes
// Ensures zero silent property loss and no unintended fallback to unrelated equipment kinds.

import type { DiagramNode, NodeKind, NodeParams } from "../schema";

export function extractPreservedUiMetadata(
  rawProps: Record<string, unknown> = {},
): DiagramNode["ui"] | undefined {
  const ui: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (
      typeof v === "string" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      typeof v === "boolean" ||
      v === null
    ) {
      ui[`prop_${k}`] = v;
    }
  }
  return Object.keys(ui).length > 0 ? ui : undefined;
}

function normalizeNumPair(val: unknown, fallback: [number, number]): [number, number] {
  if (
    Array.isArray(val) &&
    val.length >= 2 &&
    Number.isFinite(Number(val[0])) &&
    Number.isFinite(Number(val[1]))
  ) {
    return [Number(val[0]), Number(val[1])];
  }
  return fallback;
}

/**
 * Resolves free-form equipment kind aliases into a valid canonical NodeKind.
 * Preserves dedicated kinds (thermal_relay, capacitor_bank, generator, plc, hmi, etc.)
 * instead of collapsing them to generic "load".
 */
export function normalizeProjectNodeKind(rawKind: string | undefined): NodeKind {
  const k = (rawKind || "load").trim().toLowerCase();
  if (k === "thermal_relay" || k.includes("termic") || k.includes("overload") || k === "rt")
    return "thermal_relay";
  if (k === "capacitor_bank" || k.includes("capacitor") || k.includes("kvar"))
    return "capacitor_bank";
  if (k === "generator" || k.includes("gerador") || k === "gmg") return "generator";
  if (k === "plc" || k === "clp" || k.includes("controller")) return "plc";
  if (k === "hmi" || k === "ihm") return "hmi";
  if (k === "rcd" || k === "dr" || k === "ddr" || k.includes("diferencial")) return "rcd";
  if (k === "breaker" || k.includes("disjuntor") || k.startsWith("dj")) return "breaker";
  if (k === "busbar" || k.includes("barra")) return "busbar";
  if (k === "contactor" || k.includes("contator") || k === "km") return "contactor";
  if (k === "motor") return "motor";
  if (k === "transformer" || k.includes("trafo")) return "transformer";
  if (k === "vfd" || k.includes("inversor")) return "vfd";
  if (k === "softstarter" || k.includes("soft")) return "softstarter";
  if (k === "psu" || k.includes("fonte")) return "psu";
  if (k === "fuse" || k.includes("fusivel") || k.includes("fusível")) return "fuse";
  if (k === "disconnector" || k.includes("seccionadora")) return "disconnector";
  if (k === "relay" || k.includes("rele") || k.includes("relé")) return "relay";
  if (k === "ccm") return "ccm";
  if (k === "lamp" || k.includes("lampada") || k.includes("lâmpada")) return "lamp";
  if (k === "socket" || k.includes("tomada")) return "socket";
  if (k === "pt100" || k.includes("rtd")) return "pt100";
  if (k === "pressure" || k.includes("pressao")) return "pressure";
  if (k === "flow" || k.includes("vazao")) return "flow";
  if (k === "level" || k.includes("nivel")) return "level";
  if (k === "encoder") return "encoder";
  if (k === "estop" || k.includes("emergencia")) return "estop";
  if (k === "lightcurtain" || k.includes("cortina")) return "lightcurtain";
  if (k === "ground" || k === "terra" || k === "pe") return "ground";
  if (k === "neutral" || k === "neutro") return "neutral";
  if (k === "terminal" || k.includes("borne")) return "terminal";
  return "load";
}

export function buildCanonicalDiagramParams(
  kind: NodeKind,
  rawProps: Record<string, any> = {},
): NodeParams {
  const tag = rawProps.tag ? String(rawProps.tag).slice(0, 64) : undefined;
  const notes = rawProps.notes ? String(rawProps.notes).slice(0, 500) : undefined;
  const manufacturer = rawProps.manufacturer
    ? String(rawProps.manufacturer).slice(0, 120)
    : undefined;
  const model = rawProps.model ? String(rawProps.model).slice(0, 120) : undefined;
  const base = {
    ...(tag !== undefined ? { tag } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(manufacturer !== undefined ? { manufacturer } : {}),
    ...(model !== undefined ? { model } : {}),
  };

  const inRaw = rawProps.in_A ?? rawProps.In ?? rawProps.current_A ?? rawProps.nominalCurrentA;
  const in_A = Number(inRaw);
  const pRaw = rawProps.power_kW ?? rawProps.P ?? rawProps.kW ?? rawProps.powerKw;
  const power_kW = Number(pRaw);
  const uRaw = rawProps.voltage_V ?? rawProps.U ?? rawProps.V ?? rawProps.voltageV;
  const voltage_V = Number(uRaw);

  switch (kind) {
    case "breaker": {
      const polesNum = Number(rawProps.poles);
      const poles = polesNum >= 1 && polesNum <= 4 ? Math.floor(polesNum) : 3;
      const curveStr = String(rawProps.curve || "C").toUpperCase();
      const curve = ["B", "C", "D"].includes(curveStr) ? (curveStr as "B" | "C" | "D") : "C";
      return {
        kind: "breaker",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 32,
        curve,
        poles,
        icc_kA:
          Number.isFinite(Number(rawProps.icc_kA)) && Number(rawProps.icc_kA) > 0
            ? Number(rawProps.icc_kA)
            : undefined,
      };
    }
    case "contactor":
      return {
        kind: "contactor",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 25,
        coil_V: Number(rawProps.coil_V) > 0 ? Number(rawProps.coil_V) : 24,
      };
    case "rcd": {
      const polesNum = Number(rawProps.poles);
      const poles = polesNum >= 2 && polesNum <= 4 ? Math.floor(polesNum) : 4;
      return {
        kind: "rcd",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 40,
        sensitivity_mA: Number(rawProps.sensitivity_mA) > 0 ? Number(rawProps.sensitivity_mA) : 30,
        poles,
      };
    }
    case "thermal_relay":
      return {
        kind: "thermal_relay",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 25,
        trip_class: rawProps.trip_class ? String(rawProps.trip_class) : "10A",
      };
    case "fuse":
      return {
        kind: "fuse",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 32,
      };
    case "disconnector":
      return {
        kind: "disconnector",
        ...base,
        in_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 63,
      };
    case "transformer": {
      const kvaRaw = rawProps.kVA ?? rawProps.apparentPowerKva ?? rawProps.P;
      const kVA = Number(kvaRaw);
      const primary_V = Number(rawProps.primary_V ?? rawProps.primaryV);
      const secondary_V = Number(rawProps.secondary_V ?? rawProps.secondaryV ?? voltage_V);
      return {
        kind: "transformer",
        ...base,
        kVA: Number.isFinite(kVA) && kVA > 0 ? kVA : 75,
        primary_V: Number.isFinite(primary_V) && primary_V > 0 ? primary_V : 13800,
        secondary_V: Number.isFinite(secondary_V) && secondary_V > 0 ? secondary_V : 380,
        vector: String(rawProps.vector || "Dyn11"),
      };
    }
    case "generator": {
      const kvaRaw =
        rawProps.kVA ??
        rawProps.power_kVA ??
        rawProps.power_kva ??
        rawProps.apparentPowerKva ??
        rawProps.P;
      const kVA = Number(kvaRaw);
      return {
        kind: "generator",
        ...base,
        kVA: Number.isFinite(kVA) && kVA > 0 ? kVA : 150,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
      };
    }
    case "capacitor_bank": {
      const kvar = Number(rawProps.kvar ?? rawProps.power_kvar ?? rawProps.kVAR ?? rawProps.Q);
      const stagesNum = Number(rawProps.stages);
      return {
        kind: "capacitor_bank",
        ...base,
        kvar: Number.isFinite(kvar) && kvar > 0 ? kvar : 25,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
        ...(Number.isFinite(stagesNum) && stagesNum > 0 ? { stages: Math.floor(stagesNum) } : {}),
      };
    }
    case "psu":
      return {
        kind: "psu",
        ...base,
        output_V:
          Number.isFinite(Number(rawProps.output_V)) && Number(rawProps.output_V) > 0
            ? Number(rawProps.output_V)
            : Number.isFinite(voltage_V) && voltage_V > 0
              ? voltage_V
              : 24,
        output_A:
          Number.isFinite(Number(rawProps.output_A)) && Number(rawProps.output_A) > 0
            ? Number(rawProps.output_A)
            : Number.isFinite(in_A) && in_A > 0
              ? in_A
              : 10,
      };
    case "vfd":
      return {
        kind: "vfd",
        ...base,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 7.5,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
      };
    case "softstarter":
      return {
        kind: "softstarter",
        ...base,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 7.5,
      };
    case "busbar": {
      const tapsNum = Number(rawProps.taps);
      return {
        kind: "busbar",
        ...base,
        current_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 63,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
        ...(Number.isFinite(tapsNum) && tapsNum >= 1 && tapsNum <= 64
          ? { taps: Math.floor(tapsNum) }
          : {}),
      };
    }
    case "ccm":
      return {
        kind: "ccm",
        ...base,
        columns: Number(rawProps.columns) > 0 ? Math.floor(Number(rawProps.columns)) : 1,
        cells: Number(rawProps.cells) > 0 ? Math.floor(Number(rawProps.cells)) : 4,
      };
    case "motor": {
      const sm = String(rawProps.startMethod || "DOL").toUpperCase();
      const startMethod =
        sm === "STAR_DELTA" || sm.includes("ESTRELA") || sm.includes("DELTA")
          ? "STAR_DELTA"
          : sm.includes("SOFT")
            ? "SOFT"
            : sm.includes("VFD") || sm.includes("INV")
              ? "VFD"
              : "DOL";
      const curA = Number(rawProps.current_A ?? rawProps.fla_A ?? inRaw);
      return {
        kind: "motor",
        ...base,
        power_kW: Number.isFinite(power_kW) && power_kW > 0 ? power_kW : 5.5,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 380,
        ...(Number.isFinite(curA) && curA > 0 ? { current_A: curA, fla_A: curA } : {}),
        startMethod,
      };
    }
    case "load": {
      const fpRaw = Number(rawProps.fp);
      return {
        kind: "load",
        ...base,
        power_W: Number(rawProps.power_W ?? (power_kW > 0 ? power_kW * 1000 : 1000)),
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
        fp: Number.isFinite(fpRaw) && fpRaw >= 0 && fpRaw <= 1 ? fpRaw : 0.92,
      };
    }
    case "lamp":
      return {
        kind: "lamp",
        ...base,
        power_W: Number(rawProps.power_W ?? (power_kW > 0 ? power_kW * 1000 : 100)),
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
      };
    case "socket":
      return {
        kind: "socket",
        ...base,
        current_A: Number.isFinite(in_A) && in_A > 0 ? in_A : 10,
        voltage_V: Number.isFinite(voltage_V) && voltage_V > 0 ? voltage_V : 220,
      };
    case "plc":
      return {
        kind: "plc",
        ...base,
        cpu: rawProps.cpu ? String(rawProps.cpu) : "1769-L33ER",
        io_count:
          Number.isFinite(Number(rawProps.io_count)) && Number(rawProps.io_count) > 0
            ? Math.floor(Number(rawProps.io_count))
            : 16,
      };
    case "hmi":
      return {
        kind: "hmi",
        ...base,
        screen_size_in:
          Number.isFinite(Number(rawProps.screen_size_in)) && Number(rawProps.screen_size_in) > 0
            ? Number(rawProps.screen_size_in)
            : 10.1,
        protocol: rawProps.protocol ? String(rawProps.protocol) : "EtherNet/IP",
      };
    case "pt100":
      return { kind: "pt100", ...base, range_C: normalizeNumPair(rawProps.range_C, [-50, 200]) };
    case "pressure":
      return {
        kind: "pressure",
        ...base,
        range_bar: normalizeNumPair(rawProps.range_bar, [0, 10]),
      };
    case "flow":
      return { kind: "flow", ...base, range: normalizeNumPair(rawProps.range, [0, 100]) };
    case "level":
      return { kind: "level", ...base, range_pct: normalizeNumPair(rawProps.range_pct, [0, 100]) };
    case "encoder":
      return {
        kind: "encoder",
        ...base,
        ppr: Number(rawProps.ppr) > 0 ? Math.floor(Number(rawProps.ppr)) : 1024,
      };
    case "estop": {
      const catStr = String(rawProps.category || "1");
      const category = catStr === "0" || catStr === "1" || catStr === "2" ? catStr : "1";
      return { kind: "estop", ...base, category };
    }
    case "lightcurtain":
      return {
        kind: "lightcurtain",
        ...base,
        resolution_mm: Number(rawProps.resolution_mm) > 0 ? Number(rawProps.resolution_mm) : 14,
      };
    case "ground":
      return { kind: "ground", ...base };
    case "neutral":
      return { kind: "neutral", ...base };
    case "terminal":
      return { kind: "terminal", ...base };
    case "relay":
      return {
        kind: "relay",
        ...base,
        coil_V: Number(rawProps.coil_V) > 0 ? Number(rawProps.coil_V) : 24,
        contacts: Number(rawProps.contacts) > 0 ? Math.floor(Number(rawProps.contacts)) : 2,
      };
  }
}
