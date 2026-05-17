import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createStripeCheckout, createMpPreference } from "@/lib/billing.functions";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";

type PaidPlan = "basic" | "pro" | "premium";

export function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const stripeFn = useServerFn(createStripeCheckout);
  const mpFn = useServerFn(createMpPreference);

  useEffect(() => {
    const handleTrigger = () => setOpen(true);
    window.addEventListener("trigger-upgrade-modal", handleTrigger);
    return () => window.removeEventListener("trigger-upgrade-modal", handleTrigger);
  }, []);

  async function handleCheckout(provider: "stripe" | "mp", plan: PaidPlan) {
    setBusy(`${provider}:${plan}`);
    try {
      const res =
        provider === "stripe"
          ? await stripeFn({ data: { plan } })
          : await mpFn({ data: { plan } });
      window.location.href = res.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl p-6 bg-card/95 border-border backdrop-blur-md shadow-glow rounded-xl overflow-y-auto max-h-[90vh]">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <span>Fazer Upgrade do seu Plano</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Desbloqueie mais créditos de inteligência artificial, projetos ilimitados e monitoramento OPC-UA / Modbus em tempo real.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(SUBSCRIPTION_PLANS)
            .filter((p) => p.id !== "free")
            .map((p) => {
              const isPremium = p.id === "premium";
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-xl border p-5 transition-all duration-300 bg-background/50 hover:bg-background/80 ${
                    isPremium
                      ? "border-primary/60 shadow-glow bg-primary/5"
                      : "border-border"
                  }`}
                >
                  {isPremium && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-primary/20 border border-primary/30 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
                      Recomendado
                    </span>
                  )}
                  <h3 className="font-semibold text-base mb-1">{p.name}</h3>
                  <div className="mb-4">
                    <span className="text-2xl font-bold">R$ {p.priceBRL}</span>
                    <span className="text-[10px] text-muted-foreground">/mês</span>
                  </div>

                  <ul className="text-[10px] text-muted-foreground space-y-2 mb-6 flex-1">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <span>
                        {p.aiCreditsPerMonth === null
                          ? "Créditos IA ilimitados"
                          : `${p.aiCreditsPerMonth} créditos IA/mês`}
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                      <span>
                        {p.maxProjects < 0 ? "Projetos ilimitados" : `Até ${p.maxProjects} projetos`}
                      </span>
                    </li>
                    {p.realtime && (
                      <li className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>OPC-UA / Modbus em tempo real</span>
                      </li>
                    )}
                    {p.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2 mt-auto">
                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/95 text-[10px] uppercase font-bold tracking-wider cursor-pointer"
                      disabled={!!busy}
                      onClick={() => handleCheckout("stripe", p.id as PaidPlan)}
                    >
                      {busy === `stripe:${p.id}` ? "Conectando..." : "Pagar com Stripe"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-[10px] uppercase font-bold tracking-wider cursor-pointer"
                      disabled={!!busy}
                      onClick={() => handleCheckout("mp", p.id as PaidPlan)}
                    >
                      {busy === `mp:${p.id}` ? "Conectando..." : "Pagar com Pix/Boleto"}
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
