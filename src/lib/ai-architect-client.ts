import { supabase } from "@/integrations/supabase/client";
import { getPlan } from "@/lib/plans";
import {
  useProjectStore,
  type IndustrialNode,
  type IndustrialEdge,
  type NodeKind,
  type NodeCategory,
} from "@/lib/project-store";
import { useCurrentProject } from "@/lib/current-project";
import { generateArchitecture, pingArchitect } from "@/lib/ai-architect.functions";

import { useVoltaiStore, type VoltaiDiagramEdge } from "@/lib/voltai/store";
import { useEditorStore, type FbdNode, type FbdEdge } from "@/lib/editor/store";
import {
  getVoltaiFactoryParams,
  createVoltaiDefaultState,
  type VoltaiComponentType,
} from "@/lib/voltai/component-definitions";
import type { LadderRung } from "@/lib/ladder/types";

export interface ArchitectResult {
  title: string;
  rationale: string;
  transformer: { kVA: number; primary_kV: number; secondary_V: number };
  ccm: { columns: number; cells: number };
  motors: Array<{
    id: string;
    power_kW: number;
    voltage_V?: number;
    startMethod?: "DOL" | "SOFT" | "VFD";
    role?: string;
  }>;
  nodes: Array<{
    id: string;
    kind: string;
    category: string;
    label: string;
    params?: Record<string, unknown>;
    position: { x: number; y: number };
  }>;
  edges: Array<{ source: string; target: string; kind: "power" | "signal" | "pipe" }>;
}

export class AIServiceError extends Error {
  code: string;
  userMessage: string;
  steps?: string[];
  constructor(code: string, message: string, userMessage: string, steps?: string[]) {
    super(message);
    this.code = code;
    this.userMessage = userMessage;
    this.steps = steps;
  }
}

function mapError(code: string, message: string): AIServiceError {
  switch (code) {
    case "MISSING_KEY":
    case "INVALID_KEY_FORMAT":
    case "AUTH_401":
      return new AIServiceError(
        code,
        message,
        "A IA não está autenticada. Verifique a chave de IA nas configurações do projeto.",
        [
          "Acesse platform.deepseek.com/api_keys e gere uma nova chave (a conta precisa ter créditos).",
          "No Supabase, abra Settings → Edge Functions → Secrets e atualize DEEPSEEK_API_KEY.",
          "Volte aqui e clique em 'Revalidar' na tela de Status da IA.",
        ],
      );
    case "INSUFFICIENT_CREDITS":
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("trigger-upgrade-modal"));
      }
      return new AIServiceError(code, message, "Créditos de IA insuficientes neste mês.", [
        "Faça upgrade do plano em Configurações → Cobrança.",
        "Ou aguarde o próximo ciclo mensal.",
      ]);
    case "RATE_LIMIT_429":
      return new AIServiceError(code, message, "Muitas requisições à IA. Aguarde alguns segundos.");
    case "NO_CREDITS_402":
      return new AIServiceError(code, message, "Créditos da conta DeepSeek esgotados.", [
        "Adicione créditos in platform.deepseek.com/usage.",
        "Recarregue a página e tente novamente.",
      ]);
    case "UPSTREAM_5XX":
      return new AIServiceError(
        code,
        message,
        "Serviço DeepSeek temporariamente indisponível. Tente em alguns segundos.",
      );
    default:
      return new AIServiceError(code || "UNKNOWN", message, message);
  }
}

// --- Status tracking (for the Status page + global counters) ---------------
const STATUS_KEY = "eletricai.ai.statusEvents";
const AI_USAGE_KEY = "eletricai.ai.usage";
type StatusEvent = { ts: number; ok: boolean; code?: string; ms: number };

interface LocalAiUsagePayload {
  plan?: string;
  used?: number;
}

function pushStatus(ev: StatusEvent) {
  if (typeof window === "undefined") return;
  try {
    const arr: StatusEvent[] = JSON.parse(localStorage.getItem(STATUS_KEY) ?? "[]");
    arr.unshift(ev);
    localStorage.setItem(STATUS_KEY, JSON.stringify(arr.slice(0, 50)));
    window.dispatchEvent(new CustomEvent("ai-status-event"));
  } catch {
    /* ignore */
  }
}

