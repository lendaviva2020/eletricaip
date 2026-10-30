import { MODES } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";
import { Pulse } from "@phosphor-icons/react";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useI18n } from "@/lib/i18n";

export function ModeTabs() {
  const mode = useEditorStore((s) => s.activeMode);
  const setMode = useEditorStore((s) => s.setActiveMode);
  const { t } = useI18n();

  return (
    <div className="h-9 shrink-0 flex items-end border-b border-border bg-panel">
      <div className="flex-1 min-w-0 flex items-end gap-0.5 px-2 overflow-x-auto scrollbar-none">
        {MODES.map((m) => {
          const active = m.id === mode;
          const label = t(`workspace.modes.${m.id}`);
          const hint = t(`workspace.modes.${m.id}Hint`);
          return (
            <button
              key={m.id}
              data-tour={`mode-${m.id}`}
              onClick={() => {
                setMode(m.id);
                if (m.id === "unifilar" || m.id === "multifilar") {
                  useDiagramStore.getState().setActiveSheet(m.id);
                }
              }}
              className={cn(
                "relative h-8 px-2.5 text-xs font-medium rounded-t-sm flex items-center gap-1.5 transition-colors shrink-0",
                "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                active && "text-foreground bg-background border border-b-0 border-border",
              )}
            >
              <span>{label || m.label}</span>
              <span className="hidden lg:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {hint || m.hint}
              </span>
              {active && <span className="absolute -bottom-px left-2 right-2 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>
      <div className="hidden sm:flex items-center gap-1.5 pb-1.5 pr-3 pl-2 text-[11px] text-muted-foreground shrink-0 border-l border-border">
        <Pulse className="h-3 w-3 text-success" />
        <span className="font-mono">{t("workspace.sync60Hz")}</span>
      </div>
    </div>
  );
}
