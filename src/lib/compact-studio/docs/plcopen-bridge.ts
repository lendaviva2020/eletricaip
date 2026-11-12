/**
 * PLCopen XML Bridge reusing the platform's existing `buildPlcOpenXml` exporter.
 */
import { buildPlcOpenXml } from "@/lib/plc/plcopen-export";
import type { PlcProject, PlcVariable } from "@/lib/plc/types";
import type { CompactProgramModel } from "../domain/types";

function mapSignalTypeToPlc(sig: string): PlcVariable["type"] {
  switch (sig) {
    case "INT":
    case "REAL":
    case "TIME":
    case "BYTE":
    case "WORD":
    case "STRING":
    case "BOOL":
      return sig;
    default:
      return "BOOL";
  }
}

export function exportCompactToPlcOpenXml(model: CompactProgramModel): string {
  const plcProject: PlcProject = {
    vendor: "generic",
    cycleTimeMs: model.cycleTimeMs,
    rack: {
      id: model.hardware.baseCatalogId,
      label: `${model.name} (${model.hardware.basePartCode})`,
      modules: model.hardware.slots.map((s) => ({
        id: `${s.slotIndex}_${s.catalogId}`,
        catalogKey: s.catalogId,
        category: s.slotIndex === 0 ? "cpu" : s.analogInputs > 0 ? "ai" : s.analogOutputs > 0 ? "ao" : "di",
        label: s.partCode,
        description: s.family,
        slot: s.slotIndex,
        channels: s.digitalInputs + s.digitalOutputs + s.analogInputs + s.analogOutputs,
        params: {},
      })),
    },
    variables: model.ioSymbols.map((sym) => ({
      id: sym.id,
      name: sym.symbolicName || sym.address,
      address: sym.address,
      type: mapSignalTypeToPlc(sym.signalType),
      initialValue: sym.initialValue,
      comment: sym.comment,
      retentive: sym.retentive,
    })),
    programBlocks: model.pages.map((p, idx) => {
      const pageNodes = model.nodes.filter((n) => n.pageId === p.id);
      return {
        id: p.id,
        name: p.name.replace(/\s+/g, "_"),
        type: idx === 0 ? "OB" : "FC",
        number: idx + 1,
        language: model.preferredNotation === "LAD" ? "ladder" : "fbd",
        code: `// Page ${p.name}: ${pageNodes.length} blocks`,
        comment: p.description ?? "",
      };
    }),
  };

  return buildPlcOpenXml(plcProject);
}
