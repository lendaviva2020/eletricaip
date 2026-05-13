import { Handle, Position, type NodeProps } from "reactflow";
import {
  VOLTAI_COLORS,
  VOLTAI_COMPONENT_BY_TYPE,
  type VoltaiTerminal,
  type VoltaiTerminalSide,
} from "@/lib/voltai/component-definitions";
import { getComponentSymbol } from "@/lib/voltai/symbols";
import type { VoltaiDiagramComponent } from "@/lib/voltai/store";
import { cn } from "@/lib/utils";

const SIDE_POSITION: Record<VoltaiTerminalSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function handleOffset(terminals: VoltaiTerminal[], terminal: VoltaiTerminal) {
  const sameSide = terminals.filter((item) => item.side === terminal.side);
  const index = sameSide.findIndex((item) => item.id === terminal.id);
  const percent = ((index + 1) / (sameSide.length + 1)) * 100;
  return terminal.side === "left" || terminal.side === "right"
    ? { top: `${percent}%` }
    : { left: `${percent}%` };
}

export function VoltaiFlowNode({ data, selected }: NodeProps<VoltaiDiagramComponent>) {
  const definition = VOLTAI_COMPONENT_BY_TYPE[data.type];
  const status =
    data.simulationState.tripped || data.simulationState.failed || data.simulationState.blown;

  return (
    <div
      className={cn(
        "relative w-[148px] rounded-md bg-card/95 backdrop-blur border px-2.5 py-2 shadow-panel transition-all",
        selected ? "border-primary ring-2 ring-ring shadow-glow" : "border-border",
        data.simulationState.energized && "energized",
      )}
    >
      {definition.bornes.map((terminal) => {
        const type = terminal.direction === "input" ? "target" : "source";
        return (
          <Handle
            key={terminal.id}
            id={terminal.id}
            type={type}
            position={SIDE_POSITION[terminal.side]}
            title={`${terminal.id} · ${terminal.role}`}
            style={{
              ...handleOffset(definition.bornes, terminal),
              width: 8,
              height: 8,
              background: VOLTAI_COLORS[terminal.role],
              borderColor: "oklch(0.16 0.012 35)",
            }}
          />
        );
      })}

      <div className="flex items-center gap-2">
        <div
          className="h-11 w-14 shrink-0 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: getComponentSymbol(data.type) }}
        />
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-semibold truncate">{data.label}</div>
          <div className="text-[9px] text-muted-foreground truncate">{definition.name}</div>
          <div
            className={cn(
              "mt-0.5 text-[9px] font-mono",
              status ? "text-destructive" : "text-success",
            )}
          >
            {status ? "FALHA" : data.simulationState.energized ? "ON" : "READY"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {definition.bornes.slice(0, 8).map((terminal) => (
          <span
            key={terminal.id}
            className="rounded border border-border px-1 py-0.5 text-[8px] font-mono text-muted-foreground"
          >
            {terminal.id}
          </span>
        ))}
      </div>
    </div>
  );
}
