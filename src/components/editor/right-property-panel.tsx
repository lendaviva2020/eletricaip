import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash,
  Lock,
  LockOpen,
  Lightning,
  Shield,
  CheckSquare,
  Square,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import { getParamSpecs } from "@/lib/diagram/param-specs";
import {
  NodeParamsSchema,
  type NodeParams,
  type DiagramNode,
  type DiagramEdge,
} from "@/lib/diagram/schema";
import { useEditorStore, type EditorTag, type EditorTagType } from "@/lib/editor/store";
import { validateTagName } from "@/lib/editor/property-schemas";
import { ValidatedParamField } from "./property-fields/validated-param-field";
import { cn } from "@/lib/utils";
import { LadderPropertyPanel } from "./ladder-property-panel";

const TAG_TYPES: EditorTagType[] = ["BOOL", "INT", "REAL", "STRING"];

/**
 * Encontra o dispositivo de proteção (disjuntor) ou alimentador a montante associado ao circuito
 */
function findRelatedCircuitNode(
  nodeId: string,
  nodes: Record<string, DiagramNode>,
  edges: Record<string, DiagramEdge>,
): DiagramNode | null {
  const current = nodes[nodeId];
  if (!current) return null;

  // Se o nó já for breaker, procure a jusante (motor, vfd, capacitor) ou a montante (transformador, barra)
  if (current.params.kind === "breaker") {
    for (const e of Object.values(edges)) {
      if (e.source === nodeId && nodes[e.target]) {
        const tgt = nodes[e.target];
        if (
          tgt.params.kind === "motor" ||
          tgt.params.kind === "vfd" ||
          tgt.params.kind === "capacitor_bank"
        ) {
          return tgt;
        }
      }
    }
    for (const e of Object.values(edges)) {
      if (e.target === nodeId && nodes[e.source]) {
        const src = nodes[e.source];
        if (src.params.kind === "transformer" || src.params.kind === "busbar") {
          return src;
        }
      }
    }
  }

  // Se for carga (motor, vfd, etc.), procure a montante na cadeia de ligações
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);

    for (const e of Object.values(edges)) {
      if (e.target === curId) {
        const src = nodes[e.source];
        if (!src) continue;
        if (src.params.kind === "breaker") {
          return src;
        }
        queue.push(src.id);
      }
    }
  }

  // Fallback: se houver outro disjuntor de proteção no diagrama, associe como referência
  const fallbackBreaker = Object.values(nodes).find(
    (n) => n.params.kind === "breaker" && n.id !== nodeId,
  );
  if (fallbackBreaker) {
    return fallbackBreaker;
  }

  return null;
}

/**
 * Type-aware property panel profissional — com inspeção multinível contextual
 * e suporte a blocos duplos de propriedades (ex.: Motor M1 + Disjuntor QF1)
 * como ilustrado na referência visual do ElétricAi.
 */
