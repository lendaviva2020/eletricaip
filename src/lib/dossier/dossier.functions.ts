// Engineering Dossier Server Functions — TanStack Start & Supabase
// Orchestrates reading from Canvas, deterministic calculations, normative checks,
// formal approval gating, revision tracking, and multi-format exports.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { SnapshotSchema, type ProjectSnapshot } from "@/lib/projects.functions";
import { extractCanvasData } from "./extractor";
import { generateElectricalCalculationMemory } from "./calculations";
import { evaluateNormativeCompliance } from "./normative";
import { generateIndustrialBom } from "./bom";
import { generatePlcopenXml, generateStructuredText } from "./plcopen";
import type { CompleteEngineeringDossier, EngineeringApproval } from "./types";
import type { DiagramDoc } from "@/lib/diagram/schema";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { authorizeProjectAccess } from "@/lib/scada/scada.functions";
import { appendAuditEntries } from "@/lib/scada/audit-append.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  blockingUnifilarErrors,
  buildUnifilarMemorial,
  computeRevisionHash,
  sealableContent,
  verifyRevision,
  type RevisionSeal,
} from "./revision-seal";

const APPROVER_ROLES = new Set(["owner", "admin", "engineer"]);

interface AuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
}

export function assembleCompleteDossier(params: {
  projectId: string;
  projectName: string;
  clientName?: string;
  description?: string;
  snapshot: ProjectSnapshot;
  approval?: Partial<EngineeringApproval>;
}): CompleteEngineeringDossier {
  const extracted = extractCanvasData({
    projectId: params.projectId,
    projectName: params.projectName,
    clientName: params.clientName,
    description: params.description,
    snapshot: params.snapshot,
  });

  const calculationMemory = generateElectricalCalculationMemory(extracted);
  // Curto presumido REAL no ponto de cada disjuntor (cálculo de rede do unifilar).
  const diagramDoc = params.snapshot.diagram as DiagramDoc | undefined;
  if (diagramDoc && Object.keys(diagramDoc.nodes ?? {}).length > 0) {
    try {
      const network = analyzeNetwork(diagramDoc);
      for (const c of calculationMemory.circuits) {
        const at = c.breakerEquipmentId ?? c.equipmentId;
        c.presumedIccKa = network.nodes[at]?.Ik3max_kA ?? null;
      }
    } catch {
      // Diagrama inconsistente: o curto fica não calculado (null), nunca presumido.
    }
  }
  const normativeReport = evaluateNormativeCompliance(extracted, calculationMemory);
  const bom = generateIndustrialBom(extracted, calculationMemory);

  const approval: EngineeringApproval = {
    // Nada inventado: sem responsável técnico informado, o campo fica pendente.
    engineerName: params.approval?.engineerName || "Responsável técnico não informado",
    professionalRegistration: params.approval?.professionalRegistration || "Registro não informado",
    issueDate: params.approval?.issueDate || new Date().toLocaleDateString("pt-BR"),
    revision: params.approval?.revision ?? 1,
    isApproved: params.approval?.isApproved ?? false,
    approvalNotes: params.approval?.approvalNotes,
    blockingReasons: normativeReport.findings
      .filter((f) => f.status === "REPROVADO" && f.severity === "critical")
      .map((f) => `[${f.standard} ${f.clause}] ${f.title}: ${f.description}`),
  };

  return {
    dossierId: `dos_${params.projectId}_r${approval.revision}`,
    projectId: params.projectId,
    projectName: params.projectName,
    clientName: params.clientName || "Cliente não informado",
    description: params.description || "",
    scope: extracted.scope,
    createdAt: new Date().toISOString(),
    revision: approval.revision,
    approval,
    calculationMemory,
    normativeReport,
    bom,
    conductorsSchedule: extracted.conductors,
    terminalsSchedule: extracted.terminals,
    panelDocumentation: extracted.panelDocumentation,
    plcProgram: extracted.plcProgram,
    pendingInputs: extracted.pendingInputs,
  };
}

export const getEngineeringDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as unknown as AuthCtx;

    // 1. Carregar projeto e diagrama mais recente
    const [{ data: project, error: pErr }, { data: diagram, error: dErr }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, metadata")
        .eq("id", data.projectId)
        .maybeSingle(),
      supabase
        .from("diagrams")
        .select("id, canvas_data, version, updated_at")
        .eq("project_id", data.projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado");

    const parsedSnap = SnapshotSchema.safeParse(diagram?.canvas_data ?? {});
    const snapshot: ProjectSnapshot = parsedSnap.success
      ? parsedSnap.data
      : {
          schemaVersion: 3,
          project: { nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } },
          voltai: { components: [], edges: [] },
          editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
          plc: {
            vendor: "siemens",
            rack: { id: "rack-1", label: "Rack", modules: [] },
            variables: [],
            programBlocks: [],
            cycleTimeMs: 10,
          },
        };

    const metadata = (project.metadata as Record<string, unknown> | null) ?? {};
    const client = (metadata?.client as string | null) ?? undefined;
    const rev = typeof metadata?.revision === "number" ? metadata.revision : 1;

    const dossier = assembleCompleteDossier({
      projectId: project.id,
      projectName: project.name,
      clientName: client,
      description: project.description ?? undefined,
      snapshot,
      approval: {
        engineerName: (metadata?.engineerName as string) || undefined,
        professionalRegistration: (metadata?.professionalRegistration as string) || undefined,
        revision: rev,
        isApproved: Boolean(metadata?.isApproved),
      },
    });

    return { dossier };
  });

