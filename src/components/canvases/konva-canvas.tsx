import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group, RegularPolygon, Ring } from "react-konva";
import Konva from "konva";
import { useProjectStore, type IndustrialNode } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";
import { Maximize2, Minus, Plus } from "lucide-react";

type Variant = "scada" | "twin";

// Helper to sync flat tags to EditorStore
const syncTag = (name: string, value: any) => {
  const store = useProjectStore.getState();
  store.applyTick({ tags: { [name]: value } });

  const editorState = useEditorStore.getState();
  const existing = Object.values(editorState.tags).find((t) => t.name === name);
  if (existing) {
    editorState.setTagValue(existing.id, value);
  } else {
    const type = typeof value === "boolean" ? "BOOL" : "REAL";
    editorState.upsertTag({
      id: `tag-${name}`,
      name,
      type,
      value,
      forced: false,
    });
  }
};

export function KonvaCanvas({ variant }: { variant: Variant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const selectedId = useProjectStore((s) => s.selectedId);
  const select = useProjectStore((s) => s.select);
  const updatePos = useProjectStore((s) => s.updateNodePosition);
  const addNode = useProjectStore((s) => s.addNode);
  const tags = useProjectStore((s) => s.tags);

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
    const label =
      e.dataTransfer.getData("application/eletricai") ||
      e.dataTransfer.getData("application/scada-widget");
    if (!label || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left - view.x) / view.scale - 60;
    const y = (e.clientY - r.top - view.y) / view.scale - 30;
    addNode(label, { x, y });
  };

  // Pulse for SCADA / Twin animations
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000), 50);
    return () => clearInterval(id);
  }, []);

  // Wheel zoom (centered at cursor)
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = view.scale;
    const pointer = stage.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 };
    const mousePointTo = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.1;
    const newScale = Math.min(
      4,
      Math.max(0.2, direction > 0 ? oldScale * factor : oldScale / factor),
    );
    setView({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const zoomBy = (factor: number) => {
    const oldScale = view.scale;
    const newScale = Math.min(4, Math.max(0.2, oldScale * factor));
    const cx = size.w / 2,
      cy = size.h / 2;
    const wx = (cx - view.x) / oldScale,
      wy = (cy - view.y) / oldScale;
    setView({ scale: newScale, x: cx - wx * newScale, y: cy - wy * newScale });
  };
  const fit = () => setView({ x: 0, y: 0, scale: 1 });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full industrial-grid scan-overlay overflow-hidden"
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
    >
      <FloatingLegend
        title={variant === "scada" ? "SCADA · HMI Runtime" : "Digital Twin · 2D"}
        items={
          variant === "scada"
            ? [
                `${nodes.length} widgets HMI`,
                `Zoom ${Math.round(view.scale * 100)}%`,
                "Arraste widgets p/ tela",
                "Controle Interativo Ativo",
              ]
            : [
                "Simulação Twin",
                `${nodes.length} ativos físicos`,
                `Zoom ${Math.round(view.scale * 100)}%`,
                "Sincronizado",
              ]
        }
      />

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 glass rounded-md p-1">
        <button
          onClick={() => zoomBy(1.2)}
          className="h-7 w-7 grid place-items-center rounded hover:bg-accent cursor-pointer"
          title="Aumentar Zoom"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.2)}
          className="h-7 w-7 grid place-items-center rounded hover:bg-accent cursor-pointer"
          title="Diminuir Zoom"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={fit}
          className="h-7 w-7 grid place-items-center rounded hover:bg-accent cursor-pointer"
          title="Ajustar à Tela"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable
        onWheel={onWheel}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }
        }}
        onClick={(e) => {
          if (e.target === e.target.getStage()) select(null);
        }}
      >
        <Layer listening={false}>
          {edges.map((e) => {
            const a = nodes.find((n) => n.id === e.source);
            const b = nodes.find((n) => n.id === e.target);
            if (!a || !b) return null;
            const ax = a.position.x + 60,
              ay = a.position.y + 30;
            const bx = b.position.x + 60,
              by = b.position.y + 30;
            const color =
              e.kind === "power" ? "#f3c44b" : e.kind === "pipe" ? "#3fb6d6" : "#5fd699";
            return (
              <Group key={e.id}>
                <Line
                  points={[ax, ay, bx, by]}
                  stroke={color}
                  strokeWidth={6}
                  opacity={0.35}
                  lineCap="round"
                />
                <Line
                  points={[ax, ay, bx, by]}
                  stroke={color}
                  strokeWidth={2}
                  dash={[10, 8]}
                  dashOffset={-(tick * 1.2) % 18}
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
              tags={tags}
              selected={n.id === selectedId}
              onSelect={() => select(n.id)}
              onMove={(p) => updatePos(n.id, p)}
            />
          ))}
        </Layer>
      </Stage>

      <BottomStrip
        items={
          variant === "scada"
            ? [
                ["Tags Ativas", String(Object.keys(tags).length)],
                ["Fator de Escala", `${Math.round(view.scale * 100)}%`],
                ["Norma HMI", "ISA-101 compliant"],
                ["Integridade SCADA", "Live Sync Ativo"],
              ]
            : [
                ["Vazão Total", "1,240 m³/h"],
                ["Vibração", "1.8 mm/s"],
                ["Frequência PLC", "50 Hz"],
                ["Sync", "↔ Unifilar · SCADA"],
              ]
        }
      />
    </div>
  );
}

