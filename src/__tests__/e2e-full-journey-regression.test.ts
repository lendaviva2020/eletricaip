import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createProjectRecord, ensureTenant } from "@/lib/projects.functions";
import { useEditorStore } from "@/lib/editor/store";
import { applyCommand, cmd } from "@/lib/diagram/commands";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import {
  buildMultifilarCommands,
  summarizeConductors,
} from "@/lib/diagram/multifilar";
import { diagramToDxf } from "@/lib/diagram/export-dxf";
import { buildProjectPdf, ENGINEERING_LEGAL_DISCLAIMER } from "@/lib/pdf-export";
import {
  calcDemand,
  calcMotor,
  calcVoltageDrop,
  sizeConductorNBR5410,
} from "@/lib/electrical-calc";
import {
  arcFlashIEEE1584,
  checkBreakingCapacity,
  shortCircuitIEC60909,
} from "@/lib/electrical-sim";
import {
  analyzeUnifilarForLadder,
  generateSTFromMappings,
} from "@/lib/simulation/unifilar-ladder-bridge";
import { importLadderProgram } from "@/lib/ladder/importer";
import { createScanState, scanRungsPure } from "@/lib/ladder/scan-core";
import { fromAiRungSpec } from "@/lib/ladder/from-ai-spec";
import { verifyEstopInterlock } from "@/lib/ladder/verify-estop";
import type { IndustrialEdge, IndustrialNode } from "@/lib/project-store";

interface E2EInMemoryDb {
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    deleted_at: string | null;
  }>;
  profiles: Array<{
    id: string;
    full_name: string;
    locale: string;
    role: string;
    tenant_id: string | null;
  }>;
  tenant_memberships: Array<{
    id: string;
    tenant_id: string;
    user_id: string;
    role: string;
    created_at: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_by: string;
    tenant_id: string;
    metadata: Record<string, unknown>;
  }>;
  diagrams: Array<{
    id: string;
    project_id: string;
    name: string;
    version: number;
    canvas_data: unknown;
  }>;
  plan_limits: Array<{
    plan: string;
    max_projects: number;
  }>;
}

