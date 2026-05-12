import { useState } from "react";
import { Sparkles, Send, Loader2, X, MessageSquare, AlertTriangle } from "lucide-react";
import { callArchitect, applyArchitectToStore } from "@/lib/ai-architect-client";
import { useProjectStore } from "@/lib/project-store";

interface Msg { role: "user" | "ai"; text: string; error?: string }

export function CanvasAiChat() {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", text: "Oi! Descreva o que você quer adicionar ao canvas — eu projeto e aplico em tempo real." },
  ]);
  const loadDemo = useProjectStore((s) => s.loadDemoFaulty);

  const send = async () => {
    const p = val.trim();
    if (!p || busy) return;
    setVal("");
    setMsgs((m) => [...m, { role: "user", text: p }, { role: "ai", text: "Projetando…" }]);
    setBusy(true);
    try {
      const r = await callArchitect(p, true);
      applyArchitectToStore(r, { mode: "merge" });
      setMsgs((m) => {
        const c = [...m]; c[c.length - 1] = { role: "ai", text: `✔ ${r.title}\n${r.nodes.length} nós · ${r.edges.length} ligações aplicados ao canvas.` };
        return c;
      });
    } catch (e: any) {
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "ai", text: "Falha ao gerar.", error: e.message }; return c; });
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-6 right-6 z-20 h-12 w-12 rounded-full grid place-items-center text-primary-foreground glow-primary shadow-lg hover:scale-105 transition-transform"
        style={{ background: "var(--gradient-primary)" }}
        aria-label="Abrir IA no canvas"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 z-20 w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] rounded-lg glass-strong border border-primary/30 flex flex-col shadow-2xl">
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-border">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">EletricAI · no canvas</span>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={loadDemo} title="Carregar exemplo com falhas para testar validador"
                  className="h-6 px-2 rounded text-[10px] font-medium border border-warning/40 text-warning hover:bg-warning/10 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Demo c/ falhas
          </button>
          <button onClick={() => setOpen(false)} className="h-7 w-7 grid place-items-center rounded hover:bg-accent/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded-md p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap ${m.role === "ai" ? "bg-primary/5 border border-primary/15" : "bg-card border border-border"}`}>
            <div className="text-[9px] uppercase tracking-wider mb-0.5 text-muted-foreground">{m.role === "ai" ? "IA" : "Você"}</div>
            {m.text}
            {m.error && <div className="mt-1 text-destructive text-[11px]">{m.error}</div>}
          </div>
        ))}
      </div>

      <div className="shrink-0 p-2 border-t border-border">
        <div className="relative">
          <textarea
            value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="Adicione 3 motores de 75kW com VFD…"
            className="w-full resize-none rounded-md bg-input border border-border p-2 pr-9 text-[12px] outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={send} disabled={busy || !val.trim()}
                  className="absolute right-1.5 bottom-1.5 h-7 w-7 grid place-items-center rounded text-primary-foreground glow-primary disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-1 text-[9px] text-muted-foreground flex items-center gap-1">
          <MessageSquare className="h-2.5 w-2.5" /> Enter envia · Shift+Enter quebra linha
        </div>
      </div>
    </div>
  );
}
