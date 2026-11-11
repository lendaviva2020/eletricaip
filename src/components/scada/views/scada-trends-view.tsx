// SCADA SUPERVISÓRIO — View 4: Análise de Tendências & Historiador
// Multi-pen historical charting with statistics and data export
// Standards: ISA-101 (HMI), IEC 62443, OPC UA Historical Access

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChartLineUp, DownloadSimple, ArrowsClockwise } from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PenConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  enabled: boolean;
}

const PALETTE = [
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
];

export function ScadaTrendsView() {
  const isDemoProject = useScadaStore((s) => s.isDemoProject);
  const trendHistory = useScadaStore((s) => s.trendHistory);
  const tags = useScadaStore((s) => s.tags);
  const [timeRange, setTimeRange] = useState<"1m" | "5m" | "15m" | "1h" | "24h">("5m");

  // Dynamic Pens depending on Project (Customer Project vs Demo ETE)
  const availablePens = useMemo<Record<string, PenConfig>>(() => {
    if (isDemoProject) {
      return {
        totalFlow: {
          key: "totalFlow",
          label: "Vazão Total",
          unit: "m³/h",
          color: "#06b6d4",
          enabled: true,
        },
        levelT101: {
          key: "levelT101",
          label: "Nível T-101",
          unit: "%",
          color: "#f59e0b",
          enabled: true,
        },
        levelT102: {
          key: "levelT102",
          label: "Nível T-102",
          unit: "%",
          color: "#3b82f6",
          enabled: false,
        },
        levelT105: {
          key: "levelT105",
          label: "Nível T-105",
          unit: "%",
          color: "#10b981",
          enabled: true,
        },
        powerKw: {
          key: "powerKw",
          label: "Potência QM-01",
          unit: "kW",
          color: "#ec4899",
          enabled: true,
        },
        pressureFiltro: {
          key: "pressureFiltro",
          label: "Pressão F-01",
          unit: "bar",
          color: "#8b5cf6",
          enabled: true,
        },
      };
    }

    const customerPens: Record<string, PenConfig> = {};
    const tagList = Object.values(tags || {});

    tagList.forEach((tag, idx) => {
      const color = PALETTE[idx % PALETTE.length];
      customerPens[tag.name] = {
        key: tag.name,
        label: tag.name,
        unit: tag.unit || "EU",
        color,
        enabled: idx < 6, // enable first 6 by default
      };
    });

    if (Object.keys(customerPens).length === 0) {
      // Fallback if no tags yet
      customerPens["totalFlow"] = {
        key: "totalFlow",
        label: "Vazão Total",
        unit: "m³/h",
        color: "#06b6d4",
        enabled: true,
      };
      customerPens["powerKw"] = {
        key: "powerKw",
        label: "Potência Total",
        unit: "kW",
        color: "#ec4899",
        enabled: true,
      };
    }

    return customerPens;
  }, [isDemoProject, tags]);

  const [penOverrides, setPenOverrides] = useState<Record<string, boolean>>({});

  const activePens = useMemo(() => {
    const res: Record<string, PenConfig> = {};
    for (const [k, p] of Object.entries(availablePens)) {
      res[k] = {
        ...p,
        enabled: penOverrides[k] !== undefined ? penOverrides[k] : p.enabled,
      };
    }
    return res;
  }, [availablePens, penOverrides]);

  const togglePen = (key: string) => {
    setPenOverrides((prev) => ({
      ...prev,
      [key]: prev[key] !== undefined ? !prev[key] : !availablePens[key]?.enabled,
    }));
  };

  const chartData = useMemo(() => {
    const rawPoints =
      trendHistory.length > 0 ? trendHistory : generateInitialHistory(isDemoProject);
    return rawPoints.filter(Boolean).map((pt) => {
      const d = new Date(pt.timestamp || Date.now());
      const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
      const row: Record<string, number | string> = {
        time: timeStr,
        timestamp: pt.timestamp,
        totalFlow: pt.totalFlow ?? 0,
        levelT101: typeof pt.levelT101 === "number" ? +pt.levelT101.toFixed(1) : 0,
        levelT102: typeof pt.levelT102 === "number" ? +pt.levelT102.toFixed(1) : 0,
        levelT105: typeof pt.levelT105 === "number" ? +pt.levelT105.toFixed(1) : 0,
        powerKw: pt.powerKw ?? 0,
        pressureFiltro: pt.pressureFiltro ?? 0,
      };

      // Add dynamic tag values
      for (const [tagName, tag] of Object.entries(tags || {})) {
        if (typeof tag.value === "number") {
          row[tagName] = tag.value;
          row[tag.name] = tag.value;
        }
      }

      return row;
    });
  }, [trendHistory, isDemoProject, tags]);

  // Compute Statistics dynamically from chartData
  const statistics = useMemo(() => {
    return Object.values(activePens)
      .filter((p) => p.enabled)
      .map((pen) => {
        const values: number[] = [];
        for (const pt of chartData) {
          const val = pt[pen.key];
          if (typeof val === "number" && !isNaN(val)) {
            values.push(val);
          }
        }

        if (values.length === 0) {
          return {
            key: pen.key,
            label: pen.label,
            unit: pen.unit,
            min: 0,
            avg: 0,
            max: 0,
            stdDev: 0,
            count: 0,
            color: pen.color,
          };
        }

        const min = Math.min(...values);
        const max = Math.max(...values);
        const sum = values.reduce((acc, v) => acc + v, 0);
        const avg = sum / values.length;
        const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        return {
          key: pen.key,
          label: pen.label,
          unit: pen.unit,
          min: Math.round(min * 100) / 100,
          avg: Math.round(avg * 100) / 100,
          max: Math.round(max * 100) / 100,
          stdDev: Math.round(stdDev * 100) / 100,
          count: values.length,
          color: pen.color,
        };
      });
  }, [activePens, chartData]);

  const handleExportCsv = () => {
    const penKeys = Object.values(activePens)
      .filter((p) => p.enabled)
      .map((p) => p.key);

    if (penKeys.length === 0) {
      toast.error("Nenhuma variável de pena habilitada para exportação.");
      return;
    }

    const header =
      [
        "Timestamp_ISO",
        "Epoch_ms",
        ...penKeys.map((k) => `${k}_${activePens[k]?.unit || "val"}`),
      ].join(",") + "\n";
    const rows = chartData
      .map((r) => {
        const iso = new Date(Number(r.timestamp) || Date.now()).toISOString();
        const epoch = r.timestamp || Date.now();
        const vals = penKeys.map((k) => r[k] ?? 0);
        return `"${iso}",${epoch},${vals.join(",")}`;
      })
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `historian_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Dados do historiador persistente exportados em CSV.");
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. Header & Controls */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <ChartLineUp className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-mono font-bold uppercase text-white">
              Historiador de Processo & Tendências Multi-Pen
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              Resolução de amostragem: 100ms • Retenção persistente particionada mensalmente
            </p>
          </div>
        </div>

        {/* Time Scale & Export */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded text-xs font-mono">
            {(["1m", "5m", "15m", "1h", "24h"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "px-2 py-1 rounded font-semibold transition-colors",
                  timeRange === r ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
          >
            <DownloadSimple className="w-3.5 h-3.5" />
            <span>Exportar Amostras (CSV)</span>
          </button>
        </div>
      </div>

      {/* 2. Pen Selectors Bar */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider mr-1">
          Variáveis de Pena (Pens):
        </span>
        {Object.values(activePens).map((pen) => (
          <button
            key={pen.key}
            onClick={() => togglePen(pen.key)}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors border",
              pen.enabled
                ? "bg-zinc-900 border-zinc-700 text-white shadow-sm"
                : "bg-zinc-950/40 border-zinc-900 text-zinc-600 opacity-60",
            )}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: pen.enabled ? pen.color : "#4b5563" }}
            />
            <span>{pen.label}</span>
            <span className="text-[10px] text-zinc-400">({pen.unit})</span>
          </button>
        ))}
      </div>

      {/* 3. Main Multi-pen Trend Chart */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 min-h-[360px] flex flex-col shadow-md">
        <div className="flex-1 min-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                fontFamily="monospace"
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                fontFamily="monospace"
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#090d16",
                  borderColor: "#334155",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  borderRadius: "6px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", paddingTop: "8px" }}
              />

              {Object.values(activePens)
                .filter((p) => p.enabled)
                .map((pen) => (
                  <Line
                    key={pen.key}
                    type="monotone"
                    dataKey={pen.key}
                    name={`${pen.label} (${pen.unit})`}
                    stroke={pen.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Statistics Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3">
        <h3 className="text-xs font-mono font-bold uppercase text-zinc-400 tracking-wider mb-2">
          Estatísticas no Período Selecionado (Cálculo em Tempo Real)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] text-zinc-500 uppercase">
                <th className="py-1 px-3">Variável</th>
                <th className="py-1 px-3">Unidade</th>
                <th className="py-1 px-3">Valor Mínimo</th>
                <th className="py-1 px-3">Valor Médio</th>
                <th className="py-1 px-3">Valor Máximo</th>
                <th className="py-1 px-3">Desvio Padrão</th>
                <th className="py-1 px-3">Amostras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-[11px]">
              {statistics.map((st) => (
                <tr key={st.key}>
                  <td className="py-1.5 px-3 font-semibold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                    {st.label}
                  </td>
                  <td className="py-1.5 px-3 text-zinc-400">{st.unit}</td>
                  <td className="py-1.5 px-3 text-cyan-400">{st.min}</td>
                  <td className="py-1.5 px-3 text-cyan-400 font-bold">{st.avg}</td>
                  <td className="py-1.5 px-3 text-cyan-400">{st.max}</td>
                  <td className="py-1.5 px-3 text-zinc-400">{st.stdDev}</td>
                  <td className="py-1.5 px-3 text-zinc-400">{st.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function generateInitialHistory(isDemo = true) {
  if (!isDemo) return [];
  const pts = [];
  const now = Date.now();
  for (let i = 30; i >= 0; i--) {
    const ts = now - i * 2000;
    pts.push({
      timestamp: ts,
      totalFlow: 182.7 + Math.sin(i / 2) * 1.8,
      levelT101: 75.2 + Math.cos(i / 3) * 0.4,
      levelT102: 62.0 + Math.sin(i / 4) * 0.3,
      levelT105: 81.0 + Math.cos(i / 2) * 0.5,
      powerKw: 248.5 + Math.sin(i / 2) * 2.5,
      pressureFiltro: 2.4 + Math.sin(i / 3) * 0.08,
    });
  }
  return pts;
}
