/**
 * Energia incidente de arco por quadro (aba "Cálculos NBR 5410"). Resultados de
 * `analyzeArcFlash` — o mesmo motor do diagnóstico. As etiquetas são geradas como
 * arquivo HTML autônomo (texto escapado, sem script) para o usuário imprimir.
 */
import { useMemo } from "react";
import { toast } from "sonner";
import { useDiagramStore } from "@/lib/diagram/store";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { analyzeArcFlash, type BoardArcFlash } from "@/lib/diagram/connection/arc-flash";
import { buildArcFlashLabelsHtml } from "@/lib/diagram/arc-flash-labels";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STATUS_CLS: Record<BoardArcFlash["status"], string> = {
  ok: "text-foreground",
  high: "text-amber-300",
  danger: "text-destructive",
  pending: "text-muted-foreground",
};

export function ArcFlashPanel() {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const report = useMemo(() => {
    try {
      return analyzeArcFlash(doc, analyzeNetwork(doc));
    } catch {
      return null;
    }
  }, [doc]);
  if (!report) return null;

  const downloadLabels = () => {
    const html = buildArcFlashLabelsHtml(report.boards, {
      projectTitle: doc.metadata.title,
      premises: report.premises,
      disclaimer: t("arcPanel.labelsHint"),
    });
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "etiquetas-arco-eletrico.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(t("arcPanel.labelsDone"));
  };
  const calculated = report.boards.filter((b) => b.status !== "pending");

  return (
    <section className="space-y-2" data-testid="arc-flash-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
          {t("arcPanel.title")}
        </h3>
        {calculated.length > 0 && (
          <button
            type="button"
            onClick={downloadLabels}
            className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
            data-testid="arc-flash-labels"
          >
            {t("arcPanel.downloadLabels")}
          </button>
        )}
      </div>
      {report.boards.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">{t("arcPanel.noBoards")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/70 text-[11px] text-muted-foreground">
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colBoard")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colIbf")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colIa")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colTime")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colEnergy")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colPpe")}</th>
                <th className="px-2 py-1 font-semibold">{t("arcPanel.colBoundary")}</th>
              </tr>
            </thead>
            <tbody>
              {report.boards.map((b) => (
                <tr
                  key={b.boardId}
                  className={cn("border-b border-border/30", STATUS_CLS[b.status])}
                  data-testid={`arc-row-${b.boardId}`}
                >
                  <td className="px-2 py-1 font-semibold">{b.name}</td>
                  {b.status === "pending" ? (
                    <td className="px-2 py-1 italic" colSpan={6}>
                      {t("arcPanel.pending")}: {b.pendingReason}
                    </td>
                  ) : (
                    <>
                      <td className="px-2 py-1">{b.Ibf_kA}</td>
                      <td className="px-2 py-1">{b.arcingCurrent_kA}</td>
                      <td className="px-2 py-1">
                        {b.clearingTime_s}
                        {b.durationCapped ? ` (${t("arcPanel.capped")})` : ""}
                      </td>
                      <td className="px-2 py-1">
                        {b.incidentEnergy_cal_cm2}
                        {b.status === "danger" ? ` — ${t("arcPanel.danger")}` : ""}
                        {b.withinModelRange === false ? ` (${t("arcPanel.outOfRange")})` : ""}
                      </td>
                      <td className="px-2 py-1">{b.ppe_category}</td>
                      <td className="px-2 py-1">
                        {b.arcBoundary_mm !== undefined
                          ? (b.arcBoundary_mm / 1000).toFixed(2)
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.boards.length > 0 && (
        <p className="text-[10px] text-muted-foreground">{t("arcPanel.labelsHint")}</p>
      )}
    </section>
  );
}
