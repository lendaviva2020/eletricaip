import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ProjectPackageSchema,
  exportProjectPackageData,
  importProjectPackageData,
  type ProjectPackage,
  type ProjectSnapshot,
} from "@/lib/projects.functions";

const VALID_SNAPSHOT: ProjectSnapshot = {
  schemaVersion: 3,
  project: {
    nodes: [
      {
        id: "n1",
        kind: "breaker",
        category: "power",
        label: "QF1",
        position: { x: 50, y: 50 },
        params: {},
      },
    ],
    edges: [],
    tags: {},
    scadaLayout: { nodes: [], edges: [] },
  },
  voltai: { components: [], edges: [] },
  editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
  plc: {
    vendor: "siemens",
    rack: { id: "rack-1", label: "Rack Principal", modules: [] },
    variables: [],
    programBlocks: [],
    cycleTimeMs: 10,
  },
  twin: { mappings: [], nameplates: {} },
  studies: {
    st_1: {
      studyType: "arc_flash",
      equipmentIds: ["n1"],
      parameters: {},
      results: {},
      inputSnapshotHash: "abc",
      status: "valid",
      updatedAt: "2026-10-25T12:00:00Z",
    },
  },
  controlBindings: {},
  diagnostics: [],
};

const VALID_PACKAGE: ProjectPackage = {
  format: "eletricai-package",
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
  project: {
    name: "Painel CCM Linha 1",
    description: "Subestação Principal",
    client: "Mineração Vale",
  },
  snapshot: VALID_SNAPSHOT,
};

function createMockSupabaseForPackage(
  initialDiagram: unknown,
  projectData: {
    id: string;
    name: string;
    description: string | null;
    metadata: Record<string, unknown>;
  },
) {
  let savedDiagramCanvas: unknown = null;
  const client = {
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: projectData, error: null }),
            }),
          }),
        };
      }
      if (table === "diagrams") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { canvas_data: initialDiagram }, error: null }),
                }),
              }),
            }),
          }),
          update: (patch: { canvas_data: unknown }) => ({
            eq: () => {
              savedDiagramCanvas = patch.canvas_data;
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, getSavedCanvas: () => savedDiagramCanvas };
}

describe("Fase D — Exportação e Importação Determinística de Pacote do Projeto", () => {
  it("valida rigorosamente pacotes com Zod ProjectPackageSchema", () => {
    // Pacote válido deve passar na validação Zod
    const parsed = ProjectPackageSchema.safeParse(VALID_PACKAGE);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.project.name).toBe("Painel CCM Linha 1");
      expect(parsed.data.snapshot.schemaVersion).toBe(3);
    }

    // Pacote com formato adulterado ou corrompido deve ser rejeitado
    const corruptedPackage = {
      format: "other-package",
      formatVersion: 1,
      project: { name: "Teste" },
      snapshot: {},
    };
    const rejected = ProjectPackageSchema.safeParse(corruptedPackage);
    expect(rejected.success).toBe(false);
  });

  it("exporta pacote de projeto completo com metadados e snapshot v3", async () => {
    const { client } = createMockSupabaseForPackage(VALID_SNAPSHOT, {
      id: "proj-123",
      name: "Subestação 13.8kV",
      description: "Memorial Descritivo",
      metadata: { client: "Petrobras" },
    });

    const exported = await exportProjectPackageData(client, "proj-123");

    expect(exported.format).toBe("eletricai-package");
    expect(exported.formatVersion).toBe(1);
    expect(exported.project.name).toBe("Subestação 13.8kV");
    expect(exported.project.client).toBe("Petrobras");
    expect(exported.snapshot.schemaVersion).toBe(3);
    expect(exported.snapshot.studies).toBeDefined();
  });

  it("rejeita importação de pacotes mal-formatados", async () => {
    const invalidData = { invalid: true };
    const authCtx = {
      supabase: {} as unknown as SupabaseClient<Database>,
      userId: "user-123",
      claims: {},
    };

    await expect(importProjectPackageData(authCtx, { packageData: invalidData })).rejects.toThrow(
      /Pacote inválido/,
    );
  });
});
