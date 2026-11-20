/**
 * Tabela de cabos NBR 5410 (aba "Cálculos NBR 5410" do painel inferior).
 *
 * Uma linha por condutor de potência do unifilar: corrente de projeto (Ib),
 * proteção a montante (In), seção gravada × seção mínima, método de
 * instalação, comprimento (EDITÁVEL — é dado de obra, nunca inventado), queda
 * de tensão e status. Toda edição é um comando reversível (Ctrl+Z).
 *
 * O motor é `sizeDiagramCables` (puro, testado): o mesmo usado pela IA e pelo
 * diagnóstico — a tabela, o aviso e a correção mostram os mesmos números.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import type { Command } from "@/lib/diagram/commands";
import type { DiagramEdge } from "@/lib/diagram/schema";
import {
  MAX_CABLE_DROP_PCT,
  sizeDiagramCables,
  type CableRow,
  type CableRowStatus,
} from "@/lib/diagram/connection/cable-sizing";
import { NBR5410_SECTIONS } from "@/lib/electrical-calc";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const METHODS = ["A1", "A2", "B1", "B2", "C", "D", "E", "F"] as const;
const MAX_LENGTH_M = 100_000;

/** Cabo a destacar quando a tabela é aberta a partir de um aviso. */
const useCableFocus = create<{ edgeId: string | null; set: (id: string | null) => void }>(
  (set) => ({ edgeId: null, set: (edgeId) => set({ edgeId }) }),
);

/** Abre o painel inferior na tabela de cabos (opcionalmente focando um cabo). */
export function openCableTable(edgeId?: string): void {
  const s = useEditorStore.getState();
  s.setConsoleTab("calculos_nbr");
  s.setConsoleOpen(true);
  useCableFocus.getState().set(edgeId ?? null);
}

/** Aplica o dimensionamento NBR 5410 como UM comando reversível. Devolve quantos mudaram. */
export function applyCableSizing(): { changed: number; pending: number } {
  const store = useDiagramStore.getState();
  const report = sizeDiagramCables(store.doc);
  if (report.changes.length > 0) {
    const command: Command = {
      type: "Batch",
      commands: report.changes.map((c) => ({
        type: "UpdateEdgeCable" as const,
        edgeId: c.edgeId,
        from: c.from,
        to: c.to,
      })),
    };
    store.dispatch(command);
  }
  return { changed: report.changes.length, pending: report.pendingLength.length };
}

function updateCable(edge: DiagramEdge, patch: Partial<NonNullable<DiagramEdge["cable"]>>) {
  const from = edge.cable;
  const to = { insulation: "PVC" as const, ...(from ?? {}), ...patch };
  // Remove chaves explicitamente zeradas (ex.: comprimento apagado).
  for (const k of Object.keys(to) as Array<keyof typeof to>) {
    if (to[k] === undefined) delete to[k];
  }
  useDiagramStore.getState().dispatch({ type: "UpdateEdgeCable", edgeId: edge.id, from, to });
}

const STATUS_CLASS: Record<CableRowStatus, string> = {
  ok: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
  sem_secao: "bg-amber-950/50 text-amber-200 border-amber-500/40",
  subdimensionada: "bg-destructive/40 text-destructive-foreground border-destructive",
  sem_comprimento: "bg-amber-950/50 text-amber-200 border-amber-500/40",
  queda_excedida: "bg-destructive/40 text-destructive-foreground border-destructive",
  nao_dimensionavel: "bg-muted text-muted-foreground border-border",
};

function LengthInput({ row, edge }: { row: CableRow; edge: DiagramEdge }) {
  const { t } = useI18n();
  const [value, setValue] = useState(row.length_m !== undefined ? String(row.length_m) : "");
  const ref = useRef<HTMLInputElement>(null);
  const focusId = useCableFocus((s) => s.edgeId);

  useEffect(() => {
    setValue(row.length_m !== undefined ? String(row.length_m) : "");
  }, [row.length_m]);

  useEffect(() => {
    if (focusId !== row.edgeId) return;
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus();
    useCableFocus.getState().set(null);
  }, [focusId, row.edgeId]);

  const commit = () => {
    const raw = value.trim().replace(",", ".");
    if (raw === "") {
      if (row.length_m !== undefined) updateCable(edge, { length_m: undefined });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > MAX_LENGTH_M) {
      toast.error(t("cableTable.invalidLength"));
      setValue(row.length_m !== undefined ? String(row.length_m) : "");
      return;
    }
    const rounded = Math.round(n * 10) / 10;
    if (rounded !== row.length_m) updateCable(edge, { length_m: rounded });
  };

  return (
    <input
      ref={ref}
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={row.field ? t("cableTable.lengthRequired") : t("cableTable.lengthOptional")}
      aria-label={t("cableTable.colLength")}
      data-testid={`cable-length-${row.edgeId}`}
      className={cn(
        "h-7 w-20 rounded border bg-input px-1.5 text-right text-xs outline-none focus:ring-2 focus:ring-ring",
        row.status === "sem_comprimento" ? "border-amber-500/70" : "border-border",
      )}
    />
  );
}