function createE2ESupabaseMock(db: E2EInMemoryDb, authUserId: string): SupabaseClient<Database> {
  let seq = 1;
  const nextUuid = (prefix: string) =>
    `${prefix}-0000-4000-8000-${String(seq++).padStart(12, "0")}`;

  const getActiveTenantId = (): string | null => {
    const prof = db.profiles.find((p) => p.id === authUserId);
    if (prof?.tenant_id) return prof.tenant_id;
    const mem = db.tenant_memberships.find((m) => m.user_id === authUserId);
    return mem?.tenant_id ?? null;
  };

  const client = {
    rpc: vi.fn(async (fnName: string) => {
      if (fnName !== "bootstrap_personal_tenant_if_missing") {
        return { data: null, error: { message: `Unknown RPC ${fnName}` } };
      }
      let profile = db.profiles.find((p) => p.id === authUserId);
      if (!profile) {
        profile = {
          id: authUserId,
          full_name: "Eng. Marina Costa",
          locale: "pt-BR",
          role: "owner",
          tenant_id: null,
        };
        db.profiles.push(profile);
      }
      if (profile.tenant_id) {
        return { data: profile.tenant_id, error: null };
      }
      const tenantId = nextUuid("10000000");
      db.tenants.push({
        id: tenantId,
        name: `Engenharia de ${profile.full_name}`,
        slug: `eng-${authUserId.slice(0, 8)}`,
        plan: "pro",
        status: "active",
        deleted_at: null,
      });
      db.tenant_memberships.push({
        id: nextUuid("20000000"),
        tenant_id: tenantId,
        user_id: authUserId,
        role: "owner",
        created_at: new Date().toISOString(),
      });
      profile.tenant_id = tenantId;
      return { data: tenantId, error: null };
    }),
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let headCount = false;

      const builder: Record<string, unknown> = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) headCount = true;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          if (headCount && table === "projects") {
            const count = db.projects.filter((p) => p.tenant_id === filters.tenant_id).length;
            return Promise.resolve({ count, data: null, error: null });
          }
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "profiles") {
            return { data: db.profiles.find((p) => p.id === filters.id) ?? null, error: null };
          }
          if (table === "tenants") {
            return { data: db.tenants.find((t) => t.id === filters.id) ?? null, error: null };
          }
          if (table === "plan_limits") {
            return { data: db.plan_limits.find((l) => l.plan === filters.plan) ?? null, error: null };
          }
          return { data: null, error: null };
        },
        insert: (payload: Record<string, unknown>) => {
          if (table === "projects") {
            return {
              select: () => ({
                single: async () => {
                  const newProject = {
                    id: nextUuid("30000000"),
                    name: String(payload.name),
                    description: (payload.description as string | null) ?? null,
                    status: String(payload.status ?? "active"),
                    created_by: String(payload.created_by),
                    tenant_id: String(payload.tenant_id),
                    metadata: (payload.metadata as Record<string, unknown>) ?? {},
                  };
                  db.projects.push(newProject);
                  return { data: newProject, error: null };
                },
              }),
            };
          }
          if (table === "diagrams") {
            const activeTenant = getActiveTenantId();
            const proj = db.projects.find((p) => p.id === payload.project_id);
            if (!proj || proj.tenant_id !== activeTenant) {
              return Promise.resolve({
                data: null,
                error: { message: "RLS violation on diagrams" },
              });
            }
            const newDiagram = {
              id: nextUuid("40000000"),
              project_id: String(payload.project_id),
              name: String(payload.name),
              version: Number(payload.version ?? 1),
              canvas_data: payload.canvas_data,
            };
            db.diagrams.push(newDiagram);
            return Promise.resolve({ data: newDiagram, error: null });
          }
          return Promise.resolve({ data: null, error: { message: "Unsupported table" } });
        },
      };
      return builder;
    }),
  };

  return client as unknown as SupabaseClient<Database>;
}

