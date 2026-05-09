import { FlowSurface } from "./unifilar-canvas";
import type { IndustrialNode } from "@/lib/project-store";

const FBD_KINDS = new Set(["pid", "scale", "ai", "ao", "di", "do", "vfd", "pt100", "pressure", "flow", "level", "valve", "pump", "encoder"]);

export function FbdCanvas() {
  return (
    <FlowSurface
      title="FBD · IEC 61131-3"
      filter={(n: IndustrialNode) => FBD_KINDS.has(n.kind)}
    />
  );
}
