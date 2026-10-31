// Simulação elétrica de potência — curto-circuito, seletividade, arco
// elétrico, esforço térmico e queda de tensão.
//
// O cálculo é puro (`@/lib/electrical-sim`); aqui só fazemos a fronteira:
// autorização, validação Zod e persistência em `electrical_simulation_results`.
// Nada disso atesta aptidão para operação industrial (Termos §10).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  arcFlashIEEE1584,
  checkBreakingCapacity,
  motorStartThermal,
  selectivityIEC60947,
  shortCircuitIEC60909,
  voltageDropCircuit,
  type ArcFlashResult,
  type CapacityCheck,
  type EarthingSystem,
  type MotorStartThermalResult,
  type ProtectionDevice,
  type SelectivityResult,
  type ShortCircuitResult,
  type VoltageDropResult,
} from "@/lib/electrical-sim";

/**
 * Forma serializável do resultado de um estudo. Precisa ser concreta (sem
 * `unknown`) porque a TanStack Server Function valida serializabilidade.
 */
export interface ElectricalStudyResults {
  shortCircuit?: ShortCircuitResult;
  breakingCapacity?: CapacityCheck[];
  selectivity?: SelectivityResult;
  arcFlash?: ArcFlashResult;
  motorStarts?: MotorStartThermalResult[];
  circuits?: VoltageDropResult[];
}

const Earthing = z.enum(["TN-S", "TN-C", "TN-C-S", "TT", "IT"]);

const TransformerInput = z.object({
  power_kVA: z.number().positive().max(10000),
  secondary_V: z.number().positive().max(30000),
  impedance_pct: z.number().gt(0).max(30),
  vector_group: z.string().max(12).optional(),
  x_r_ratio: z.number().positive().max(100).optional(),
});

const ProtectionInput = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["MCB", "MCCB", "ACB", "fuse", "thermal_overload", "motor_protection"]),
  rating_A: z.number().positive().max(6300),
  curve: z.enum(["B", "C", "D", "K", "Z"]).optional(),
  instantaneous_A: z.number().positive().max(100000).optional(),
  breaking_kA: z.number().positive().max(200).optional(),
  thermal_delay_s: z.number().positive().max(600).optional(),
});

const CircuitInput = z.object({
  circuitId: z.string().min(1).max(40),
  current_A: z.number().positive().max(5000),
  length_m: z.number().positive().max(3000),
  cable_mm2: z.number().positive().max(1000),
  voltage_V: z.number().positive().max(30000).optional(),
  cosphi: z.number().gt(0).max(1).optional(),
  limit_pct: z.number().gt(0).max(20).optional(),
  installationMethod: z.enum(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]).optional(),
  insulation: z.enum(["PVC", "EPR", "XLPE"]).optional(),
  ambientTemp_C: z.number().min(10).max(60).optional(),
  groupedCircuits: z.number().int().min(1).max(50).optional(),
  breaker_A: z.number().positive().max(6300).optional(),
  phases: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  reactance_mOhm_per_m: z.number().min(0).max(5).optional(),
});

const MotorStartInput = z.object({
  motorId: z.string().min(1).max(40),
  In_A: z.number().positive().max(5000),
  Istart_A: z.number().positive().max(50000),
  duration_s: z.number().positive().max(120),
});

const Study = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("short_circuit"),
    transformer: TransformerInput,
    voltage_V: z.number().positive().max(30000).optional(),
    earthing: Earthing.optional(),
    devices: z.array(ProtectionInput).max(50).default([]),
  }),
  z.object({
    kind: z.literal("selectivity"),
    upstream: ProtectionInput,
    downstream: ProtectionInput,
    faultCurrent_A: z.number().positive().max(1000000),
  }),
  z.object({
    kind: z.literal("arc_flash"),
    ik_kA: z.number().positive().max(200),
    clearingTime_s: z.number().positive().max(10).optional(),
    workingDistance_mm: z.number().positive().max(2000).optional(),
    electrodeGap_mm: z.number().positive().max(200).optional(),
    configuration: z.enum(["VB", "VC", "VD", "HA", "HB", "HC"]).optional(),
  }),
  z.object({
    kind: z.literal("thermal"),
    motors: z.array(MotorStartInput).min(1).max(50),
  }),
  z.object({
    kind: z.literal("voltage_drop"),
    circuits: z.array(CircuitInput).min(1).max(100),
  }),
]);

type StudyInput = z.infer<typeof Study>;
type Device = z.infer<typeof ProtectionInput>;

const STANDARD_BY_KIND: Record<StudyInput["kind"], string> = {
  short_circuit: "IEC_60909",
  selectivity: "IEC_60947",
  arc_flash: "IEEE_1584",
  thermal: "NBR_5410",
  voltage_drop: "NBR_5410",
};

const RunInput = z.object({
  projectId: z.string().uuid(),
  study: Study,
  persist: z.boolean().default(true),
});

interface ComputedStudy {
  simulationType: string;
  standard: string;
  results: ElectricalStudyResults;
  warnings: string[];
}

