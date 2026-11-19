/**
 * Editor HMI de processo — três modos sobre o MESMO documento:
 *  - Desenho: arrastar equipamentos da biblioteca e interligar portas (como
 *    no unifilar), mover, girar, renomear, apagar; desfazer/refazer.
 *  - Código: a tela inteira como texto (linguagem HMI); a IA escreve o código.
 *  - Operar: SIMULAÇÃO — ligar/desligar, reverter, velocidade, válvulas,
 *    níveis; produto corre nas tubulações. Nunca escreve em equipamento real.
 * React Flow (DOM/SVG): funciona igual em computador, tablet e celular.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowArcLeft,
  ArrowArcRight,
  ArrowClockwise,
  ArrowsCounterClockwise,
  CheckCircle,
  Code,
  MagnifyingGlass,
  PencilSimple,
  Play,
  Plus,
  Robot,
  Stop,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORIES,
  MEDIUM_COLOR,
  MEDIUM_LABEL,
  equipmentDef,
  searchLibrary,
  type EquipmentDef,
  type PortDef,
  type PortSide,
} from "@/lib/hmi/process-library";
import { validateHmiDoc, type HmiEquipment, type HmiLink } from "@/lib/hmi/hmi-model";
import { parseHmiCode, serializeHmiDoc } from "@/lib/hmi/hmi-dsl";
import { runtimeTags } from "@/lib/hmi/hmi-runtime";
import { useHmiStore } from "@/lib/hmi/hmi-store";
import { generateHmiCode } from "@/lib/hmi/hmi-ai.functions";
import { publishTags } from "@/lib/scada/tag-hub";
import { isDocumentHidden } from "@/lib/utils/visibility";
import { IDLE_STATE, ProcessSymbol } from "./process-symbols";

// ── Geometria de portas com rotação ───────────────────────────────────

const SIDES: PortSide[] = ["top", "right", "bottom", "left"];

/** Gira o lado e a fração da porta em passos de 90° no sentido horário. */
export function rotatePort(
  side: PortSide,
  at: number,
  rotation: number,
): { side: PortSide; at: number } {
  let s = side;
  let a = at;
  for (let i = 0; i < (((rotation / 90) % 4) + 4) % 4; i++) {
    // left→top (1-a), top→right (a), right→bottom (1-a), bottom→left (a)
    const flip = s === "left" || s === "right";
    s = SIDES[(SIDES.indexOf(s) + 1) % 4];
    a = flip ? 1 - a : a;
  }
  return { side: s, at: a };
}

const POS: Record<PortSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function handleStyle(side: PortSide, at: number, color: string) {
  const pct = `${Math.round(at * 100)}%`;
  const base = { background: color, width: 12, height: 12, border: "2px solid #0b1220" };
  return side === "top" || side === "bottom" ? { ...base, left: pct } : { ...base, top: pct };
}

// ── Nó de equipamento ─────────────────────────────────────────────────

interface EquipmentNodeData {
  eq: HmiEquipment;
  def: EquipmentDef;
  operate: boolean;
}

const EquipmentNode = memo(function EquipmentNode({
  data,
  selected,
}: NodeProps<EquipmentNodeData>) {
  const { eq, def, operate } = data;
  const st = useHmiStore((s) => s.runtime.equipment[eq.id]) ?? IDLE_STATE;
  const rot = eq.rotation ?? 0;
  const swap = rot === 90 || rot === 270;
  const w = swap ? def.h : def.w;
  const h = swap ? def.w : def.h;
  const fluid =
    def.ports.find((p) => p.dir !== "out" && p.media[0] !== "energia")?.media[0] ?? "agua";
  return (
    <div
      className={`relative rounded-md ${selected ? "ring-2 ring-sky-400" : ""}`}
      style={{ width: w, height: h }}
      data-testid={`hmi-eq-${eq.id}`}
    >
      <div
        style={{
          width: def.w,
          height: def.h,
          transform: `translate(${(w - def.w) / 2}px, ${(h - def.h) / 2}px) rotate(${rot}deg)`,
          transformOrigin: "center",
        }}
      >
        <ProcessSymbol type={eq.type} w={def.w} h={def.h} state={st} fluid={fluid} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10px] leading-tight text-zinc-300">
        <div className="font-bold text-white">{eq.id}</div>
        {eq.label && <div className="text-zinc-400">{eq.label}</div>}
        {operate && st.running && (
          <div className={st.reverse ? "text-amber-400" : "text-emerald-400"}>
            {st.reverse ? "REVERSO" : "LIGADO"}
            {def.ops.includes("speed") ? ` ${st.speedPct}%` : ""}
          </div>
        )}
      </div>
      {def.ports.map((p: PortDef) => {
        const r = rotatePort(p.side, p.at, rot);
        return (
          <Handle
            key={p.id}
            id={p.id}
            type="source"
            position={POS[r.side]}
            style={handleStyle(r.side, r.at, MEDIUM_COLOR[p.media[0]])}
            title={`${p.label} (${p.dir === "in" ? "entrada" : p.dir === "out" ? "saída" : "conexão"}: ${p.media
              .map((m) => MEDIUM_LABEL[m])
              .join(", ")})`}
            isConnectable={!operate}
          />
        );
      })}
    </div>
  );
});

