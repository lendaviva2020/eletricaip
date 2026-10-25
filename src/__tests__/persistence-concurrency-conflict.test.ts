import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { saveProjectRecord, type ProjectSnapshot } from "@/lib/projects.functions";

interface DiagramRecord {
  id: string;
  project_id: string;
  version: number;
  canvas_data: unknown;
  updated_at: string;
}

function createMockSupabase(initialDiagram: DiagramRecord) {
  const diagrams: DiagramRecord[] = [{ ...initialDiagram }];
  const projects: Array<{ id: string; updated_at: string }> = [
    { id: initialDiagram.project_id, updated_at: new Date().toISOString() },
  ];

  const client = {
    from: (table: string) => {
      if (table === "diagrams") {
        return {
          select: (_cols?: string) => ({
            eq: (_field: string, val: string) => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    const row = diagrams.find((d) => d.project_id === val) ?? null;
                    return { data: row ? { ...row } : null, error: null };
                  },
                }),
              }),
            }),
          }),
          update: (patch: Partial<DiagramRecord>) => ({
            eq: (_field: string, idVal: string) => {
              const row = diagrams.find((d) => d.id === idVal);
              if (row) {
                Object.assign(row, patch);
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "projects") {
        return {
          update: (patch: { updated_at: string }) => ({
            eq: (_field: string, idVal: string) => {
              const p = projects.find((x) => x.id === idVal);
              if (p) Object.assign(p, patch);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;

  return { client, diagrams };
}

const DUMMY_SNAPSHOT: ProjectSnapshot = {
  schemaVersion: 3,
  project: { nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } },
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
  studies: {},
  controlBindings: {},
  diagnostics: [],
};

describe("Fase D — Concorrência Otimista e Versionamento Estrito (T6)", () => {
  const projectId = "11111111-1111-1111-1111-111111111111";
  const userId = "user-123";

  it("avança diagram.version monotonicamente a cada saveProjectRecord confirmado", async () => {
    const { client, diagrams } = createMockSupabase({
      id: "diag-1",
      project_id: projectId,
      version: 1,
      canvas_data: DUMMY_SNAPSHOT,
      updated_at: new Date().toISOString(),
    });

    const res1 = await saveProjectRecord(
      { supabase: client, userId },
      { projectId, snapshot: DUMMY_SNAPSHOT, expectedVersion: 1 },
    );

    expect(res1.version).toBe(2);
    expect(diagrams[0].version).toBe(2);

    const res2 = await saveProjectRecord(
      { supabase: client, userId },
      { projectId, snapshot: DUMMY_SNAPSHOT, expectedVersion: 2 },
    );

    expect(res2.version).toBe(3);
    expect(diagrams[0].version).toBe(3);
  });

  it("rejeita salvamento concorrente com VERSION_CONFLICT quando expectedVersion diverge da versão no servidor", async () => {
    const { client } = createMockSupabase({
      id: "diag-1",
      project_id: projectId,
      version: 5, // Servidor já avançou até versão 5 (ex: por outra aba)
      canvas_data: DUMMY_SNAPSHOT,
      updated_at: new Date().toISOString(),
    });

    // Tentativa de salvar esperando versão 4 (desatualizada)
    await expect(
      saveProjectRecord(
        { supabase: client, userId },
        { projectId, snapshot: DUMMY_SNAPSHOT, expectedVersion: 4 },
      ),
    ).rejects.toThrow(/VERSION_CONFLICT/);
  });

  it("permite sobrescrita explícita através de force: true mesmo com versão divergente", async () => {
    const { client, diagrams } = createMockSupabase({
      id: "diag-1",
      project_id: projectId,
      version: 5,
      canvas_data: DUMMY_SNAPSHOT,
      updated_at: new Date().toISOString(),
    });

    // Usuário confirmou que deseja sobrescrever
    const res = await saveProjectRecord(
      { supabase: client, userId },
      { projectId, snapshot: DUMMY_SNAPSHOT, expectedVersion: 3, force: true },
    );

    expect(res.version).toBe(6);
    expect(diagrams[0].version).toBe(6);
  });
});