function compute(study: StudyInput): ComputedStudy {
  const warnings: string[] = [];

  switch (study.kind) {
    case "short_circuit": {
      const sc = shortCircuitIEC60909(study.transformer, {
        voltage_V: study.voltage_V,
        earthing: study.earthing as EarthingSystem | undefined,
      });
      const capacity = checkBreakingCapacity(study.devices as ProtectionDevice[], sc.Ik3ph_kA);
      for (const c of capacity) {
        if (!c.adequate) {
          warnings.push(
            `Dispositivo ${c.deviceId}: capacidade de ruptura ${c.breaking_kA} kA < corrente disponível ${c.Ik_kA} kA.`,
          );
        }
      }
      return {
        simulationType: "short_circuit",
        standard: STANDARD_BY_KIND.short_circuit,
        results: { shortCircuit: sc, breakingCapacity: capacity },
        warnings,
      };
    }
    case "selectivity": {
      const res = selectivityIEC60947(
        study.upstream as ProtectionDevice,
        study.downstream as ProtectionDevice,
        study.faultCurrent_A,
      );
      if (!res.selective) {
        warnings.push("Coordenação NÃO seletiva: o montante pode disparar junto com o jusante.");
      } else if (res.mode === "partial") {
        warnings.push("Coordenação parcialmente seletiva — verificar tabela do fabricante.");
      }
      return {
        simulationType: "selectivity",
        standard: STANDARD_BY_KIND.selectivity,
        results: { selectivity: res },
        warnings,
      };
    }
    case "arc_flash": {
      const res = arcFlashIEEE1584(study.ik_kA, {
        clearingTime_s: study.clearingTime_s,
        workingDistance_mm: study.workingDistance_mm,
        electrodeGap_mm: study.electrodeGap_mm,
        configuration: study.configuration,
      });
      if (res.ppe_category >= 3) {
        warnings.push(
          `Energia incidente ${res.incidentEnergy_cal_cm2} cal/cm² exige PPE categoria ${res.ppe_category} (NR-10 / NFPA 70E).`,
        );
      }
      return {
        simulationType: "arc_flash",
        standard: STANDARD_BY_KIND.arc_flash,
        results: { arcFlash: res },
        warnings,
      };
    }
    case "thermal": {
      const motors = study.motors.map((m) =>
        motorStartThermal(m.motorId, m.In_A, m.Istart_A, m.duration_s),
      );
      for (const m of motors) {
        if (m.tripRisk === "HIGH") {
          warnings.push(
            `Motor ${m.motorId}: risco ALTO de disparo na partida (ΔT ≈ ${m.estimatedRise_C}°C).`,
          );
        }
      }
      return {
        simulationType: "thermal",
        standard: STANDARD_BY_KIND.thermal,
        results: { motorStarts: motors },
        warnings,
      };
    }
    case "voltage_drop": {
      const circuits = study.circuits.map((c) =>
        voltageDropCircuit(c.circuitId, c.current_A, c.length_m, c.cable_mm2, {
          voltage_V: c.voltage_V,
          cosphi: c.cosphi,
          limit_pct: c.limit_pct,
          installationMethod: c.installationMethod,
          insulation: c.insulation,
          ambientTemp_C: c.ambientTemp_C,
          groupedCircuits: c.groupedCircuits,
          breaker_A: c.breaker_A,
          phases: c.phases,
          reactance_mOhm_per_m: c.reactance_mOhm_per_m,
        }),
      );
      for (const c of circuits) {
        if (!c.within_limit) {
          warnings.push(
            `Circuito ${c.circuitId}: queda de tensão ${c.voltage_drop_pct}% acima do limite ${c.limit_pct}% (NBR 5410 — seção recomendada ≥ ${c.recommended_cable_mm2} mm²).`,
          );
        }
        if (!c.thermal_adequate) {
          warnings.push(
            `Circuito ${c.circuitId}: capacidade térmica corrigida I'z = ${c.Iz_corrected_A} A insuficiente para I_b = ${c.current_A} A (NBR 5410 — seção recomendada ≥ ${c.recommended_cable_mm2} mm²).`,
          );
        }
      }
      return {
        simulationType: "voltage_drop",
        standard: STANDARD_BY_KIND.voltage_drop,
        results: { circuits },
        warnings,
      };
    }
    default: {
      const _exhaustive: never = study;
      throw new Error(`study_kind_unsupported:${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Calcula um estudo elétrico e opcionalmente persiste o resultado. */
export const runElectricalStudy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RunInput.parse(input))
  .handler(async ({ data, context }) => {
    const startedAtMs = Date.now();
    const computed = compute(data.study);
    const computationTimeMs = Date.now() - startedAtMs;

    let resultId: string | null = null;
    if (data.persist) {
      const db = context.supabase;
      const { data: row, error } = await db
        .from("electrical_simulation_results")
        .insert({
          project_id: data.projectId,
          simulation_type: computed.simulationType,
          standard: computed.standard,
          input_data: data.study as unknown as Json,
          results: computed.results as unknown as Json,
          warnings: computed.warnings as unknown as Json,
          errors: [],
          computation_time_ms: computationTimeMs,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      resultId = String(row.id);
    }

    return {
      ok: true as const,
      resultId,
      simulationType: computed.simulationType,
      standard: computed.standard,
      results: computed.results,
      warnings: computed.warnings,
      computationTimeMs,
    };
  });

export const listElectricalStudies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ projectId: z.string().uuid(), simulationType: z.string().max(40).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    let query = db
      .from("electrical_simulation_results")
      .select("id, simulation_type, standard, results, warnings, computation_time_ms, created_at");
    if (data.simulationType) query = query.eq("simulation_type", data.simulationType);

    const { data: rows, error } = await query
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteElectricalStudy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { error } = await db.from("electrical_simulation_results").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