export const approveAndEmitDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        engineerName: z.string().trim().min(2).max(160),
        professionalRegistration: z.string().trim().min(2).max(60),
        artNumber: z.string().trim().max(60).optional(),
        approvalNotes: z.string().max(2000).optional(),
        syncBomToDatabase: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthCtx;
    const { supabase, userId } = authCtx;

    // Só quem responde tecnicamente pelo projeto emite revisão.
    const access = await authorizeProjectAccess(
      authCtx as unknown as Parameters<typeof authorizeProjectAccess>[0],
      data.projectId,
      { requireWrite: true },
    );
    if (!access.role || !APPROVER_ROLES.has(access.role)) {
      throw new Error("FORBIDDEN: Só owner, admin ou engenheiro aprovam uma revisão.");
    }

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, name, description, metadata")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error("DB_ERROR: Falha ao carregar o projeto.");
    if (!project) throw new Error("NOT_FOUND: Projeto não encontrado");

    const { data: diagram, error: dErr } = await supabase
      .from("diagrams")
      .select("canvas_data, version")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dErr) throw new Error("DB_ERROR: Falha ao carregar o diagrama.");

    const snapshot = SnapshotSchema.parse(diagram?.canvas_data ?? {});
    const existingMeta = (project.metadata as Record<string, unknown> | null) ?? {};

    // Revisão = maior versão gravada + 1 (não o contador do metadata, que pode divergir).
    const { data: last, error: lErr } = await supabase
      .from("project_versions")
      .select("version_number")
      .eq("project_id", data.projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) throw new Error("DB_ERROR: Falha ao ler as revisões.");
    const nextRevision = (last?.version_number ?? 0) + 1;

    const dossier = assembleCompleteDossier({
      projectId: project.id,
      projectName: project.name,
      clientName: (existingMeta.client as string) || undefined,
      description: project.description ?? undefined,
      snapshot,
      approval: {
        engineerName: data.engineerName,
        professionalRegistration: data.professionalRegistration,
        revision: nextRevision,
        isApproved: true,
        issueDate: new Date().toLocaleDateString("pt-BR"),
        approvalNotes: data.approvalNotes,
      },
    });

    // ── TRAVA DE SEGURANÇA: não se emite projeto com falha crítica ──────────
    const criticalFailures = dossier.normativeReport.findings.filter(
      (f) => f.status === "REPROVADO" && f.severity === "critical",
    );
    if (criticalFailures.length > 0) {
      throw new Error(
        `BLOQUEIO DE SEGURANÇA: O projeto possui ${criticalFailures.length} não-conformidade(s) crítica(s) de engenharia (ex: ${criticalFailures[0].title}). A aprovação formal é bloqueada até a correção dos apontamentos no Canvas.`,
      );
    }
    const diagramDoc = snapshot.diagram as DiagramDoc | undefined;
    const unifilarErrors = blockingUnifilarErrors(diagramDoc);
    if (unifilarErrors.length > 0) {
      throw new Error(
        `BLOQUEIO DE SEGURANÇA: o unifilar tem ${unifilarErrors.length} erro(s) no diagnóstico (ex.: ${unifilarErrors[0]}). Corrija antes de emitir a revisão.`,
      );
    }

    // ── Selo: SHA-256 do conteúdo + memorial de cálculo ─────────────────────
    const content = snapshot as unknown as Record<string, unknown>;
    const memorial = buildUnifilarMemorial(diagramDoc);
    const hash = await computeRevisionHash(content, memorial);
    const seal: RevisionSeal = {
      algorithm: "SHA-256",
      hash,
      revision: nextRevision,
      approvedAt: new Date().toISOString(),
      approvedBy: userId,
      engineerName: data.engineerName,
      professionalRegistration: data.professionalRegistration,
      ...(data.artNumber ? { artNumber: data.artNumber } : {}),
    };

    const { data: version, error: vErr } = await supabase
      .from("project_versions")
      .insert({
        project_id: data.projectId,
        version_number: nextRevision,
        snapshot: {
          ...sealableContent(content),
          calculationMemorial: memorial,
          engineeringDossierApproval: dossier.approval,
          revisionSeal: seal,
        } as unknown as Json,
        created_by: userId,
      })
      .select("id")
      .single();
    if (vErr || !version) throw new Error("DB_ERROR: Falha ao gravar a revisão aprovada.");

    // Registro na trilha de auditoria encadeada (o cliente não escreve nela).
    await appendAuditEntries(access.tenantId, userId, [
      {
        action: "PROJECT_REVISION_APPROVED",
        resourceType: "project_version",
        resourceId: version.id,
        details: {
          projectId: data.projectId,
          revision: nextRevision,
          sha256: hash,
          engineerName: data.engineerName,
          professionalRegistration: data.professionalRegistration,
          artNumber: data.artNumber ?? null,
        },
      },
    ]);

    const { error: mErr } = await supabase
      .from("projects")
      .update({
        metadata: {
          ...existingMeta,
          revision: nextRevision,
          engineerName: data.engineerName,
          professionalRegistration: data.professionalRegistration,
          isApproved: true,
          lastEmittedAt: seal.approvedAt,
          approvedRevision: { revision: nextRevision, versionId: version.id, sha256: hash },
        } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId);
    if (mErr) throw new Error("DB_ERROR: Revisão gravada, mas o projeto não foi atualizado.");

    if (data.syncBomToDatabase) {
      const { error: delErr } = await supabase
        .from("project_bom_items")
        .delete()
        .eq("project_id", data.projectId)
        .eq("source", "canvas_dossier");
      if (delErr) throw new Error("DB_ERROR: Falha ao atualizar a lista de materiais.");
      const insertRows = dossier.bom.map((b) => ({
        project_id: data.projectId,
        part_number: b.tag,
        description: b.description,
        manufacturer: b.manufacturer ?? "A especificar",
        quantity: b.quantity,
        unit: b.unit,
        reference: b.circuitRef ?? null,
        notes: `[${b.category}] ${b.notes ?? ""}`,
        source: "canvas_dossier",
        created_by: userId,
      }));
      if (insertRows.length > 0) {
        const { error: insErr } = await supabase.from("project_bom_items").insert(insertRows);
        if (insErr) throw new Error("DB_ERROR: Falha ao gravar a lista de materiais.");
      }
    }

    return {
      success: true,
      revision: nextRevision,
      sha256: hash,
      versionId: version.id,
      dossier,
    };
  });

