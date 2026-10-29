import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  LadderRung,
  LadderCell,
  LadderInstruction,
  LadderBranch,
  LadderBranchItem,
  LadderCellKind,
  RungTopology,
} from "@/lib/ladder/types";
import {
  newRung,
  emptyCell,
  rungCols,
  generateUniqueRungId,
  ensureRungTopology,
  buildTopologyFromCells,
  isOutputKind,
} from "@/lib/ladder/types";
import { compileProgram } from "@/lib/ladder/compiler";
import {
  scanRungs,
  resetRuntimeState,
  getLastScanDuration,
  LadderScanTimeoutError,
  type ScanResult,
} from "@/lib/ladder/runtime";
import { validateRungs } from "@/lib/ladder/validator";
import { useEditorStore, type LadderProfile, type EditorTag } from "@/lib/editor/store";
import { LadderCellView } from "./ladder-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Pause,
  Square,
  RotateCcw,
  StepForward,
  Code2,
  Rows3,
  X,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Edit2,
  Undo2,
  Redo2,
  ClipboardPaste,
  GitFork,
  AlertTriangle,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Hand,
  CheckCircle2,
  Activity,
  Layers,
} from "lucide-react";

/**
 * Cria o projeto industrial de referência oficial (Imagem 1).
 * Contém Selo clássico de bomba, temporizador TON com pino ET ao vivo e comparador de nível.
 */
