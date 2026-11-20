import { currentStudioModel } from "@/lib/compact-studio/integration/legacy-fbd-migration";
import { supabase } from "@/integrations/supabase/client";
import {
  useProjectStore,
  type IndustrialNode,
  type IndustrialEdge,
  type NodeKind,
  type NodeCategory,
} from "@/lib/project-store";
import { useCurrentProject } from "@/lib/current-project";
import { SnapshotSchema } from "@/lib/projects.functions";
import { markAllUnconfirmed } from "@/lib/diagram/unconfirmed-params";
import { buildLadderFromUnifilar, mergeUnifilarRungs } from "@/lib/ladder/from-unifilar";
import { syncMotorLogicFromUnifilar } from "@/lib/compact-studio/integration/unifilar-motor-program";
import { generateArchitecture, pingArchitect } from "@/lib/ai-architect.functions";
import { recordAiStatusEvent, listAiStatusEvents } from "@/lib/tenant-settings.functions";

import { useEditorStore } from "@/lib/editor/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { buildProjectSnapshot } from "@/lib/use-project-persistence";
import type { VerificationReport } from "@/lib/ai/verification-types";
import { useDiagramStore } from "@/lib/diagram/store";
import { makeNode, makeEdge, createEmptyDoc } from "@/lib/diagram/model";
import { repairDiagramConnections } from "@/lib/diagram/connection/connection-repair-engine";
import { autoLayoutIndustrialDiagram } from "@/lib/diagram/connection/auto-layout-router";
import {
  buildCanonicalDiagramParams,
  resolveComponentKind,
} from "@/lib/importer/universal-importer";
import type { DiagramDoc, NodeKind as DiagramNodeKind } from "@/lib/diagram/schema";

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
  verification?: VerificationReport;
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
          "Acesse aistudio.google.com/app/apikey e gere uma nova chave de API do Google Gemini.",
          "Nos secrets do servidor (Vercel ou Supabase), configure GEMINI_API_KEY.",
          "Volte aqui e clique em 'Revalidar agora' na tela de Status da IA.",
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
      return new AIServiceError(code, message, "Cota da conta Google Gemini esgotada.", [
        "Verifique o plano e faturamento em aistudio.google.com ou Google Cloud Console.",
        "Recarregue a página e tente novamente.",
      ]);
    case "UPSTREAM_5XX":
      return new AIServiceError(
        code,
        message,
        "Serviço Google Gemini temporariamente indisponível. Tente em alguns segundos.",
      );
    default:
      return new AIServiceError(code || "UNKNOWN", message, message);
  }
}

// --- Status tracking (for the Status page + global counters) ---------------
const STATUS_KEY = "eletricai.ai.statusEvents";
type StatusEvent = { ts: number; ok: boolean; code?: string; ms: number };

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
  // Best-effort persistence to Supabase (tenant-scoped). Ignored when
  // user is not authenticated yet.
  void supabase.auth.getUser().then(({ data }) => {
    if (!data.user) return;
    recordAiStatusEvent({
      data: { ok: ev.ok, code: ev.code, latencyMs: ev.ms },
    }).catch(() => {
      /* swallow — local copy already kept */
    });
  });
}

export async function fetchAiStatusEvents(): Promise<StatusEvent[]> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return getStatusEvents();
    const rows = await listAiStatusEvents({ data: { limit: 50 } });
    return rows.map((r) => ({
      ts: new Date(r.created_at).getTime(),
      ok: r.ok,
      code: r.code ?? undefined,
      ms: r.latency_ms,
    }));
  } catch {
    return getStatusEvents();
  }
}

/**
 * Triggers the AI credits badge to refetch its server-side quota.
 * The quota itself is enforced server-side (requireAiQuota middleware) —
 * this is purely a UI refresh signal.
 */