/**
 * Confere a integridade das revisões aprovadas: recalcula o SHA-256 de cada
 * revisão gravada e compara com o hash registrado na auditoria. Também diz se
 * o projeto atual foi alterado desde a última revisão aprovada.
 */
export const verifyApprovedRevisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const authCtx = context as unknown as AuthCtx;
    const { supabase } = authCtx;
    const access = await authorizeProjectAccess(
      authCtx as unknown as Parameters<typeof authorizeProjectAccess>[0],
      data.projectId,
    );

    const { data: versions, error } = await supabase
      .from("project_versions")
      .select("id, version_number, created_at, snapshot")
      .eq("project_id", data.projectId)
      .order("version_number", { ascending: false })
      .limit(20);
    if (error) throw new Error("DB_ERROR: Falha ao ler as revisões.");

    const sealed = (versions ?? []).filter(
      (v) => (v.snapshot as Record<string, unknown> | null)?.revisionSeal,
    );
    const ids = sealed.map((v) => v.id);
    const audited = new Map<string, string>();
    if (ids.length > 0) {
      const { data: logs, error: aErr } = await supabaseAdmin
        .from("audit_logs")
        .select("resource_id, details")
        .eq("tenant_id", access.tenantId)
        .eq("action", "PROJECT_REVISION_APPROVED")
        .in("resource_id", ids);
      if (aErr) throw new Error("DB_ERROR: Falha ao ler a auditoria.");
      for (const l of logs ?? []) {
        const sha = (l.details as Record<string, unknown> | null)?.sha256;
        if (typeof sha === "string" && l.resource_id) audited.set(l.resource_id, sha);
      }
    }

    const results = [];
    for (const v of sealed) {
      const snap = v.snapshot as Record<string, unknown>;
      const seal = snap.revisionSeal as RevisionSeal;
      const auditedHash = audited.get(v.id);
      const check = await verifyRevision(snap, auditedHash);
      results.push({
        versionId: v.id,
        revision: v.version_number,
        approvedAt: seal.approvedAt,
        engineerName: seal.engineerName,
        professionalRegistration: seal.professionalRegistration,
        artNumber: seal.artNumber ?? null,
        hash: seal.hash,
        audited: Boolean(auditedHash),
        status: check.status,
      });
    }

    // Projeto atual × última revisão aprovada.
    let changedSinceApproval: boolean | null = null;
    if (results.length > 0) {
      const { data: diagram } = await supabase
        .from("diagrams")
        .select("canvas_data")
        .eq("project_id", data.projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const parsed = SnapshotSchema.safeParse(diagram?.canvas_data ?? {});
      if (parsed.success) {
        const content = parsed.data as unknown as Record<string, unknown>;
        const memorial = buildUnifilarMemorial(parsed.data.diagram as DiagramDoc | undefined);
        changedSinceApproval = (await computeRevisionHash(content, memorial)) !== results[0].hash;
      }
    }

    return { revisions: results, changedSinceApproval };
  });
