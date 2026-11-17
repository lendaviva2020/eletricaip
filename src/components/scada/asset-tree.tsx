// Árvore de ativos =planta → +local → equipamento (ISA-101 navegação).
// Cor só para anormalidade: vermelho = alarme/falha, âmbar = desvio.
import { useState } from "react";
import { CaretDown, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { filterAssetTree, type AreaHealth, type AssetTreeNode } from "@/lib/scada/asset-hierarchy";
import { cn } from "@/lib/utils";

export function healthDotClass(h: AreaHealth): string {
  if (h === "ALARM") return "bg-red-500";
  if (h === "DEVIATION") return "bg-amber-400";
  if (h === "NORMAL") return "bg-zinc-400";
  return "border border-zinc-500 bg-transparent";
}

export const HEALTH_LABEL: Record<AreaHealth, string> = {
  ALARM: "Alarme",
  DEVIATION: "Desvio",
  NORMAL: "Normal",
  NO_DATA: "Sem dados",
};

interface Props {
  nodes: readonly AssetTreeNode[];
  selectedEquipmentId: string | null;
  onSelectEquipment: (id: string) => void;
}

export function AssetTree({ nodes, selectedEquipmentId, onSelectEquipment }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const visible = filterAssetTree(nodes, query);
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const render = (list: readonly AssetTreeNode[], depth: number) => (
    <ul role={depth === 0 ? "tree" : "group"} className="space-y-0.5">
      {list.map((n) => {
        const isLeaf = n.kind === "equipment";
        const open = query.trim() !== "" || !collapsed.has(n.key);
        const selected = isLeaf && n.equipmentId === selectedEquipmentId;
        return (
          <li
            key={n.key}
            role="treeitem"
            aria-expanded={isLeaf ? undefined : open}
            aria-selected={selected}
          >
            <button
              type="button"
              onClick={() =>
                isLeaf && n.equipmentId ? onSelectEquipment(n.equipmentId) : toggle(n.key)
              }
              className={cn(
                "w-full flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-zinc-800/70",
                selected ? "bg-zinc-800 text-white" : "text-zinc-300",
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
              data-testid={isLeaf ? `asset-tree-eq-${n.equipmentId}` : `asset-tree-node-${n.key}`}
            >
              {isLeaf ? (
                <span className="w-3" />
              ) : open ? (
                <CaretDown className="w-3 h-3 shrink-0" />
              ) : (
                <CaretRight className="w-3 h-3 shrink-0" />
              )}
              <span
                className={cn("w-2 h-2 rounded-full shrink-0", healthDotClass(n.health))}
                title={HEALTH_LABEL[n.health]}
              />
              <span className={cn("truncate", !isLeaf && "font-mono font-semibold")}>
                {n.label}
              </span>
            </button>
            {!isLeaf && open && n.children.length > 0 && render(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col min-h-0 h-full" data-testid="scada-asset-tree">
      <label className="relative block mb-2">
        <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 64))}
          placeholder="Buscar tag ou nome"
          className="w-full bg-zinc-950 border border-zinc-800 rounded pl-7 pr-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600"
          aria-label="Buscar na árvore de ativos"
        />
      </label>
      <div className="flex-1 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="text-[11px] text-zinc-500 px-1">
            {nodes.length === 0 ? "Projeto sem equipamentos." : "Nada encontrado."}
          </p>
        ) : (
          render(visible, 0)
        )}
      </div>
    </div>
  );
}
