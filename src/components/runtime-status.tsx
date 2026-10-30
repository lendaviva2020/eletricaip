import { useEffect, useState } from "react";
import {
  Radio,
  WifiHigh,
  WifiSlash,
  Plug,
  Square,
  CircleNotch,
  Octagon,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BrandBolt } from "@/components/brand-bolt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import {
  connectSupabase,
  disconnect,
  loadConfig,
  startLocalSimulation,
  autoConnect,
} from "@/lib/runtime-client";
import { cn } from "@/lib/utils";

export function RuntimeStatus() {
  const runtime = useProjectStore((s) => s.runtime);
  const simulationStatus = useEditorStore((s) => s.simulationStatus);
  const setSimulationStatus = useEditorStore((s) => s.setSimulationStatus);
  const emergencyLatched = useSafetyStore((s) => s.emergencyLatched);
  const triggerEmergency = useSafetyStore((s) => s.triggerEmergency);
  const rearmEmergency = useSafetyStore((s) => s.rearmEmergency);
  const canStartSimulation = useSafetyStore((s) => s.canStartSimulation);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [channel, setChannel] = useState("eletricai:runtime");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setChannel(cfg.channel ?? "eletricai:runtime");
      autoConnect();
    }
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectSupabase({ url: url.trim(), anonKey: anonKey.trim(), channel: channel.trim() });
      setOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setSimulationStatus("stopped");
    await disconnect();
  };

  const handleStartSim = () => {
    const check = canStartSimulation();
    if (!check.allowed) {
      toast.error(check.reason);
      return;
    }
    setSimulationStatus("running");
    startLocalSimulation();
  };

  const handleTriggerEmergency = () => {
    triggerEmergency("header_topbar", "Parada de emergência acionada pelo operador no cabeçalho");
    toast.error("PARADA DE EMERGÊNCIA ATUADA. Todos os circuitos foram desenergizados.");
  };

  const handleRearm = () => {
    const res = rearmEmergency("Operador");
    if (res.success) {
      toast.success(res.message);
    }
  };

  const isSimActive = runtime.connected || simulationStatus === "running";
  const isSimPaused = !isSimActive && simulationStatus === "paused";

  const dot = emergencyLatched
    ? "bg-rose-500 animate-ping"
    : isSimActive
      ? runtime.source === "supabase"
        ? "bg-success"
        : "bg-emerald-400"
      : isSimPaused
        ? "bg-amber-400"
        : "bg-muted-foreground/40";

  const label = emergencyLatched
    ? "E-STOP ATUADO"
    : isSimActive
      ? runtime.source === "supabase"
        ? "Realtime · LIVE"
        : "Simulação Ativa"
      : isSimPaused
        ? "Simulação Pausada"
        : "Simulação Parada";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <button
            className={cn(
              "h-8 px-2.5 rounded-md border flex items-center gap-2 text-[11px] font-mono transition-all",
              emergencyLatched
                ? "border-rose-500/60 bg-rose-950/40 text-rose-300 font-bold animate-pulse"
                : "border-border bg-card/60 hover:bg-accent/50 text-foreground",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", dot, isSimActive && "energized")} />
            {emergencyLatched ? (
              <Octagon className="h-3 w-3 text-rose-400 fill-current" />
            ) : isSimActive ? (
              <WifiHigh className="h-3 w-3 text-emerald-400" />
            ) : (
              <WifiSlash className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">{label}</span>
            {runtime.cycleMs && isSimActive && !emergencyLatched && (
              <span className="hidden md:inline text-muted-foreground">· {runtime.cycleMs}ms</span>
            )}
          </button>
        </DialogTrigger>

        {emergencyLatched ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5 gap-1.5 text-xs bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 font-bold cursor-pointer"
            onClick={handleRearm}
            title="Rearmar Parada de Emergência (Requer comando START posterior)"
            data-testid="runtime-rearm-btn"
          >
            <ArrowCounterClockwise className="h-3.5 w-3.5" /> Rearmar
          </Button>
        ) : !isSimActive ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-xs text-primary font-semibold hover:bg-primary/10"
            onClick={handleStartSim}
            data-testid="runtime-sim-btn"
          >
            <BrandBolt className="h-3.5 w-3.5 text-primary" /> Sim
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 gap-1.5 text-xs text-destructive hover:bg-destructive/10 font-semibold"
              onClick={handleDisconnect}
            >
              <Square className="h-3 w-3 fill-current" /> Stop
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 px-2 gap-1 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold tracking-wide"
              onClick={handleTriggerEmergency}
              title="PARADA DE EMERGÊNCIA (Corte imediato de atuadores)"
              data-testid="runtime-estop-btn"
            >
              <Octagon className="h-3.5 w-3.5 fill-current" /> E-STOP
            </Button>
          </div>
        )}
      </div>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" /> Conectar Runtime Supabase
          </DialogTitle>
          <DialogDescription>
            Cole a URL e a <strong>chave pública (anon)</strong> do seu projeto Supabase. Os ticks
            chegam pelo canal Realtime informado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rt-url" className="text-[11px]">
              Project URL
            </Label>
            <Input
              id="rt-url"
              placeholder="https://xxxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-key" className="text-[11px]">
              Anon (publishable) key
            </Label>
            <Input
              id="rt-key"
              placeholder="eyJhbGciOi..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-ch" className="text-[11px]">
              Canal Realtime
            </Label>
            <Input
              id="rt-ch"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          {error && <div className="text-[11px] text-destructive font-mono">⚠ {error}</div>}
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            Nunca cole a <code>service_role</code> aqui — ela expõe seu banco. Use somente{" "}
            <code>anon</code>. Os ticks devem ser publicados como <code>broadcast</code> evento{" "}
            <code>tick</code> no canal acima (ex.: por uma Edge Function/cron). O esquema da carga e
            o código da função estão em <code>/mnt/documents/eletricai-edge-function.ts</code>.
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConnect}
            disabled={busy || !url || !anonKey}
            style={{ background: "var(--gradient-primary)" }}
            className="text-primary-foreground"
          >
            {busy ? (
              <CircleNotch className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Plug className="h-3.5 w-3.5 mr-1.5" />
            )}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
