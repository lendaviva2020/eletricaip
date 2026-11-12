import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import { createEmptyUnifiedDoc } from "../lib/model/migration-v2-to-v3";
import { useRuntimeStore } from "../lib/model/runtime-store";
import { useUnifiedProjectStore } from "../lib/model/unified-store";
import { CompactExecutionEngine } from "../lib/compact-studio/runtime";
import {
  checkCompactStudioPermission,
  publishCompactFrameToRuntimeStore,
  reconcileCompactSymbolsWithUnifiedTags,
} from "../lib/compact-studio/integration";

describe("Fase 9 — Integração SSOT (SCADA/Unifilar), RBAC & Políticas RLS Multi-Tenant", () => {
  it("propagates symbol renames via persistent UUID without duplicating tags and flags conflicts", () => {
    const doc = createEmptyUnifiedDoc({ id: "proj_ssot", name: "SSOT Project" });
    let compact = createEmptyCompactProgramModel({ id: "cp_ssot", name: "Painel Bomba" });
    const pageId = compact.pages[0].id;

    const i1Node = createCompactBlockNode({
      id: "node_i1",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "BOTAO_LIGA",
      ioSymbolId: "sym_start",
    });

    compact = {
      ...compact,
      ioSymbols: [
        {
          id: "sym_start",
          ioKind: "DI",
          address: "I1",
          symbolicName: "BOTAO_LIGA",
          signalType: "BOOL",
          canonicalTagId: "uuid-tag-start-001",
          comment: "Botão de partida",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: [i1Node],
    };

    const res1 = reconcileCompactSymbolsWithUnifiedTags(compact, doc);
    expect(res1.conflicts).toHaveLength(0);
    expect(res1.updatedTags["uuid-tag-start-001"]?.name).toBe("BOTAO_LIGA");

    // Rename symbolic name and re-reconcile -> same UUID preserved, node updated, no duplicate tag
    const docWithTags = {
      ...doc,
      engineering: { ...doc.engineering, tags: res1.updatedTags },
    };
    const renamedCompact = {
      ...res1.model,
      ioSymbols: [{ ...res1.model.ioSymbols[0], symbolicName: "PARTIDA_BOMBA_01" }],
    };

    const res2 = reconcileCompactSymbolsWithUnifiedTags(renamedCompact, docWithTags);
    const allIds = Object.keys(res2.updatedTags);
    expect(allIds).toHaveLength(Object.keys(res1.updatedTags).length);
    expect(allIds.filter((id) => id.startsWith("uuid-tag-start"))).toEqual(["uuid-tag-start-001"]);
    expect(res2.updatedTags["uuid-tag-start-001"].name).toBe("PARTIDA_BOMBA_01");
    expect(res2.model.nodes[0].instanceName).toBe("PARTIDA_BOMBA_01");
  });

  it("streams live CompactRuntimeFrame into useRuntimeStore without dirtying UnifiedProjectStore", () => {
    useUnifiedProjectStore.getState().markSaved();
    let compact = createEmptyCompactProgramModel({ id: "cp_live", name: "Live RT" });
    const pageId = compact.pages[0].id;
    const i1 = createCompactBlockNode({
      id: "n1",
      pageId,
      blockType: "INPUT_DI",
      instanceName: "CMD_ON",
      ioSymbolId: "s1",
    });
    const q1 = createCompactBlockNode({
      id: "n2",
      pageId,
      blockType: "OUTPUT_QO",
      instanceName: "MOTOR_M1",
      ioSymbolId: "s2",
    });

    compact = {
      ...compact,
      ioSymbols: [
        {
          id: "s1",
          ioKind: "DI",
          address: "I1",
          symbolicName: "CMD_ON",
          signalType: "BOOL",
          canonicalTagId: "tag-cmd",
          comment: "",
          retentive: false,
          initialValue: false,
        },
        {
          id: "s2",
          ioKind: "DO",
          address: "Q1",
          symbolicName: "MOTOR_M1",
          signalType: "BOOL",
          canonicalTagId: "tag-m1",
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: [i1, q1],
      connections: [
        {
          id: "c1",
          pageId,
          fromNodeId: "n1",
          fromPortId: "out",
          toNodeId: "n2",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const eng = new CompactExecutionEngine(compact);
    eng.setInput("CMD_ON", true);
    const frame = eng.step(20);

    publishCompactFrameToRuntimeStore(compact, frame);

    const rt = useRuntimeStore.getState();
    expect(rt.tagValuesById["tag-m1"]).toBe(true);
    expect(rt.tagValuesByName["MOTOR_M1"]).toBe(true);
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);
  });

  it("enforces strict tenant RBAC and verifies RLS policies in Supabase migration", () => {
    expect(checkCompactStudioPermission("viewer", "view_program")).toBe(true);
    expect(checkCompactStudioPermission("viewer", "edit_program")).toBe(false);
    expect(checkCompactStudioPermission("operator", "force_runtime_tag")).toBe(true);
    expect(checkCompactStudioPermission("operator", "edit_hardware")).toBe(false);
    expect(checkCompactStudioPermission("engineer", "edit_program")).toBe(true);
    expect(checkCompactStudioPermission("engineer", "write_field_device")).toBe(false);
    expect(checkCompactStudioPermission("admin", "write_field_device")).toBe(true);

    const sqlPath = path.resolve(
      __dirname,
      "../../supabase/migrations/20261112150000_compact_studio_libraries_and_audit.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toContain("ALTER TABLE public.compact_studio_libraries ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "ALTER TABLE public.compact_studio_device_audit ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain("REVOKE ALL ON public.compact_studio_libraries FROM anon");
    expect(sql).toContain("REVOKE ALL ON public.compact_studio_device_audit FROM anon");
    expect(sql).toContain("tm.tenant_id = compact_studio_libraries.tenant_id");
    expect(sql).toContain("tm.tenant_id = compact_studio_device_audit.tenant_id");
    // Append-only guarantee on audit table
    expect(sql).not.toMatch(/FOR (UPDATE|DELETE) TO .* ON public\.compact_studio_device_audit/i);
  });
});