export function RightPropertyPanel() {
  const activeMode = useEditorStore((s) => s.activeMode);
  const selectedId = useDiagramStore((s) => s.selectedNodeIds[0] ?? null);
  const selectedEdgeId = useDiagramStore((s) => s.selectedEdgeIds[0] ?? null);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const doc = useDiagramStore((s) => s.doc);
  const node = useDiagramStore((s) => (selectedId ? s.doc.nodes[selectedId] : null));
  const selectedEdge = useDiagramStore((s) =>
    selectedEdgeId ? s.doc.edges[selectedEdgeId] : null,
  );
  const dispatch = useDiagramStore((s) => s.dispatch);
  const setSelection = useDiagramStore((s) => s.setSelection);

  const [isConfigured, setIsConfigured] = useState(true);

  const relatedNode = useMemo(() => {
    if (!selectedId) return null;
    return findRelatedCircuitNode(selectedId, doc.nodes, doc.edges);
  }, [selectedId, doc.nodes, doc.edges]);

  if (activeMode === "ladder") {
    return <LadderPropertyPanel />;
  }

  if (!node && selectedEdge) {
    return (
      <div className="p-3 space-y-3 text-[12px] font-sans">
        <div className="rounded-md border border-[#f97316]/40 bg-[#0e1626] p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <span className="font-bold text-xs tracking-wider text-[#f97316]">
              CONEXÃO / CONDUTOR SELECIONADO
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{selectedEdge.id}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div>
              <span className="text-muted-foreground block text-[10px]">ORIGEM</span>
              <span className="font-bold text-foreground">
                {doc.nodes[selectedEdge.source]?.label || selectedEdge.source}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">DESTINO</span>
              <span className="font-bold text-foreground">
                {doc.nodes[selectedEdge.target]?.label || selectedEdge.target}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              deleteSelected();
              toast.success("Conexão excluída.");
            }}
            data-testid="property-delete-edge"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
          >
            <Trash className="h-3.5 w-3.5" />
            Excluir conexão
          </button>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground flex flex-col items-center justify-center text-center py-12 gap-2">
        <Lightning className="h-6 w-6 text-muted-foreground/50 mb-1" />
        <p className="font-semibold text-foreground/80">Nenhum componente selecionado</p>
        <p className="text-[11px] text-muted-foreground">
          Clique em um motor, disjuntor, contator ou condutor no canvas para inspecionar seus
          parâmetros elétricos ou excluí-lo.
        </p>
      </div>
    );
  }

  const kind = node.params.kind;
  const paramSpecs = getParamSpecs(kind);
  const tag = (node.params as any).tag || node.label || node.id;
  const kindTitle =
    kind === "motor" ? "MOTOR" : kind === "breaker" ? "DISJUNTOR" : kind.toUpperCase();

  const commitParam = (
    targetNodeId: string,
    currentParams: any,
    key: string,
    value: string | number | boolean,
  ) => {
    const nextRaw = { ...currentParams, [key]: value } as unknown;
    const parsed = NodeParamsSchema.safeParse(nextRaw);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Valor inválido");
      return;
    }
    dispatch(
      cmd.batch([
        {
          type: "UpdateNodeParams",
          nodeId: targetNodeId,
          from: currentParams,
          to: parsed.data,
        },
      ]),
    );
  };

  const restoreFactory = () => {
    const defaults: Record<string, unknown> = { kind };
    for (const [key, spec] of Object.entries(paramSpecs)) {
      if (key === "notes" || key === "tag") continue;
      defaults[key] = spec.defaultValue;
    }
    const parsed = NodeParamsSchema.safeParse(defaults);
    if (!parsed.success) {
      toast.error("Não foi possível restaurar padrões");
      return;
    }
    dispatch({
      type: "UpdateNodeParams",
      nodeId: node.id,
      from: node.params,
      to: parsed.data,
    });
    toast.success(`Padrões restaurados para ${tag}`);
  };

  return (
    <div className="p-3 space-y-3.5 text-[12px] font-sans">
      {/* BLOCO 1: PROPRIEDADES DO COMPONENTE PRIMÁRIO SELECIONADO */}
      <div className="rounded-md border border-[#38bdf8]/40 bg-[#0e1626] overflow-hidden shadow-sm">
        <div className="bg-[#131d2e] px-3 py-2 border-b border-border/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightning className="h-4 w-4 text-[#38bdf8]" />
            <span className="font-bold text-xs tracking-wider text-[#38bdf8]">
              PROPRIEDADES - {kindTitle} {tag}
            </span>
          </div>
          <button
            onClick={() => setIsConfigured((c) => !c)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
            title="Alternar estado de parametrização"
          >
            {isConfigured ? (
              <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Square className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className={isConfigured ? "text-emerald-400 font-medium" : ""}>Setado</span>
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Resumo Industrial Rápido */}
          <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[#0a0f1c] border border-border/50 text-[11px] font-mono">
            <div>
              <span className="text-muted-foreground block text-[10px]">TAG</span>
              <span className="font-bold text-[#38bdf8]">{tag}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">TIPO / LAYOUT</span>
              <span className="font-medium">{kind === "motor" ? "Trifásico / Gaiola" : kind}</span>
            </div>
            {kind === "motor" && (
              <>
                <div>
                  <span className="text-muted-foreground block text-[10px]">POTÊNCIA</span>
                  <span className="font-medium text-amber-300">
                    {(node.params as any).power_kW ?? 7.5} kW
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">CORRENTE In</span>
                  <span className="font-medium text-amber-300">
                    {(node.params as any).current_A ?? 15.2} A
                  </span>
                </div>
              </>
            )}
            <div>
              <span className="text-muted-foreground block text-[10px]">FABRICANTE</span>
              <span>{(node.params as any).manufacturer ?? "WEG"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">MODELO</span>
              <span>{(node.params as any).model ?? "W22 Premium"}</span>
            </div>
          </div>

          {/* Parâmetros Editáveis com Validação Zod */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              Parâmetros Técnicos
            </div>
            {Object.keys(paramSpecs).length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">
                Sem parâmetros adicionais.
              </div>
            ) : (
              Object.entries(paramSpecs).map(([key, spec]) => (
                <ValidatedParamField
                  key={key}
                  spec={spec}
                  value={
                    (node.params as unknown as Record<string, unknown>)[key] ?? spec.defaultValue
                  }
                  onCommit={(value) => commitParam(node.id, node.params, key, value)}
                />
              ))
            )}
          </div>

          <div className="pt-2 border-t border-border/50 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                deleteSelected();
                toast.success(`Componente ${tag} excluído.`);
              }}
              data-testid="property-delete-node"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
            >
              <Trash className="h-3.5 w-3.5" />
              Excluir componente ({tag})
            </button>
          </div>
        </div>
      </div>

      {/* BLOCO 2: DISPOSITIVO DE PROTEÇÃO OU ALIMENTAÇÃO ASSOCIADO (Ex: DISJUNTOR QF1) */}
      {relatedNode && (
        <div className="rounded-md border border-[#f97316]/40 bg-[#0e1626] overflow-hidden shadow-sm">
          <div className="bg-[#131d2e] px-3 py-2 border-b border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#f97316]" />
              <span className="font-bold text-xs tracking-wider text-[#f97316]">
                PROPRIEDADES -{" "}
                {relatedNode.params.kind === "breaker"
                  ? "DISJUNTOR"
                  : relatedNode.params.kind.toUpperCase()}{" "}
                {(relatedNode.params as any).tag || relatedNode.label || relatedNode.id}
              </span>
            </div>
            <button
              onClick={() => setSelection([relatedNode.id])}
              className="flex items-center gap-1 text-[10px] text-[#38bdf8] hover:underline"
              title="Focar este componente no canvas"
            >
              <span>Ver</span>
              <ArrowSquareOut className="h-3 w-3" />
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2 p-2 rounded bg-[#0a0f1c] border border-border/50 text-[11px] font-mono">
              <div>
                <span className="text-muted-foreground block text-[10px]">TAG PROTEÇÃO</span>
                <span className="font-bold text-[#f97316]">
                  {(relatedNode.params as any).tag || relatedNode.label || relatedNode.id}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">CURVA DISPARO</span>
                <span className="font-medium text-amber-300">
                  Curva {(relatedNode.params as any).curve ?? "C"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">CORRENTE In</span>
                <span className="font-bold text-amber-300">
                  {(relatedNode.params as any).in_A ?? 63} A
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">CAPACIDADE Icu</span>
                <span className="font-medium">10 kA</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">FABRICANTE</span>
                <span>{(relatedNode.params as any).manufacturer ?? "Schneider"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">MODELO</span>
                <span>{(relatedNode.params as any).model ?? "iC60N"}</span>
              </div>
            </div>

            {/* Edição rápida da corrente do disjuntor de proteção */}
            {relatedNode.params.kind === "breaker" && (
              <div className="flex items-center justify-between text-[11px] pt-1">
                <span className="text-muted-foreground">Ajuste In (A):</span>
                <div className="flex gap-1">
                  {[20, 32, 63, 100].map((amp) => (
                    <button
                      key={amp}
                      onClick={() => commitParam(relatedNode.id, relatedNode.params, "in_A", amp)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        (relatedNode.params as any).in_A === amp
                          ? "bg-[#f97316] text-black font-bold border-[#f97316]"
                          : "bg-[#131d2e] text-muted-foreground hover:text-foreground border-border"
                      }`}
                    >
                      {amp}A
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BLOCO 3: TAGS DE ENGENHARIA E PLC */}
      <TagsSection nodeId={node.id} />

      <button
        onClick={restoreFactory}
        className="w-full text-[11px] py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
      >
        Restaurar padrões de fábrica
      </button>
    </div>
  );
}

function TagsSection({ nodeId }: { nodeId: string }) {
  const tagsObj = useEditorStore((s) => s.editorTags);
  const tags = useMemo(() => {
    return Object.values(tagsObj).filter((t) => t.id.startsWith(nodeId));
  }, [tagsObj, nodeId]);
  const upsertTag = useEditorStore((s) => s.upsertTag);
  const removeTag = useEditorStore((s) => s.removeTag);
  const forceTagValue = useEditorStore((s) => s.forceTagValue);
  const releaseTag = useEditorStore((s) => s.releaseTag);

  const [name, setName] = useState("");
  const [type, setType] = useState<EditorTagType>("BOOL");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const err = validateTagName(name);
    if (err) {
      setError(err);
      return;
    }
    const id = `${nodeId}.${name.trim()}`;
    if (useEditorStore.getState().editorTags[id]) {
      setError("Tag já existe neste nó");
      return;
    }
    const tag: EditorTag = {
      id,
      name: name.trim(),
      type,
      value: type === "BOOL" ? false : type === "STRING" ? "" : 0,
      forced: false,
    };
    upsertTag(tag);
    setName("");
    setError(null);
  };

  return (
    <Section title="Tags PLC & Automação">
      <div className="space-y-1.5">
        {tags.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">Nenhuma tag vinculada.</div>
        )}
        {tags.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-1.5 text-[11px] font-mono bg-[#0a0f1c] border border-border/60 rounded px-2 py-1"
          >
            <span className="text-[#38bdf8] truncate flex-1" title={t.id}>
              {t.name}
            </span>
            <span className="text-[9px] uppercase text-muted-foreground">{t.type}</span>
            <span
              className={cn("text-[10px]", t.forced ? "text-amber-400" : "text-foreground/70")}
              title={`valor=${String(t.value)}`}
            >
              {String(t.value)}
            </span>
            <button
              onClick={() =>
                t.forced
                  ? releaseTag(t.id)
                  : forceTagValue(t.id, t.type === "BOOL" ? !t.value : t.value)
              }
              className="h-5 w-5 grid place-items-center rounded hover:bg-accent"
              title={t.forced ? "Liberar (release)" : "Forçar valor"}
            >
              {t.forced ? (
                <LockOpen className="h-3 w-3 text-amber-400" />
              ) : (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => removeTag(t.id)}
              className="h-5 w-5 grid place-items-center rounded hover:bg-destructive/10 text-destructive"
              title="Remover tag"
            >
              <Trash className="h-3 w-3" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-1 pt-1">
          <input
            aria-label="Nome da nova tag"
            title="Nome da nova tag"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="RUN, FAULT, %Q0.0…"
            maxLength={64}
            className={cn(
              "flex-1 h-7 rounded bg-[#101929] border px-2 text-[11px] font-mono outline-none text-foreground",
              error ? "border-destructive" : "border-border",
            )}
          />
          <select
            aria-label="Tipo da nova tag"
            title="Tipo da nova tag"
            value={type}
            onChange={(e) => setType(e.target.value as EditorTagType)}
            className="h-7 rounded bg-[#101929] border border-border text-[10px] px-1 text-foreground"
          >
            {TAG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            className="h-7 w-7 grid place-items-center rounded bg-[#38bdf8] text-black font-bold hover:opacity-90"
            title="Adicionar tag"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <div className="text-[10px] text-destructive pt-1">{error}</div>}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 font-bold">
        {title}
      </div>
      <div className="rounded-md border border-border/70 bg-[#0e1626] p-2.5 space-y-1">
        {children}
      </div>
    </div>
  );
}

export type { NodeParams };
