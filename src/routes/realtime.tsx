import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Activity, AlertTriangle, Send, Key, Lock, CheckCircle2, Radio } from "lucide-react";
import {
  listIotDevices,
  getLatestReadings,
  listIotAlerts,
  acknowledgeAlert,
  enqueueIotCommand,
  checkRealtimeFeature,
  createIotApiKey,
} from "@/lib/iot.functions";

export const Route = createFileRoute("/realtime")({
  component: RealtimePage,
  head: () => ({
    meta: [
      { title: "Realtime · EletricAI Industrial" },
      { name: "description", content: "Telemetria ao vivo, alarmes e comandos para PLCs/CLPs conectados." },
    ],
  }),
});

type Reading = { id: string; device_id: string; value: number; quality: string; timestamp: string };
type Alert = {
  id: string;
  device_id: string | null;
  level: string;
  message: string;
  value: number | null;
  timestamp: string;
  is_resolved: boolean | null;
};

function RealtimePage() {
  const fetchFeature = useServerFn(checkRealtimeFeature);
  const fetchDevices = useServerFn(listIotDevices);
  const fetchReadings = useServerFn(getLatestReadings);
  const fetchAlerts = useServerFn(listIotAlerts);
  const ackAlert = useServerFn(acknowledgeAlert);
  const sendCmd = useServerFn(enqueueIotCommand);
  const newKey = useServerFn(createIotApiKey);

  const qc = useQueryClient();
  const feature = useQuery({ queryKey: ["iot", "feature"], queryFn: () => fetchFeature() });
  const devices = useQuery({ queryKey: ["iot", "devices"], queryFn: () => fetchDevices(), refetchInterval: 30_000 });
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (devices.data?.ok && devices.data.devices.length && !activeId) {
      setActiveId(devices.data.devices[0].id);
    }
  }, [devices.data, activeId]);

  const initial = useQuery({
    queryKey: ["iot", "readings", activeId],
    queryFn: () => fetchReadings({ data: { deviceId: activeId ?? undefined, limit: 100 } }),
    enabled: !!activeId,
  });

  const alerts = useQuery({ queryKey: ["iot", "alerts"], queryFn: () => fetchAlerts(), refetchInterval: 15_000 });

  const [live, setLive] = useState<Reading[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (initial.data?.ok) setLive(initial.data.readings as Reading[]);
  }, [initial.data]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel(`iot-readings-${activeId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "iot_readings", ...(activeId ? { filter: `device_id=eq.${activeId}` } : {}) },
        (payload) => {
          const r = payload.new as Reading;
          setLive((prev) => [...prev.slice(-199), r]);
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "iot_alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["iot", "alerts"] });
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeId, qc]);

  const ackMut = useMutation({
    mutationFn: (id: string) => ackAlert({ data: { alertId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iot", "alerts"] }),
  });

  // ===== UI: feature gate
  if (feature.data && feature.data.ok && !feature.data.enabled) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Card className="p-8 text-center space-y-4">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Realtime / IoT é um recurso Pro</h1>
          <p className="text-muted-foreground">
            Telemetria ao vivo, alarmes em tempo real e comandos para PLCs estão disponíveis nos planos Pro e Premium.
          </p>
          <Button asChild>
            <Link to="/settings/billing">Fazer upgrade</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Realtime / IoT
          </h1>
          <p className="text-sm text-muted-foreground">Telemetria ao vivo, alarmes e comandos para PLCs/CLPs.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Radio className={`h-3.5 w-3.5 ${connected ? "text-success animate-pulse" : "text-muted-foreground"}`} />
          {connected ? "Stream conectado" : "Conectando…"}
        </div>
      </header>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* Devices sidebar */}
        <Card className="p-3 space-y-2 h-fit">
          <div className="text-xs font-semibold uppercase text-muted-foreground px-2">Dispositivos</div>
          <ApiKeyCreator onCreate={(name) => newKey({ data: { name } })} />
          {!devices.data || !devices.data.ok ? (
            <div className="p-2 text-xs text-muted-foreground">Carregando…</div>
          ) : devices.data.devices.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              Nenhum dispositivo. Use uma API key acima e POST em <code>/api/public/iot/ingest</code> para enviar leituras.
            </div>
          ) : (
            devices.data.devices.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                  activeId === d.id ? "bg-primary/15 text-foreground" : "hover:bg-muted/50"
                }`}
              >
                <div className="font-medium truncate">{d.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">{d.device_external_id}</div>
              </button>
            ))
          )}
        </Card>

        {/* Main */}
        <div className="space-y-4">
          <LiveChart readings={live} />
          <CommandPanel
            deviceExternalId={
              devices.data?.ok ? devices.data.devices.find((d) => d.id === activeId)?.device_external_id ?? "" : ""
            }
            onSend={(p) => sendCmd({ data: p })}
          />
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-semibold">Alarmes recentes</h2>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-auto">
              {!alerts.data?.ok || alerts.data.alerts.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nenhum alarme.</div>
              ) : (
                (alerts.data.alerts as Alert[]).map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 text-xs p-2 rounded border ${
                      a.is_resolved ? "border-border bg-muted/30 opacity-60" : "border-warning/40 bg-warning/5"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(a.timestamp).toLocaleTimeString("pt-BR")}
                    </span>
                    <span className="font-semibold uppercase">{a.level}</span>
                    <span className="flex-1 truncate">{a.message}</span>
                    {a.value != null && <span className="font-mono">{a.value.toFixed(2)}</span>}
                    {!a.is_resolved && (
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => ackMut.mutate(a.id)}>
                        <CheckCircle2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LiveChart({ readings }: { readings: Reading[] }) {
  const { min, max, path, last } = useMemo(() => {
    if (readings.length === 0) return { min: 0, max: 1, path: "", last: 0 };
    const vals = readings.map((r) => r.value);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const range = mx - mn || 1;
    const w = 800;
    const h = 200;
    const path = readings
      .map((r, i) => {
        const x = (i / Math.max(1, readings.length - 1)) * w;
        const y = h - ((r.value - mn) / range) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { min: mn, max: mx, path, last: vals[vals.length - 1] };
  }, [readings]);

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-semibold">Telemetria ao vivo</h2>
        <div className="text-xs text-muted-foreground font-mono">
          última: <span className="text-foreground">{last.toFixed(3)}</span> · {readings.length} pts
        </div>
      </div>
      <div className="aspect-[4/1] w-full bg-muted/20 rounded relative overflow-hidden">
        {readings.length > 0 ? (
          <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
            <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
          </svg>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Aguardando leituras…
          </div>
        )}
        <div className="absolute top-1 left-2 text-[10px] font-mono text-muted-foreground">{max.toFixed(2)}</div>
        <div className="absolute bottom-1 left-2 text-[10px] font-mono text-muted-foreground">{min.toFixed(2)}</div>
      </div>
    </Card>
  );
}

function CommandPanel({
  deviceExternalId,
  onSend,
}: {
  deviceExternalId: string;
  onSend: (p: { deviceExternalId: string; command: string; payload: Record<string, unknown>; watchdogMs: number }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [cmd, setCmd] = useState("start");
  const [watchdog, setWatchdog] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    if (!deviceExternalId) {
      setMsg("Selecione um dispositivo");
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await onSend({ deviceExternalId, command: cmd, payload: {}, watchdogMs: watchdog });
    setBusy(false);
    setMsg(r.ok ? "Comando enfileirado" : `Falhou: ${r.error}`);
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Send className="h-4 w-4 text-info" />
        <h2 className="font-semibold">Enviar comando</h2>
      </div>
      <div className="grid sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Comando</label>
          <Input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="start, stop, reset…" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Watchdog (ms)</label>
          <Input
            type="number"
            min={500}
            max={60000}
            value={watchdog}
            onChange={(e) => setWatchdog(Number(e.target.value) || 5000)}
          />
        </div>
        <Button onClick={send} disabled={busy || !deviceExternalId}>
          {busy ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      {msg && <div className="text-xs mt-2 text-muted-foreground">{msg}</div>}
      <div className="text-[10px] text-muted-foreground mt-2">
        Se o PLC não confirmar antes do watchdog, o comando é marcado como falho (fail-safe).
      </div>
    </Card>
  );
}

function ApiKeyCreator({ onCreate }: { onCreate: (name: string) => Promise<{ ok: boolean; apiKey?: string; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("PLC linha 03");
  const [issued, setIssued] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    const r = await onCreate(name);
    if (r.ok && r.apiKey) setIssued(r.apiKey);
  };

  return (
    <div className="px-2">
      {!open && (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setOpen(true)}>
          <Key className="h-3 w-3" /> Nova API key (ingest)
        </Button>
      )}
      {open && !issued && (
        <div className="space-y-2 p-2 border border-border rounded">
          <Input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="h-7 text-xs" />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs flex-1" onClick={create}>
              Criar
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setOpen(false)}>
              X
            </Button>
          </div>
        </div>
      )}
      {issued && (
        <div className="space-y-2 p-2 border border-warning/50 bg-warning/5 rounded">
          <div className="text-[10px] font-semibold text-warning">⚠ Copie agora — não será exibida de novo</div>
          <code className="block text-[10px] break-all bg-background p-1 rounded font-mono">{issued}</code>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs w-full"
            onClick={() => {
              navigator.clipboard.writeText(issued);
              setIssued(null);
              setOpen(false);
            }}
          >
            Copiar e fechar
          </Button>
        </div>
      )}
    </div>
  );
}