function createReferenceIndustrialProject(): LadderRung[] {
  // Rung 0001: Partida Bomba com Selo e Saídas Paralelas
  const r1: LadderRung = {
    id: "rung-0001",
    label: "0001 | Habilitação e Partida da Bomba Principal de Recalque",
    comment: "0001 | Habilitação e Partida da Bomba Principal de Recalque",
    cols: 6,
    cells: [
      [
        { id: "inst-b-partida", kind: "XIC", operand: "B_PARTIDA" },
        { id: "inst-b-selo", kind: "XIC", operand: "B_STATUS_RUN" },
        { id: "inst-e-stop", kind: "XIO", operand: "E_PARADA_EMERG" },
        { id: "inst-falha", kind: "XIO", operand: "FALHA_SOBRECARGA" },
        emptyCell(),
        { id: "out-bomba-main", kind: "OTE", operand: "BOMBA_MAIN" },
      ],
      [
        { id: "inst-b-selo", kind: "XIC", operand: "B_STATUS_RUN" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { id: "out-sinaliz-run", kind: "OTE", operand: "SINALIZ_RUN" },
      ],
    ],
    topology: {
      id: "rung-0001",
      number: 1,
      comment: "0001 | Habilitação e Partida da Bomba Principal de Recalque",
      rootBranch: {
        id: "r1-root",
        items: [
          {
            id: "r1-selo",
            type: "parallel",
            branches: [
              {
                id: "r1-b1",
                items: [
                  {
                    id: "r1-b-partida",
                    type: "instruction",
                    instruction: { id: "inst-b-partida", kind: "XIC", operand: "B_PARTIDA" },
                  },
                ],
              },
              {
                id: "r1-b2",
                items: [
                  {
                    id: "r1-b-selo",
                    type: "instruction",
                    instruction: { id: "inst-b-selo", kind: "XIC", operand: "B_STATUS_RUN" },
                  },
                ],
              },
            ],
          },
          {
            id: "r1-estop",
            type: "instruction",
            instruction: { id: "inst-e-stop", kind: "XIO", operand: "E_PARADA_EMERG" },
          },
          {
            id: "r1-falha",
            type: "instruction",
            instruction: { id: "inst-falha", kind: "XIO", operand: "FALHA_SOBRECARGA" },
          },
        ],
      },
      outputs: [
        { id: "out-bomba-main", kind: "OTE", operand: "BOMBA_MAIN" },
        { id: "out-sinaliz-run", kind: "OTE", operand: "SINALIZ_RUN" },
      ],
    },
  };

  // Rung 0002: Temporizador TON Bomba Reserva
  const r2: LadderRung = {
    id: "rung-0002",
    label: "0002 | Temporizador de Atraso para Entrada da Bomba Reserva",
    comment: "0002 | Temporizador de Atraso para Entrada da Bomba Reserva",
    cols: 6,
    cells: [
      [
        { id: "inst-r2-bomba", kind: "XIC", operand: "BOMBA_MAIN" },
        { id: "inst-r2-ton", kind: "TON", operand: "TON_01", preset: 10000, params: { PT: 10000 } },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { id: "out-r2-bomba-reserva", kind: "OTE", operand: "BOMBA_RESERVA_HAB" },
      ],
    ],
    topology: {
      id: "rung-0002",
      number: 2,
      comment: "0002 | Temporizador de Atraso para Entrada da Bomba Reserva",
      rootBranch: {
        id: "r2-root",
        items: [
          {
            id: "r2-bomba-main",
            type: "instruction",
            instruction: { id: "inst-r2-bomba", kind: "XIC", operand: "BOMBA_MAIN" },
          },
          {
            id: "r2-ton",
            type: "instruction",
            instruction: {
              id: "inst-r2-ton",
              kind: "TON",
              operand: "TON_01",
              preset: 10000,
              params: { PT: 10000 },
            },
          },
        ],
      },
      outputs: [{ id: "out-r2-bomba-reserva", kind: "OTE", operand: "BOMBA_RESERVA_HAB" }],
    },
  };

  // Rung 0003: Comparador de Nível
  const r3: LadderRung = {
    id: "rung-0003",
    label: "0003 | Intertravamento de Nível com Comparador (>=)",
    comment: "0003 | Intertravamento de Nível com Comparador (>=)",
    cols: 6,
    cells: [
      [
        {
          id: "inst-r3-cmp",
          kind: "CMP_GE",
          operand: "COMP_01",
          params: { IN1: "NIVEL_AGUA", IN2: "NIVEL_CRITICO" },
        },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { id: "out-r3-alm", kind: "OTE", operand: "ALM_NIVEL_ALTO" },
      ],
    ],
    topology: {
      id: "rung-0003",
      number: 3,
      comment: "0003 | Intertravamento de Nível com Comparador (>=)",
      rootBranch: {
        id: "r3-root",
        items: [
          {
            id: "r3-cmp",
            type: "instruction",
            instruction: {
              id: "inst-r3-cmp",
              kind: "CMP_GE",
              operand: "COMP_01",
              params: { IN1: "NIVEL_AGUA", IN2: "NIVEL_CRITICO" },
            },
          },
        ],
      },
      outputs: [{ id: "out-r3-alm", kind: "OTE", operand: "ALM_NIVEL_ALTO" }],
    },
  };

  return [r1, r2, r3];
}

export function RungGrid() {
  const rungs = useEditorStore((s) => s.rungs);
  const setRungs = useEditorStore((s) => s.setRungs);
  const setRungsRuntime = useEditorStore((s) => s.setRungsRuntime);
  const editorTags = useEditorStore((s) => s.editorTags);
  const upsertTag = useEditorStore((s) => s.upsertTag);
  const forceTagValue = useEditorStore((s) => s.forceTagValue);
  const releaseTag = useEditorStore((s) => s.releaseTag);
  const selected = useEditorStore((s) => s.selectedNodeId);
  const select = useEditorStore((s) => s.setSelectedNode);
  const profile = useEditorStore((s) => s.ladderProfile);
  const setProfile = useEditorStore((s) => s.setLadderProfile);
  const setSelectedTarget = useEditorStore((s) => s.setSelectedLadderTarget);
  const selectedTarget = useEditorStore((s) => s.selectedLadderTarget);
  const simulationStatus = useEditorStore((s) => s.simulationStatus);
  const setSimulationStatus = useEditorStore((s) => s.setSimulationStatus);

  const running = simulationStatus === "running";
  const [zoom, setZoom] = useState(100);
  const [tScan, setTScan] = useState(12);
  const [showST, setShowST] = useState(false);
  const [compileFormat, setCompileFormat] = useState<"ST" | "IL">("ST");

  // Ponto e cursor de inserção previsível
  const [insertionPoint, setInsertionPoint] = useState<{ rungId: string; index: number } | null>(null);

  // Pilha de histórico para Undo / Redo (com refs para evitar mutação in-place e dupla invocação do StrictMode)
  const [undoStack, setUndoStack] = useState<LadderRung[][]>([]);
  const [redoStack, setRedoStack] = useState<LadderRung[][]>([]);
  const undoStackRef = useRef<LadderRung[][]>([]);
  const redoStackRef = useRef<LadderRung[][]>([]);

  // Área de transferência local (Copy / Paste)
  const [clipboard, setClipboard] = useState<{
    type: "rung" | "instruction";
    rungData?: LadderRung;
    instructionData?: LadderInstruction;
  } | null>(null);

  // Edição inline de comentários de rede
  const [editingCommentRungId, setEditingCommentRungId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const [scanState, setScanState] = useState<Record<string, ScanResult>>({});
  const intervalRef = useRef<number | null>(null);
  const scanCountRef = useRef(0);

  // Aplica mutação com registro atômico no histórico de Undo (com cópia profunda imutável)
  const applyRungsWithHistory = useCallback(
    (updater: (prev: LadderRung[]) => LadderRung[]) => {
      const current = useEditorStore.getState().rungs;
      const snapshot: LadderRung[] = JSON.parse(JSON.stringify(current));
      const workingCopy: LadderRung[] = JSON.parse(JSON.stringify(current));
      const next = updater(workingCopy);
      undoStackRef.current = [...undoStackRef.current.slice(-30), snapshot];
      redoStackRef.current = [];
      setUndoStack(undoStackRef.current);
      setRedoStack([]);
      setRungs(next);
    },
    [setRungs],
  );

  // Desfazer (Undo)
  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const currentSnapshot: LadderRung[] = JSON.parse(
      JSON.stringify(useEditorStore.getState().rungs),
    );
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, currentSnapshot];
    setUndoStack(undoStackRef.current);
    setRedoStack(redoStackRef.current);
    setRungs(JSON.parse(JSON.stringify(previous)));
    toast.info("Desfazer (Undo) aplicado");
  }, [setRungs]);

  // Refazer (Redo)
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const currentSnapshot: LadderRung[] = JSON.parse(
      JSON.stringify(useEditorStore.getState().rungs),
    );
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, currentSnapshot];
    setRedoStack(redoStackRef.current);
    setUndoStack(undoStackRef.current);
    setRungs(JSON.parse(JSON.stringify(next)));
    toast.info("Refazer (Redo) aplicado");
  }, [setRungs]);

  // Copiar elemento ou rede selecionada
  const copySelected = useCallback(() => {
    if (selectedTarget?.elementId && selectedTarget.rungId) {
      const rung = rungs.find((r) => r.id === selectedTarget.rungId);
      if (!rung) return;
      const topology = ensureRungTopology(rung);
      let found: LadderInstruction | undefined;

      for (const item of topology.rootBranch.items) {
        if (item.type === "instruction" && item.instruction?.id === selectedTarget.elementId) {
          found = item.instruction;
          break;
        } else if (item.type === "parallel" && item.branches) {
          for (const br of item.branches) {
            for (const bi of br.items) {
              if (bi.type === "instruction" && bi.instruction?.id === selectedTarget.elementId) {
                found = bi.instruction;
                break;
              }
            }
          }
        }
      }

      if (!found) {
        found = topology.outputs.find((o) => o.id === selectedTarget.elementId);
      }

      if (found) {
        setClipboard({ type: "instruction", instructionData: { ...found } });
        toast.success(`Instrução ${found.kind} (${found.operand}) copiada`);
        return;
      }
    }

    if (selected) {
      const rung = rungs.find((r) => r.id === selected);
      if (rung) {
        setClipboard({ type: "rung", rungData: JSON.parse(JSON.stringify(rung)) });
        toast.success(`Rede "${rung.label}" copiada para a área de transferência`);
      }
    }
  }, [selected, selectedTarget, rungs]);

  // Colar elemento ou rede
  const paste = useCallback(() => {
    if (!clipboard) {
      toast.info("Área de transferência vazia.");
      return;
    }

    if (clipboard.type === "rung" && clipboard.rungData) {
      const orig = clipboard.rungData;
      const newId = generateUniqueRungId();
      const cloned: LadderRung = {
        ...orig,
        id: newId,
        label: `${orig.label} (Cópia)`,
        comment: `${orig.comment || orig.label} (Cópia)`,
        cells: orig.cells.map((row) =>
          row.map((c) => ({
            ...c,
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          })),
        ),
      };
      cloned.topology = buildTopologyFromCells(cloned);

      applyRungsWithHistory((prev) => {
        const idx = prev.findIndex((r) => r.id === selected);
        if (idx >= 0) {
          const copy = [...prev];
          copy.splice(idx + 1, 0, cloned);
          return copy;
        }
        return [...prev, cloned];
      });
      select(newId);
      toast.success("Rede colada com sucesso.");
    } else if (clipboard.type === "instruction" && clipboard.instructionData) {
      const targetRungId = selected || rungs[0]?.id;
      if (!targetRungId) return;
      const newInst: LadderInstruction = {
        ...clipboard.instructionData,
        id: `inst-${Date.now()}`,
      };
      insertInstructionAtCursor(targetRungId, newInst);
      toast.success(`Instrução ${newInst.kind} (${newInst.operand}) colada.`);
    }
  }, [clipboard, selected, rungs, applyRungsWithHistory, select]);

  // Inicializa com o projeto de referência oficial se estiver vazio
  useEffect(() => {
    if (rungs.length === 0) {
      const refRungs = createReferenceIndustrialProject();
      setRungs(refRungs);

      // Semeia tags iniciais
      upsertTag({ id: "tag-1", name: "B_PARTIDA", type: "BOOL", value: true, forced: false });
      upsertTag({ id: "tag-2", name: "B_STATUS_RUN", type: "BOOL", value: true, forced: false });
      upsertTag({ id: "tag-3", name: "E_PARADA_EMERG", type: "BOOL", value: false, forced: false });
      upsertTag({ id: "tag-4", name: "FALHA_SOBRECARGA", type: "BOOL", value: false, forced: false });
      upsertTag({ id: "tag-5", name: "BOMBA_MAIN", type: "BOOL", value: true, forced: false });
      upsertTag({ id: "tag-6", name: "SINALIZ_RUN", type: "BOOL", value: true, forced: false });
      upsertTag({ id: "tag-7", name: "NIVEL_AGUA", type: "INT", value: 1450, forced: false });
      upsertTag({ id: "tag-8", name: "NIVEL_CRITICO", type: "INT", value: 1200, forced: false });
    }
  }, [rungs.length, setRungs, upsertTag]);

  // Inserção Previsível na posição exata do cursor
  const insertInstructionAtCursor = useCallback(
    (rungId: string, kindOrInst: string | LadderInstruction) => {
      const isInstObj = typeof kindOrInst === "object";
      const kind = isInstObj ? kindOrInst.kind : kindOrInst;
      const isOut = isOutputKind(kind as LadderCellKind);

      applyRungsWithHistory((prev) =>
        prev.map((r) => {
          if (r.id !== rungId) return r;
          const topology = ensureRungTopology(r);

          const newInst: LadderInstruction = isInstObj
            ? { ...kindOrInst, id: `inst-${Date.now()}` }
            : {
                id: `inst-${Date.now()}`,
                kind: kind as any,
                operand: kind.startsWith("CMP")
                  ? "COMP_01"
                  : kind.startsWith("TON")
                    ? "TON_01"
                    : isOut
                      ? "BOMBA_OUT"
                      : "TAG_INPUT",
                preset: kind.startsWith("TON") ? 5000 : undefined,
                params: kind.startsWith("CMP") ? { IN1: "VAR_A", IN2: "VAR_B" } : undefined,
              };

          if (isOut) {
            topology.outputs.push(newInst);
            toast.success(`Saída ${newInst.kind} (${newInst.operand}) adicionada à rede.`);
          } else {
            const insertIdx =
              insertionPoint && insertionPoint.rungId === rungId
                ? Math.min(insertionPoint.index, topology.rootBranch.items.length)
                : topology.rootBranch.items.length;

            topology.rootBranch.items.splice(insertIdx, 0, {
              id: `item-${Date.now()}`,
              type: "instruction",
              instruction: newInst,
            });

            setInsertionPoint({ rungId, index: insertIdx + 1 });
            toast.success(`Instrução ${newInst.kind} inserida na posição ${insertIdx + 1}.`);
          }

          // Atualiza célula na matriz legada
          const newCells = r.cells.map((row) => [...row]);
          const emptyIdx = newCells[0].findIndex((c) => c.kind === "EMPTY");
          if (emptyIdx >= 0 && emptyIdx < newCells[0].length - 1) {
            newCells[0][emptyIdx] = {
              id: newInst.id,
              kind: newInst.kind,
              operand: newInst.operand,
              preset: newInst.preset,
              params: newInst.params,
            };
          }

          return { ...r, cells: newCells, topology };
        }),
      );
    },
    [insertionPoint, applyRungsWithHistory],
  );

  // Listener para evento customizado de inserção da biblioteca lateral
  useEffect(() => {
    const handlePaletteInsert = (e: Event) => {
      const customEvent = e as CustomEvent<{ elementId: string }>;
      const elId = customEvent.detail?.elementId;
      if (!elId || rungs.length === 0) return;

      const targetRungId = selected || rungs[0].id;
      insertInstructionAtCursor(targetRungId, elId);
    };

    window.addEventListener("eletricai:ladder-insert-element", handlePaletteInsert);
    return () => window.removeEventListener("eletricai:ladder-insert-element", handlePaletteInsert);
  }, [selected, rungs, insertInstructionAtCursor]);

  // Atalhos de teclado industriais (Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTarget?.elementId && selectedTarget.rungId) {
          e.preventDefault();
          deleteElement(selectedTarget.rungId, selectedTarget.elementId);
          return;
        }
        if (selected) {
          e.preventDefault();
          removeRung(selected);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, copySelected, paste, selectedTarget, selected, rungs]);

  // Loop de Simulação Contínua do CLP (100ms)
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    const tick = () => {
      try {
        const results = scanRungs(rungs);
        scanCountRef.current += 1;
        useEditorStore.getState().incrementSimulationCycle();
        setScanState(Object.fromEntries(results.map((r) => [r.rungId, r])));
        setTScan(getLastScanDuration());

        setRungsRuntime((rs) =>
          rs.map((r) => {
            const found = results.find((x) => x.rungId === r.id);
            return found ? { ...r, poweredOut: found.poweredOut } : r;
          }),
        );
      } catch (err) {
        if (err instanceof LadderScanTimeoutError) {
          console.warn("[Ladder] Ciclo abortado por estouro de orçamento:", err.message);
          setSimulationStatus("paused");
        }
      }
    };

    intervalRef.current = window.setInterval(tick, 100);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running, rungs, setRungsRuntime, setSimulationStatus]);

  // Validação Estática Contínua
  const issues = useMemo(() => {
    return validateRungs(rungs, editorTags);
  }, [rungs, editorTags]);

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warn").length;

  // Operações de Edição de Redes
  const addRung = () => {
    const idx = rungs.length;
    const rung = newRung(idx);
    rung.label = `${String(idx + 1).padStart(4, "0")} | Nova Rede Ladder`;
    rung.comment = rung.label;
    applyRungsWithHistory((prev) => [...prev, rung]);
    select(rung.id);
    toast.success("Nova rede Ladder adicionada.");
  };

  const insertRungAt = (index: number) => {
    const rung = newRung(index);
    rung.label = `${String(index + 1).padStart(4, "0")} | Nova Rede Ladder`;
    rung.comment = rung.label;
    applyRungsWithHistory((prev) => {
      const copy = [...prev];
      copy.splice(index, 0, rung);
      return copy;
    });
    select(rung.id);
    toast.success(`Rede inserida na posição ${index + 1}.`);
  };

  const removeRung = (id: string) => {
    applyRungsWithHistory((prev) => prev.filter((r) => r.id !== id));
    if (selected === id) select(null);
    toast.success("Rede removida.");
  };

  const duplicateRung = (id: string) => {
    const original = rungs.find((r) => r.id === id);
    if (!original) return;
    const newId = generateUniqueRungId();
    const cloned: LadderRung = {
      ...original,
      id: newId,
      label: `${original.label} (Cópia)`,
      comment: `${original.comment || original.label} (Cópia)`,
      cells: original.cells.map((row) =>
        row.map((c) => ({
          ...c,
          id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })),
      ),
    };
    cloned.topology = buildTopologyFromCells(cloned);
    applyRungsWithHistory((prev) => [...prev, cloned]);
    select(newId);
    toast.success("Rede duplicada com novos identificadores únicos.");
  };

  const moveRung = (id: string, delta: number) => {
    applyRungsWithHistory((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  // Criação e expansão de ramos paralelos
  const addParallelBranchToRung = (rungId: string) => {
    applyRungsWithHistory((prev) =>
      prev.map((r) => {
        if (r.id !== rungId) return r;
        const topology = ensureRungTopology(r);

        const newBranch: LadderBranch = {
          id: `br-${Date.now()}`,
          items: [
            {
              id: `item-${Date.now()}`,
              type: "instruction",
              instruction: { id: `inst-${Date.now()}`, kind: "XIC", operand: "B_STATUS_RUN" },
            },
          ],
        };

        topology.rootBranch.items.push({
          id: `par-${Date.now()}`,
          type: "parallel",
          branches: [
            {
              id: `br-top-${Date.now()}`,
              items: [
                {
                  id: `it-top-${Date.now()}`,
                  type: "instruction",
                  instruction: { id: `inst-top-${Date.now()}`, kind: "XIC", operand: "B_PARTIDA" },
                },
              ],
            },
            newBranch,
          ],
        });

        const newCells = [...r.cells, Array.from({ length: rungCols(r) }, emptyCell)];
        newCells[newCells.length - 1][0] = { kind: "XIC", operand: "B_STATUS_RUN" };

        return { ...r, cells: newCells, topology };
      }),
    );
    toast.success("Ramo paralelo (derivação OR/selo) criado.");
  };

  const addBranchLevel = (rungId: string) => {
    applyRungsWithHistory((prev) =>
      prev.map((r) => {
        if (r.id !== rungId) return r;
        const topology = ensureRungTopology(r);
        const parItem = topology.rootBranch.items.find((it) => it.type === "parallel");

        const newBranch: LadderBranch = {
          id: `br-lvl-${Date.now()}`,
          items: [
            {
              id: `item-${Date.now()}`,
              type: "instruction",
              instruction: { id: `inst-${Date.now()}`, kind: "XIC", operand: "RAMO_PARALELO" },
            },
          ],
        };

        if (parItem && parItem.type === "parallel") {
          (parItem.branches ??= []).push(newBranch);
        } else {
          topology.rootBranch.items.push({
            id: `par-${Date.now()}`,
            type: "parallel",
            branches: [newBranch],
          });
        }

        const newCells = [...r.cells, Array.from({ length: rungCols(r) }, emptyCell)];
        newCells[newCells.length - 1][0] = { kind: "XIC", operand: "RAMO_PARALELO" };

        return { ...r, cells: newCells, topology };
      }),
    );
    toast.success("Novo nível de ramo paralelo adicionado.");
  };

  // Movimentação e exclusão de elementos
  const moveElement = (rungId: string, elementId: string, direction: "left" | "right") => {
    applyRungsWithHistory((prev) =>
      prev.map((r) => {
        if (r.id !== rungId) return r;
        const topology = ensureRungTopology(r);
        const items = [...topology.rootBranch.items];
        const idx = items.findIndex(
          (it) => it.type === "instruction" && it.instruction?.id === elementId,
        );
        if (idx === -1) return r;
        const targetIdx = direction === "left" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= items.length) return r;
        const [moved] = items.splice(idx, 1);
        items.splice(targetIdx, 0, moved);
        topology.rootBranch.items = items;
        return { ...r, topology };
      }),
    );
    toast.success(`Elemento movido para ${direction === "left" ? "esquerda" : "direita"}.`);
  };

  const deleteElement = (rungId: string, elementId: string) => {
    applyRungsWithHistory((prev) =>
      prev.map((r) => {
        if (r.id !== rungId) return r;
        const topology = ensureRungTopology(r);
        topology.rootBranch.items = topology.rootBranch.items.filter(
          (it) => !(it.type === "instruction" && it.instruction?.id === elementId),
        );
        for (const item of topology.rootBranch.items) {
          if (item.type === "parallel" && item.branches) {
            for (const br of item.branches) {
              br.items = br.items.filter(
                (bi) => !(bi.type === "instruction" && bi.instruction?.id === elementId),
              );
            }
          }
        }
        topology.outputs = topology.outputs.filter((o) => o.id !== elementId);
        const cells = r.cells.map((row) =>
          row.map((c) => (c.id === elementId ? emptyCell() : c)),
        );
        return { ...r, cells, topology };
      }),
    );
    setSelectedTarget(null);
    toast.success("Elemento removido da rede.");
  };

  // Edição de comentário / descrição de rede
  const startEditingComment = (rung: LadderRung) => {
    setEditingCommentRungId(rung.id);
    setCommentDraft(rung.comment || rung.label);
  };

  const saveComment = (rungId: string) => {
    if (!commentDraft.trim()) {
      setEditingCommentRungId(null);
      return;
    }
    applyRungsWithHistory((prev) =>
      prev.map((r) => {
        if (r.id !== rungId) return r;
        const topology = ensureRungTopology(r);
        topology.comment = commentDraft.trim();
        return {
          ...r,
          comment: commentDraft.trim(),
          label: commentDraft.trim(),
          topology,
        };
      }),
    );
    setEditingCommentRungId(null);
    toast.success("Comentário da rede atualizado.");
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground select-none overflow-hidden font-sans">
      {/* ─────────────────────────────────────────────────────────────────────────────
          1. BARRA SUPERIOR (TOPBAR PROFISSIONAL LADDER) - IDÊNTICA À IMAGEM 1
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="h-10 border-b border-border bg-card/60 px-3 flex items-center justify-between gap-3 shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-display text-xs font-bold tracking-wider text-foreground uppercase flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-primary font-black text-sm">ELÉTRICAI</span> — LADDER PROFISSIONAL
          </span>

          {/* Abas de Projeto e Ações de Histórico */}
          <div className="flex items-center gap-2 ml-2 border-l border-border/60 pl-2">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-background border border-border text-[11px] font-mono text-foreground font-medium shadow-xs">
              <span>PROJETO_BOMBAS_E_ESTACAO_TRATAMENTO.ladder</span>
            </div>

            {/* Ações de Desfazer, Refazer, Copiar, Colar e Excluir */}
            <div className="flex items-center gap-0.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={undo}
                disabled={undoStack.length === 0}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-20"
                title="Desfazer (Ctrl+Z)"
                data-testid="ladder-undo-btn"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={redo}
                disabled={redoStack.length === 0}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-20"
                title="Refazer (Ctrl+Y)"
                data-testid="ladder-redo-btn"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={copySelected}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Copiar Selecionado (Ctrl+C)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={paste}
                disabled={!clipboard}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-20"
                title="Colar (Ctrl+V)"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!selectedTarget?.elementId && !selected}
                onClick={() => {
                  if (selectedTarget?.elementId && selectedTarget.rungId) {
                    deleteElement(selectedTarget.rungId, selectedTarget.elementId);
                  } else if (selected) {
                    removeRung(selected);
                  }
                }}
                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/20 disabled:opacity-20"
                title="Excluir Instrução ou Rede Selecionada (Del / Backspace)"
                data-testid="ladder-delete-btn"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Controles de Simulação ao Vivo */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${
              simulationStatus === "running"
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : simulationStatus === "paused"
                  ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                  : "bg-muted/40 border-border text-muted-foreground"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                simulationStatus === "running"
                  ? "bg-emerald-400 animate-pulse"
                  : simulationStatus === "paused"
                    ? "bg-amber-400"
                    : "bg-muted-foreground/50"
              }`}
            />
            <span>
              {simulationStatus === "running"
                ? "Simulação Ativa"
                : simulationStatus === "paused"
                  ? "Simulação Pausada"
                  : "Simulação Parada"}
            </span>
          </div>

          {!running ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSimulationStatus("running");
              }}
              className="h-7 px-2.5 text-xs font-semibold gap-1 bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-400"
              title="Iniciar / Retomar Ciclos Ladder"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>RUN</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSimulationStatus("paused");
              }}
              className="h-7 px-2.5 text-xs font-semibold gap-1 bg-amber-950/60 hover:bg-amber-900/60 border-amber-500/40 text-amber-300"
              title="Pausar Ciclos Ladder"
            >
              <Pause className="h-3 w-3 fill-current" />
              <span>PAUSA</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSimulationStatus("stopped");
            }}
            className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
            title="Parar Execução"
          >
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden sm:inline">STOP</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              resetRuntimeState();
              useEditorStore.getState().resetSimulationState();
              toast.success("Estado das variáveis e temporizadores redefinido.");
            }}
            className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Redefinir Estado (Reset de Temporizadores/Contadores)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => scanRungs(rungs)}
            disabled={running}
            className="h-7 px-2 text-xs"
            title="Avançar 1 Ciclo (Step)"
          >
            <StepForward className="h-3.5 w-3.5" />
          </Button>

          <div className="font-mono text-[10px] px-2 py-0.5 rounded bg-muted/60 border border-border/40 text-muted-foreground">
            Tscan: <span className="text-foreground font-semibold">{tScan}ms</span>
          </div>

          {/* Perfil de Linguagem / Fabricante */}
          <div className="hidden lg:flex items-center gap-1 text-[11px] font-sans border-l border-border/60 pl-3">
            <span className="text-muted-foreground text-[10px]">Perfil:</span>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as LadderProfile)}
              className="bg-transparent border-0 font-medium text-xs text-foreground cursor-pointer outline-none"
            >
              <option value="generic" className="bg-popover text-popover-foreground">
                CLP Genérico / IEC 61131-3
              </option>
              <option value="rockwell" className="bg-popover text-popover-foreground">
                Rockwell Studio 5000 (ControlLogix)
              </option>
              <option value="siemens" className="bg-popover text-popover-foreground">
                Siemens TIA Portal (S7-1500)
              </option>
            </select>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowST((v) => !v)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Ver Código Structured Text / IL"
          >
            <Code2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. ÁREA CENTRAL DO DIAGRAMA (TRILHO ESQUERDO, REDES, FIOS E TRILHO DIREITO)
         ───────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto relative p-6 industrial-grid scrollbar-thin">
        <div
          className="mx-auto max-w-5xl transition-transform duration-75 origin-top"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          {rungs.map((rung, rungIndex) => {
            const topology = ensureRungTopology(rung);
            const isSel = selected === rung.id;
            const res = scanState[rung.id];
            const powered = res?.poweredOut ?? rung.poweredOut ?? false;
            const rungNum = String(rungIndex + 1).padStart(4, "0");
            const isEditingComment = editingCommentRungId === rung.id;

            return (
              <div key={rung.id} className="mb-6">
                <div
                  onClick={() => {
                    select(rung.id);
                    setSelectedTarget({ rungId: rung.id, elementId: undefined });
                  }}
                  className={`rounded-lg border transition-all bg-card/50 backdrop-blur-sm shadow-sm ${
                    isSel
                      ? "border-primary/80 ring-1 ring-primary/40 shadow-glow"
                      : "border-border/60 hover:border-border"
                  }`}
                >
                  {/* Cabeçalho da Rede com Edição de Comentário */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-muted/80 text-foreground border border-border/40">
                        RUNG {rungNum}
                      </span>

                      {isEditingComment ? (
                        <div className="flex items-center gap-1.5 flex-1 max-w-md">
                          <Input
                            autoFocus
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveComment(rung.id);
                              if (e.key === "Escape") setEditingCommentRungId(null);
                            }}
                            className="h-6 text-xs font-mono"
                            placeholder="Comentário da rede..."
                          />
                          <Button size="sm" className="h-6 px-2 text-xs" onClick={() => saveComment(rung.id)}>
                            Salvar
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-1.5 cursor-pointer group"
                          onClick={() => startEditingComment(rung)}
                          title="Clique para editar comentário da rede"
                        >
                          <span className="text-xs font-semibold text-foreground/90 font-mono">
                            {rung.comment || rung.label}
                          </span>
                          <Edit2 className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity" />
                        </div>
                      )}

                      {powered && (
                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                          ENERGIZADO
                        </span>
                      )}
                    </div>

                    {/* Botões de Ação na Rede */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setInsertionPoint({ rungId: rung.id, index: topology.rootBranch.items.length });
                          insertInstructionAtCursor(rung.id, "XIC");
                        }}
                        className="px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        title="Inserir contato na posição de foco"
                      >
                        <Plus className="h-3 w-3" /> + inserção previsível
                      </button>
                      <button
                        onClick={() => addParallelBranchToRung(rung.id)}
                        className="px-2 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground border border-border hover:text-foreground transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        title="Criar derivação paralela"
                      >
                        <GitFork className="h-3 w-3" /> + inserir ramo paralelo
                      </button>
                      <button
                        onClick={() => duplicateRung(rung.id)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground"
                        title="Duplicar Rede"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveRung(rung.id, -1)}
                        disabled={rungIndex === 0}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para cima"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => moveRung(rung.id, 1)}
                        disabled={rungIndex === rungs.length - 1}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeRung(rung.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive"
                        title="Excluir Rede"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Circuito Elétrico da Rede (Trilho Esquerdo -> Fios -> Células/Ramos -> Trilho Direito) */}
                  <div className="flex items-stretch px-4 py-5 min-h-[100px] overflow-x-auto">
                    {/* Trilho de Força Esquerdo (Energia Positiva) */}
                    <div className="flex flex-col items-center justify-between shrink-0 mr-3">
                      <div
                        className={`w-2.5 rounded-full flex-1 transition-all ${
                          running
                            ? "bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.9)]"
                            : "bg-slate-700"
                        }`}
                        title="Trilho de Potência Esquerdo (L+ / 24VDC)"
                      />
                      <span className="font-mono text-[10px] font-bold text-muted-foreground/70 mt-1">
                        {rungNum}
                      </span>
                    </div>

                    {/* Corpo dos Condutores e Elementos Lógicos */}
                    <div className="flex-1 flex items-center justify-between gap-4 px-2 relative min-w-[500px]">
                      {/* Caminho Lógico de Entrada (Série e Ramos Paralelos) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Fio de conexão inicial vindo do trilho esquerdo */}
                        <div
                          className={`h-1 w-6 shrink-0 rounded-full transition-colors ${
                            running ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-slate-600"
                          }`}
                        />

                        {/* Renderização dos Itens da Topologia */}
                        {topology.rootBranch.items.map((item, itemIdx) => {
                          const isCursorHere =
                            insertionPoint?.rungId === rung.id && insertionPoint?.index === itemIdx;

                          return (
                            <div key={item.id || itemIdx} className="flex items-center gap-2">
                              {/* Slot de Inserção / Cursor */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInsertionPoint({ rungId: rung.id, index: itemIdx });
                                  toast.info(`Cursor de inserção posicionado antes do item ${itemIdx + 1}`);
                                }}
                                title="Clique para posicionar o cursor de inserção aqui"
                                className={`flex items-center justify-center cursor-pointer transition-all ${
                                  isCursorHere
                                    ? "w-2.5 h-12 bg-primary/80 rounded animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.9)]"
                                    : "w-1 h-8 bg-transparent hover:bg-primary/40 rounded opacity-0 hover:opacity-100"
                                }`}
                              />

                              {item.type === "instruction" && item.instruction ? (
                                /* Instrução em Série */
                                <div className="flex items-center gap-2">
                                  <LadderCellView
                                    cell={item.instruction}
                                    rungId={rung.id}
                                    isOutputCol={false}
                                    energized={Boolean(item.instruction.energized)}
                                    diagnostic={res?.diagnostics?.[`inst:${item.instruction.id}`]}
                                    onDelete={() =>
                                      item.instruction?.id &&
                                      deleteElement(rung.id, item.instruction.id)
                                    }
                                    onChange={(n) => {
                                      const targetInst = item.instruction;
                                      if (!targetInst) return;
                                      targetInst.kind = n.kind;
                                      targetInst.operand = n.operand;
                                      targetInst.preset = n.preset;
                                      targetInst.params = n.params;
                                      applyRungsWithHistory((prev) =>
                                        prev.map((r) => (r.id === rung.id ? { ...r, topology } : r)),
                                      );
                                    }}
                                  />
                                  {/* Fio condutor pós-instrução */}
                                  <div
                                    className={`h-1 w-5 shrink-0 rounded-full transition-colors ${
                                      Boolean(item.instruction.energized)
                                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                                        : "bg-slate-600"
                                    }`}
                                  />
                                </div>
                              ) : item.type === "parallel" && item.branches ? (
                                /* Ramo Paralelo (Garfo com derivações verticais e horizontais) */
                                <div className="flex items-center my-1 relative bg-card/20 p-1.5 rounded-lg border border-border/30">
                                  {/* Conector Vertical Esquerdo do Ramo */}
                                  <div className="flex flex-col justify-around py-1 space-y-3 relative">
                                    {item.branches.map((br, bIdx) => {
                                      const brEnergized = br.items.some(
                                        (bi) => bi.type === "instruction" && bi.instruction?.energized,
                                      );
                                      return (
                                        <div key={br.id || bIdx} className="flex items-center gap-1.5 relative">
                                          {/* Linha horizontal para o ramo */}
                                          <div
                                            className={`h-1 w-4 shrink-0 transition-colors ${
                                              running ? "bg-emerald-400" : "bg-slate-600"
                                            }`}
                                          />
                                          {/* Instruções do Ramo */}
                                          {br.items.map((bi) =>
                                            bi.type === "instruction" && bi.instruction ? (
                                              <div key={bi.instruction.id} className="flex items-center gap-1.5">
                                                <LadderCellView
                                                  cell={bi.instruction}
                                                  rungId={rung.id}
                                                  isOutputCol={false}
                                                  energized={Boolean(bi.instruction.energized)}
                                                  diagnostic={res?.diagnostics?.[`inst:${bi.instruction.id}`]}
                                                  onDelete={() =>
                                                    bi.instruction?.id &&
                                                    deleteElement(rung.id, bi.instruction.id)
                                                  }
                                                  onChange={(n) => {
                                                    const subInst = bi.instruction;
                                                    if (!subInst) return;
                                                    subInst.kind = n.kind;
                                                    subInst.operand = n.operand;
                                                    subInst.preset = n.preset;
                                                    subInst.params = n.params;
                                                    applyRungsWithHistory((prev) =>
                                                      prev.map((r) =>
                                                        r.id === rung.id ? { ...r, topology } : r,
                                                      ),
                                                    );
                                                  }}
                                                />
                                              </div>
                                            ) : null,
                                          )}
                                          {/* Linha horizontal após as instruções do ramo */}
                                          <div
                                            className={`h-1 w-4 shrink-0 transition-colors ${
                                              brEnergized ? "bg-emerald-400" : "bg-slate-600"
                                            }`}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Linha de saída do bloco paralelo */}
                                  <div
                                    className={`h-1 w-5 shrink-0 rounded-full transition-colors ml-1 ${
                                      item.branches.some((b) =>
                                        b.items.some(
                                          (bi) => bi.type === "instruction" && bi.instruction?.energized,
                                        ),
                                      )
                                        ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                                        : "bg-slate-600"
                                    }`}
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        {/* Cursor no final da linha série */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setInsertionPoint({
                              rungId: rung.id,
                              index: topology.rootBranch.items.length,
                            });
                            toast.info("Cursor posicionado no fim da linha de contatos");
                          }}
                          title="Clique para posicionar cursor no fim da rede"
                          className={`flex items-center justify-center cursor-pointer transition-all ${
                            insertionPoint?.rungId === rung.id &&
                            insertionPoint?.index === topology.rootBranch.items.length
                              ? "w-2.5 h-12 bg-primary/80 rounded animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.9)]"
                              : "w-1 h-8 bg-transparent hover:bg-primary/40 rounded opacity-0 hover:opacity-100"
                          }`}
                        />
                      </div>

                      {/* Bobinas de Saída na Direita (empilhadas em paralelo) */}
                      <div className="flex flex-col items-center gap-2.5 ml-auto shrink-0 pl-6 border-l border-border/20">
                        {topology.outputs.map((out, outIdx) => {
                          const isEnergized = powered;
                          return (
                            <div key={out.id || outIdx} className="flex items-center gap-2">
                              <div
                                className={`h-1 w-5 shrink-0 transition-colors ${
                                  isEnergized
                                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                                    : "bg-slate-600"
                                }`}
                              />
                              <LadderCellView
                                cell={{
                                  id: out.id,
                                  kind: out.kind,
                                  operand: out.operand,
                                  preset: out.preset,
                                  params: out.params,
                                  energized: isEnergized,
                                }}
                                rungId={rung.id}
                                isOutputCol={true}
                                energized={isEnergized}
                                diagnostic={res?.diagnostics?.[`out:${out.id}`]}
                                onDelete={() => out.id && deleteElement(rung.id, out.id)}
                                onChange={(n) => {
                                  topology.outputs[outIdx] = {
                                    id: out.id,
                                    kind: n.kind,
                                    operand: n.operand,
                                    preset: n.preset,
                                    params: n.params,
                                  };
                                  applyRungsWithHistory((prev) =>
                                    prev.map((r) => (r.id === rung.id ? { ...r, topology } : r)),
                                  );
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Trilho de Força Direito (Neutro / 0VDC) */}
                    <div className="flex flex-col items-center justify-between shrink-0 ml-3">
                      <div
                        className={`w-2.5 rounded-full flex-1 transition-all ${
                          running
                            ? "bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.9)]"
                            : "bg-slate-700"
                        }`}
                        title="Trilho de Potência Direito (N / 0VDC)"
                      />
                    </div>
                  </div>

                  {/* Barra Inferior de Operações da Rede */}
                  <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/30 bg-muted/10">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setInsertionPoint({ rungId: rung.id, index: topology.rootBranch.items.length });
                          insertInstructionAtCursor(rung.id, "XIC");
                        }}
                        className="px-2.5 py-1 rounded text-[11px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        title="Inserir novo contato no ponto de foco"
                      >
                        <Plus className="h-3.5 w-3.5" /> + inserção previsível
                      </button>
                      <button
                        onClick={() => addParallelBranchToRung(rung.id)}
                        className="px-2.5 py-1 rounded text-[11px] bg-muted/60 text-muted-foreground border border-border/60 hover:text-foreground transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        title="Criar derivação paralela (selo / OR)"
                      >
                        <GitFork className="h-3.5 w-3.5" /> + inserir ramo paralelo
                      </button>
                      <button
                        onClick={() => addBranchLevel(rung.id)}
                        className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground border border-border/40 hover:bg-muted/30 transition-colors font-medium flex items-center gap-1 cursor-pointer"
                        title="Adicionar novo nível ao ramo paralelo"
                      >
                        <Rows3 className="h-3 w-3" /> + nível de ramo
                      </button>
                    </div>

                    {/* Controles de Movimentação do Elemento Selecionado */}
                    {selectedTarget?.elementId && selectedTarget.rungId === rung.id && (
                      <div className="flex items-center gap-1 text-[10px] font-mono bg-muted/40 px-2 py-0.5 rounded border border-border/40">
                        <span className="text-muted-foreground">Elemento:</span>
                        <span className="text-primary font-bold">{selectedTarget.operand || selectedTarget.kind}</span>
                        <button
                          onClick={() => moveElement(rung.id, selectedTarget.elementId!, "left")}
                          className="p-1 hover:text-foreground text-muted-foreground"
                          title="Mover elemento para esquerda"
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveElement(rung.id, selectedTarget.elementId!, "right")}
                          className="p-1 hover:text-foreground text-muted-foreground"
                          title="Mover elemento para direita"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deleteElement(rung.id, selectedTarget.elementId!)}
                          className="p-1 hover:text-destructive text-muted-foreground"
                          title="Excluir elemento selecionado (Del)"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botão de Inserção de Nova Rede entre Redes */}
                <div className="flex items-center justify-center my-2">
                  <button
                    onClick={() => insertRungAt(rungIndex + 1)}
                    className="h-6 px-3 rounded-full bg-muted/60 hover:bg-primary hover:text-white border border-border/60 text-muted-foreground text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                    title="Inserir Nova Rede Aqui"
                  >
                    <Plus className="h-3 w-3" /> Nova Rede ({rungIndex + 2})
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Controles Flutuantes de Zoom e Pan no Canto Inferior Direito */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-card/90 border border-border p-1 rounded-md shadow-lg backdrop-blur-md z-20">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            title="Reduzir Zoom"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-[11px] px-1 text-foreground font-semibold">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            title="Aumentar Zoom"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <button
            onClick={() => setZoom(100)}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            title="Ajustar Pan"
          >
            <Hand className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Modal / Gaveta de Código Exportado (Structured Text / IL) */}
      {showST && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <span className="font-bold text-xs uppercase tracking-wider text-foreground">
                  Código IEC 61131-3 Gerado
                </span>
                <div className="flex items-center gap-1 bg-background rounded border border-border p-0.5 text-[10px]">
                  <button
                    onClick={() => setCompileFormat("ST")}
                    className={`px-2 py-0.5 rounded font-mono font-medium ${
                      compileFormat === "ST" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Structured Text (ST)
                  </button>
                  <button
                    onClick={() => setCompileFormat("IL")}
                    className={`px-2 py-0.5 rounded font-mono font-medium ${
                      compileFormat === "IL" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Instruction List (IL - Legado)
                  </button>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowST(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {compileFormat === "IL" && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-500 flex items-center gap-2">
                <span className="font-semibold uppercase tracking-wider">Formato Legado (IEC 61131-3):</span>
                <span>A linguagem IL foi formalmente descontinuada na norma IEC 61131-3:2025 em favor de ST. Exportação mantida exclusivamente para interoperabilidade com CLPs clássicos (2ª Edição).</span>
              </div>
            )}
            <pre className="p-4 flex-1 overflow-auto font-mono text-xs text-foreground/90 bg-muted/10 whitespace-pre-wrap select-text">
              {compileProgram(rungs, compileFormat)}
            </pre>
            <div className="p-3 border-t border-border flex justify-end gap-2 bg-muted/20">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(compileProgram(rungs, compileFormat));
                  toast.success("Código copiado para a área de transferência!");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar Código
              </Button>
              <Button size="sm" onClick={() => setShowST(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
