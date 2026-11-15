// Auditoria Fase 1 — F1.7 (snapshot inválido não vira projeto vazio) e
// F1.8 (save com UPDATE condicional à versão: sem lost update).
import { describe, it, expect } from "vitest";
import {
  SnapshotSchema,
  SNAPSHOT_INVALID_ERROR,
  saveProjectRecord,
  summarizeSnapshotIssues,
} from "@/lib/projects.functions";

const validSnapshot = {
  schemaVersion: 3,
  project: { nodes: [], edges: [], tags: {}, scadaLayout: { nodes: [], edges: [] } },
  voltai: { components: [], edges: [] },
  editor: { tags: {}, rungs: [], fbdNodes: [], fbdEdges: [] },
  plc: { vendor: "siemens", rack: {}, variables: [], programBlocks: [], cycleTimeMs: 10 },
} as never;

/** Cliente Supabase mínimo: registra filtros do UPDATE e devolve linhas configuráveis. */
function makeSupabase(opts: {
  currentVersion: number;
  updatedRows: Array<{ id: string; version: number }>;
}) {
  const calls: { updateFilters: Array<[string, unknown]> } = { updateFilters: [] };
  const supabase = {
    from(table: string) {
      if (table === "diagrams") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "d1", version: opts.currentVersion },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: () => {
            const chain = {
              eq(col: string, val: unknown) {
                calls.updateFilters.push([col, val]);
                return chain;
              },
              select: async () => ({ data: opts.updatedRows, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === "projects") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
  return { supabase: supabase as never, calls };
}

describe("F1.7 — snapshot persistido inválido", () => {
  it("um único campo inválido reprova o schema (motivo do bloqueio no load)", () => {
    const bad = { ...(validSnapshot as object), plc: { cycleTimeMs: "10" } };
    const parsed = SnapshotSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const summary = summarizeSnapshotIssues(parsed.error);
      expect(summary).toContain("plc.cycleTimeMs");
    }
  });

  it("o erro tipado tem prefixo estável para o cliente bloquear o autosave", () => {
    expect(SNAPSHOT_INVALID_ERROR).toBe("SNAPSHOT_INVALID");
  });
});

describe("F1.8 — save atômico condicionado à versão", () => {
  it("o UPDATE filtra por id E pela versão lida", async () => {
    const { supabase, calls } = makeSupabase({
      currentVersion: 7,
      updatedRows: [{ id: "d1", version: 8 }],
    });
    const res = await saveProjectRecord(
      { supabase, userId: "u1" },
      { projectId: "p1", snapshot: validSnapshot, expectedVersion: 7 },
    );
    expect(res.version).toBe(8);
    expect(calls.updateFilters).toEqual([
      ["id", "d1"],
      ["version", 7],
    ]);
  });

  it("0 linhas afetadas (outro save confirmou antes) => VERSION_CONFLICT, nunca sobrescrita", async () => {
    const { supabase } = makeSupabase({ currentVersion: 7, updatedRows: [] });
    await expect(
      saveProjectRecord(
        { supabase, userId: "u1" },
        { projectId: "p1", snapshot: validSnapshot, expectedVersion: 7 },
      ),
    ).rejects.toThrow(/VERSION_CONFLICT/);
  });

  it("sem expectedVersion o UPDATE ainda é condicionado à versão lida", async () => {
    const { supabase, calls } = makeSupabase({ currentVersion: 3, updatedRows: [] });
    await expect(
      saveProjectRecord({ supabase, userId: "u1" }, { projectId: "p1", snapshot: validSnapshot }),
    ).rejects.toThrow(/VERSION_CONFLICT/);
    expect(calls.updateFilters).toContainEqual(["version", 3]);
  });

  it("force (sobrescrita escolhida pelo usuário) não aplica o filtro de versão", async () => {
    const { supabase, calls } = makeSupabase({
      currentVersion: 3,
      updatedRows: [{ id: "d1", version: 4 }],
    });
    await saveProjectRecord(
      { supabase, userId: "u1" },
      { projectId: "p1", snapshot: validSnapshot, force: true },
    );
    expect(calls.updateFilters).toEqual([["id", "d1"]]);
  });
});

describe("F1.4 — fonte única de IS_PHYSICAL_CONTROL_ALLOWED", () => {
  it("só existe uma declaração da constante e todas as reexportações valem false", async () => {
    const { execSync } = await import("node:child_process");
    const out = execSync(
      'git grep -n "IS_PHYSICAL_CONTROL_ALLOWED = false as const" -- "src/**/*.ts" ":!src/__tests__/**"',
      { encoding: "utf8" },
    );
    const declarations = out.trim().split("\n").filter(Boolean);
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toContain("src/lib/safety/physical-control.ts");

    const modules = await Promise.all([
      import("@/lib/ai/gateway/types"),
      import("@/lib/edge/protocol-classification"),
      import("@/lib/industrial/types"),
      import("@/lib/observability/types"),
      import("@/lib/studio/canonical/types"),
      import("@/lib/studio/libraries/industrial-libraries"),
    ]);
    for (const m of modules) expect(m.IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
  });
});