// ── Ligação (tubulação/transporte/cabo) ───────────────────────────────

interface PipeData {
  link: HmiLink;
}

const PipeEdge = memo(function PipeEdge(props: EdgeProps<PipeData>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } =
    props;
  const flowing = useHmiStore((s) => (data ? s.runtime.flowing[data.link.id] : false));
  const reversed = useHmiStore((s) => (data ? s.runtime.reversedLinks[data.link.id] : false));
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  const color = data ? MEDIUM_COLOR[data.link.medium] : "#94a3b8";
  const electric = data?.link.medium === "energia" || data?.link.medium === "sinal";
  return (
    <g>
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} />
      <path
        d={path}
        fill="none"
        stroke={selected ? "#38bdf8" : color}
        strokeWidth={electric ? 2 : 6}
        strokeOpacity={flowing ? 1 : 0.55}
        strokeDasharray={electric ? "5 4" : undefined}
      />
      {flowing && (
        <path
          d={path}
          fill="none"
          stroke="#f8fafc"
          strokeWidth={electric ? 1.5 : 2.5}
          className={`hmi-pipe-flow${reversed ? " hmi-rev" : ""}`}
        />
      )}
    </g>
  );
});

const nodeTypes = { equipment: EquipmentNode };
const edgeTypes = { pipe: PipeEdge };

// ── Biblioteca ─────────────────────────────────────────────────────────

