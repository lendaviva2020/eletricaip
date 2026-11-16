/**
 * Painel "Documentação EletricAI" do editor unifilar: verificação ao vivo da
 * documentação de painel e o comando "Numerar dispositivos" (IEC 81346),
 * aplicado como um único comando reversível (Ctrl+Z).
 */
import { useDeferredValue, useMemo, useState } from "react";
import { CaretDown, CaretRight, ListNumbers, Warning, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { documentationFromDiagram } from "@/lib/documentation/diagram-adapter";
import { planDeviceNumbering, type NumberingMode } from "@/lib/documentation/diagram-numbering";
import { useI18n } from "@/lib/i18n";

const MAX_LISTED = 6;

export function EletricaiDocPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const liveDoc = useDiagramStore((s) => s.doc);
  const liveRungs = useEditorStore((s) => s.rungs);
  // Recalcula fora do caminho crítico de arraste/edição do canvas.
  const doc = useDeferredValue(liveDoc);
  const rungs = useDeferredValue(liveRungs);

  const documentation = useMemo(() => {
    if (!open) return null;
    try {
      return documentationFromDiagram(doc, rungs);
    } catch {
      return null;
    }
  }, [open, doc, rungs]);

  const pendingTags = useMemo(() => planDeviceNumbering(doc, "missing").changes.length, [doc]);

  const apply = (mode: NumberingMode) => {
    const current = useDiagramStore.getState().doc;
    const plan = planDeviceNumbering(current, mode);
    if (!plan.command) {
      toast.info(t("docPanel.nothingToNumber"));
      return;
    }
    if (mode === "all" && !window.confirm(t("docPanel.confirmAll", { n: plan.changes.length }))) {
      return;
    }
    useDiagramStore.getState().dispatch(plan.command);
    toast.success(t("docPanel.numbered", { n: plan.changes.length }));
  };

  const errors = documentation?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = documentation?.issues.filter((i) => i.severity === "warning") ?? [];
  const listed = [...errors, ...warnings].slice(0, MAX_LISTED);

  return (
    <div className="rounded-md border border-border bg-card/40" data-testid="eletricai-doc-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider"
      >
        {open ? <CaretDown className="h-3 w-3" /> : <CaretRight className="h-3 w-3" />}
        <ListNumbers className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1">{t("docPanel.title")}</span>
        {pendingTags > 0 && (
          <span className="rounded bg-warning/15 px-1.5 text-[10px] font-semibold normal-case text-warning">
            {t("docPanel.pendingTags", { n: pendingTags })}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-2.5 pb-2.5 pt-2 text-[11px]">
          <p className="text-muted-foreground">{t("docPanel.desc")}</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => apply("missing")}
              className="rounded bg-primary px-2 py-1 font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("docPanel.numberMissing")}
            </button>
            <button
              type="button"
              onClick={() => apply("all")}
              className="rounded border border-border px-2 py-1 hover:bg-muted"
            >
              {t("docPanel.renumberAll")}
            </button>
          </div>

          {documentation && (
            <>
              <div className="grid grid-cols-3 gap-1 text-center">
                <Stat label={t("docPanel.devices")} value={documentation.devices.length} />
                <Stat label={t("docPanel.cables")} value={documentation.cables.length} />
                <Stat label={t("docPanel.terminals")} value={documentation.terminals.length} />
              </div>
              {listed.length === 0 ? (
                <p className="flex items-center gap-1 text-success">
                  <CheckCircle className="h-3.5 w-3.5" /> {t("docPanel.ok")}
                </p>
              ) : (
                <ul className="space-y-1" aria-label={t("docPanel.issues")}>
                  {listed.map((i, idx) => (
                    <li
                      key={`${i.code}-${i.ref}-${idx}`}
                      className={
                        i.severity === "error"
                          ? "flex gap-1 text-destructive"
                          : "flex gap-1 text-warning"
                      }
                    >
                      <Warning className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{i.message}</span>
                    </li>
                  ))}
                  {errors.length + warnings.length > MAX_LISTED && (
                    <li className="text-muted-foreground">
                      {t("docPanel.more", { n: errors.length + warnings.length - MAX_LISTED })}
                    </li>
                  )}
                </ul>
              )}
              <p className="text-[10px] text-muted-foreground">{t("docPanel.dossierHint")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-background px-1 py-1">
      <div className="font-mono text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