export function CableTable() {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const report = useMemo(() => {
    try {
      return sizeDiagramCables(doc);
    } catch {
      return null;
    }
  }, [doc]);

  if (!report) return null;
  const rows = report.rows;
  const pending = rows.filter((r) => r.status !== "ok").length;

  const onSizeAll = () => {
    const { changed, pending: missingLength } = applyCableSizing();
    if (changed === 0) toast.info(t("cableTable.nothingToSize"));
    else toast.success(t("cableTable.sized", { n: changed }));
    if (missingLength > 0) toast.warning(t("cableTable.needLength", { n: missingLength }));
  };

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center italic text-muted-foreground" data-testid="cable-table-empty">
        {t("cableTable.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="cable-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t("cableTable.summary", { n: rows.length, ok: rows.length - pending, pending })}
        </span>
        <button
          type="button"
          onClick={onSizeAll}
          className="h-7 rounded bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
          data-testid="cable-size-all"
        >
          {t("cableTable.sizeAll")}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border/70 text-[11px] text-muted-foreground">
              <th className="px-2 py-1 font-semibold">{t("cableTable.colCable")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colIb")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colProtection")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colSection")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colMethod")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colLength")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colDrop")}</th>
              <th className="px-2 py-1 font-semibold">{t("cableTable.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const edge = doc.edges[row.edgeId];
              if (!edge) return null;
              return (
                <tr
                  key={row.edgeId}
                  className="border-b border-border/30 hover:bg-muted/20"
                  data-testid={`cable-row-${row.edgeId}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-foreground">{row.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {row.field ? t("cableTable.field") : t("cableTable.panel")} ·{" "}
                      {row.threePhase ? "3F" : "1F"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">{row.Ib_A > 0 ? `${row.Ib_A} A` : "—"}</td>
                  <td className="px-2 py-1.5">
                    {row.protection_A !== undefined ? `${row.protection_A} A` : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={row.section_mm2 ?? ""}
                      onChange={(e) =>
                        updateCable(edge, {
                          section_mm2: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      aria-label={t("cableTable.colSection")}
                      className="h-7 rounded border border-border bg-input px-1 text-xs"
                    >
                      <option value="">—</option>
                      {NBR5410_SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s} mm²
                        </option>
                      ))}
                    </select>
                    {row.required_mm2 !== undefined && (
                      <div className="text-[10px] text-muted-foreground">
                        {t("cableTable.min", { s: row.required_mm2 })}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={edge.cable?.installation ?? ""}
                      onChange={(e) =>
                        updateCable(edge, {
                          installation: e.target.value === "" ? undefined : e.target.value,
                        })
                      }
                      aria-label={t("cableTable.colMethod")}
                      className="h-7 rounded border border-border bg-input px-1 text-xs"
                    >
                      <option value="">{t("cableTable.methodDefault")}</option>
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <LengthInput row={row} edge={edge} />
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 font-semibold",
                      row.drop_pct === undefined
                        ? "text-muted-foreground"
                        : row.drop_pct > MAX_CABLE_DROP_PCT
                          ? "text-destructive"
                          : "text-emerald-400",
                    )}
                  >
                    {row.drop_pct !== undefined ? `${row.drop_pct}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                        STATUS_CLASS[row.status],
                      )}
                    >
                      {t(`cableTable.status_${row.status}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="text-[10px] text-muted-foreground">
        <summary className="cursor-pointer">{t("cableTable.premisesTitle")}</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {report.premises.map((p) => (
            <li key={p}>{p}</li>
          ))}
          <li>{t("cableTable.dropLimit", { pct: MAX_CABLE_DROP_PCT })}</li>
        </ul>
      </details>
    </div>
  );
}
