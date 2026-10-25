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
  const normativeReport = evaluateNormativeCompliance(extracted, calculationMemory);
  const bom = generateIndustrialBom(extracted, calculationMemory);

  const approval: EngineeringApproval = {
    engineerName: params.approval?.engineerName || "Engenheiro Responsável Técnico",
    professionalRegistration: params.approval?.professionalRegistration || "CREA / CFT — Emissão Inicial",
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
    clientName: params.clientName || "Cliente Industrial",
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
          plc: { vendor: "siemens", rack: { id: "rack-1", label: "Rack", modules: [] }, variables: [], programBlocks: [], cycleTimeMs: 10 },
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
        engineerName: z.string().min(2).max(160),
        professionalRegistration: z.string().min(2).max(60),
        approvalNotes: z.string().max(2000).optional(),
        syncBomToDatabase: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as AuthCtx;

    // Carregar projeto
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, name, description, metadata")
      .eq("id", data.projectId)
      .maybeSingle();

    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Projeto não encontrado");

    const { data: diagram } = await supabase
      .from("diagrams")
      .select("canvas_data, version")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = SnapshotSchema.parse(diagram?.canvas_data ?? {});
    const existingMeta = (project.metadata as Record<string, unknown> | null) ?? {};
    const nextRevision = (Number(existingMeta.revision) || 1) + 1;

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

    // ── TRAVA DE SEGURANÇA OBRIGATÓRIA (SAFETY FIRST) ───────────────────────
    // Se houver qualquer falha normativa crítica (ex: falta de E-STOP, sobrecorrente sem proteção, condutor violado),
    // a emissão técnica formal é terminantemente BLOQUEADA!
    const criticalFailures = dossier.normativeReport.findings.filter(
      (f) => f.status === "REPROVADO" && f.severity === "critical",
    );

    if (criticalFailures.length > 0) {
      throw new Error(
        `BLOQUEIO DE SEGURANÇA: O projeto possui ${criticalFailures.length} não-conformidade(s) crítica(s) de engenharia (ex: ${criticalFailures[0].title}). A aprovação formal é bloqueada até a correção dos apontamentos no Canvas.`,
      );
    }

    // 1. Gravar revisão oficial em project_versions
    await supabase.from("project_versions").insert({
      project_id: data.projectId,
      version_number: nextRevision,
      snapshot: {
        ...snapshot,
        engineeringDossierApproval: dossier.approval,
      } as unknown as Json,
      created_by: userId,
    });

    // 2. Atualizar metadados do projeto
    await supabase
      .from("projects")
      .update({
        metadata: {
          ...existingMeta,
          revision: nextRevision,
          engineerName: data.engineerName,
          professionalRegistration: data.professionalRegistration,
          isApproved: true,
          lastEmittedAt: new Date().toISOString(),
        } as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId);

    // 3. Sincronizar BOM gerado no banco se solicitado
    if (data.syncBomToDatabase) {
      // Deletar itens gerados automaticamente anteriores
      await supabase
        .from("project_bom_items")
        .delete()
        .eq("project_id", data.projectId)
        .eq("source", "canvas_dossier");

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
        await supabase.from("project_bom_items").insert(insertRows);
      }
    }

    return {
      success: true,
      revision: nextRevision,
      dossier,
    };
  });
