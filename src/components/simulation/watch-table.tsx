import { useMemo, useState } from "react";
import { useEditorStore, type EditorTag } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import { Eye, Lock, Unlock, Search, XCircle, RefreshCw } from "lucide-react";

export function WatchTable() {
  const editorTags = useEditorStore((s) => s.editorTags);
  const forceTagValue = useEditorStore((s) => s.forceTagValue);
  const releaseTag = useEditorStore((s) => s.releaseTag);
  const projectTags = useProjectStore((s) => s.tags);
  const [filter, setFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const allTags = useMemo(() => {
    const items: {
      id: string;
      name: string;
      value: unknown;
      type: string;
      forced: boolean;
      source: string;
    }[] = [];

    for (const [id, tag] of Object.entries(editorTags)) {
      items.push({
        id,
        name: tag.name,
        value: tag.value,
        type: tag.type,
        forced: tag.forced,
        source: "Ladder/PLC",
      });
    }

    for (const [name, value] of Object.entries(projectTags)) {
      if (!items.some((i) => i.name === name)) {
        items.push({
          id: `project-${name}`,
          name,
          value,
          type: typeof value === "boolean" ? "BOOL" : typeof value === "number" ? "REAL" : "STRING",
          forced: false,
          source: "SCADA",
        });
      }
    }

    if (filter) {
      const f = filter.toLowerCase();
      return items.filter(
        (i) => i.name.toLowerCase().includes(f) || i.value?.toString().toLowerCase().includes(f),
      );
    }
    return items;
  }, [editorTags, projectTags, filter]);

  const formatVal = (v: unknown): string => {
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return v.toFixed(3);
    return String(v ?? "");
  };

  return (
    <div className="flex flex-col h-full text-[12px]">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          Watch Table ({allTags.length})
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-6 w-6 grid place-items-center rounded ${autoRefresh ? "text-primary" : "text-muted-foreground"} hover:bg-accent cursor-pointer`}
            title={autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              setFilter("");
              releaseTag("");
            }}
            className="h-6 w-6 grid place-items-center rounded text-muted-foreground hover:bg-accent cursor-pointer"
            title="Limpar filtro"
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar tags..."
            className="w-full h-7 pl-7 pr-2 rounded bg-input border border-border text-[11px] outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {allTags.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma tag. Execute a simulação Ladder ou conecte ao SCADA.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left px-2 py-1.5 font-medium w-4"></th>
                <th className="text-left px-2 py-1.5 font-medium">Tag</th>
                <th className="text-right px-2 py-1.5 font-medium">Valor</th>
                <th className="text-center px-2 py-1.5 font-medium w-16">Tipo</th>
                <th className="text-right px-2 py-1.5 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {allTags.map((tag) => (
                <WatchRow
                  key={tag.id}
                  tag={tag}
                  formatVal={formatVal}
                  onForce={(value) => forceTagValue(tag.id, value)}
                  onRelease={() => releaseTag(tag.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground flex items-center gap-2">
        <Lock className="h-3 w-3" />
        <span>Tags forcadas nao sao sobrescritas pelo runtime</span>
      </div>
    </div>
  );
}

function WatchRow({
  tag,
  formatVal,
  onForce,
  onRelease,
}: {
  tag: { id: string; name: string; value: unknown; type: string; forced: boolean; source: string };
  formatVal: (v: unknown) => string;
  onForce: (value: boolean | number | string) => void;
  onRelease: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");

  const isBool = tag.type === "BOOL";

  const startEdit = () => {
    if (tag.forced) {
      onRelease();
      return;
    }
    setEditVal(formatVal(tag.value));
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    let parsed: boolean | number | string = editVal;
    if (isBool) {
      parsed = editVal.toUpperCase() === "TRUE" || editVal === "1";
    } else if (!isNaN(Number(editVal)) && editVal.trim() !== "") {
      parsed = Number(editVal);
    }
    onForce(parsed);
  };

  return (
    <tr
      className={`border-b border-border/50 hover:bg-accent/30 transition-colors group ${
        tag.forced ? "bg-warning/5" : ""
      }`}
    >
      <td className="px-2 py-1" title={tag.forced ? "Forçado" : "Livre"}>
        {tag.forced ? (
          <Lock className="h-3 w-3 text-warning" />
        ) : (
          <Unlock className="h-3 w-3 text-muted-foreground/40" />
        )}
      </td>
      <td className="px-2 py-1 font-mono text-[11px]">{tag.name}</td>
      <td className="px-2 py-1 text-right">
        {editing ? (
          <input
            autoFocus
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-20 text-right h-6 px-1.5 rounded bg-input border border-primary text-[11px] font-mono outline-none"
          />
        ) : (
          <button
            onClick={startEdit}
            className="font-mono text-[11px] px-1.5 py-0.5 rounded hover:bg-accent cursor-pointer"
            title={tag.forced ? "Clique para liberar" : "Clique para forçar valor"}
          >
            {formatVal(tag.value)}
          </button>
        )}
      </td>
      <td className="px-2 py-1 text-center">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          {tag.type}
        </span>
      </td>
      <td className="px-2 py-1 text-right text-[10px] text-muted-foreground">{tag.source}</td>
    </tr>
  );
}
