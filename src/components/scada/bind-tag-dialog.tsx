// "Bind to tag" modal — fuzzy autocomplete over editor + project tags.
// Used to wire HMI widget params (gauge.tag, slider.tag, …) to a runtime tag.
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag as TagIcon, Plus } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTag?: string;
  onConfirm: (tagName: string) => void;
  title?: string;
}

interface TagOption {
  name: string;
  source: "editor" | "project";
  type: string;
  preview: string;
}

export function BindTagDialog({ open, onOpenChange, currentTag, onConfirm, title }: Props) {
  const [query, setQuery] = useState(currentTag ?? "");
  const [focusIdx, setFocusIdx] = useState(0);

  const editorTags = useEditorStore((s) => s.editorTags);
  const projectTags = useProjectStore((s) => s.tags);

  const options = useMemo<TagOption[]>(() => {
    const map = new Map<string, TagOption>();
    Object.values(editorTags).forEach((t) =>
      map.set(t.name, {
        name: t.name,
        source: "editor",
        type: t.type,
        preview: String(t.value),
      }),
    );
    Object.entries(projectTags).forEach(([name, value]) => {
      if (map.has(name)) return;
      map.set(name, {
        name,
        source: "project",
        type: typeof value === "boolean" ? "BOOL" : typeof value === "number" ? "REAL" : "STRING",
        preview: String(value),
      });
    });
    const q = query.trim().toLowerCase();
    const all = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return all;
    return all.filter((o) => o.name.toLowerCase().includes(q));
  }, [editorTags, projectTags, query]);

  const exact = options.some((o) => o.name === query.trim());

  const handleConfirm = (tagName: string) => {
    const name = tagName.trim();
    if (!name) return;
    // Auto-create as editor tag if it doesn't exist yet
    const exists = Object.values(useEditorStore.getState().editorTags).some((t) => t.name === name);
    if (!exists && !(name in useProjectStore.getState().tags)) {
      useEditorStore.getState().upsertTag({
        id: `tag-${name}`,
        name,
        type: "REAL",
        value: 0,
        forced: false,
      });
    }
    onConfirm(name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <TagIcon className="h-4 w-4 text-primary" />
            {title ?? "Vincular Tag"}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Selecione uma tag existente ou crie uma nova. As alterações refletem nos widgets HMI e
            no Watch.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setFocusIdx((i) => Math.min(options.length - 1, i + 1));
            else if (e.key === "ArrowUp") setFocusIdx((i) => Math.max(0, i - 1));
            else if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm(options[focusIdx]?.name ?? query);
            }
          }}
          placeholder="Buscar ou digitar nome..."
          className="font-mono text-[12px]"
        />

        <div className="max-h-60 overflow-auto border border-border rounded-md divide-y divide-border">
          {options.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              Nenhuma tag encontrada. Pressione Enter para criar “{query.trim()}”.
            </div>
          ) : (
            options.map((opt, idx) => (
              <button
                key={opt.name}
                type="button"
                onClick={() => handleConfirm(opt.name)}
                onMouseEnter={() => setFocusIdx(idx)}
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-[11px] cursor-pointer ${
                  idx === focusIdx ? "bg-accent" : "bg-transparent"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      opt.source === "editor" ? "bg-primary" : "bg-success"
                    }`}
                  />
                  <span className="font-mono truncate">{opt.name}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">{opt.type}</span>
                </div>
                <span className="font-mono text-muted-foreground truncate max-w-[120px]">
                  {opt.preview}
                </span>
              </button>
            ))
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {options.length} tag{options.length === 1 ? "" : "s"} disponíveis
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => handleConfirm(query)}
              disabled={!query.trim()}
              className="gap-1"
            >
              {exact ? (
                "Vincular"
              ) : (
                <>
                  <Plus className="h-3 w-3" /> Criar e vincular
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