function NodeShape({
  node,
  variant,
  tick,
  tags,
  selected,
  onSelect,
  onMove,
}: {
  node: IndustrialNode;
  variant: Variant;
  tick: number;
  tags: Record<string, any>;
  selected: boolean;
  onSelect: () => void;
  onMove: (p: { x: number; y: number }) => void;
}) {
  const isHmiWidget = [
    "gauge",
    "display",
    "level",
    "trend",
    "button",
    "switch",
    "slider",
    "input",
    "alarm_banner",
    "alarm_table",
    "label",
  ].includes(node.kind);

  const groupRef = useRef<Konva.Group>(null);
  const accent =
    node.category === "power"
      ? "#3fb6d6"
      : node.category === "mech"
        ? "#5fd699"
        : node.category === "inst"
          ? "#f3c44b"
          : "#9bb6ff";

  // Handles drag binding for HMI Sliders
  const handleSliderDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const thumbX = e.target.x();
    const trackWidth = 80;
    const percentage = Math.min(100, Math.max(0, Math.round((thumbX / trackWidth) * 100)));
    const tagName = String(node.params.tag || "SLIDER_TAG");
    syncTag(tagName, percentage);
  };

  if (variant === "scada" && isHmiWidget) {
    const width = node.kind === "trend" || node.kind === "alarm_table" ? 180 : 120;
    const height = node.kind === "trend" || node.kind === "alarm_table" ? 100 : 70;

    // Get current value of the bound tag
    const boundTagName = String(node.params.tag || "");
    const tagValue = boundTagName ? (tags[boundTagName] ?? 0) : 0;

    return (
      <Group
        x={node.position.x}
        y={node.position.y}
        draggable
        ref={groupRef}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => onMove({ x: e.target.x(), y: e.target.y() })}
      >
        {selected && (
          <Rect
            x={-3}
            y={-3}
            width={width + 6}
            height={height + 6}
            cornerRadius={6}
            stroke={accent}
            strokeWidth={1.5}
            dash={[4, 4]}
          />
        )}

        {/* Base Widget Card Panel */}
        <Rect
          width={width}
          height={height}
          cornerRadius={6}
          fill="rgba(21, 28, 45, 0.85)"
          stroke="#263554"
          strokeWidth={1}
          shadowColor="black"
          shadowBlur={6}
          shadowOpacity={0.3}
        />

        {/* GAUGE WIDGET */}
        {node.kind === "gauge" && (
          <Group x={width / 2} y={35}>
            <Ring innerRadius={20} outerRadius={22} fill="#263554" strokeWidth={0} />
            <Text
              y={-5}
              x={-20}
              width={40}
              align="center"
              text={String(tagValue)}
              fontFamily="JetBrains Mono, monospace"
              fontSize={11}
              fill="#5fd699"
              fontStyle="bold"
            />
            <Text
              y={12}
              x={-50}
              width={100}
              align="center"
              text={boundTagName || "Sem Tag"}
              fontFamily="JetBrains Mono, monospace"
              fontSize={7}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* NUMERIC DISPLAY WIDGET */}
        {node.kind === "display" && (
          <Group x={10} y={10}>
            <Rect
              width={100}
              height={32}
              cornerRadius={4}
              fill="#0b0e14"
              stroke="#1b2438"
              strokeWidth={1}
            />
            <Text
              x={6}
              y={8}
              text={String(tagValue)}
              fontFamily="JetBrains Mono, monospace"
              fontSize={14}
              fill="#f3c44b"
              fontStyle="bold"
            />
            <Text
              x={80}
              y={10}
              text={String(node.params.unit || "")}
              fontFamily="sans-serif"
              fontSize={10}
              fill="#8a99b3"
            />
            <Text
              y={38}
              width={100}
              align="center"
              text={boundTagName || "display"}
              fontFamily="JetBrains Mono, monospace"
              fontSize={7}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* LEVEL INDICATOR WIDGET */}
        {node.kind === "level" && (
          <Group x={15} y={8}>
            {/* Level glass tank outline */}
            <Rect width={22} height={52} cornerRadius={3} stroke="#2a3d66" strokeWidth={1.5} />
            <Rect
              x={2}
              y={50 - Math.min(48, Math.max(0, (Number(tagValue) / 100) * 48))}
              width={18}
              height={Math.min(48, Math.max(0, (Number(tagValue) / 100) * 48))}
              cornerRadius={2}
              fill="#3fb6d6"
              opacity={0.8}
            />
            <Text
              x={30}
              y={12}
              text={`${tagValue}%`}
              fontFamily="JetBrains Mono, monospace"
              fontSize={12}
              fill="#3fb6d6"
              fontStyle="bold"
            />
            <Text
              x={30}
              y={30}
              text={boundTagName || "Nível"}
              fontFamily="JetBrains Mono, monospace"
              fontSize={7}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* PUSH BUTTON WIDGET */}
        {node.kind === "button" && (
          <Group x={width / 2} y={height / 2}>
            <Circle
              radius={20}
              fill={tagValue === true || tagValue === "true" ? "#22c55e" : "#ef4444"}
              stroke="#fff"
              strokeWidth={1}
              shadowColor="black"
              shadowBlur={4}
              onClick={(e) => {
                e.cancelBubble = true;
                syncTag(boundTagName, !tagValue);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                syncTag(boundTagName, !tagValue);
              }}
              cursor="pointer"
            />
            <Text
              x={-30}
              y={-5}
              width={60}
              align="center"
              text={String(node.params.labelText || "BOTAO")}
              fontFamily="sans-serif"
              fontSize={9}
              fontStyle="bold"
              fill="#fff"
            />
          </Group>
        )}

        {/* TOGGLE SWITCH WIDGET */}
        {node.kind === "switch" && (
          <Group x={width / 2 - 25} y={height / 2 - 12}>
            <Rect
              width={50}
              height={24}
              cornerRadius={12}
              fill={tagValue === true || tagValue === "true" ? "#3fb6d6" : "#263554"}
              onClick={(e) => {
                e.cancelBubble = true;
                syncTag(boundTagName, !tagValue);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                syncTag(boundTagName, !tagValue);
              }}
              cursor="pointer"
            />
            <Circle
              x={tagValue === true || tagValue === "true" ? 38 : 12}
              y={12}
              radius={10}
              fill="#fff"
              shadowBlur={3}
            />
            <Text
              y={28}
              width={50}
              align="center"
              text={String(node.params.labelText || "Auto")}
              fontFamily="sans-serif"
              fontSize={8}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* SLIDER CONTROLLER WIDGET */}
        {node.kind === "slider" && (
          <Group x={15} y={25}>
            {/* Track line */}
            <Line points={[0, 10, 90, 10]} stroke="#263554" strokeWidth={4} lineCap="round" />
            <Circle
              x={Math.min(90, Math.max(0, (Number(tagValue) / 100) * 90))}
              y={10}
              radius={8}
              fill="#3fb6d6"
              draggable
              dragBoundFunc={(pos) => {
                // Ensure slider thumb stays horizontally bounded
                const stage = groupRef.current?.getStage();
                if (!stage) return pos;
                const nodeX = groupRef.current!.x() + 15;
                const scale = stage.scaleX();
                const minX = nodeX * scale + stage.x();
                const maxX = (nodeX + 90) * scale + stage.x();
                return {
                  x: Math.min(maxX, Math.max(minX, pos.x)),
                  y: (groupRef.current!.y() + 35) * scale + stage.y(),
                };
              }}
              onDragMove={handleSliderDrag}
            />
            <Text
              x={0}
              y={-14}
              text={`${tagValue}%`}
              fontFamily="JetBrains Mono, monospace"
              fontSize={9}
              fill="#3fb6d6"
            />
            <Text
              x={40}
              y={-14}
              text={boundTagName || "SP"}
              fontFamily="sans-serif"
              fontSize={8}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* TEXT LABEL WIDGET */}
        {node.kind === "label" && (
          <Group x={10} y={15}>
            <Text
              width={100}
              align="center"
              text={String(node.params.text || "HMI Label")}
              fontFamily="sans-serif"
              fontSize={12}
              fontStyle="bold"
              fill="#e6ecf5"
            />
          </Group>
        )}

        {/* TREND WIDGET */}
        {node.kind === "trend" && (
          <Group x={10} y={10}>
            <Rect
              width={160}
              height={80}
              cornerRadius={4}
              fill="#0b0e14"
              stroke="#1b2438"
              strokeWidth={1}
            />
            {/* Draw mini graph grid */}
            {[20, 40, 60].map((yVal) => (
              <Line
                key={yVal}
                points={[0, yVal, 160, yVal]}
                stroke="#151d2a"
                strokeWidth={0.5}
                dash={[2, 2]}
              />
            ))}
            {/* Draw a gorgeous neon line representation */}
            <Line
              points={[
                10,
                65,
                30,
                55 + Math.sin(tick / 4) * 15,
                60,
                35 - Math.sin(tick / 6) * 20,
                90,
                50 + Math.cos(tick / 5) * 10,
                120,
                25 - Math.sin(tick / 3) * 15,
                150,
                40,
              ]}
              stroke="#f3c44b"
              strokeWidth={1.5}
              tension={0.3}
            />
            <Text
              x={5}
              y={5}
              text={boundTagName ? `Trend: ${boundTagName}` : "Trend Chart"}
              fontFamily="sans-serif"
              fontSize={8}
              fill="#8a99b3"
            />
          </Group>
        )}

        {/* DEFAULT FALLBACK LABEL FOR SCADA WIDGET */}
        {!["gauge", "display", "level", "button", "switch", "slider", "label", "trend"].includes(
          node.kind,
        ) && (
          <Group x={12} y={12}>
            <Text
              text={node.label}
              fontFamily="JetBrains Mono, monospace"
              fontSize={11}
              fill="#e6ecf5"
              fontStyle="bold"
            />
            <Text
              y={18}
              text={`Widget HMI (${node.kind})`}
              fontFamily="sans-serif"
              fontSize={8}
              fill="#8a99b3"
            />
          </Group>
        )}
      </Group>
    );
  }

  // STANDARD INDUSTRIAL SYMBOL / DIGITAL TWIN
  return (
    <Group
      x={node.position.x}
      y={node.position.y}
      draggable
      ref={groupRef}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(e) => onMove({ x: e.target.x(), y: e.target.y() })}
    >
      {selected && (
        <Rect
          x={-4}
          y={-4}
          width={128}
          height={68}
          cornerRadius={10}
          stroke={accent}
          strokeWidth={1.5}
          dash={[4, 4]}
          opacity={0.9}
        />
      )}
      <Rect
        width={120}
        height={60}
        cornerRadius={8}
        fill="#1a2030"
        stroke={accent}
        strokeWidth={1.5}
        shadowColor="black"
        shadowBlur={12}
        shadowOpacity={0.4}
      />
      <Group x={12} y={12}>
        <Symbol kind={node.kind} accent={accent} tick={tick} variant={variant} />
      </Group>
      <Text
        x={52}
        y={10}
        text={node.label}
        fontFamily="JetBrains Mono, monospace"
        fontSize={12}
        fontStyle="bold"
        fill="#e6ecf5"
      />
      <Text
        x={52}
        y={26}
        text={summarize(node)}
        fontFamily="JetBrains Mono, monospace"
        fontSize={9}
        fill="#8a99b3"
        width={64}
        ellipsis
      />
      {node.energized && (
        <Circle
          x={110}
          y={10}
          radius={3}
          fill={accent}
          opacity={0.5 + 0.5 * Math.abs(Math.sin(tick / 8))}
        />
      )}
    </Group>
  );
}

function Symbol({
  kind,
  accent,
  tick,
  variant,
}: {
  kind: IndustrialNode["kind"];
  accent: string;
  tick: number;
  variant: Variant;
}) {
  const animate = variant === "scada" || variant === "twin";
  switch (kind) {
    case "motor":
      return (
        <Group>
          <Circle x={18} y={18} radius={16} stroke={accent} strokeWidth={2} />
          <Text x={10} y={10} text="M" fontSize={16} fontStyle="bold" fill={accent} />
          {animate && (
            <Ring
              x={18}
              y={18}
              innerRadius={10}
              outerRadius={11}
              stroke={accent}
              rotation={(tick * 9) % 360}
              dash={[3, 4]}
            />
          )}
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
          <Rect
            x={2}
            y={animate ? 8 + Math.sin(tick / 12) * 3 : 12}
            width={32}
            height={animate ? 26 - Math.sin(tick / 12) * 3 : 22}
            fill={accent}
            opacity={0.3}
            cornerRadius={3}
          />
        </Group>
      );
    case "valve":
      return (
        <Group y={6}>
          <RegularPolygon
            x={10}
            y={12}
            sides={3}
            radius={12}
            rotation={90}
            stroke={accent}
            strokeWidth={2}
          />
          <RegularPolygon
            x={26}
            y={12}
            sides={3}
            radius={12}
            rotation={-90}
            stroke={accent}
            strokeWidth={2}
          />
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
      return (
        <Rect x={0} y={14} width={36} height={8} cornerRadius={2} fill={accent} opacity={0.7} />
      );
    case "breaker":
    case "contactor":
      return (
        <Group>
          <Rect
            x={4}
            y={4}
            width={28}
            height={28}
            cornerRadius={4}
            stroke={accent}
            strokeWidth={2}
          />
          <Line points={[10, 26, 22, 10]} stroke={accent} strokeWidth={2} />
        </Group>
      );
    case "vfd":
    case "softstarter":
      return (
        <Group>
          <Rect
            x={2}
            y={4}
            width={32}
            height={28}
            cornerRadius={4}
            stroke={accent}
            strokeWidth={2}
          />
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
          <Text
            x={6}
            y={11}
            text={kind === "pt100" ? "T°" : kind === "pressure" ? "P" : kind === "flow" ? "Q" : "L"}
            fontSize={13}
            fill={accent}
            fontStyle="bold"
          />
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
          {animate &&
            [0, 12, 24].map((x) => (
              <Rect
                key={x}
                x={(x + tick * 1.5) % 36}
                y={16}
                width={6}
                height={6}
                fill={accent}
                opacity={0.6}
              />
            ))}
        </Group>
      );
    case "reactor":
      return <Circle x={18} y={18} radius={16} stroke={accent} strokeWidth={2} />;
    default:
      return (
        <Rect x={4} y={4} width={28} height={28} cornerRadius={4} stroke={accent} strokeWidth={2} />
      );
  }
}

function summarize(n: IndustrialNode) {
  return Object.entries(n.params)
    .slice(0, 2)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
}
