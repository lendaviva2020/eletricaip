import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Lock, Unlock } from "lucide-react";
import { getVoltaiCompDef } from "@/lib/voltai/component-definitions";
import { useVoltaiStore } from "@/lib/voltai/store";
import { useEditorStore, type EditorTag, type EditorTagType } from "@/lib/editor/store";
import { validateTagName } from "@/lib/editor/property-schemas";
import { ValidatedParamField } from "./property-fields/validated-param-field";
import { cn } from "@/lib/utils";

const TAG_TYPES: EditorTagType[] = ["BOOL", "INT", "REAL", "STRING"];

/**
 * Type-aware property panel.
 * Reads selected component from voltai store; writes back via store actions.
 * Tag binding section reads/writes the shared editor store (cross-module).
 */
export function RightPropertyPanel() {
  const voltaiNode = useVoltaiStore((s) => s.components.find((n) => n.id === s.selectedId));
  const updateParam = useVoltaiStore((s) => s.updateComponentParam);
  const restoreFactory = useVoltaiStore((s) => s.restoreFactoryParams);

  if (!voltaiNode) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Selecione um componente no canvas para editar suas propriedades.
      </div>
    );
  }

  const definition = getVoltaiCompDef(voltaiNode.type);
  const paramSpecs = definition.paramSpecs ?? {};

  return (
    <div className="p-4 space-y-3 text-[12px]">
      <Section title="Selecionado">
        <div className="text-sm font-medium">
          {voltaiNode.label} · {definition.name}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {definition.category} · {definition.standard.join(", ")}
        </div>
      </Section>

      <Section title="Parâmetros">
        {Object.keys(paramSpecs).length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">
            Sem parâmetros configuráveis.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(paramSpecs).map(([key, spec]) => (
              <ValidatedParamField
                key={key}
                spec={spec}
                value={voltaiNode.params[key] ?? spec.defaultValue}
                onCommit={(value) => updateParam(voltaiNode.id, key, value)}
              />
            ))}
          </div>
        )}
      </Section>

      <TagsSection nodeId={voltaiNode.id} />

      <Section title="Estado de simulação">
        {Object.entries(voltaiNode.simulationState).map(([k, v]) => (
          <div key={k} className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-mono text-foreground">{String(v)}</span>
          </div>
        ))}
      </Section>

      <button
        onClick={() => {
          restoreFactory(voltaiNode.id);
          toast.success(`Configurações de fábrica restauradas para ${voltaiNode.label}`);
        }}
        className="w-full text-[11px] py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10"
      >
        Restaurar fábrica
      </button>
    </div>
  );
}

function TagsSection({ nodeId }: { nodeId: string }) {
  const tagsObj = useEditorStore((s) => s.tags);
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
    if (useEditorStore.getState().tags[id]) {
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
    <Section title="Tags vinculadas">
      <div className="space-y-1.5">
        {tags.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic">Nenhuma tag vinculada.</div>
        )}
        {tags.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-1.5 text-[11px] font-mono bg-card/60 border border-border rounded px-2 py-1"
          >
            <span className="text-primary truncate flex-1" title={t.id}>
              {t.name}
            </span>
            <span className="text-[9px] uppercase text-muted-foreground">{t.type}</span>
            <span
              className={cn("text-[10px]", t.forced ? "text-warning" : "text-foreground/70")}
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
                <Unlock className="h-3 w-3 text-warning" />
              ) : (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            <button
              onClick={() => removeTag(t.id)}
              className="h-5 w-5 grid place-items-center rounded hover:bg-destructive/10 text-destructive"
              title="Remover tag"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-1 pt-1">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="RUN, FAULT, %Q0.0…"
            maxLength={64}
            className={cn(
              "flex-1 h-7 rounded bg-input border px-2 text-[11px] font-mono outline-none",
              error ? "border-destructive" : "border-border",
            )}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EditorTagType)}
            className="h-7 rounded bg-input border border-border text-[10px] px-1"
          >
            {TAG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            className="h-7 w-7 grid place-items-center rounded bg-primary text-primary-foreground hover:opacity-90"
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
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {title}
      </div>
      <div className="rounded-md border border-border bg-card p-3 space-y-1">{children}</div>
    </div>
  );
}
