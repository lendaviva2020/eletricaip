import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group, RegularPolygon, Ring } from "react-konva";
import Konva from "konva";
import { useProjectStore, type IndustrialNode } from "@/lib/project-store";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

type Variant = "scada" | "twin";

export function KonvaCanvas({ variant }: { variant: Variant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const selectedId = useProjectStore((s) => s.selectedId);
  const select = useProjectStore((s) => s.select);
  const updatePos = useProjectStore((s) => s.updateNodePosition);
  const addNode = useProjectStore((s) => s.addNode);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const label = e.dataTransfer.getData("application/eletricai");
    if (!label || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    addNode(label, { x: e.clientX - r.left - 60, y: e.clientY - r.top - 30 });
  };

  // Pulse for SCADA
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (variant !== "scada") return;
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 50);
    return () => clearInterval(id);
  }, [variant]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full industrial-grid scan-overlay overflow-hidden"
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
    >
      <FloatingLegend
        title={variant === "scada" ? "SCADA · HMI Runtime" : "Digital Twin · 2D"}
        items={variant === "scada"
          ? [`${nodes.length} símbolos`, "Drag & Drop", "60 Hz", "Live Sync"]
          : ["Physics ON", `${nodes.length} ativos`, "Drag & Drop", "GPU OK"]}
      />

      <Stage width={size.w} height={size.h}>
        <Layer listening={false}>
          {/* Pipes / wires between nodes */}
          {edges.map((e) => {
            const a = nodes.find((n) => n.id === e.source);
            const b = nodes.find((n) => n.id === e.target);
            if (!a || !b) return null;
            const ax = a.position.x + 60, ay = a.position.y + 30;
            const bx = b.position.x + 60, by = b.position.y + 30;
            const color = e.kind === "power" ? "#f3c44b" : e.kind === "pipe" ? "#3fb6d6" : "#5fd699";
            return (
              <Group key={e.id}>
                <Line points={[ax, ay, bx, by]} stroke={color} strokeWidth={6} opacity={0.35} lineCap="round" />
                <Line
                  points={[ax, ay, bx, by]} stroke={color} strokeWidth={2}
                  dash={[10, 8]} dashOffset={-(tick * 1.2) % 18}
                  lineCap="round"
                />
              </Group>
            );
          })}
        </Layer>

        <Layer>
          {nodes.map((n) => (
            <NodeShape
              key={n.id}
              node={n}
              variant={variant}
              tick={tick}
              selected={n.id === selectedId}
              onSelect={() => select(n.id)}
              onMove={(p) => updatePos(n.id, p)}
            />
          ))}
        </Layer>
      </Stage>

      <BottomStrip
        items={variant === "scada"
          ? [["Tags", String(nodes.length * 4)], ["Alarmes", "2 ⚠"], ["FPS", "60"], ["Sync", "↔ Unifilar · Ladder · Twin"]]
          : [["Throughput", "1240 pç/h"], ["Vibração", "2.1 mm/s"], ["Temp", "47°C"], ["Sync", "↔ Unifilar · SCADA"]]}
      />
    </div>
  );
}

function NodeShape({
  node, variant, tick, selected, onSelect, onMove,
}: {
  node: IndustrialNode; variant: Variant; tick: number; selected: boolean;
  onSelect: () => void; onMove: (p: { x: number; y: number }) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const accent = node.category === "power" ? "#3fb6d6"
    : node.category === "mech" ? "#5fd699"
    : node.category === "inst" ? "#f3c44b" : "#9bb6ff";

  return (
    <Group
      x={node.position.x}
      y={node.position.y}
      draggable
      ref={groupRef}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onMove({ x: e.target.x(), y: e.target.y() })}
    >
      {/* Selection halo */}
      {selected && (
        <Rect x={-4} y={-4} width={128} height={68} cornerRadius={10}
              stroke={accent} strokeWidth={1.5} dash={[4, 4]} opacity={0.9} />
      )}

      <Rect width={120} height={60} cornerRadius={8} fill="#1a2030" stroke={accent} strokeWidth={1.5}
            shadowColor="black" shadowBlur={12} shadowOpacity={0.4} />

      {/* Symbol */}
      <Group x={12} y={12}>
        <Symbol kind={node.kind} accent={accent} tick={tick} variant={variant} />
      </Group>

      <Text x={52} y={10} text={node.label} fontFamily="JetBrains Mono, monospace"
            fontSize={12} fontStyle="bold" fill="#e6ecf5" />
      <Text x={52} y={26} text={summarize(node)} fontFamily="JetBrains Mono, monospace"
            fontSize={9} fill="#8a99b3" width={64} ellipsis />
      {node.energized && (
        <Circle x={110} y={10} radius={3} fill={accent}
                opacity={0.5 + 0.5 * Math.abs(Math.sin(tick / 8))} />
      )}
    </Group>
  );
}

