import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, Key, ShieldAlert, ExternalLink } from "lucide-react";
import { pingArchitectHealth, getStatusEvents } from "@/lib/ai-architect-client";

export const Route = createFileRoute("/settings/ai-status")({
  head: () => ({
    meta: [
      { title: "Status da IA · EletricAI Industrial OS" },
      { name: "description", content: "Diagnóstico da integração com o motor de IA (DeepSeek): chave, ping e histórico." },
    ],
  }),
  component: AiStatusPage,
});

function AiStatusPage() {
  const [health, setHealth] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState(getStatusEvents());

  const refresh = async () => {
    setBusy(true);
    setHealth(await pingArchitectHealth());
    setEvents(getStatusEvents());
    setBusy(false);
  };

  useEffect(() => {
    refresh();
    const onEv = () => setEvents(getStatusEvents());
    window.addEventListener("ai-status-event", onEv);
    return () => window.removeEventListener("ai-status-event", onEv);
  }, []);

  const last24h = events.filter((e) => Date.now() - e.ts < 24 * 60 * 60 * 1000);
  const auth401Count = last24h.filter((e) => e.code === "AUTH_401").length;
  const successCount = last24h.filter((e) => e.ok).length;
  const lastEvent = events[0];

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[900px] mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-2">
              <Sparkles className="h-3 w-3" /> Integração de IA
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Status da IA Industrial</h1>
            <p className="text-sm text-muted-foreground mt-1">Provedor: <span className="font-mono text-foreground">DeepSeek</span> · modelo <span className="font-mono text-foreground">deepseek-chat</span></p>
          </div>
          <button onClick={refresh} disabled={busy}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium border border-border hover:bg-accent disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Revalidar agora
          </button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card icon={Key} label="Chave configurada" tone={health?.keyConfigured ? "ok" : "err"}
                value={health?.keyConfigured ? (health?.keyFormatValid ? "OK" : "Formato inválido") : "Ausente"}
                hint={health?.keyFormatReason} />
          <Card icon={CheckCircle2} label="Último ping ao DeepSeek"
                tone={health?.pingOk ? "ok" : health == null ? "warn" : "err"}
                value={health?.pingOk ? `200 OK` : (health?.pingStatus ? `HTTP ${health.pingStatus}` : "—")}
                hint={health?.pingError?.slice(0, 80)} />
          <Card icon={ShieldAlert} label="Erros 401 (24h)" tone={auth401Count === 0 ? "ok" : "err"}
                value={String(auth401Count)} hint={`${successCount} sucessos / ${last24h.length} chamadas`} />
        </div>

        {(!health?.ok || auth401Count > 0) && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-destructive">Ação necessária para reativar a IA</h2>
                <ol className="list-decimal list-inside mt-2 space-y-1.5 text-sm text-foreground/90">
                  <li>Gere uma nova chave em <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1 text-primary">platform.deepseek.com/api_keys <ExternalLink className="h-3 w-3" /></a> e confirme que sua conta tem créditos.</li>
                  <li>No Supabase, abra <a href={`https://supabase.com/dashboard/project/${import.meta.env.VITE_SUPABASE_PROJECT_ID}/settings/functions`} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1 text-primary">Settings → Edge Functions → Secrets <ExternalLink className="h-3 w-3" /></a> e atualize <code className="px-1 py-0.5 rounded bg-muted text-[12px]">DEEPSEEK_API_KEY</code>.</li>
                  <li>Volte aqui e clique em <strong>Revalidar agora</strong>.</li>
                </ol>
                <p className="mt-3 text-[12px] text-muted-foreground">Por segurança, sua chave nunca aparece nesta página nem em logs do app.</p>
              </div>
            </div>
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-2">Histórico recente (últimas 50 chamadas)</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Quando</th>
                  <th className="text-left font-medium px-3 py-2">Resultado</th>
                  <th className="text-left font-medium px-3 py-2">Código</th>
                  <th className="text-right font-medium px-3 py-2">Latência</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nenhuma chamada registrada ainda.</td></tr>
                )}
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{new Date(e.ts).toLocaleString()}</td>
                    <td className={`px-3 py-1.5 font-medium ${e.ok ? "text-success" : "text-destructive"}`}>{e.ok ? "✓ OK" : "✗ Falha"}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{e.code ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{e.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lastEvent && (
            <p className="mt-2 text-[11px] text-muted-foreground">Última atividade: {new Date(lastEvent.ts).toLocaleString()}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, tone, hint }: { icon: any; label: string; value: string; tone: "ok" | "warn" | "err"; hint?: string }) {
  const c = tone === "ok" ? "text-success border-success/30 bg-success/5" : tone === "warn" ? "text-warning border-warning/30 bg-warning/5" : "text-destructive border-destructive/30 bg-destructive/5";
  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-xl font-mono mt-1">{value}</div>
      {hint && <div className="text-[11px] mt-1 text-muted-foreground line-clamp-2">{hint}</div>}
    </div>
  );
}
