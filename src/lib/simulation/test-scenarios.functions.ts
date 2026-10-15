// Cenários de teste de planta — persistência + execução headless determinística.
//
// A execução reutiliza o motor de planta puro (`plant-engine.ts`): o mesmo
// modelo que alimenta o painel de simulação roda aqui sem UI, com um roteiro
// de entradas agendadas por tempo. Resultado gravado em `test_scenario_runs`.
//
// Autorização: usamos o cliente do próprio usuário (RLS aplica). As policies
// exigem membership do tenant; escrita exige papel owner/admin/engineer.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createPlant,
  defaultPlantInputs,
  plantTags,
  stepPlant,
  type InjectedFault,
  type PlantInputs,
  type PlantMotorSpec,
  type PlantState,
} from "@/lib/simulation/plant-engine";



// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MotorSpecInput = z.object({
  id: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_]+$/, "id deve ser alfanumérico"),
  name: z.string().max(64).optional(),
  power_kW: z.number().positive().max(1000),
  voltage_V: z.number().positive().max(30000).optional(),
  ratedRpm: z.number().positive().max(30000).optional(),
  tripTemp_C: z.number().min(0).max(300).optional(),
});

const FaultKind = z.enum(["none", "overload", "short", "phase"]);

const ScheduledStep = z.object({
  at_s: z.number().min(0).max(600),
  start: z.boolean().optional(),
  stop: z.boolean().optional(),
  estop: z.boolean().optional(),
  reset: z.boolean().optional(),
  motorCmd: z.record(z.string().min(1).max(16), z.boolean()).optional(),
  faultInject: z.record(z.string().min(1).max(16), FaultKind).optional(),
  ambientTemp_C: z.number().min(-40).max(200).optional(),
  plantTemp_C: z.number().min(-40).max(400).optional(),
  smoke: z.boolean().optional(),
  exhaustDemand: z.boolean().optional(),
  undervoltage: z.boolean().optional(),
});

const ScenarioConfig = z.object({
  duration_s: z.number().min(1).max(600).default(60),
  dt_s: z.number().min(0.01).max(1).default(0.1),
  motors: z.array(MotorSpecInput).max(16).optional(),
  steps: z.array(ScheduledStep).max(200).default([]),
});

const Expectations = z.object({
  allMotorsRunning: z.boolean().optional(),
  anyMotorTripped: z.boolean().optional(),
  noMotorTripped: z.boolean().optional(),
  estopLatched: z.boolean().optional(),
  maxCurrent_A: z.number().min(0).optional(),
  maxTemp_C: z.number().min(-40).max(400).optional(),
  motorStarts: z.record(z.string().min(1).max(16), z.number().int().min(0)).optional(),
});

const ScenarioInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  scenarioType: z
    .enum([
      "normal",
      "fault_injection",
      "protection_test",
      "interlock_test",
      "performance",
      "custom",
    ])
    .default("normal"),
  config: ScenarioConfig.default({ duration_s: 60, dt_s: 0.1, steps: [] }),
  expected: Expectations.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isTemplate: z.boolean().default(false),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  scenarioType: z
    .enum([
      "normal",
      "fault_injection",
      "protection_test",
      "interlock_test",
      "performance",
      "custom",
    ])
    .optional(),
  config: ScenarioConfig.optional(),
  expected: Expectations.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isTemplate: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Motor de execução headless (puro)
// ---------------------------------------------------------------------------

export interface RunMetrics {
  duration_s: number;
  maxCurrent_A: number;
  maxTemp_C: number;
  motorStarts: Record<string, number>;
  motorsRunning: number;
  exhaustorsRunning: number;
  exhaustCycles: number;
  estopLatched: boolean;
  generalAlarm: boolean;
  trips: Array<{ motorId: string; code: string; t: number }>;
}

export interface ScenarioEvaluation {
  passed: boolean;
  failures: string[];
}

interface RunOutcome {
  initial: PlantState;
  final: PlantState;
  metrics: RunMetrics;
  evaluation: ScenarioEvaluation;
  tags: Record<string, number | boolean>;
}

function toMotorSpecs(
  motors: z.infer<typeof MotorSpecInput>[] | undefined,
): PlantMotorSpec[] | undefined {
  if (!motors || motors.length === 0) return undefined;
  return motors.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    power_kW: m.power_kW,
    voltage_V: m.voltage_V,
    ratedRpm: m.ratedRpm,
    tripTemp_C: m.tripTemp_C,
  }));
}

