import { motion } from "framer-motion";
import { useProjectStore } from "@/lib/project-store";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

export function LadderCanvas() {
  const nodes = useProjectStore((s) => s.nodes);
  const select = useProjectStore((s) => s.select);
  const selectedId = useProjectStore((s) => s.selectedId);

  // Auto-derive rungs from motors / pumps / valves
  const driven = nodes.filter((n) => ["motor", "pump", "valve", "conveyor"].includes(n.kind));
  const safety = nodes.filter((n) => ["estop", "lightcurtain"].includes(n.kind));
  const sensors = nodes.filter((n) => ["pt100", "pressure", "flow", "level", "encoder"].includes(n.kind));

  const rungs = driven.map((d, i) => {
    const contacts: string[] = ["I0.0 START"];
    if (safety[0]) contacts.push(`!${safety[0].id}`);
    if (sensors[i % Math.max(sensors.length, 1)]) contacts.push(`${sensors[i % sensors.length].id}.OK`);
    return { id: d.id, label: `${d.label} · ${d.kind.toUpperCase()}`, contacts, coil: `Q0.${i} ${d.id}` };
  });

  return (
    <div className="relative h-full w-full overflow-auto industrial-grid scan-overlay">
      <FloatingLegend title="Ladder · IEC 61131-3 (auto)" items={["RUN", `${rungs.length} rungs`, "↔ Unifilar/SCADA", "Live"]} />

      <div className="p-8 pt-16 pb-20 max-w-5xl mx-auto space-y-2">
        {rungs.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-20">
            Arraste motores, bombas ou válvulas no Unifilar/SCADA — as rungs serão geradas aqui.
          </div>
        )}
        {rungs.map((r, idx) => (
          <motion.div
            key={r.id}
            onClick={() => select(r.id)}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={`rounded-md border bg-card/60 backdrop-blur cursor-pointer transition-all ${
              selectedId === r.id ? "border-primary shadow-glow" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  R{String(idx + 1).padStart(3, "0")}
                </span>
                <span className="text-xs font-medium">{r.label}</span>
              </div>
              <span className="text-[10px] font-mono text-success">● ENERGIZED</span>
            </div>

            <div className="flex items-center px-4 py-6 gap-3 overflow-x-auto">
              <div className="h-10 w-1 bg-energized rounded-full energized" />
              {r.contacts.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-px w-6 bg-energized energized" />
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center">
                      <span className="block h-6 w-px bg-foreground/80" />
                      <span className="block h-px w-3 bg-foreground/40" />
                      <span className="block h-6 w-px bg-foreground/80" />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{c}</span>
                  </div>
                </div>
              ))}
              <div className="h-px flex-1 min-w-8 bg-energized energized" />
              <div className="flex flex-col items-center gap-1">
                <div className="relative h-6 w-8">
                  <span className="absolute inset-0 rounded-full border-2 border-success" />
                  <span className="absolute inset-1 rounded-full bg-success/30 energized" />
                </div>
                <span className="text-[10px] font-mono text-success">{r.coil}</span>
              </div>
              <div className="h-10 w-1 bg-energized rounded-full energized" />
            </div>
          </motion.div>
        ))}
      </div>

      <BottomStrip items={[["Scan", "8 ms"], ["Rungs", `${rungs.length}`], ["Forces", "0"], ["Sync", "↔ Store"]]} />
    </div>
  );
}
