/**
 * Curvas tempo × corrente da cadeia de proteção de uma carga (log × log).
 * Faixas da norma (IEC 60898-1 / 60947-4-1) — as curvas reais do fabricante
 * ficam dentro delas. Linhas verticais: corrente de projeto, partida do motor
 * e curtos máximo/mínimo no ponto da carga (do cálculo de rede).
 */
import { useMemo, useState } from "react";
import { useDiagramStore } from "@/lib/diagram/store";
import type { DiagramNode } from "@/lib/diagram/schema";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { loadCurrent_A, nodeDisplayName } from "@/lib/diagram/connection/cable-sizing";
import {
  OVERLOAD_RATIO,
  T_MAX_S,
  T_MIN_S,
  bandFor,
  cableDamageTime,
  logSpace,
  motorStartChecks,
  protectionChain,
  selectivityByCurves,
  type TripBand,
} from "@/lib/diagram/connection/trip-curves";
import { useI18n } from "@/lib/i18n";

/** Ordem categórica fixa (variante para fundo escuro). */
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const LOADS = new Set(["motor", "load", "lamp", "socket"]);
const W = 560;
const H = 300;
const PAD = { l: 48, r: 12, t: 10, b: 30 };

function fmtA(a: number): string {
  return a >= 1000
    ? `${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kA`
    : `${Math.round(a)} A`;
}

