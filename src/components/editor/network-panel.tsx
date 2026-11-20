/**
 * Dados da rede e resultados do cálculo de curto-circuito (aba "Cálculos NBR
 * 5410"). Os dados (aterramento, curto da concessionária, temperatura) são do
 * PROJETO e mudam por comando reversível (Ctrl+Z). Os resultados vêm de
 * `analyzeNetwork` — o mesmo motor do diagnóstico e da camada do canvas.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDiagramStore } from "@/lib/diagram/store";
import type { DiagramNode, NetworkSettings } from "@/lib/diagram/schema";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { nodeDisplayName } from "@/lib/diagram/connection/cable-sizing";
import { useNetworkOverlay } from "@/lib/diagram/network-overlay-store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EARTHING = ["TN-S", "TN-C", "TN-C-S", "TT", "IT"] as const;
const POINT_KINDS = new Set([
  "breaker",
  "busbar",
  "motor",
  "load",
  "lamp",
  "socket",
  "fuse",
  "rcd",
]);

function setNetwork(patch: Partial<NetworkSettings>) {
  const store = useDiagramStore.getState();
  const from = store.doc.metadata.network;
  const to: NetworkSettings = { ...(from ?? {}), ...patch };
  for (const k of Object.keys(to) as Array<keyof NetworkSettings>) {
    if (to[k] === undefined) delete to[k];
  }
  store.dispatch({
    type: "UpdateNetworkSettings",
    from,
    to: Object.keys(to).length > 0 ? to : undefined,
  });
}

function NumberField(props: {
  label: string;
  hint?: string;
  value?: number;
  min: number;
  max: number;
  onCommit: (v: number | undefined) => void;
  testId: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(props.value !== undefined ? String(props.value) : "");
  useEffect(() => setText(props.value !== undefined ? String(props.value) : ""), [props.value]);
  const commit = () => {
    const raw = text.trim().replace(",", ".");
    if (raw === "") {
      if (props.value !== undefined) props.onCommit(undefined);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < props.min || n > props.max) {
      toast.error(t("networkPanel.invalidNumber"));
      setText(props.value !== undefined ? String(props.value) : "");
      return;
    }
    if (n !== props.value) props.onCommit(n);
  };
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground" title={props.hint}>
      {props.label}
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={props.hint ?? "—"}
        data-testid={props.testId}
        className="h-7 w-32 rounded border border-border bg-input px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

export function NetworkPanel() {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const overlay = useNetworkOverlay();
  const net = doc.metadata.network;
  const report = useMemo(() => {
    try {
      return analyzeNetwork(doc);
    } catch {
      return null;
    }
  }, [doc]);

  const points = useMemo(
    () =>
      Object.values(doc.nodes)
        .filter((n) => n.sheet === "unifilar" && POINT_KINDS.has(n.params.kind))
        .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y),
    [doc.nodes],
  );

  if (!report) return null;
  const hasSource = Object.keys(report.nodes).length > 0;

  const icuStatus = (n: DiagramNode, ik?: number) => {
    if (n.params.kind !== "breaker") return null;
    const icu = (n.params as { icc_kA?: number }).icc_kA;
    if (icu === undefined) return { text: t("networkPanel.icuMissing"), cls: "text-amber-300" };
    if (ik !== undefined && icu < ik)
      return { text: `${icu} kA · ${t("networkPanel.icuLow")}`, cls: "text-destructive" };
    return { text: `${icu} kA · ${t("networkPanel.icuOk")}`, cls: "text-emerald-400" };
  };

  return (
    <section className="space-y-2" data-testid="network-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
          {t("networkPanel.title")}
        </h3>
        <label className="flex items-center gap-1.5 text-[11px] text-foreground">
          <input
            type="checkbox"
            checked={overlay.visible}
            onChange={(e) => overlay.setVisible(e.target.checked)}
            data-testid="network-overlay-toggle"
          />
          {t("networkPanel.showOnDiagram")}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          {t("networkPanel.earthing")}
          <select
            value={net?.earthing ?? ""}
            onChange={(e) =>
              setNetwork({
                earthing:
                  e.target.value === ""
                    ? undefined
                    : (e.target.value as NonNullable<NetworkSettings["earthing"]>),
              })
            }
            data-testid="network-earthing"
            className="h-7 rounded border border-border bg-input px-1 text-xs text-foreground"
          >
            <option value="">{t("networkPanel.earthingUnknown")}</option>
            {EARTHING.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        {(["overheadSupply", "lightningProtection"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            {t(`networkPanel.${key}`)}
            <select
              value={net?.[key] === undefined ? "" : net[key] ? "yes" : "no"}
              onChange={(e) =>
                setNetwork({
                  [key]: e.target.value === "" ? undefined : e.target.value === "yes",
                })
              }
              data-testid={`network-${key}`}
              className="h-7 rounded border border-border bg-input px-1 text-xs text-foreground"
            >
              <option value="">{t("networkPanel.earthingUnknown")}</option>
              <option value="yes">{t("networkPanel.yes")}</option>
              <option value="no">{t("networkPanel.no")}</option>
            </select>
          </label>
        ))}
        <NumberField
          label={t("networkPanel.utilityScc")}
          hint={t("networkPanel.utilitySccHint")}
          value={net?.utilityScc_MVA}
          min={1}
          max={100_000}
          onCommit={(v) => setNetwork({ utilityScc_MVA: v })}
          testId="network-scc"
        />
        <NumberField
          label={t("networkPanel.ambientTemp")}
          value={net?.ambientTemp_C}
          min={10}
          max={80}
          onCommit={(v) => setNetwork({ ambientTemp_C: v })}
          testId="network-temp"
        />
      </div>

      {!hasSource ? (
        <p className="text-[11px] italic text-muted-foreground">{t("networkPanel.noSource")}</p>
      ) : (
        <>
          <p
            className={cn(
              "text-[11px]",
              report.findings.length ? "text-amber-300" : "text-emerald-400",
            )}
          >
            {report.findings.length
              ? t("networkPanel.findings", { n: report.findings.length })
              : t("networkPanel.noFindings")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/70 text-[11px] text-muted-foreground">
                  <th className="px-2 py-1 font-semibold">{t("networkPanel.colPoint")}</th>
                  <th className="px-2 py-1 font-semibold">{t("networkPanel.colIk3")}</th>
                  <th className="px-2 py-1 font-semibold">{t("networkPanel.colIk1")}</th>
                  <th className="px-2 py-1 font-semibold">{t("networkPanel.colDrop")}</th>
                  <th className="px-2 py-1 font-semibold">{t("networkPanel.colIcu")}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((n) => {
                  const r = report.nodes[n.id];
                  if (!r) return null;
                  const icu = icuStatus(n, r.Ik3max_kA);
                  const pending = t("networkPanel.pending");
                  return (
                    <tr
                      key={n.id}
                      className="border-b border-border/30"
                      data-testid={`network-row-${n.id}`}
                    >
                      <td className="px-2 py-1 font-semibold text-foreground">
                        {nodeDisplayName(n)}
                      </td>
                      <td className="px-2 py-1">{r.Ik3max_kA ?? pending}</td>
                      <td className="px-2 py-1">{r.Ik1min_kA ?? pending}</td>
                      <td className="px-2 py-1">
                        {r.dropTotal_pct !== undefined ? `${r.dropTotal_pct}%` : "—"}
                      </td>
                      <td className={cn("px-2 py-1", icu?.cls)}>{icu?.text ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {report.premises.length > 0 && (
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">{t("networkPanel.premisesTitle")}</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {report.premises.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
