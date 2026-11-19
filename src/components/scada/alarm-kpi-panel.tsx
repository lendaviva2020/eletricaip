// Indicadores de desempenho de alarmes (ISA-18.2), calculados do histórico
// gravado (alarm_history). Referências usuais exibidas ao lado, sem nota
// inventada: valor acima da referência fica em âmbar/vermelho.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  ISA_TARGETS,
  alarmPointKey,
  computeAlarmKpis,
  type AlarmKpis,
} from "@/lib/scada/alarm-management";
import { loadAlarmKpis } from "@/lib/scada/alarm-management.functions";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { hours: 24, label: "24 h" },
  { hours: 168, label: "7 dias" },
  { hours: 720, label: "30 dias" },
] as const;

type Level = "ok" | "warn" | "bad";

function level(v: number, ok: number, warn: number): Level {
  if (v <= ok) return "ok";
  if (v <= warn) return "warn";
  return "bad";
}

const LEVEL_CLASS: Record<Level, string> = {
  ok: "text-zinc-100",
  warn: "text-amber-300",
  bad: "text-red-300",
};

const fmt = (v: number, d = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: d });

function minutes(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${fmt(ms / 60_000)} min`;
}

export function AlarmKpiPanel() {
  const projectId = useScadaStore((s) => s.currentProjectId);
  const isDemo = useScadaStore((s) => s.isDemoProject);
  const alarms = useScadaStore((s) => s.alarms);
  const [hours, setHours] = useState<24 | 168 | 720>(24);
  const loadFn = useServerFn(loadAlarmKpis);

  const q = useQuery({
    queryKey: ["alarm-kpis", projectId, hours],
    queryFn: () => loadFn({ data: { projectId: projectId as string, hours } }),
    enabled: Boolean(projectId) && !isDemo,
    staleTime: 60_000,
  });

  const demoKpis = useMemo<AlarmKpis | null>(() => {
    if (!isDemo) return null;
    const now = Date.now();
    return computeAlarmKpis(
      alarms.map((a) => ({
        pointKey: alarmPointKey(a),
        tag: a.tag,
        priority: a.priority,
        triggeredAt: a.timestamp,
        acknowledgedAt: a.acknowledgedAt ?? null,
        clearedAt: a.clearedAt ?? null,
      })),
      { from: now - hours * 3_600_000, to: now, now },
    );
  }, [isDemo, alarms, hours]);

  const k = isDemo ? demoKpis : (q.data?.kpis ?? null);

  return (
    <div className="space-y-3" data-testid="alarm-kpi-panel">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.hours}
            onClick={() => setHours(w.hours)}
            aria-pressed={hours === w.hours}
            className={cn(
              "px-2.5 py-1 rounded border text-xs font-mono",
              hours === w.hours ? "border-zinc-300 text-white" : "border-zinc-800 text-zinc-400",
            )}
          >
            {w.label}
          </button>
        ))}
        <span className="text-[11px] text-zinc-500">
          {isDemo
            ? "Demonstração: só os alarmes desta sessão (nada é gravado)."
            : "Calculado do histórico de alarmes gravado do projeto."}
        </span>
      </div>

      {!isDemo && q.isLoading && <p className="text-sm text-zinc-500">Calculando…</p>}
      {!isDemo && q.isError && (
        <p className="text-sm text-red-300">Não foi possível calcular os indicadores.</p>
      )}
      {q.data?.truncated && (
        <p className="text-[11px] text-amber-300">
          Histórico muito grande: considerados os 20 mil alarmes mais recentes.
        </p>
      )}

      {k && (
        <>
          {k.total === 0 && (
            <p className="text-sm text-zinc-500" data-testid="alarm-kpi-empty">
              Nenhum alarme registrado no período.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="alarm-kpi-cards">
            <Kpi
              label="Alarmes por hora"
              value={fmt(k.perHour)}
              lvl={level(k.perHour, ISA_TARGETS.perHourAcceptable, ISA_TARGETS.perHourManageable)}
              hint={`ref. ≤ ${ISA_TARGETS.perHourAcceptable} aceitável · ≤ ${ISA_TARGETS.perHourManageable} máximo`}
            />
            <Kpi
              label="Pico em 10 min"
              value={String(k.peak10Min)}
              lvl={level(k.peak10Min, ISA_TARGETS.per10MinManageable, ISA_TARGETS.floodPer10Min)}
              hint={`média ${fmt(k.per10MinAvg, 2)} · inundação > ${ISA_TARGETS.floodPer10Min}`}
            />
            <Kpi
              label="Tempo em inundação"
              value={`${fmt(k.floodTimePct)} %`}
              lvl={level(
                k.floodTimePct,
                ISA_TARGETS.floodTimePctMax,
                ISA_TARGETS.floodTimePctMax * 5,
              )}
              hint={`${k.floodIntervals} intervalo(s) de 10 min · ref. < ${ISA_TARGETS.floodTimePctMax} %`}
            />
            <Kpi
              label="10 mais frequentes"
              value={`${fmt(k.top10Pct)} %`}
              lvl={k.total < 20 ? "ok" : level(k.top10Pct, ISA_TARGETS.top10ContributionPctMax, 20)}
              hint={`do total (${k.total}) · ref. < ${ISA_TARGETS.top10ContributionPctMax} %`}
            />
            <Kpi
              label="Em oscilação"
              value={String(k.chatteringPoints.length)}
              lvl={k.chatteringPoints.length ? "warn" : "ok"}
              hint={`≥ ${ISA_TARGETS.chatterActivations} disparos em 60 s`}
            />
            <Kpi
              label="Parados > 24 h"
              value={String(k.standing.length)}
              lvl={k.standing.length ? "warn" : "ok"}
              hint="ativos sem normalizar"
            />
            <Kpi
              label="Tempo até reconhecer"
              value={minutes(k.medianAckMs)}
              lvl="ok"
              hint="mediana"
            />
            <Kpi
              label="Prioridades"
              value={`${k.priorityMix.CRITICAL}/${k.priorityMix.HIGH}/${k.priorityMix.MEDIUM}/${k.priorityMix.LOW}`}
              lvl="ok"
              hint="crítica/alta/média/baixa"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ListBox
              title="Mais frequentes"
              empty="—"
              items={k.topBadActors.map((a) => ({
                key: a.pointKey,
                left: a.tag,
                right: `${a.count} (${fmt(a.pct)} %)`,
              }))}
            />
            <ListBox
              title="Em oscilação (chattering)"
              empty="Nenhum."
              items={k.chatteringPoints.map((c) => ({
                key: c.pointKey,
                left: c.tag,
                right: `${c.maxIn60s} em 60 s`,
              }))}
            />
            <ListBox
              title="Parados há mais de 24 h"
              empty="Nenhum."
              items={k.standing.map((s) => ({
                key: s.pointKey,
                left: s.tag,
                right: new Date(s.since).toLocaleString("pt-BR"),
              }))}
            />
          </div>
          <p className="text-[10px] text-zinc-600">
            Referências usuais de gestão de alarmes por console de operação (ISA-18.2 / EEMUA 191).
            Servem para orientar a racionalização, não como certificação.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  lvl,
  hint,
}: {
  label: string;
  value: string;
  lvl: Level;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="text-[10px] uppercase font-mono text-zinc-500">{label}</div>
      <div className={cn("text-lg font-bold font-mono", LEVEL_CLASS[lvl])}>{value}</div>
      <div className="text-[10px] text-zinc-500">{hint}</div>
    </div>
  );
}

function ListBox({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { key: string; left: string; right: string }[];
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="text-[10px] uppercase font-mono text-zinc-500 mb-1">{title}</div>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-600">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.key} className="flex justify-between gap-2 text-[11px] font-mono">
              <span className="truncate text-zinc-200">{i.left}</span>
              <span className="text-zinc-400 shrink-0">{i.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