function applyStep(base: PlantInputs, step: z.infer<typeof ScheduledStep>): PlantInputs {
  return {
    ...base,
    start: step.start ?? base.start,
    stop: step.stop ?? base.stop,
    estop: step.estop ?? base.estop,
    reset: step.reset ?? base.reset,
    motorCmd: { ...base.motorCmd, ...(step.motorCmd ?? {}) },
    faultInject: {
      ...base.faultInject,
      ...(step.faultInject as Record<string, InjectedFault> | undefined),
    },
    ambientTemp_C: step.ambientTemp_C ?? base.ambientTemp_C,
    plantTemp_C: step.plantTemp_C ?? base.plantTemp_C,
    smoke: step.smoke ?? base.smoke,
    exhaustDemand: step.exhaustDemand ?? base.exhaustDemand,
    undervoltage: step.undervoltage ?? base.undervoltage,
  };
}

/** Executa o roteiro de forma determinística: mesma entrada → mesmo resultado. */
export function runScenario(
  config: z.infer<typeof ScenarioConfig>,
  expected: z.infer<typeof Expectations> | undefined,
): RunOutcome {
  const specs = toMotorSpecs(config.motors);
  const initial = createPlant(specs);
  const sortedSteps = [...config.steps].sort((a, b) => a.at_s - b.at_s);

  let inputs = defaultPlantInputs();
  let current = initial;
  let stepIndex = 0;

  const trips: RunMetrics["trips"] = [];
  const exhaustEvents = { on: 0, off: 0 };
  const seenFaults = new Set<string>();
  let maxCurrent = 0;
  let maxTemp = 0;
  const motorStarts: Record<string, number> = {};

  const totalSteps = Math.ceil(config.duration_s / config.dt_s);
  for (let i = 0; i <= totalSteps; i++) {
    const t = i * config.dt_s;

    while (stepIndex < sortedSteps.length && sortedSteps[stepIndex].at_s <= t) {
      inputs = applyStep(inputs, sortedSteps[stepIndex]);
      stepIndex++;
    }

    const previous = current;
    current = stepPlant(current, inputs, config.dt_s);

    for (const [motorId, motor] of Object.entries(current.motors)) {
      maxCurrent = Math.max(maxCurrent, motor.current_A);
      maxTemp = Math.max(maxTemp, motor.temp_C);

      const wasRunning = previous.motors[motorId]?.running ?? false;
      if (motor.running && !wasRunning) motorStarts[motorId] = (motorStarts[motorId] ?? 0) + 1;

      if (motor.fault && !seenFaults.has(`${motorId}:${motor.fault.code}`)) {
        seenFaults.add(`${motorId}:${motor.fault.code}`);
        trips.push({ motorId, code: motor.fault.code, t: motor.fault.t });
      }
    }

    for (const [exId, ex] of Object.entries(current.exhaustors)) {
      const wasRunning = previous.exhaustors[exId]?.running ?? false;
      if (ex.running && !wasRunning) exhaustEvents.on++;
      if (!ex.running && wasRunning) exhaustEvents.off++;
    }
  }

  const metrics: RunMetrics = {
    duration_s: config.duration_s,
    maxCurrent_A: Math.round(maxCurrent * 10) / 10,
    maxTemp_C: Math.round(maxTemp * 10) / 10,
    motorStarts,
    motorsRunning: Object.values(current.motors).filter((m) => m.running).length,
    exhaustorsRunning: Object.values(current.exhaustors).filter((e) => e.running).length,
    exhaustCycles: exhaustEvents.on,
    estopLatched: current.estopLatched,
    generalAlarm: current.generalAlarm,
    trips,
  };

  return {
    initial,
    final: current,
    metrics,
    evaluation: evaluate(metrics, expected),
    tags: plantTags(current),
  };
}

