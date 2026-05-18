import { Handle, Position, type NodeProps } from "reactflow";
import { KIND_GLYPH, type IndustrialNode } from "@/lib/project-store";
import { cn } from "@/lib/utils";

const CAT_COLOR: Record<string, string> = {
  power: "border-primary text-primary",
  mech: "border-success text-success",
  inst: "border-warning text-warning",
  logic: "border-info text-info",
};

export function IndustrialFlowNode({ data, selected }: NodeProps<IndustrialNode>) {
  const color = CAT_COLOR[data.category] ?? "border-border text-foreground";
  return (
    <div
      className={cn(
        "min-w-[120px] rounded-md bg-card/90 backdrop-blur border-2 px-2 py-1.5 shadow-panel transition-all",
        color,
        selected && "ring-2 ring-ring shadow-glow",
        data.energized && "energized",
      )}
    >
      <Handle type="target" position={Position.Left} className="bg-primary! w-2! h-2!" />
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-7 w-7 grid place-items-center rounded font-mono text-[13px] font-bold border",
            color,
          )}
        >
          {KIND_GLYPH[data.kind] ?? "?"}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-mono font-semibold truncate">{data.label}</div>
          <div className="text-[9px] text-muted-foreground truncate">
            {Object.entries(data.params)
              .slice(0, 2)
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ")}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="bg-primary! w-2! h-2!" />
    </div>
  );
}
