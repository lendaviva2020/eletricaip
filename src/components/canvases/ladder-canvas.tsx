import { motion } from "framer-motion";
import { BottomStrip, FloatingLegend } from "./unifilar-canvas";

const RUNGS = [
  { id: 1, label: "ESTEIRA-01 START", contacts: ["I0.0 START", "I0.1 !E-STOP", "I0.2 !FALHA"], coil: "Q0.0 K1" },
  { id: 2, label: "INTERTRAVAMENTO", contacts: ["I0.3 NÍVEL_OK", "I0.4 PORTA_FECHADA"], coil: "Q0.1 PERMISSIVO" },
  { id: 3, label: "TIMER PARTIDA", contacts: ["M10.0 TON.Q"], coil: "Q0.2 INVERSOR" },
  { id: 4, label: "ALARME SOBRECARGA", contacts: ["I0.5 RELÉ_TÉRMICO"], coil: "Q0.3 BUZZER" },
];

export function LadderCanvas() {
  return (
    <div className="relative h-full w-full overflow-auto industrial-grid scan-overlay">
      <FloatingLegend title="Ladder · IEC 61131-3" items={["RUN", "Cycle 8ms", "I/O 64", "Tags 142"]} />

      <div className="p-8 pt-16 pb-20 max-w-5xl mx-auto space-y-2">
        {RUNGS.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: r.id * 0.06 }}
            className="rounded-md border border-border bg-card/60 backdrop-blur"
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  R{String(r.id).padStart(3, "0")}
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

      <BottomStrip
        items={[
          ["Scan", "8 ms"],
          ["Rungs", "4 / 4 OK"],
          ["Forces", "0"],
          ["IEC 61131", "✓ Compliant"],
        ]}
      />
    </div>
  );
}
