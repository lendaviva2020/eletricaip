/**
 * Ponte DiagramDoc (editor) → documentação de painel EPLAN, usando o MESMO
 * conversor canônico do resto do app (`upgradeSnapshotV2ToV3`), para que o
 * editor, o dossiê e os relatórios vejam exatamente a mesma topologia.
 */
import type { DiagramDoc } from "@/lib/diagram/schema";
import type { ProjectSnapshot } from "@/lib/projects.functions";
import { upgradeSnapshotV2ToV3 } from "@/lib/model/migration-v2-to-v3";
import { buildPanelDocumentation, type PanelDocumentation } from "./index";

export function documentationFromDiagram(
  doc: DiagramDoc,
  ladderRungs: readonly unknown[] = [],
): PanelDocumentation {
  const snapshot = {
    schemaVersion: 3,
    diagram: doc,
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
  } as unknown as ProjectSnapshot;
  return buildPanelDocumentation(upgradeSnapshotV2ToV3(snapshot), { ladderRungs });
}
