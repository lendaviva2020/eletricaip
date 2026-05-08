import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Send } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/ai")({
  head: () => ({ meta: [{ title: "IA Industrial · EletricAI" }, { name: "description", content: "Copilot industrial com IA nativa." }] }),
  component: AiPage,
});

const SUGGESTIONS = [
  "Criar esteira com motor 7.5kW, E-STOP, sensor e inversor.",
  "Gerar unifilar para QGBT 2500A com 6 motores e proteção seletiva.",
  "Validar instalação contra NBR 5410 e NR-10.",
  "Diagnosticar sobrecarga no motor M-03.",
];

const HISTORY = [
  { role: "user", t: "Crie um sistema de bombeamento com 2 bombas em paralelo, redundância e alarmes ISA-18.2." },
  { role: "ai", t: "Pronto. Gerei: unifilar (2 bombas + barramento redundante), ladder (lógica master/standby + intertravamento), SCADA (HMI com tendências), 24 tags e 6 alarmes priorizados (ISA-18.2). Aplique para visualizar no Workspace." },
];

function AiPage() {
  const [val, setVal] = useState("");
  return (
    <div className="flex-1 overflow-hidden flex">
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary"/> EletricAI Copilot
          </h1>
          <p className="text-[12px] text-muted-foreground">IA contextual integrada a unifilar, ladder, SCADA, Twin e PLC.</p>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin p-6 space-y-4 max-w-3xl mx-auto w-full">
          {HISTORY.map((m, i) => (
            <div key={i} className={`rounded-lg p-4 ${m.role === "ai" ? "glass border border-primary/20" : "bg-card border border-border"}`}>
              <div className="text-[10px] uppercase tracking-wider mb-1 text-muted-foreground">{m.role === "ai" ? "EletricAI" : "Você"}</div>
              <div className="text-sm leading-relaxed">{m.t}</div>
            </div>
          ))}

          <div className="grid sm:grid-cols-2 gap-2 pt-4">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setVal(s)} className="text-left text-[12px] p-3 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors">
                <Sparkles className="h-3 w-3 text-primary inline mr-1.5"/>{s}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto relative">
            <textarea
              value={val}
              onChange={(e) => setVal(e.target.value)}
              rows={2}
              placeholder="Descreva uma planta, um intertravamento, um equipamento…"
              className="w-full resize-none rounded-md bg-input border border-border p-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button className="absolute right-2 bottom-2 h-8 w-8 grid place-items-center rounded-md text-primary-foreground glow-primary"
                    style={{ background: "var(--gradient-primary)" }}>
              <Send className="h-4 w-4"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