export function getLocalAiUsage() {
  if (typeof window === "undefined")
    return { plan: "free", used: 0, remainingLabel: "10 créditos" };
  try {
    const usage: LocalAiUsagePayload = JSON.parse(localStorage.getItem(AI_USAGE_KEY) ?? "{}");
    const plan = getPlan(usage.plan);
    const used = Number(usage.used ?? 0);
    const remainingLabel =
      plan.aiCreditsPerMonth === null
        ? "IA ilimitada"
        : `${Math.max(0, plan.aiCreditsPerMonth - used)} créditos`;
    return { plan: plan.id, used, remainingLabel };
  } catch {
    return { plan: "free", used: 0, remainingLabel: "10 créditos" };
  }
}

function incrementLocalAiUsage(planId = "free") {
  if (typeof window === "undefined") return;
  const current = getLocalAiUsage();
  const next = { plan: planId || current.plan, used: current.used + 1 };
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ai-usage-event"));
}
export function getStatusEvents(): StatusEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export async function callArchitect(
  prompt: string,
  includeContext = true,
): Promise<ArchitectResult> {
  const context = includeContext
    ? { nodes: useProjectStore.getState().nodes, edges: useProjectStore.getState().edges }
    : undefined;
  const t0 = Date.now();
  try {
    const res = await generateArchitecture({ data: { prompt, context } });
    if (!res.ok) {
      pushStatus({ ts: Date.now(), ok: false, code: res.error.code, ms: Date.now() - t0 });
      throw mapError(res.error.code, res.error.message);
    }
    pushStatus({ ts: Date.now(), ok: true, ms: Date.now() - t0 });
    incrementLocalAiUsage();
    return res.system as unknown as ArchitectResult;
  } catch (e) {
    if (e instanceof AIServiceError) throw e;
    pushStatus({ ts: Date.now(), ok: false, code: "NETWORK", ms: Date.now() - t0 });
    throw mapError("NETWORK", (e as Error).message);
  }
}

export async function pingArchitectHealth(): Promise<unknown> {
  const t0 = Date.now();
  try {
    const json = await pingArchitect();
    pushStatus({
      ts: Date.now(),
      ok: !!json.ok,
      code: json.ok ? undefined : "HEALTH_FAIL",
      ms: Date.now() - t0,
    });
    return json;
  } catch (e) {
    pushStatus({ ts: Date.now(), ok: false, code: "HEALTH_NETWORK", ms: Date.now() - t0 });
    return { ok: false, error: (e as Error).message };
  }
}