export function evaluate(
  metrics: RunMetrics,
  expected: z.infer<typeof Expectations> | undefined,
): ScenarioEvaluation {
  const failures: string[] = [];
  if (!expected) return { passed: true, failures };

  const motorIds = Object.keys(metrics.motorStarts);
  if (expected.allMotorsRunning && metrics.motorsRunning === 0) {
    failures.push("Nenhum motor em funcionamento no final da simulação.");
  }
  if (expected.anyMotorTripped && metrics.trips.length === 0) {
    failures.push("Nenhuma proteção acionou, mas o cenário esperava pelo menos um trip.");
  }
  if (expected.noMotorTripped && metrics.trips.length > 0) {
    failures.push(
      `Proteção acionou indevidamente: ${metrics.trips.map((t) => `${t.motorId}(${t.code})`).join(", ")}.`,
    );
  }
  if (expected.estopLatched !== undefined && metrics.estopLatched !== expected.estopLatched) {
    failures.push(
      `Estado do E-STOP "${metrics.estopLatched}" difere do esperado "${expected.estopLatched}".`,
    );
  }
  if (expected.maxCurrent_A !== undefined && metrics.maxCurrent_A > expected.maxCurrent_A) {
    failures.push(
      `Corrente máxima ${metrics.maxCurrent_A}A excede o limite esperado de ${expected.maxCurrent_A}A.`,
    );
  }
  if (expected.maxTemp_C !== undefined && metrics.maxTemp_C > expected.maxTemp_C) {
    failures.push(
      `Temperatura máxima ${metrics.maxTemp_C}°C excede o limite esperado de ${expected.maxTemp_C}°C.`,
    );
  }
  if (expected.motorStarts) {
    for (const [motorId, expectedStarts] of Object.entries(expected.motorStarts)) {
      const actual = metrics.motorStarts[motorId] ?? 0;
      if (actual !== expectedStarts) {
        failures.push(`Motor ${motorId}: ${actual} partida(s), esperado ${expectedStarts}.`);
      }
    }
  }
  if (motorIds.length === 0 && Object.keys(expected.motorStarts ?? {}).length > 0) {
    failures.push("Nenhum motor registrou partida durante a simulação.");
  }

  return { passed: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Tipos serializáveis espelhando os JSONB persistidos. */
export interface ScenarioStepJson {
  at_s: number;
  start?: boolean;
  stop?: boolean;
  estop?: boolean;
  reset?: boolean;
  motorCmd?: Record<string, boolean>;
  faultInject?: Record<string, string>;
  ambientTemp_C?: number;
  plantTemp_C?: number;
  smoke?: boolean;
  exhaustDemand?: boolean;
  undervoltage?: boolean;
}

export interface ScenarioMotorJson {
  id: string;
  name?: string;
  power_kW: number;
  voltage_V?: number;
  ratedRpm?: number;
  tripTemp_C?: number;
}

export interface ScenarioConfigJson {
  duration_s: number;
  dt_s: number;
  motors?: ScenarioMotorJson[];
  steps: ScenarioStepJson[];
}

export interface ScenarioExpectationsJson {
  allMotorsRunning?: boolean;
  anyMotorTripped?: boolean;
  noMotorTripped?: boolean;
  estopLatched?: boolean;
  maxCurrent_A?: number;
  maxTemp_C?: number;
  motorStarts?: Record<string, number>;
}

/** Resumo serializável retornado ao cliente (a linha crua não é serializável). */
export interface ScenarioSummary {
  id: string;
  name: string;
  description: string | null;
  scenarioType: string;
  config: ScenarioConfigJson;
  expected: ScenarioExpectationsJson | null;
  tags: string[];
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunResult: { passed: boolean } | null;
}

function normalizeConfig(raw: unknown): ScenarioConfigJson {
  const parsed = ScenarioConfig.safeParse(raw ?? {});
  return parsed.success ? parsed.data : ScenarioConfig.parse({});
}

function normalizeExpected(raw: unknown): ScenarioExpectationsJson | null {
  if (raw == null) return null;
  const parsed = Expectations.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function normalizeLastRun(raw: unknown): { passed: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const passed = (raw as { passed?: unknown }).passed;
  return typeof passed === "boolean" ? { passed } : null;
}

function normalizeScenarioRow(row: Record<string, unknown>): ScenarioSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    scenarioType: String(row.scenario_type),
    config: normalizeConfig(row.plant_config),
    expected: normalizeExpected(row.expected_results),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    isTemplate: row.is_template === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastRunAt: typeof row.last_run_at === "string" ? row.last_run_at : null,
    lastRunResult: normalizeLastRun(row.last_run_result),
  };
}

export const listTestScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    let query = db
      .from("test_scenarios")
      .select(
        "id, project_id, name, description, scenario_type, plant_config, expected_results, tags, is_template, created_at, updated_at, last_run_at, last_run_result",
      );
    if (data.projectId) query = query.eq("project_id", data.projectId);

    const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map(normalizeScenarioRow);
  });