function notifyAiUsageChanged() {
  if (typeof window === "undefined") return;
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
  briefingDocument?: {
    fileName: string;
    mimeType?: string;
    content: string;
    encoding?: "utf8" | "base64";
  },
  locale: "pt-BR" | "en" = "pt-BR",
): Promise<ArchitectResult> {
  const context = includeContext
    ? { nodes: useProjectStore.getState().nodes, edges: useProjectStore.getState().edges }
    : undefined;
  const t0 = Date.now();
  try {
    const res = await generateArchitecture({
      data: {
        prompt,
        context,
        locale,
        ...(briefingDocument
          ? {
              briefingDocument: {
                ...briefingDocument,
                encoding: briefingDocument.encoding ?? "utf8",
              },
            }
          : {}),
      },
    });
    if (!res.ok) {
      pushStatus({ ts: Date.now(), ok: false, code: res.error.code, ms: Date.now() - t0 });
      throw mapError(res.error.code, res.error.message);
    }
    pushStatus({ ts: Date.now(), ok: true, ms: Date.now() - t0 });
    notifyAiUsageChanged();
    return {
      ...(res.system as unknown as ArchitectResult),
      verification: res.verification,
    };
  } catch (e) {
    if (e instanceof AIServiceError) throw e;
    pushStatus({ ts: Date.now(), ok: false, code: "NETWORK", ms: Date.now() - t0 });
    throw mapError("NETWORK", (e as Error).message);
  }
}

// Cache curto: o health-check chama o provedor externo (1-3s). Sem isso,
// cada remontagem do banner dispara um novo ping + gravação de evento, o que
// gera enxame de requisições canceladas (AbortError) no dev server.
const HEALTH_TTL_MS = 60_000;
let healthCache: { at: number; promise: Promise<unknown> } | undefined;

export function pingArchitectHealth(): Promise<unknown> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return healthCache.promise;
  }
  const promise = runHealthPing();
  healthCache = { at: Date.now(), promise };
  return promise;
}

