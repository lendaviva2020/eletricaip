// #TWIN-04 — Painel "E-se?" para overrides locais de tags do Digital Twin.
import { useMemo, useState } from "react";
import { FlaskConical, Save, Trash2, RotateCcw, X } from "lucide-react";
import { useDigitalTwinStore, type WhatIfValue } from "@/lib/digital-twin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export function WhatIfPanel({ onClose }: { onClose?: () => void }) {
  const enabled = useDigitalTwinStore((s) => s.whatIfEnabled);
  const overrides = useDigitalTwinStore((s) => s.whatIfOverrides);
  const mappings = useDigitalTwinStore((s) => s.mappings);
  const buffers = useDigitalTwinStore((s) => s.telemetryBuffers);
  const scenarios = useDigitalTwinStore((s) => s.whatIfScenarios);

  const setEnabled = useDigitalTwinStore((s) => s.setWhatIfEnabled);
  const setOverride = useDigitalTwinStore((s) => s.setWhatIfOverride);
  const clearOverride = useDigitalTwinStore((s) => s.clearWhatIfOverride);
  const reset = useDigitalTwinStore((s) => s.resetWhatIf);
  const saveScenario = useDigitalTwinStore((s) => s.saveWhatIfScenario);
  const loadScenario = useDigitalTwinStore((s) => s.loadWhatIfScenario);
  const deleteScenario = useDigitalTwinStore((s) => s.deleteWhatIfScenario);

  const [scenarioName, setScenarioName] = useState("");

  const tags = useMemo(() => {
    const all = new Map<string, { label: string; unit: string; type: string }>();
    for (const m of mappings) {
      for (const h of m.hotspots) {
        all.set(h.tag, { label: h.label, unit: h.unit, type: h.type });
      }
    }
    return Array.from(all.entries()).map(([tag, meta]) => ({ tag, ...meta }));
  }, [mappings]);

  const lastReal = (tag: string): number | null => {
    const b = buffers[tag];
    if (!b || b.samples.length === 0) return null;
    return b.samples[b.samples.length - 1].value;
  };

  return (
    <aside className="w-80 shrink-0 border-l border-border flex flex-col bg-card/30">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-warning" /> Modo "E-se?"
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">Ativar simulação hipotética</span>
          <span className="text-[10px] text-muted-foreground">
            Telemetria real não é persistida enquanto ativo.
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(c) => setEnabled(c)}
          aria-label="Ativar modo E-se"
        />
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Nenhuma tag mapeada para sobrescrever.
          </p>
        ) : (
          tags.map(({ tag, label, unit, type }) => {
            const overridden = tag in overrides;
            const real = lastReal(tag);
            const current: WhatIfValue | "" = overridden
              ? overrides[tag]
              : real != null
                ? real
                : "";
            return (
              <div
                key={tag}
                className={`rounded-md border p-2 space-y-1 ${
                  overridden ? "border-warning/50 bg-warning/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">{label}</p>
                    <p className="text-[9px] text-muted-foreground font-mono truncate">{tag}</p>
                  </div>
                  {overridden && (
                    <Badge variant="outline" className="text-[9px] h-4 border-warning text-warning">
                      override
                    </Badge>
                  )}
                </div>
                {type === "status" ? (
                  <Switch
                    checked={Boolean(current)}
                    onCheckedChange={(c) => setOverride(tag, c)}
                    aria-label={`Override ${tag}`}
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={typeof current === "number" ? current : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          clearOverride(tag);
                        } else {
                          setOverride(tag, Number(v));
                        }
                      }}
                      className="h-7 text-xs"
                      placeholder={real != null ? String(real.toFixed(2)) : "—"}
                    />
                    <span className="text-[10px] text-muted-foreground font-mono w-8">{unit}</span>
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => clearOverride(tag)}
                        className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
                        title="Limpar override"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <div className="flex gap-1">
          <Input
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Nome do cenário"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2"
            disabled={!scenarioName.trim() || Object.keys(overrides).length === 0}
            onClick={() => {
              saveScenario(scenarioName.trim());
              setScenarioName("");
            }}
            title="Salvar cenário"
          >
            <Save className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={reset}
            title="Resetar tudo"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
        {scenarios.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-auto">
            {scenarios.map((sc) => (
              <div
                key={sc.id}
                className="flex items-center justify-between gap-1 rounded px-2 py-1 hover:bg-accent/40"
              >
                <button
                  type="button"
                  onClick={() => loadScenario(sc.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-[11px] truncate">{sc.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {Object.keys(sc.overrides).length} tags
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteScenario(sc.id)}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent"
                  title="Excluir cenário"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