export function applyArchitectToStore(
  result: ArchitectResult,
  opts: { mode: "replace" | "merge" } = { mode: "replace" },
) {
  // 1. Map and update SCADA / Physical Twin (useProjectStore)
  const nodes: IndustrialNode[] = result.nodes.map((n) => ({
    id: n.id,
    kind: (n.kind as NodeKind) || "motor",
    category: (n.category as NodeCategory) || "mech",
    label: n.label || n.id,
    position: n.position,
    params: (n.params as Record<string, unknown>) ?? {},
    energized: n.category === "power" || n.category === "mech",
  }));
  const edges: IndustrialEdge[] = result.edges.map((e, i) => ({
    id: `ai-${Date.now()}-${i}`,
    source: e.source,
    target: e.target,
    kind: e.kind,
  }));

  useProjectStore.setState((s) => ({
    nodes:
      opts.mode === "replace"
        ? nodes
        : [...s.nodes, ...nodes.filter((n) => !s.nodes.find((x) => x.id === n.id))],
    edges: opts.mode === "replace" ? edges : [...s.edges, ...edges],
    selectedId: nodes[0]?.id ?? null,
    logs: [
      {
        t: new Date().toISOString(),
        tag: "AI",
        msg: `Sistema gerado: ${result.title} · ${nodes.length} nós · ${edges.length} ligações`,
        lvl: "ok" as const,
        channel: "IA" as const,
      },
      ...s.logs,
    ].slice(0, 200),
  }));

  // 2. Map and deploy to Unifilar Canvas (useVoltaiStore)
  const voltaiComponents = result.nodes.map((n) => {
    let type: VoltaiComponentType = "QF";
    const kindLower = n.kind.toLowerCase();
    if (kindLower.includes("breaker") || kindLower.includes("disjuntor")) type = "QF";
    else if (kindLower.includes("contactor") || kindLower.includes("contator")) type = "KM";
    else if (
      kindLower.includes("thermal") ||
      kindLower.includes("termico") ||
      kindLower.includes("rele")
    )
      type = "FR";
    else if (kindLower.includes("motor")) type = "M";
    else if (kindLower.includes("transformer") || kindLower.includes("trafo")) type = "TR";
    else if (kindLower.includes("plc") || kindLower.includes("clp")) type = "PLC";
    else if (kindLower.includes("source") || kindLower.includes("fonte")) type = "PS";
    else if (kindLower.includes("bus") || kindLower.includes("barramento")) type = "BC";
    else if (kindLower.includes("soft") || kindLower.includes("starter")) type = "SS";
    else if (kindLower.includes("vfd") || kindLower.includes("inversor")) type = "VFD";
    else if (kindLower.includes("switch") || kindLower.includes("seccionadora")) type = "QS";

    return {
      id: n.id,
      type,
      label: n.label || n.id,
      position: n.position || { x: 100, y: 100 },
      rotation: 0,
      params: getVoltaiFactoryParams(type),
      simulationState: createVoltaiDefaultState(type),
    };
  });

  const voltaiEdges = result.edges.map((e, index) => ({
    id: `ve-ai-${Date.now()}-${index}`,
    source: e.source,
    target: e.target,
    sourceHandle: null,
    targetHandle: null,
    role: (e.kind === "power" ? "power" : e.kind === "signal" ? "signal" : "control") as VoltaiDiagramEdge["role"],
  }));

  useVoltaiStore.getState().setAll(voltaiComponents, voltaiEdges);

  // 3. Map and deploy standard compliant Ladder rungs & Shared tags (useEditorStore)
  const ladderRungs: LadderRung[] = [];
  const motorList =
    result.motors && result.motors.length > 0
      ? result.motors
      : result.nodes
          .filter((n) => n.kind.toLowerCase().includes("motor"))
          .map((n) => ({ id: n.id, startMethod: "DOL" }));

  motorList.forEach((motor, i) => {
    const motorId = motor.id || `M${i + 1}`;
    const kmId = `KM${i + 1}`;

    // Rung 1: Direct-on-Line (DOL) Command & Seal contact
    const r1: LadderRung = {
      id: `rung-ai-${Date.now()}-motor-${i}-cmd`,
      label: `Partida do Motor ${motorId} (Selo de KM)`,
      cells: [
        [
          { kind: "XIC", operand: `%I0.${i * 4}` }, // Motor Overload/Breaker OK
          { kind: "XIC", operand: `%I0.${i * 4 + 1}` }, // Start Push-Button
          { kind: "XIO", operand: `%I0.${i * 4 + 2}` }, // Stop Push-Button
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "OTE", operand: `%Q0.${i * 2}` }, // Contactor command
        ],
        [
          { kind: "EMPTY", operand: "" },
          { kind: "XIC", operand: `%Q0.${i * 2}` }, // Seal contact
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
        ],
      ],
    };
    ladderRungs.push(r1);

    // Rung 2: Motor Protection Tripped Alarm Lamp
    const r2: LadderRung = {
      id: `rung-ai-${Date.now()}-motor-${i}-fault`,
      label: `Alarme de Disparo / Falha ${motorId}`,
      cells: [
        [
          { kind: "XIO", operand: `%I0.${i * 4}` }, // NC contact of overload
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "EMPTY", operand: "" },
          { kind: "OTE", operand: `%Q0.${i * 2 + 1}` }, // Alarm Lamp
        ],
      ],
    };
    ladderRungs.push(r2);

    // Register IO Tags in editor store
    useEditorStore.getState().upsertTag({
      id: `%I0.${i * 4}`,
      name: `${motorId}_PROT_OK`,
      type: "BOOL",
      value: true,
      forced: false,
    });
    useEditorStore.getState().upsertTag({
      id: `%I0.${i * 4 + 1}`,
      name: `${motorId}_START`,
      type: "BOOL",
      value: false,
      forced: false,
    });
    useEditorStore.getState().upsertTag({
      id: `%I0.${i * 4 + 2}`,
      name: `${motorId}_STOP`,
      type: "BOOL",
      value: false,
      forced: false,
    });
    useEditorStore.getState().upsertTag({
      id: `%Q0.${i * 2}`,
      name: `${kmId}_CMD`,
      type: "BOOL",
      value: false,
      forced: false,
    });
    useEditorStore.getState().upsertTag({
      id: `%Q0.${i * 2 + 1}`,
      name: `${motorId}_FAULT_LAMP`,
      type: "BOOL",
      value: false,
      forced: false,
    });
  });

  useEditorStore.getState().setRungs(ladderRungs);

  // 4. Map and deploy logical FBD blocks (useEditorStore.fbdNodes / fbdEdges)
  const fbdNodes: FbdNode[] = [];
  const fbdEdges: FbdEdge[] = [];

  motorList.forEach((motor, i) => {
    const motorId = motor.id || `M${i + 1}`;

    // Place an AND block for Protection and Start Buttons
    fbdNodes.push({
      id: `AND_${i + 1}`,
      type: "fbdBlock",
      position: { x: 100, y: 150 + i * 200 },
      data: {
        label: `AND_${i + 1}`,
        type: "AND",
        inputs: [
          { id: "in1", label: "IN1", type: "BOOL" },
          { id: "in2", label: "IN2", type: "BOOL" },
        ],
        outputs: [{ id: "out", label: "OUT", type: "BOOL" }],
        params: undefined,
      },
    });

    // Place a Timer TON block for delayed start/stop
    fbdNodes.push({
      id: `TON_${i + 1}`,
      type: "fbdBlock",
      position: { x: 340, y: 150 + i * 200 },
      data: {
        label: `TON_${i + 1}`,
        type: "TON",
        inputs: [
          { id: "in", label: "IN", type: "BOOL" },
          { id: "pt", label: "PT", type: "INT" },
        ],
        outputs: [
          { id: "q", label: "Q", type: "BOOL" },
          { id: "et", label: "ET", type: "INT" },
        ],
        params: { PT: "T#5s" },
      },
    });

    // Connect the AND output to the TON input
    fbdEdges.push({
      id: `fbd-edge-${Date.now()}-${i}`,
      source: `AND_${i + 1}`,
      target: `TON_${i + 1}`,
      sourceHandle: "out",
      targetHandle: "in",
      style: { stroke: "oklch(0.78 0.17 200)", strokeWidth: 2 },
    });
  });

  useEditorStore.getState().setFbdAll(fbdNodes, fbdEdges);

  void autoSaveVersion(result, nodes, edges);
  return { nodes: nodes.length, edges: edges.length };
}