async function runHealthPing(): Promise<unknown> {
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

/**
 * Converts ArchitectResult into a fully connected, standards-compliant DiagramDoc.
 * Guarantees that busbar branches, contactors, overloads, and motors are wired.
 */
export function convertArchitectResultToDiagramDoc(
  result: ArchitectResult,
  baseDoc?: DiagramDoc,
  mode: "replace" | "merge" = "replace",
): DiagramDoc {
  const doc: DiagramDoc =
    mode === "merge" && baseDoc ? JSON.parse(JSON.stringify(baseDoc)) : createEmptyDoc();

  doc.metadata = {
    title: result.title || doc.metadata.title,
    norms: ["NBR 5410", "IEC 60947", "IEC 60204-1"],
  };

  const idMap = new Map<string, string>();
  const tagOrLabelToId = new Map<string, string>();

  // 1. Process and add Diagram Nodes
  for (const n of result.nodes) {
    const kind = (resolveComponentKind(n.kind) || n.kind || "motor") as DiagramNodeKind;
    const finalId =
      mode === "merge" && doc.nodes[n.id] ? `${n.id}_${Date.now().toString(36).slice(-4)}` : n.id;
    idMap.set(n.id, finalId);
    tagOrLabelToId.set(n.id, finalId);
    if (n.label) tagOrLabelToId.set(n.label, finalId);

    const canonicalParams = buildCanonicalDiagramParams(
      kind,
      (n.params as Record<string, any>) ?? {},
    );

    const newNode = makeNode({
      id: finalId,
      sheet: "unifilar",
      // Valores nominais da IA ficam pendentes de confirmação do engenheiro.
      params: markAllUnconfirmed(canonicalParams),
      position: n.position || { x: 100, y: 100 },
      label: n.label || n.id,
      rotation: 0,
    });
    doc.nodes[finalId] = newNode;
  }

  // 2. Process and add Diagram Edges
  const busbarTapCount = new Map<string, number>();
  for (let i = 0; i < result.edges.length; i++) {
    const e = result.edges[i];
    const srcId = tagOrLabelToId.get(e.source) || idMap.get(e.source) || e.source;
    const tgtId = tagOrLabelToId.get(e.target) || idMap.get(e.target) || e.target;

    if (!doc.nodes[srcId] || !doc.nodes[tgtId]) continue;

    const edgeId = mode === "merge" ? `e_ai_${Date.now().toString(36)}_${i}` : `e_ai_${i + 1}`;

    let sourcePort = "B";
    if (doc.nodes[srcId]?.params.kind === "busbar") {
      const count = (busbarTapCount.get(srcId) || 0) + 1;
      busbarTapCount.set(srcId, count);
      const taps = ["B1", "B2", "B3", "B4", "B"];
      sourcePort = taps[(count - 1) % taps.length];
    }
    const targetPort = "T";

    const newEdge = makeEdge({
      id: edgeId,
      source: srcId,
      target: tgtId,
      sourcePort,
      targetPort,
      kind: e.kind === "signal" ? "signal" : "power",
      sheet: "unifilar",
      circuitConfig: "3F+N+PE",
    });
    doc.edges[edgeId] = newEdge;
  }

  // 3. Deterministically repair any missing or broken topological links
  const repaired = repairDiagramConnections(doc);
  let finalDoc = repaired.repairedDoc;

  // 4. Auto-layout spacing
  try {
    finalDoc = autoLayoutIndustrialDiagram(finalDoc);
  } catch (layoutErr) {
    console.warn("[convertArchitectResultToDiagramDoc] autoLayout:", layoutErr);
  }

  return finalDoc;
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
    params: (n.params as Record<string, string | number | boolean>) ?? {},
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

  // 2. Map and deploy Unifilar Diagram (useDiagramStore)
  const diagramDoc = convertArchitectResultToDiagramDoc(
    result,
    useDiagramStore.getState().doc,
    opts.mode,
  );
  useDiagramStore.getState().loadDoc(diagramDoc);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("eletricai-fit-view"));
  }

  // 3. Ladder: o MESMO projeto do unifilar (fonte única). Antes o Arquiteto
  //    gerava redes próprias com endereços %I inventados e parada em XIO (botão
  //    NA: fio rompido não parava o motor).
  const ladder = buildLadderFromUnifilar(diagramDoc);
  const editor = useEditorStore.getState();
  for (const tag of ladder.tags) {
    if (!editor.editorTags[tag.id]) editor.upsertTag(tag);
  }
  editor.setRungs((prev) =>
    opts.mode === "replace"
      ? mergeUnifilarRungs(
          prev.filter((r) => r.source?.kind === "unifilar"),
          ladder.rungs,
        )
      : mergeUnifilarRungs(prev, ladder.rungs),
  );

  // 4. FB Electric Studio: lógica de comando dos motores do unifilar (página
  //    "uf-motors", idempotente). Antes: blocos AND/TON soltos sem ligação.
  try {
    const { model } = syncMotorLogicFromUnifilar(currentStudioModel(), diagramDoc);
    useUnifiedProjectStore.getState().setCompactStudioProgram(model);
  } catch (err) {
    console.warn("[FB Electric Studio] lógica do unifilar não aplicada:", err);
  }

  // 5. Synchronize canonical UnifiedProjectDoc
  try {
    const snap = buildProjectSnapshot();
    const currentMeta = useUnifiedProjectStore.getState().doc.metadata;
    useUnifiedProjectStore
      .getState()
      .hydrateFromV2Snapshot(snap, currentMeta, { syncLegacy: false });
  } catch (err) {
    console.warn("[applyArchitectToStore] unified store sync:", err);
  }

  // A gravação é responsabilidade de quem aplica: o /ai cria o projeto e salva o
  // snapshot completo; no workspace, o autosave do projeto aberto grava.
  // (Antes uma "versão" em formato próprio era inserida no projeto aberto — não
  // restaurável e gravada até no projeto errado.)
  return { nodes: nodes.length, edges: edges.length };
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
  // Snapshot COMPLETO do projeto (o mesmo do autosave), validado: só assim a
  // versão pode ser restaurada. Antes gravava só {nodes, edges} e restaurar
  // essa versão deixava o canvas vazio.
  const parsed = SnapshotSchema.safeParse(buildProjectSnapshot());
  if (!parsed.success) return { ok: false, error: "Estado do projeto inválido para versionar." };
  void label;
  const { error } = await supabase.from("project_versions").insert({
    project_id: project.id,
    created_by: u.user.id,
    version_number: next,
    snapshot: parsed.data as never,
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