export function TripCurveChart() {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const loads = useMemo(
    () =>
      Object.values(doc.nodes)
        .filter((n) => n.sheet === "unifilar" && LOADS.has(n.params.kind))
        .sort((a, b) => a.position.x - b.position.x),
    [doc.nodes],
  );
  const [loadId, setLoadId] = useState<string>("");
  const selected: DiagramNode | undefined = doc.nodes[loadId] ?? loads[0];

  const data = useMemo(() => {
    if (!selected) return null;
    const chain = protectionChain(doc, selected.id);
    const bands = chain.devices.map(bandFor).filter((b): b is TripBand => b !== null);
    const network = analyzeNetwork(doc);
    const r = network.nodes[selected.id];
    const Ib = loadCurrent_A(selected);
    const start = motorStartChecks(doc).find((c) => c.motorId === selected.id);
    const markers: Array<{ I: number; label: string }> = [];
    if (Ib) markers.push({ I: Ib, label: `Ib ${fmtA(Ib)}` });
    if (start)
      markers.push({ I: start.start_A, label: `${t("tripCurves.start")} ${fmtA(start.start_A)}` });
    if (r?.Ik1min_kA)
      markers.push({ I: r.Ik1min_kA * 1000, label: `F-T ${fmtA(r.Ik1min_kA * 1000)}` });
    if (r?.Ik3max_kA)
      markers.push({ I: r.Ik3max_kA * 1000, label: `Ik ${fmtA(r.Ik3max_kA * 1000)}` });

    const breakers = chain.devices.filter((d) => d.params.kind === "breaker");
    const pairs = breakers.slice(1).map((down, i) => {
      const up = breakers[i];
      const ik = network.nodes[down.id]?.Ik3max_kA;
      return { up, down, sel: selectivityByCurves(up, down, ik ? ik * 1000 : undefined) };
    });

    const allI = [...bands.flatMap((b) => b.range), ...markers.map((m) => m.I)].filter(
      (v) => v > 0,
    );
    const xMin = Math.max(1, Math.min(...allI) * 0.7);
    const xMax = Math.max(xMin * 10, Math.max(...allI) * 1.5);
    return { chain, bands, markers, pairs, xMin, xMax };
  }, [doc, selected, t]);

  if (loads.length === 0) return null;

  const x = (I: number) =>
    PAD.l +
    ((Math.log10(I) - Math.log10(data!.xMin)) / (Math.log10(data!.xMax) - Math.log10(data!.xMin))) *
      (W - PAD.l - PAD.r);
  const y = (s: number) => {
    const c = Math.min(T_MAX_S, Math.max(T_MIN_S, s));
    return (
      PAD.t +
      ((Math.log10(T_MAX_S) - Math.log10(c)) / (Math.log10(T_MAX_S) - Math.log10(T_MIN_S))) *
        (H - PAD.t - PAD.b)
    );
  };

  const bandPath = (b: TripBand) => {
    const pts = logSpace(
      Math.max(b.range[0], data!.xMin),
      Math.min(b.range[1], data!.xMax),
      90,
    ).filter((I) => Number.isFinite(b.tMin(I)));
    if (pts.length < 2) return "";
    const top = pts.map((I) => `${x(I)},${y(Number.isFinite(b.tMax(I)) ? b.tMax(I) : T_MAX_S)}`);
    const bottom = [...pts].reverse().map((I) => `${x(I)},${y(b.tMin(I))}`);
    return `M${top.join("L")}L${bottom.join("L")}Z`;
  };

  const xTicks = data
    ? [1, 10, 100, 1000, 10_000, 100_000].filter((v) => v >= data.xMin && v <= data.xMax)
    : [];
  const yTicks = [0.01, 0.1, 1, 10, 100, 1000, 10_000];

  return (
    <section className="space-y-2" data-testid="trip-curves">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground">
          {t("tripCurves.title")}
        </h3>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {t("tripCurves.load")}
          <select
            value={selected?.id ?? ""}
            onChange={(e) => setLoadId(e.target.value)}
            data-testid="trip-curves-load"
            className="h-7 rounded border border-border bg-input px-1 text-xs text-foreground"
          >
            {loads.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeDisplayName(n)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data && data.bands.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">{t("tripCurves.noDevices")}</p>
      ) : data ? (
        <>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full min-w-[420px] max-w-[720px] text-muted-foreground"
              role="img"
              aria-label={t("tripCurves.title")}
            >
              {yTicks.map((v) => (
                <g key={`y${v}`}>
                  <line
                    x1={PAD.l}
                    x2={W - PAD.r}
                    y1={y(v)}
                    y2={y(v)}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                  />
                  <text
                    x={PAD.l - 4}
                    y={y(v) + 3}
                    textAnchor="end"
                    fontSize={9}
                    fill="currentColor"
                  >
                    {v >= 1 ? `${v} s` : `${v * 1000} ms`}
                  </text>
                </g>
              ))}
              {xTicks.map((v) => (
                <g key={`x${v}`}>
                  <line
                    x1={x(v)}
                    x2={x(v)}
                    y1={PAD.t}
                    y2={H - PAD.b}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                  />
                  <text
                    x={x(v)}
                    y={H - PAD.b + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="currentColor"
                  >
                    {fmtA(v)}
                  </text>
                </g>
              ))}
              {data.bands.map((b, i) => (
                <path
                  key={b.id}
                  d={bandPath(b)}
                  fill={SERIES[i % SERIES.length]}
                  fillOpacity={0.22}
                  stroke={SERIES[i % SERIES.length]}
                  strokeWidth={2}
                >
                  <title>{b.label}</title>
                </path>
              ))}
              {data.chain.cables.map((e, i) => {
                const pts = logSpace(data.xMin, data.xMax, 60)
                  .map((I) => ({ I, s: cableDamageTime(e, I) }))
                  .filter(
                    (p): p is { I: number; s: number } =>
                      p.s !== undefined && p.s <= 5 && p.s >= T_MIN_S,
                  );
                if (pts.length < 2) return null;
                const color = SERIES[(data.bands.length + i) % SERIES.length];
                return (
                  <path
                    key={e.id}
                    d={`M${pts.map((p) => `${x(p.I)},${y(p.s)}`).join("L")}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  >
                    <title>
                      {t("tripCurves.cable")} {e.cable?.section_mm2} mm²
                    </title>
                  </path>
                );
              })}
              {data.markers.map((m, i) => (
                <g key={m.label}>
                  <line
                    x1={x(m.I)}
                    x2={x(m.I)}
                    y1={PAD.t}
                    y2={H - PAD.b}
                    stroke="currentColor"
                    strokeOpacity={0.7}
                    strokeDasharray="2 3"
                  />
                  <text x={x(m.I) + 3} y={PAD.t + 10 + i * 11} fontSize={9} fill="currentColor">
                    {m.label}
                  </text>
                </g>
              ))}
              <text x={W - PAD.r} y={H - 2} textAnchor="end" fontSize={9} fill="currentColor">
                {t("tripCurves.axisX")}
              </text>
            </svg>
          </div>

          <ul
            className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground"
            data-testid="trip-curves-legend"
          >
            {data.bands.map((b, i) => (
              <li key={b.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: SERIES[i % SERIES.length] }}
                />
                {b.label}
              </li>
            ))}
            {data.chain.cables.map((e, i) => (
              <li key={e.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0 w-4 border-t-2 border-dashed"
                  style={{ borderColor: SERIES[(data.bands.length + i) % SERIES.length] }}
                />
                {t("tripCurves.cable")} {e.cable?.section_mm2} mm²
              </li>
            ))}
          </ul>

          {data.pairs.length > 0 && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/70 text-[11px] text-muted-foreground">
                  <th className="px-2 py-1 font-semibold">{t("tripCurves.colPair")}</th>
                  <th className="px-2 py-1 font-semibold">{t("tripCurves.colRatio")}</th>
                  <th className="px-2 py-1 font-semibold">{t("tripCurves.colLimit")}</th>
                  <th className="px-2 py-1 font-semibold">{t("tripCurves.colVerdict")}</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map(({ up, down, sel }) =>
                  sel ? (
                    <tr key={`${up.id}-${down.id}`} className="border-b border-border/30">
                      <td className="px-2 py-1">
                        {nodeDisplayName(up)} → {nodeDisplayName(down)}
                      </td>
                      <td className="px-2 py-1">
                        {sel.overloadRatio ?? "—"}
                        {sel.overloadRatio !== undefined && sel.overloadRatio < OVERLOAD_RATIO
                          ? " ⚠"
                          : ""}
                      </td>
                      <td className="px-2 py-1">{sel.limit_A ? fmtA(sel.limit_A) : "—"}</td>
                      <td className="px-2 py-1">{t(`tripCurves.verdict_${sel.verdict}`)}</td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-muted-foreground">{t("tripCurves.premise")}</p>
        </>
      ) : null}
    </section>
  );
}
