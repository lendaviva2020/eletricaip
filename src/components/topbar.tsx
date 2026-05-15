import { useState } from "react";
import { Search, Bell, Save, Share2, GitBranch, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RuntimeStatus } from "@/components/runtime-status";
import { MobileMenu } from "@/components/mobile-menu";
import { AiCreditsBadge } from "@/components/ai-credits-badge";
import { saveManualVersion } from "@/lib/ai-architect-client";

export function Topbar() {
  const [saving, setSaving] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const onSave = async () => {
    setSaving("busy");
    setSavedMsg(null);
    const r = await saveManualVersion(`Snapshot ${new Date().toLocaleString("pt-BR")}`);
    if (r.ok) {
      setSaving("ok");
      setSavedMsg(`v${r.version} salva`);
      setTimeout(() => {
        setSaving("idle");
        setSavedMsg(null);
      }, 2500);
    } else {
      setSaving("err");
      setSavedMsg(r.error ?? "Falha ao salvar");
      setTimeout(() => {
        setSaving("idle");
        setSavedMsg(null);
      }, 4000);
    }
  };

  return (
    <header className="h-14 shrink-0 flex items-center gap-2 px-3 sm:px-4 border-b border-border glass-strong">
      <MobileMenu />
      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5" />
        <span className="font-mono">main</span>
        <span className="text-border">/</span>
        <span className="text-foreground font-medium">Planta — Linha 03</span>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <div className="relative w-full max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-input/60 border border-border text-sm
                       outline-none focus:ring-2 focus:ring-ring focus:bg-input
                       placeholder:text-muted-foreground/70"
          />
          <kbd className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <Button
          size="sm"
          variant={saving === "ok" ? "default" : saving === "err" ? "destructive" : "ghost"}
          onClick={onSave}
          disabled={saving === "busy"}
          className="h-8 px-2 gap-1.5 text-xs"
          title={savedMsg ?? "Salvar snapshot do projeto"}
        >
          {saving === "busy" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saving === "ok" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">
            {saving === "ok" ? savedMsg : saving === "err" ? "Falhou" : "Salvar"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex h-8 px-2 gap-1.5 text-xs"
        >
          <Share2 className="h-3.5 w-3.5" /> Compartilhar
        </Button>
        <div className="hidden md:block h-5 w-px bg-border mx-1" />
        <RuntimeStatus />
        <AiCreditsBadge />
        <div className="hidden sm:block h-5 w-px bg-border mx-1" />
        <Button size="icon" variant="ghost" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-warning energized" />
        </Button>
        <div className="h-7 w-7 rounded-full ring-1 ring-border bg-gradient-to-br from-primary/60 to-info/60" />
      </div>
    </header>
  );
}