function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchLibrary(q), [q]);
  return (
    <div className="flex h-full flex-col">
      <div className="relative p-2">
        <MagnifyingGlass className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: rosca, caldeira, tanque…"
          className="h-8 pl-7 text-xs"
          aria-label="Buscar equipamento"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {CATEGORIES.map((cat) => {
          const items = results.filter((d) => d.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {cat}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((d) => (
                  <button
                    key={d.type}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-hmi-equipment", d.type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onAdd(d.type)}
                    className="flex flex-col items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 p-1.5 text-[10px] text-zinc-300 hover:border-sky-500/60 hover:bg-zinc-800"
                    title={`${d.label} — toque para adicionar ou arraste para o desenho`}
                    data-testid={`hmi-lib-${d.type}`}
                  >
                    <div className="flex h-12 w-full items-center justify-center">
                      <div style={{ transform: `scale(${Math.min(1, 44 / d.h, 64 / d.w)})` }}>
                        <ProcessSymbol type={d.type} w={d.w} h={d.h} />
                      </div>
                    </div>
                    <span className="line-clamp-2 text-center leading-tight">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Propriedades / faceplate ───────────────────────────────────────────

function Properties({ id, operate }: { id: string; operate: boolean }) {
  const eq = useHmiStore((s) => s.doc.equipment.find((e) => e.id === id));
  const st = useHmiStore((s) => s.runtime.equipment[id]);
  const estop = useHmiStore((s) => s.runtime.estop);
  const update = useHmiStore((s) => s.updateEquipment);
  const rename = useHmiStore((s) => s.renameEquipment);
  const remove = useHmiStore((s) => s.removeEquipment);
  const command = useHmiStore((s) => s.command);
  const select = useHmiStore((s) => s.select);
  const [idDraft, setIdDraft] = useState(id);
  useEffect(() => setIdDraft(id), [id]);
  if (!eq) return null;
  const def = equipmentDef(eq.type);
  if (!def) return null;
  const run = (cmd: Parameters<typeof command>[0]) => {
    const r = command(cmd);
    if (!r.ok) toast.error(r.reason);
  };

  return (
    <div className="space-y-3 p-3 text-xs" data-testid="hmi-properties">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm font-bold text-white">{eq.id}</div>
          <div className="text-zinc-400">{def.label}</div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => select(null)}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {operate ? (
        <div className="space-y-3">
          {def.ops.includes("run") && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500"
                disabled={st?.running || estop}
                onClick={() => run({ kind: "start", id })}
                data-testid="hmi-start"
              >
                <Play className="mr-1 h-3.5 w-3.5" /> Ligar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!st?.running}
                onClick={() => run({ kind: "stop", id })}
              >
                <Stop className="mr-1 h-3.5 w-3.5" /> Desligar
              </Button>
            </div>
          )}
          {def.ops.includes("reverse") && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => run({ kind: "toggleReverse", id })}
            >
              <ArrowsCounterClockwise className="mr-1 h-3.5 w-3.5" />
              Sentido: {st?.reverse ? "REVERSO (trás)" : "DIRETO (frente)"} — trocar
            </Button>
          )}
          {def.ops.includes("speed") && (
            <label className="block space-y-1">
              <span className="text-zinc-400">Velocidade: {st?.speedPct ?? 100}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={st?.speedPct ?? 100}
                onChange={(e) => run({ kind: "speed", id, pct: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </label>
          )}
          {def.ops.includes("open") && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500"
                disabled={st?.open}
                onClick={() => run({ kind: "open", id })}
              >
                Abrir
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!st?.open}
                onClick={() => run({ kind: "close", id })}
              >
                Fechar
              </Button>
            </div>
          )}
          {def.ops.includes("level") && (
            <label className="block space-y-1">
              <span className="text-zinc-400">
                Nível (simulado): {Math.round(st?.levelPct ?? 0)}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(st?.levelPct ?? 0)}
                onChange={(e) => run({ kind: "setLevel", id, pct: Number(e.target.value) })}
                className="w-full accent-sky-500"
              />
            </label>
          )}
          {def.ops.length === 0 && (
            <p className="text-zinc-500">Equipamento passivo: sem comandos.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-zinc-400">Identificação</span>
            <Input
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              onBlur={() => {
                const err = rename(id, idDraft.trim());
                if (err) {
                  toast.error(err);
                  setIdDraft(id);
                }
              }}
              className="h-8 font-mono text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400">Nome</span>
            <Input
              value={eq.label}
              maxLength={80}
              onChange={(e) => update(id, { label: e.target.value })}
              className="h-8 text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400">Tag (CLP/SCADA)</span>
            <Input
              value={eq.tag ?? ""}
              placeholder={eq.id}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "" || /^[A-Za-z0-9_.-]{1,64}$/.test(v))
                  update(id, { tag: v || undefined });
              }}
              className="h-8 font-mono text-xs"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                update(id, { rotation: (((eq.rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 })
              }
            >
              <ArrowClockwise className="mr-1 h-3.5 w-3.5" /> Girar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => remove(id)}>
              <Trash className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
          <div className="pt-1 text-[10px] text-zinc-500">
            Portas:{" "}
            {def.ports.map((p) => (
              <span key={p.id} className="mr-1 inline-flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: MEDIUM_COLOR[p.media[0]] }}
                />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────

function FlowCanvas({ operate }: { operate: boolean }) {
  const doc = useHmiStore((s) => s.doc);
  const selectedId = useHmiStore((s) => s.selectedId);
  const select = useHmiStore((s) => s.select);
  const move = useHmiStore((s) => s.moveEquipment);
  const connect = useHmiStore((s) => s.connect);
  const removeLink = useHmiStore((s) => s.removeLink);
  const removeEquipment = useHmiStore((s) => s.removeEquipment);
  const addEquipment = useHmiStore((s) => s.addEquipment);
  const rf = useReactFlow();
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});

  const nodes: Node<EquipmentNodeData>[] = useMemo(
    () =>
      doc.equipment.flatMap((eq) => {
        const def = equipmentDef(eq.type);
        if (!def) return [];
        return [
          {
            id: eq.id,
            type: "equipment",
            position: dragPos[eq.id] ?? { x: eq.x, y: eq.y },
            data: { eq, def, operate },
            selected: eq.id === selectedId,
            draggable: !operate,
          },
        ];
      }),
    [doc.equipment, selectedId, operate, dragPos],
  );

  const edges: Edge<PipeData>[] = useMemo(
    () =>
      doc.links.map((l) => ({
        id: l.id,
        source: l.from.equipment,
        sourceHandle: l.from.port,
        target: l.to.equipment,
        targetHandle: l.to.port,
        type: "pipe",
        data: { link: l },
      })),
    [doc.links],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          if (c.dragging) setDragPos((p) => ({ ...p, [c.id]: c.position! }));
          else {
            move(c.id, c.position.x, c.position.y);
            setDragPos((p) => {
              const n = { ...p };
              delete n[c.id];
              return n;
            });
          }
        } else if (c.type === "position" && c.dragging === false) {
          const pos = dragPos[c.id];
          if (pos) move(c.id, pos.x, pos.y);
          setDragPos((p) => {
            const n = { ...p };
            delete n[c.id];
            return n;
          });
        } else if (c.type === "remove" && !operate) {
          removeEquipment(c.id);
        }
      }
    },
    [move, removeEquipment, operate, dragPos],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return;
      const a = doc.equipment.find((e) => e.id === c.source);
      const b = doc.equipment.find((e) => e.id === c.target);
      const pa = a && equipmentDef(a.type)?.ports.find((p) => p.id === c.sourceHandle);
      const pb = b && equipmentDef(b.type)?.ports.find((p) => p.id === c.targetHandle);
      // O sentido segue as portas: quem é "saída" é a origem.
      const swap = pa?.dir === "in" || pb?.dir === "out";
      const from = { equipment: c.source, port: c.sourceHandle };
      const to = { equipment: c.target, port: c.targetHandle };
      const r = swap ? connect(to, from) : connect(from, to);
      if (!r.ok) toast.error(r.reason);
    },
    [connect, doc.equipment],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/x-hmi-equipment");
      if (!type) return;
      const p = rf.project({
        x: e.clientX - e.currentTarget.getBoundingClientRect().left,
        y: e.clientY - e.currentTarget.getBoundingClientRect().top,
      });
      addEquipment(type, p.x, p.y);
    },
    [rf, addEquipment],
  );

  return (
    <div
      className="h-full w-full"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      data-testid="hmi-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={operate ? undefined : onConnect}
        onNodeClick={(_, n) => select(n.id)}
        onPaneClick={() => select(null)}
        onEdgesDelete={operate ? undefined : (es) => es.forEach((x) => removeLink(x.id))}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={!operate}
        deleteKeyCode={operate ? null : ["Delete", "Backspace"]}
        minZoom={0.15}
        maxZoom={3}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-[#0b1220]"
      >
        <Background color="#1e293b" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!hidden md:!block"
          style={{ background: "#0f172a" }}
          nodeColor="#475569"
          maskColor="rgba(2,6,23,0.65)"
        />
      </ReactFlow>
    </div>
  );
}

// ── Código ─────────────────────────────────────────────────────────────

function CodeEditor() {
  const doc = useHmiStore((s) => s.doc);
  const replaceDoc = useHmiStore((s) => s.replaceDoc);
  const [text, setText] = useState(() => serializeHmiDoc(doc));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setText(serializeHmiDoc(doc));
  }, [doc, touched]);
  const result = useMemo(() => parseHmiCode(text), [text]);
  const lines = text.split("\n").length;
  const errors = result.issues.filter((i) => i.level === "error");

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
        <Button
          size="sm"
          disabled={!result.doc || !touched}
          onClick={() => {
            if (!result.doc) return;
            replaceDoc(result.doc);
            setTouched(false);
            toast.success("Código aplicado ao desenho.");
          }}
          data-testid="hmi-apply-code"
        >
          <CheckCircle className="mr-1 h-3.5 w-3.5" /> Aplicar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!touched}
          onClick={() => {
            setText(serializeHmiDoc(doc));
            setTouched(false);
          }}
        >
          Descartar
        </Button>
        <span className={errors.length ? "text-red-400" : "text-emerald-400"}>
          {errors.length ? `${errors.length} erro(s)` : "Código válido"}
        </span>
        <span className="ml-auto hidden text-zinc-500 sm:inline">
          equipamento ID tipo "nome" em x,y · ligar A.porta -&gt; B.porta meio
        </span>
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto bg-[#0b1220] font-mono text-[12px] leading-5">
        <pre className="select-none px-2 py-2 text-right text-zinc-600" aria-hidden>
          {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setTouched(true);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-h-full flex-1 resize-none bg-transparent px-2 py-2 text-zinc-100 outline-none"
          aria-label="Código da tela HMI"
          data-testid="hmi-code"
        />
      </div>
      {result.issues.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-t border-zinc-800 px-3 py-2 text-[11px]">
          {result.issues.slice(0, 30).map((i, k) => (
            <div key={k} className={i.level === "error" ? "text-red-400" : "text-amber-400"}>
              {i.line ? `linha ${i.line}: ` : ""}
              {i.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── IA ─────────────────────────────────────────────────────────────────

function AiPanel({ onClose }: { onClose: () => void }) {
  const doc = useHmiStore((s) => s.doc);
  const replaceDoc = useHmiStore((s) => s.replaceDoc);
  const setMode = useHmiStore((s) => s.setMode);
  const gen = useServerFn(generateHmiCode);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ code: string; summary: string } | null>(null);
  const changeCurrent = doc.equipment.length > 0;

  const run = async () => {
    setBusy(true);
    setProposal(null);
    try {
      const r = await gen({
        data: { prompt, currentCode: changeCurrent ? serializeHmiDoc(doc) : undefined },
      });
      if (!r.ok) toast.error(r.error);
      else setProposal({ code: r.code, summary: r.summary });
    } catch {
      toast.error("Falha ao falar com a IA.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-3 text-xs" data-testid="hmi-ai">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-white">
          <Robot className="h-4 w-4 text-sky-400" /> IA da tela HMI
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        maxLength={4000}
        placeholder={
          changeCurrent
            ? "Ex.: acrescente um exaustor no cozinhador e uma bomba levando o óleo para o tanque 2"
            : "Ex.: fábrica de óleo e farinha: moega, rosca, cozinhador com vapor da caldeira, prensa, decanter e tanque de óleo"
        }
      />
      <Button
        className="w-full"
        disabled={busy || prompt.trim().length < 3}
        onClick={() => void run()}
      >
        {busy ? "Gerando código…" : changeCurrent ? "Alterar a tela atual" : "Criar a tela"}
      </Button>
      {proposal && (
        <div className="space-y-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-2">
          {proposal.summary && <p className="text-zinc-300">{proposal.summary}</p>}
          <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-200">
            {proposal.code}
          </pre>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              onClick={() => {
                const p = parseHmiCode(proposal.code);
                if (!p.doc) {
                  toast.error("O código da IA tem erros.");
                  return;
                }
                replaceDoc(p.doc);
                setMode("design");
                setProposal(null);
                toast.success("Tela aplicada. Use Ctrl+Z para desfazer.");
              }}
            >
              Aplicar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposal(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-zinc-500">
        Usa créditos de IA do plano. Nada é aplicado sem você confirmar.
      </p>
    </div>
  );
}

// ── Estúdio ────────────────────────────────────────────────────────────

const TICK_MS = 250;
const PUBLISH_MS = 1000;

export function HmiProcessStudio() {
  const mode = useHmiStore((s) => s.mode);
  const setMode = useHmiStore((s) => s.setMode);
  const doc = useHmiStore((s) => s.doc);
  const selectedId = useHmiStore((s) => s.selectedId);
  const undo = useHmiStore((s) => s.undo);
  const redo = useHmiStore((s) => s.redo);
  const canUndo = useHmiStore((s) => s.past.length > 0);
  const canRedo = useHmiStore((s) => s.future.length > 0);
  const estop = useHmiStore((s) => s.runtime.estop);
  const command = useHmiStore((s) => s.command);
  const addEquipment = useHmiStore((s) => s.addEquipment);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const operate = mode === "operate";
  const issues = useMemo(() => validateHmiDoc(doc), [doc]);
  const errors = issues.filter((i) => i.level === "error").length;

  // Simulação: passo a cada 250 ms; tags na base única a cada 1 s.
  useEffect(() => {
    if (!operate) return;
    let last = performance.now();
    let lastPub = 0;
    const t = setInterval(() => {
      const now = performance.now();
      // Aba oculta: não simular. Reancora `last` para não dar salto de dt ao
      // voltar (o HMI integra sobre dt real, ao contrário de planta/CCM).
      if (isDocumentHidden()) {
        last = now;
        return;
      }
      // Limita o dt (aba que ficou em segundo plano, GC, breakpoint): um passo
      // de cada vez em vez de um salto que esvaziaria/encheria tanques de uma vez.
      const dt = Math.min((now - last) / 1000, 0.5);
      useHmiStore.getState().tick(dt);
      last = now;
      if (now - lastPub >= PUBLISH_MS) {
        lastPub = now;
        const s = useHmiStore.getState();
        publishTags("SIMULATION", runtimeTags(s.doc, s.runtime));
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [operate]);

  // Atalhos de desfazer/refazer no desenho.
  const studioRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (operate || !(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (
        !studioRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body
      )
        return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [operate, undo, redo]);

  const addAtCenter = (type: string) => {
    const n = doc.equipment.length;
    addEquipment(type, 60 + (n % 5) * 240, 60 + Math.floor(n / 5) * 220);
    setPaletteOpen(false);
  };

  const tab = (m: typeof mode, label: string, Icon: typeof Code) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs ${
        mode === m ? "bg-sky-600 text-white" : "text-zinc-400 hover:text-white"
      }`}
      data-testid={`hmi-mode-${m}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  const side = aiOpen ? (
    <AiPanel onClose={() => setAiOpen(false)} />
  ) : selectedId ? (
    <Properties id={selectedId} operate={operate} />
  ) : null;

  return (
    <div
      ref={studioRef}
      className="flex h-full min-h-0 flex-col bg-[#080b11] text-zinc-200"
      data-testid="hmi-studio"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {tab("design", "Desenho", PencilSimple)}
          {tab("code", "Código", Code)}
          {tab("operate", "Operar", Play)}
        </div>
        {mode === "design" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 lg:hidden"
              onClick={() => setPaletteOpen((v) => !v)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Equipamentos
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!canUndo}
              onClick={undo}
              aria-label="Desfazer"
            >
              <ArrowArcLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={!canRedo}
              onClick={redo}
              aria-label="Refazer"
            >
              <ArrowArcRight className="h-4 w-4" />
            </Button>
          </>
        )}
        {mode !== "operate" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setAiOpen((v) => !v)}
            data-testid="hmi-ai-toggle"
          >
            <Robot className="mr-1 h-3.5 w-3.5" /> IA
          </Button>
        )}
        {operate && (
          <>
            {estop ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => command({ kind: "reset" })}
              >
                Rearmar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="h-7"
                onClick={() => command({ kind: "estop" })}
              >
                <Stop className="mr-1 h-3.5 w-3.5" /> Parar tudo
              </Button>
            )}
          </>
        )}
        <span
          className={`ml-auto flex items-center gap-1 text-[11px] ${errors ? "text-red-400" : issues.length ? "text-amber-400" : "text-zinc-500"}`}
          title={issues.map((i) => i.message).join("\n")}
        >
          {issues.length ? <Warning className="h-3.5 w-3.5" /> : null}
          {doc.equipment.length} equip. · {doc.links.length} lig.
          {issues.length ? ` · ${issues.length} aviso(s)` : ""}
        </span>
      </div>

      {operate && (
        <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-center text-[11px] font-semibold text-amber-300">
          MODO SIMULAÇÃO — DADOS ILUSTRATIVOS, NÃO ORIGINADOS DE EQUIPAMENTO FÍSICO. Nenhum comando
          sai para o campo.
          {estop && " · PARADA GERAL ATIVA"}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {mode === "design" && (
          <aside
            className={`${paletteOpen ? "absolute inset-y-0 left-0 z-20 flex" : "hidden"} w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 lg:static lg:flex`}
          >
            <Palette onAdd={addAtCenter} />
          </aside>
        )}
        <div className="relative min-w-0 flex-1">
          {mode === "code" ? (
            <CodeEditor />
          ) : (
            <>
              <ReactFlowProvider>
                <FlowCanvas operate={operate} />
              </ReactFlowProvider>
              {doc.equipment.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-zinc-400">
                  <p>
                    {operate
                      ? "Desenhe a tela antes de operar."
                      : "Arraste equipamentos da biblioteca, escreva o código da tela ou peça para a IA montar."}
                  </p>
                  {!operate && (
                    <div className="pointer-events-auto flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="lg:hidden"
                        onClick={() => setPaletteOpen(true)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Equipamentos
                      </Button>
                      <Button size="sm" onClick={() => setAiOpen(true)}>
                        <Robot className="mr-1 h-3.5 w-3.5" /> Montar com IA
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {side && (
          <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[45%] overflow-y-auto border-t border-zinc-800 bg-zinc-950 md:static md:max-h-none md:w-72 md:shrink-0 md:border-l md:border-t-0">
            {side}
          </aside>
        )}
      </div>
    </div>
  );
}