async function autoSaveVersion(
  result: ArchitectResult,
  nodes: IndustrialNode[],
  edges: IndustrialEdge[],
) {
  try {
    const project = useCurrentProject.getState().project;
    if (!project?.id) return;
    const { data: last } = await supabase
      .from("project_versions")
      .select("version_number")
      .eq("project_id", project.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = ((last as { version_number?: number } | null)?.version_number ?? 0) + 1;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("project_versions").insert({
      project_id: project.id,
      created_by: u.user.id,
      version_number: next,
      snapshot: {
        source: "ai-architect",
        title: result.title,
        rationale: result.rationale,
        transformer: result.transformer,
        ccm: result.ccm,
        nodes,
        edges,
        savedAt: new Date().toISOString(),
      } as Record<string, unknown>,
    });
    useProjectStore.getState().pushLog({
      t: new Date().toISOString(),
      tag: "VERSION",
      msg: `Versão v${next} salva automaticamente`,
      lvl: "ok",
      channel: "IA",
    });
  } catch (e) {
    console.warn("autoSaveVersion failed:", e);
  }
}

export async function saveManualVersion(
  label: string,
): Promise<{ ok: boolean; version?: number; error?: string }> {
  const project = useCurrentProject.getState().project;
  if (!project?.id)
    return { ok: false, error: "Nenhum projeto ativo. Selecione um projeto no Onboarding." };
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Sessão expirada." };
  const { data: last } = await supabase
    .from("project_versions")
    .select("version_number")
    .eq("project_id", project.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = ((last as { version_number?: number } | null)?.version_number ?? 0) + 1;
  const { nodes, edges } = useProjectStore.getState();
  const { error } = await supabase.from("project_versions").insert({
    project_id: project.id,
    created_by: u.user.id,
    version_number: next,
    snapshot: { source: "manual", label, nodes, edges, savedAt: new Date().toISOString() } as Record<string, unknown>,
  });
  if (error) return { ok: false, error: error.message };
  useProjectStore.getState().pushLog({
    t: new Date().toISOString(),
    tag: "SAVE",
    msg: `Snapshot manual v${next} salvo (${label})`,
    lvl: "ok",
    channel: "Eventos",
  });
  return { ok: true, version: next };
}