function Symbol({ kind, accent, tick, variant }: { kind: IndustrialNode["kind"]; accent: string; tick: number; variant: Variant }) {
  const animate = variant === "scada" || variant === "twin";
  switch (kind) {
    case "motor":
      return (
        <Group>
          <Circle x={18} y={18} radius={16} stroke={accent} strokeWidth={2} />
          <Text x={10} y={10} text="M" fontSize={16} fontStyle="bold" fill={accent} />
          {animate && <Ring x={18} y={18} innerRadius={10} outerRadius={11} stroke={accent}
                            rotation={(tick * 9) % 360} dash={[3, 4]} />}
        </Group>
      );
    case "pump":
      return (
        <Group>
          <Circle x={18} y={18} radius={16} stroke={accent} strokeWidth={2} />
          <Group x={18} y={18} rotation={animate ? (tick * 18) % 360 : 0}>
            <Line points={[-12, 0, 12, 0]} stroke={accent} strokeWidth={2} />
            <Line points={[0, -12, 0, 12]} stroke={accent} strokeWidth={2} />
          </Group>
        </Group>
      );
    case "tank":
      return (
        <Group>
          <Rect width={36} height={36} cornerRadius={4} stroke={accent} strokeWidth={2} />
          <Rect x={2} y={animate ? 8 + Math.sin(tick / 12) * 3 : 12}
                width={32} height={animate ? 26 - Math.sin(tick / 12) * 3 : 22}
                fill={accent} opacity={0.3} cornerRadius={3} />
        </Group>
      );
    case "valve":
      return (
        <Group y={6}>
          <RegularPolygon x={10} y={12} sides={3} radius={12} rotation={90} stroke={accent} strokeWidth={2} />
          <RegularPolygon x={26} y={12} sides={3} radius={12} rotation={-90} stroke={accent} strokeWidth={2} />
        </Group>
      );
    case "transformer":
      return (
        <Group>
          <Circle x={12} y={18} radius={11} stroke={accent} strokeWidth={2} />
          <Circle x={24} y={18} radius={11} stroke={accent} strokeWidth={2} />
        </Group>
      );
    case "busbar":
      return <Rect x={0} y={14} width={36} height={8} cornerRadius={2} fill={accent} opacity={0.7} />;
    case "breaker":
    case "contactor":
      return (
        <Group>
          <Rect x={4} y={4} width={28} height={28} cornerRadius={4} stroke={accent} strokeWidth={2} />
          <Line points={[10, 26, 22, 10]} stroke={accent} strokeWidth={2} />
        </Group>
      );
    case "vfd":
    case "softstarter":
      return (
        <Group>
          <Rect x={2} y={4} width={32} height={28} cornerRadius={4} stroke={accent} strokeWidth={2} />
          <Text x={6} y={10} text={kind === "vfd" ? "≋" : "S"} fontSize={16} fill={accent} />
        </Group>
      );
    case "pt100":
    case "pressure":
    case "flow":
    case "level":
      return (
        <Group>
          <Circle x={18} y={18} radius={15} stroke={accent} strokeWidth={2} />
          <Text x={6} y={11} text={kind === "pt100" ? "T°" : kind === "pressure" ? "P" : kind === "flow" ? "Q" : "L"}
                fontSize={13} fill={accent} fontStyle="bold" />
        </Group>
      );
    case "estop":
      return (
        <Group>
          <Circle x={18} y={18} radius={15} fill="#c63a3a" />
          <Circle x={18} y={18} radius={9} fill="#1a2030" />
        </Group>
      );
    case "conveyor":
      return (
        <Group>
          <Rect x={0} y={14} width={36} height={10} stroke={accent} strokeWidth={1.5} />
          {animate && [0, 12, 24].map((x) => (
            <Rect key={x} x={(x + (tick * 1.5)) % 36} y={16} width={6} height={6} fill={accent} opacity={0.6} />
          ))}
        </Group>
      );
    case "reactor":
      return <Circle x={18} y={18} radius={16} stroke={accent} strokeWidth={2} />;
    default:
      return <Rect x={4} y={4} width={28} height={28} cornerRadius={4} stroke={accent} strokeWidth={2} />;
  }
}

function summarize(n: IndustrialNode) {
  const parts = Object.entries(n.params).slice(0, 2).map(([k, v]) => `${k}:${v}`);
  return parts.join(" ");
}