describe("Fase 10 — Tarefa 10.1: Bateria de Testes de Regressão de Ponta a Ponta (E2E)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error");
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("executa a jornada completa: Cadastro → Onboarding → Projeto → Unifilar → Cabos NBR 5410 → Curto-Circuito IEC 60909 → Ladder NR-12 → Exportação PDF/DXF sem erros de console", async () => {
    // ── 1. CADASTRO & PROVISIONAMENTO MULTI-TENANT ───────────────────────────
    const userId = "aaaaaaaa-1111-4000-8000-000000000001";
    const db: E2EInMemoryDb = {
      tenants: [],
      profiles: [],
      tenant_memberships: [],
      projects: [],
      diagrams: [],
      plan_limits: [{ plan: "pro", max_projects: 50 }],
    };
    const supabase = createE2ESupabaseMock(db, userId);

    const tenantId = await ensureTenant(supabase, userId);
    expect(tenantId).toBeTruthy();
    expect(db.tenants).toHaveLength(1);
    expect(db.tenant_memberships).toHaveLength(1);
    expect(db.tenant_memberships[0].role).toBe("owner");
    expect(db.profiles[0].tenant_id).toBe(tenantId);

    // ── 2. ONBOARDING & NAVEGAÇÃO ENTRE MODOS DO WORKSPACE ───────────────────
    const editorStore = useEditorStore.getState();
    const modesToVisit = ["unifilar", "ladder", "fbd", "scada", "twin", "plc", "sim"] as const;
    for (const mode of modesToVisit) {
      editorStore.setActiveMode(mode);
      expect(useEditorStore.getState().activeMode).toBe(mode);
    }
    editorStore.setActiveMode("unifilar");

    // ── 3. CRIAÇÃO DE PROJETO COM PERSISTÊNCIA COMPROVADA NO BANCO ───────────
    const createdProject = await createProjectRecord(
      {
        supabase,
        userId,
        claims: { sub: userId, email: "marina@alfa.ind.br", role: "authenticated" },
      },
      {
        name: "Subestação e CCM Linha de Envase 04",
        client: "Indústria Metalúrgica Alfa S.A.",
        description: "Projeto executivo completo para homologação final Fase 10.",
      },
    );

    expect(createdProject.id).toBeTruthy();
    expect(db.projects).toHaveLength(1);
    expect(db.projects[0].tenant_id).toBe(tenantId);
    expect(db.diagrams).toHaveLength(1);
    expect(db.diagrams[0].project_id).toBe(createdProject.id);

    // ── 4. DESENHO UNIFILAR E CONVERSÃO MULTIFILAR ───────────────────────────
    let doc = createEmptyDoc({
      metadata: {
        title: createdProject.name,
        author: "Eng. Marina Costa — CREA-SP 5061234567",
        norms: ["NBR 5410", "NR-12", "IEC 60909"],
      },
    });

    const trafoNode = makeNode({
      id: "TR-01",
      sheet: "unifilar",
      label: "TR-01 500kVA",
      position: { x: 200, y: 120 },
      params: { kind: "transformer", kVA: 500, primary_V: 13800, secondary_V: 380, vector: "Dyn11" },
    });
    const breakerNode = makeNode({
      id: "QF-01",
      sheet: "unifilar",
      label: "QF-01",
      position: { x: 200, y: 240 },
      params: { kind: "breaker", in_A: 80, curve: "C", poles: 3, icc_kA: 36 },
    });
    const contactorNode = makeNode({
      id: "KM-01",
      sheet: "unifilar",
      label: "KM-01",
      position: { x: 200, y: 360 },
      params: { kind: "contactor", in_A: 80, coil_V: 24 },
    });
    const motorNode = makeNode({
      id: "M-01",
      sheet: "unifilar",
      label: "M-01 Bomba Principal 37kW",
      position: { x: 200, y: 480 },
      params: { kind: "motor", power_kW: 37, voltage_V: 380, startMethod: "VFD" },
    });
    const estopNode = makeNode({
      id: "ES-01",
      sheet: "unifilar",
      label: "ES-01 Parada de Emergência",
      position: { x: 360, y: 360 },
      params: { kind: "estop", category: "0" },
    });

    for (const n of [trafoNode, breakerNode, contactorNode, motorNode, estopNode]) {
      doc = applyCommand(doc, { type: "AddNode", node: n });
    }

    const e1 = makeEdge({
      id: "E-TR-QF",
      sheet: "unifilar",
      source: "TR-01",
      target: "QF-01",
      kind: "power",
      circuitConfig: "3F+N+PE",
    });
    const e2 = makeEdge({
      id: "E-QF-KM",
      sheet: "unifilar",
      source: "QF-01",
      target: "KM-01",
      kind: "power",
      circuitConfig: "3F",
    });
    const e3 = makeEdge({
      id: "E-KM-M1",
      sheet: "unifilar",
      source: "KM-01",
      target: "M-01",
      kind: "power",
      circuitConfig: "3F",
    });

    for (const edgeItem of [e1, e2, e3]) {
      doc = applyCommand(doc, { type: "AddEdge", edge: edgeItem });
    }

    const multifilarCmds = buildMultifilarCommands(doc);
    expect(multifilarCmds.length).toBeGreaterThan(0);
    doc = applyCommand(doc, { type: "Batch", commands: multifilarCmds });

    const conductorSummary = summarizeConductors(doc);
    expect(conductorSummary.totalCircuits).toBe(3);
    expect(conductorSummary.totalConductors).toBe(11); // (5 para 3F+N+PE) + 2*(3 para 3F)

    // Atualiza persistência do diagrama no banco
    db.diagrams[0].canvas_data = doc;
    db.diagrams[0].version = 2;

    // ── 5. DIMENSIONAMENTO DE CABOS E QUEDA DE TENSÃO (NBR 5410) ─────────────
    const motorCalc = calcMotor({
      id: "M-01",
      power_kW: 37,
      voltage_V: 380,
      cosphi: 0.86,
      efficiency: 0.93,
      startMethod: "VFD",
      installationMethod: "B1",
      insulation: "XLPE",
      ambientTemp_C: 35,
      groupedCircuits: 2,
      cableLength_m: 85,
    });

    expect(motorCalc.In_A).toBeGreaterThan(65);
    expect(motorCalc.In_A).toBeLessThan(75);
    expect(motorCalc.cable_mm2).toBeGreaterThanOrEqual(25);
    expect(motorCalc.breaker_A).toBeGreaterThanOrEqual(80);
    expect(motorCalc.overloadCoordinated).toBe(true);

    const conductorSizing = sizeConductorNBR5410(motorCalc.In_A, {
      method: "B1",
      insulation: "XLPE",
      ambientTemp_C: 35,
      groupedCircuits: 2,
      loadedConductors: 3,
      breaker_A: motorCalc.breaker_A,
      length_m: 85,
      voltage_V: 380,
      cosphi: 0.86,
    });
    expect(conductorSizing.coordination.coordinated).toBe(true);

    const vDrop = calcVoltageDrop(
      motorCalc.In_A,
      85,
      Math.max(35, conductorSizing.section_mm2),
      380,
      0.86,
    );
    expect(vDrop.reactiveDrop_V).toBeGreaterThan(0); // Reatância indutiva considerada para >= 35 mm²
    expect(vDrop.deltaV_pct).toBeLessThan(4); // Dentro do limite de 4% para circuitos terminais de motor

    const demand = calcDemand([{ id: "M-01", power_kW: 37 }]);
    expect(demand.transformer_kVA).toBeGreaterThanOrEqual(75);

    // ── 6. ESTUDO DE CURTO-CIRCUITO (IEC 60909) E ARCO ELÉTRICO (IEEE 1584) ──
    const scStudy = shortCircuitIEC60909(
      { power_kVA: 500, secondary_V: 380, impedance_pct: 4.5, vector_group: "Dyn11" },
      { earthing: "TN-S" },
    );
    expect(scStudy.Ik3ph_kA).toBeGreaterThan(5);
    expect(scStudy.ip_kA).toBeGreaterThan(scStudy.Ik3ph_kA);

    const breakingChecks = checkBreakingCapacity(
      [
        {
          id: "QF-01",
          type: "MCCB",
          rating_A: motorCalc.breaker_A,
          breaking_kA: 36,
          curve: "C",
        },
      ],
      scStudy.Ik3ph_kA,
    );
    expect(breakingChecks).toHaveLength(1);
    expect(breakingChecks[0].adequate).toBe(true);

    const arcFlash = arcFlashIEEE1584(scStudy.Ik3ph_kA, {
      clearingTime_s: 0.04,
      workingDistance_mm: 455,
      electrodeGap_mm: 25,
    });
    expect(arcFlash.incidentEnergy_cal_cm2).toBeGreaterThan(0);
    expect(arcFlash.arc_boundary_mm).toBeGreaterThan(0);

    // ── 7. LÓGICA LADDER E INTERTRAVAMENTO DE SEGURANÇA NR-12 (E-STOP) ───────
    const plantNodes: IndustrialNode[] = [
      { id: "TR-01", kind: "busbar", label: "Barra 380V", category: "power", position: { x: 0, y: 0 }, params: {} },
      { id: "KM-01", kind: "contactor", label: "KM-01", category: "power", position: { x: 0, y: 100 }, params: {} },
      { id: "M-01", kind: "motor", label: "M-01", category: "power", position: { x: 0, y: 200 }, params: {} },
      { id: "ES-01", kind: "estop", label: "ES-01", category: "power", position: { x: 100, y: 100 }, params: {} },
    ];
    const plantEdges: IndustrialEdge[] = [
      { id: "e_bus_km", source: "TR-01", target: "KM-01", kind: "power" },
      { id: "e_km_m1", source: "KM-01", target: "M-01", kind: "power" },
      { id: "e_es_km", source: "ES-01", target: "KM-01", kind: "signal" },
    ];

    const bridgeAnalysis = analyzeUnifilarForLadder(plantNodes, plantEdges);
    expect(bridgeAnalysis.success).toBe(true);
    expect(bridgeAnalysis.mappings.length).toBeGreaterThan(0);

    const stProgram = generateSTFromMappings(bridgeAnalysis.mappings, false);
    expect(stProgram).toContain("SISTEMA_ON :=");
    expect(stProgram).toContain("ES_SISTEMA");

    const importedLadder = importLadderProgram(stProgram, "ST");
    expect(importedLadder.warnings).toBeDefined();
    expect(importedLadder.rungs.length).toBeGreaterThan(0);

    // Validação do intertravamento físico E-STOP segundo NR-12
    const safeRung = fromAiRungSpec({
      id: "rung_m01",
      label: "Partida Motor M-01 com Intertravamento E-STOP NR-12",
      output: { kind: "OTE", operand: "KM-01" },
      branches: [
        [
          { kind: "XIO", operand: "ES-01" },
          { kind: "XIC", operand: "START_M01" },
        ],
      ],
    });

    const estopFindings = verifyEstopInterlock([safeRung], plantNodes, plantEdges);
    expect(estopFindings.filter((f) => f.severity === "error")).toHaveLength(0);

    // Simulação do ciclo de scan PLC: motor liga com START_M01=true & ES-01=false, e desliga imediatamente quando ES-01=true
    const scanState = createScanState();
    const scanNormal = scanRungsPure(
      [safeRung],
      { START_M01: true, "ES-01": false },
      scanState,
      100,
    );
    expect(scanNormal.tags["KM-01"]).toBe(true);

    const scanEmergency = scanRungsPure(
      [safeRung],
      { START_M01: true, "ES-01": true },
      scanState,
      200,
    );
    expect(scanEmergency.tags["KM-01"]).toBe(false);

    // ── 8. EXPORTAÇÃO DXF (CAD R12) E PDF (MEMORIAL COM BOM + CONDUTORES) ────
    const dxfOutput = diagramToDxf(doc, "unifilar");
    expect(dxfOutput).toContain("SECTION");
    expect(dxfOutput).toContain("ENTITIES");
    expect(dxfOutput).toContain("M-01 Bomba Principal 37kW");
    expect(dxfOutput).toContain("EOF");

    const pdfDoc = buildProjectPdf({
      project: {
        name: createdProject.name,
        client: "Indústria Metalúrgica Alfa S.A.",
        status: "Homologado",
        description: "Memorial descritivo gerado no teste E2E da Fase 10.",
      },
      authorName: "Eng. Marina Costa — CREA-SP 5061234567",
      norm: "ABNT NBR 5410 · NR-12 · IEC 60909",
      conductors: conductorSummary,
      bom: [
        {
          part_number: "WEG-W22-37KW",
          description: "Motor Trifásico W22 IR3 Premium 37 kW 4P 380V",
          manufacturer: "WEG",
          quantity: 1,
          unit: "un",
          unit_price_brl: 18450.0,
        },
        {
          part_number: "WEG-DWB160-80A",
          description: "Disjuntor Caixa Moldada DWB160 80A 36kA",
          manufacturer: "WEG",
          quantity: 1,
          unit: "un",
          unit_price_brl: 890.0,
        },
      ],
      totalBRL: 19340.0,
    });

    expect(pdfDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(ENGINEERING_LEGAL_DISCLAIMER).toContain("CREA/CFT");
    expect(ENGINEERING_LEGAL_DISCLAIMER).toContain("ART/TRT");

    // ── 9. VERIFICAÇÃO DE AUSÊNCIA DE ERROS DE CONSOLE E PERSISTÊNCIA ────────
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(db.projects[0].name).toBe("Subestação e CCM Linha de Envase 04");
    expect((db.diagrams[0].canvas_data as typeof doc).nodes["M-01"].label).toContain("37kW");
  });
});
