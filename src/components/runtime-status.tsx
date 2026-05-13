import { useEffect, useState } from "react";
import { Radio, Wifi, WifiOff, Plug, Square, Loader2 } from "lucide-react";
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
    await disconnect();
  };

  const dot = runtime.connected
    ? runtime.source === "supabase"
      ? "bg-success"
      : "bg-primary"
    : "bg-muted-foreground/40";
  const label = runtime.connected
    ? runtime.source === "supabase"
      ? "Realtime · LIVE"
      : "Sim local · LIVE"
    : "Runtime offline";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1.5">
        <DialogTrigger asChild>
          <button className="h-8 px-2.5 rounded-md border border-border bg-card/60 hover:bg-accent/50 flex items-center gap-2 text-[11px] font-mono">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", dot, runtime.connected && "energized")}
            />
            {runtime.connected ? (
              <Wifi className="h-3 w-3 text-success" />
            ) : (
              <WifiOff className="h-3 w-3 text-muted-foreground" />
            )}
            <span>{label}</span>
            {runtime.cycleMs && (
              <span className="text-muted-foreground">· {runtime.cycleMs}ms</span>
            )}
          </button>
        </DialogTrigger>
        {!runtime.connected ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-xs"
            onClick={startLocalSimulation}
          >
            <BrandBolt className="h-3.5 w-3.5 text-primary" /> Sim
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 gap-1.5 text-xs text-destructive"
            onClick={handleDisconnect}
          >
            <Square className="h-3 w-3 fill-current" /> Stop
          </Button>
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
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
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