export const createTestScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScenarioInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: row, error } = await db
      .from("test_scenarios")
      .insert({
        project_id: data.projectId,
        name: data.name,
        description: data.description ?? null,
        scenario_type: data.scenarioType,
        plant_config: data.config as unknown as Json,
        expected_results: (data.expected ?? null) as unknown as Json,
        tags: data.tags,
        is_template: data.isTemplate,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: String(row.id) };
  });

export const updateTestScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const patch: Database["public"]["Tables"]["test_scenarios"]["Update"] = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.scenarioType !== undefined) patch.scenario_type = data.scenarioType;
    if (data.config !== undefined) patch.plant_config = data.config as unknown as Json;
    if (data.expected !== undefined) patch.expected_results = data.expected as unknown as Json;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.isTemplate !== undefined) patch.is_template = data.isTemplate;

    const { error } = await db.from("test_scenarios").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteTestScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { error } = await db.from("test_scenarios").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Resumo serializável de uma execução. */
export interface RunSummary {
  id: string;
  runNumber: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  passed: boolean | null;
  failureReason: string | null;
  metrics: RunMetrics | null;
}

function normalizeRunRow(row: Record<string, unknown>): RunSummary {
  const rawMetrics = row.metrics;
  let metrics: RunMetrics | null = null;
  if (rawMetrics && typeof rawMetrics === "object") {
    const m = rawMetrics as Partial<RunMetrics>;
    metrics = {
      duration_s: Number(m.duration_s ?? 0),
      maxCurrent_A: Number(m.maxCurrent_A ?? 0),
      maxTemp_C: Number(m.maxTemp_C ?? 0),
      motorStarts: m.motorStarts ?? {},
      motorsRunning: Number(m.motorsRunning ?? 0),
      exhaustorsRunning: Number(m.exhaustorsRunning ?? 0),
      exhaustCycles: Number(m.exhaustCycles ?? 0),
      estopLatched: m.estopLatched === true,
      generalAlarm: m.generalAlarm === true,
      trips: Array.isArray(m.trips) ? m.trips : [],
    };
  }
  return {
    id: String(row.id),
    runNumber: Number(row.run_number ?? 0),
    status: String(row.status),
    startedAt: String(row.started_at),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    passed: typeof row.passed === "boolean" ? row.passed : null,
    failureReason: typeof row.failure_reason === "string" ? row.failure_reason : null,
    metrics,
  };
}

export const listScenarioRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ scenarioId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: rows, error } = await db
      .from("test_scenario_runs")
      .select(
        "id, run_number, status, started_at, completed_at, duration_ms, metrics, passed, failure_reason",
      )
      .eq("scenario_id", data.scenarioId)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map(normalizeRunRow);
  });

/** Executa o cenário de forma headless e persiste a execução. */
export const runTestScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ scenarioId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase;

    const { data: scenario, error: loadErr } = await db
      .from("test_scenarios")
      .select("id, plant_config, expected_results")
      .eq("id", data.scenarioId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!scenario) throw new Error("scenario_not_found");

    const config = ScenarioConfig.parse(scenario.plant_config ?? {});
    const expected = scenario.expected_results
      ? Expectations.parse(scenario.expected_results)
      : undefined;

    const startedAtMs = Date.now();
    const outcome = runScenario(config, expected);
    const durationMs = Date.now() - startedAtMs;

    const { data: run, error: runErr } = await db
      .from("test_scenario_runs")
      .insert({
        scenario_id: scenario.id,
        status: "completed",
        duration_ms: durationMs,
        plant_initial_state: outcome.initial as unknown as Json,
        plant_final_state: outcome.final as unknown as Json,
        metrics: outcome.metrics as unknown as Json,
        passed: outcome.evaluation.passed,
        failure_reason: outcome.evaluation.failures.join(" ") || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    const { error: updErr } = await db
      .from("test_scenarios")
      .update({
        last_run_at: new Date(startedAtMs).toISOString(),
        last_run_result: { passed: outcome.evaluation.passed, metrics: outcome.metrics } as unknown as Json,
      })
      .eq("id", scenario.id);
    if (updErr) throw new Error(updErr.message);

    return {
      ok: true as const,
      runId: String(run.id),
      passed: outcome.evaluation.passed,
      failures: outcome.evaluation.failures,
      metrics: outcome.metrics,
      tags: outcome.tags,
      durationMs,
    };
  });
