import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Sparkles,
  Send,
  Loader2,
  Cpu,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Info,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  callArchitect,
  applyArchitectToStore,
  type ArchitectResult,
} from "@/lib/ai-architect-client";
import { calcDemand, calcMotor } from "@/lib/electrical-calc";
import { validateProject, summarize, type NormFinding } from "@/lib/norm-validator";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "IA Industrial · EletricAI" },
      { name: "description", content: "Copilot industrial com IA nativa." },
    ],
  }),
  component: AiPage,
});

const SUGGESTIONS = [
  "Sala de máquinas: 15 motores parafuso 500 CV de amônia, 20 condensadores com 2 motores cada. Pesquise o restante.",
  "Esteira com motor 7.5kW, E-STOP, sensor de presença e inversor VFD.",
  "QGBT 2500A com 6 motores, proteção seletiva e medição.",
  "Bombeamento redundante: 2 bombas 50CV em paralelo, alarmes ISA-18.2.",
];

interface ChatMsg {
  role: "user" | "ai";
  text: string;
  result?: ArchitectResult;
  error?: string;
}

function AiPage() {
  const router = useRouter();
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatMsg[]>([
    {
      role: "ai",
      text: "Descreva uma planta, um equipamento ou só um briefing curto. Eu projeto o sistema elétrico completo: trafo, CCM, motores, proteções, cabos, instrumentação e topologia. Tudo aparece simultaneamente em Unifilar, Ladder, FBD, SCADA e Twin.",
    },
  ]);

  const send = async (prompt?: string) => {
    const p = (prompt ?? val).trim();
    if (!p || busy) return;
    setVal("");
    setHistory((h) => [...h, { role: "user", text: p }, { role: "ai", text: "Projetando…" }]);
    setBusy(true);
    try {
      const result = await callArchitect(p, false);
      setHistory((h) => {
        const copy = [...h];
        copy[copy.length - 1] = {
          role: "ai",
          text: `${result.title}\n\n${result.rationale}`,
          result,
        };
        return copy;
      });
    } catch (e: any) {
      setHistory((h) => {
        const copy = [...h];
        copy[copy.length - 1] = { role: "ai", text: "Falha ao gerar.", error: e.message };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = (r: ArchitectResult, mode: "ladder" | "unifilar" | "both") => {
    applyArchitectToStore(r, { mode: "replace" });
    router.navigate({ to: "/workspace" });
    void mode;
  };

  return (
    <div className="flex-1 overflow-hidden flex">
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> EletricAI Copilot
            <span className="text-[9px] font-mono uppercase tracking-wider text-primary/80 ml-2 px-1.5 py-0.5 rounded bg-primary/10">
              CORE ENGINE
            </span>
          </h1>
          <p className="text-[12px] text-muted-foreground">
            Motor de IA que projeta sistemas elétricos do zero ao fim, com cálculos em memória.
          </p>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin p-6 space-y-4 max-w-3xl mx-auto w-full">
          {history.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 ${m.role === "ai" ? "glass border border-primary/20" : "bg-card border border-border"}`}
            >
              <div className="text-[10px] uppercase tracking-wider mb-1 text-muted-foreground">
                {m.role === "ai" ? "EletricAI" : "Você"}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</div>
              {m.error && (
                <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {m.error}
                </div>
              )}
              {m.result && <ResultCard result={m.result} onApply={apply} />}
            </div>
          ))}

          {history.length <= 2 && (
            <div className="grid sm:grid-cols-2 gap-2 pt-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-[12px] p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors"
                >
                  <Sparkles className="h-3 w-3 text-primary inline mr-1.5" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto relative">
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              rows={2}
              placeholder="Descreva uma planta, um intertravamento, um equipamento… (Ctrl/⌘+Enter para enviar)"
              className="w-full resize-none rounded-md bg-input border border-border p-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => send()}
              disabled={busy || !val.trim()}
              className="absolute right-2 bottom-2 h-8 w-8 grid place-items-center rounded-md text-primary-foreground glow-primary disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  result,
  onApply,
}: {
  result: ArchitectResult;
  onApply: (r: ArchitectResult, mode: "ladder" | "unifilar" | "both") => void;
}) {
  const motorSpecs = result.motors.map((m) =>
    calcMotor({
      id: m.id,
      power_kW: m.power_kW,
      voltage_V: m.voltage_V,
      startMethod: m.startMethod,
    }),
  );
  const demand = calcDemand(
    result.motors.map((m) => ({ id: m.id, power_kW: m.power_kW, voltage_V: m.voltage_V })),
  );
  const totalIn = motorSpecs.reduce((s, m) => s + m.In_A, 0);
  const findings = useMemo(() => {
    const nodes = result.nodes.map((n) => ({
      ...n,
      kind: n.kind as any,
      category: n.category as any,
      params: n.params ?? {},
    })) as any;
    const edges = result.edges.map((e, i) => ({ ...e, id: `tmp-${i}` })) as any;
    return validateProject(nodes, edges);
  }, [result]);
  const sum = summarize(findings);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-2">
        <Stat
          label="Trafo"
          value={`${result.transformer.kVA} kVA`}
          sub={`${result.transformer.primary_kV}/${result.transformer.secondary_V}V`}
        />
        <Stat
          label="Motores"
          value={`${result.motors.length}`}
          sub={`Σ ${demand.totalLoad_kW} kW`}
        />
        <Stat
          label="Corrente nominal"
          value={`${Math.round(totalIn)} A`}
          sub={`Demanda ${demand.apparent_kVA} kVA`}
        />
        <Stat
          label="CCM"
          value={`${result.ccm.columns} col.`}
          sub={`${result.ccm.cells} células`}
        />
        <Stat
          label="Nós"
          value={`${result.nodes.length}`}
          sub={`${result.edges.length} ligações`}
        />
        <Stat
          label="Trafo sugerido"
          value={`${demand.transformer_kVA} kVA`}
          sub="cálc. em memória"
        />
      </div>

      <details className="rounded-md border border-border bg-card/50 p-2">
        <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <Cpu className="h-3 w-3" /> Detalhamento por motor ({motorSpecs.length})
        </summary>
        <div className="mt-2 max-h-48 overflow-auto scrollbar-thin">
          <table className="w-full text-[11px] font-mono">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-1">ID</th>
                <th className="text-right p-1">P (kW)</th>
                <th className="text-right p-1">In (A)</th>
                <th className="text-right p-1">Ist (A)</th>
                <th className="text-right p-1">Cabo</th>
                <th className="text-right p-1">Disj.</th>
                <th className="text-left p-1">Partida</th>
              </tr>
            </thead>
            <tbody>
              {motorSpecs.map((m) => (
                <tr key={m.id} className="border-t border-border/50">
                  <td className="p-1">{m.id}</td>
                  <td className="text-right p-1">{m.power_kW}</td>
                  <td className="text-right p-1">{m.In_A}</td>
                  <td className="text-right p-1">{m.Istart_A}</td>
                  <td className="text-right p-1">{m.cable_mm2} mm²</td>
                  <td className="text-right p-1">{m.breaker_A} A</td>
                  <td className="p-1">{m.startMethod ?? "DOL"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <NormPanel findings={findings} summary={sum} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onApply(result, "unifilar")}
          className="text-[12px] px-3 h-9 rounded-md text-primary-foreground glow-primary inline-flex items-center gap-1.5"
          style={{ background: "var(--gradient-primary)" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar como Unifilar
        </button>
        <button
          onClick={() => onApply(result, "ladder")}
          className="text-[12px] px-3 h-9 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1.5"
        >
          Aplicar como Ladder
        </button>
        <button
          onClick={() => onApply(result, "both")}
          className="text-[12px] px-3 h-9 rounded-md border border-primary/40 text-primary hover:bg-primary/10 inline-flex items-center gap-1.5"
        >
          Aplicar e abrir Workspace
        </button>
      </div>
    </div>
  );
}

function NormPanel({
  findings,
  summary,
}: {
  findings: NormFinding[];
  summary: { errors: number; warns: number; infos: number };
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-md border border-success/40 bg-success/10 p-3 flex items-center gap-2 text-xs">
        <ShieldCheck className="h-4 w-4 text-success" />
        Conforme NBR 5410 / NBR 14039 / NR-10 / NR-12 / IEC 61131 / ISA-18.2.
      </div>
    );
  }
  const tone =
    summary.errors > 0
      ? "border-destructive/40 bg-destructive/5"
      : summary.warns > 0
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-card/40";
  return (
    <div className={`rounded-md border ${tone} p-3 space-y-2`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <ShieldAlert className="h-4 w-4 text-warning" />
        Validação normativa
        <span className="ml-auto flex gap-2 font-mono text-[10px] text-muted-foreground">
          {summary.errors > 0 && (
            <span className="text-destructive">● {summary.errors} crítico(s)</span>
          )}
          {summary.warns > 0 && <span className="text-warning">● {summary.warns} aviso(s)</span>}
          {summary.infos > 0 && <span>● {summary.infos} info</span>}
        </span>
      </div>
      <ul className="space-y-1.5 max-h-56 overflow-auto scrollbar-thin">
        {findings.map((f) => (
          <li key={f.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
            {f.severity === "error" ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            ) : f.severity === "warn" ? (
              <ShieldAlert className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
            ) : (
              <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <div>
                <span className="font-mono text-[9px] uppercase text-muted-foreground mr-1.5">
                  {f.norm}
                </span>
                <span className="font-semibold">{f.title}</span>
              </div>
              <div className="text-muted-foreground">{f.detail}</div>
              {f.fixHint && <div className="text-primary/80 mt-0.5">→ {f.fixHint}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground font-mono">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
