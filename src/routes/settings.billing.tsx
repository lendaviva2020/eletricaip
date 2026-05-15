import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import {
  getBillingOverview,
  createStripeCheckout,
  createMpPreference,
  cancelSubscription,
  changePlanManual,
} from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLANS, getPlan } from "@/lib/plans";

export const Route = createFileRoute("/settings/billing")({
  head: () => ({ meta: [{ title: "Faturamento · EletricAI" }] }),
  component: BillingPage,
});

type Plan = "pro" | "premium";

function BillingPage() {
  const overviewFn = useServerFn(getBillingOverview);
  const stripeFn = useServerFn(createStripeCheckout);
  const mpFn = useServerFn(createMpPreference);
  const cancelFn = useServerFn(cancelSubscription);
  const manualFn = useServerFn(changePlanManual);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-overview"],
    queryFn: () => overviewFn({}),
  });

  async function handleCheckout(provider: "stripe" | "mp", plan: Plan) {
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

  async function handleCancel() {
    if (!confirm("Cancelar assinatura ao final do período?")) return;
    try {
      await cancelFn({});
      toast.success("Assinatura será cancelada no fim do período.");
      await qc.invalidateQueries({ queryKey: ["billing-overview"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleManual(plan: "free" | Plan) {
    if (!confirm(`Forçar mudança para o plano ${plan} (admin override, sem cobrança)?`)) return;
    try {
      await manualFn({ data: { plan } });
      toast.success("Plano atualizado.");
      await qc.invalidateQueries({ queryKey: ["billing-overview"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const currentPlan = data?.plan ?? "free";
  const plan = getPlan(currentPlan);

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-5xl mx-auto">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      <h1 className="text-2xl font-bold mb-1">Faturamento & Assinatura</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Plano atual: <span className="font-medium text-foreground">{plan.name}</span>
        {data?.subscriptionStatus && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-muted">{data.subscriptionStatus}</span>
        )}
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {(Object.values(SUBSCRIPTION_PLANS) as typeof SUBSCRIPTION_PLANS[keyof typeof SUBSCRIPTION_PLANS][]).map((p) => {
          const isCurrent = currentPlan === p.id;
          return (
            <div
              key={p.id}
              className={`border rounded-lg p-5 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  <p className="text-2xl font-bold mt-1">
                    R$ {p.priceBRL}
                    <span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </p>
                </div>
                {isCurrent && <CheckCircle2 className="w-5 h-5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                {p.aiCallsPerMonth ? `${p.aiCallsPerMonth} chamadas IA/mês` : "IA ilimitada"}
              </p>
              {!isCurrent && p.id !== "basico" && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!!busy}
                    onClick={() => handleCheckout("stripe", p.id as Plan)}
                  >
                    {busy === `stripe:${p.id}` ? "Abrindo…" : "Pagar com Stripe"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={!!busy}
                    onClick={() => handleCheckout("mp", p.id as Plan)}
                  >
                    {busy === `mp:${p.id}` ? "Abrindo…" : "Pagar com Mercado Pago"}
                  </Button>
                </div>
              )}
              {isCurrent && currentPlan !== "basico" && (
                <Button size="sm" variant="ghost" className="w-full" onClick={handleCancel}>
                  Cancelar assinatura
                </Button>
              )}
            </div>
          );
        })}
      </section>

      <section className="mb-8 border border-border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500" /> Override de admin (sem cobrança)
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Para testes locais ou mudanças manuais. Em produção, use o checkout.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleManual("free")}>FREE</Button>
          <Button size="sm" variant="outline" onClick={() => handleManual("pro")}>PRO</Button>
          <Button size="sm" variant="outline" onClick={() => handleManual("premium")}>PREMIUM</Button>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Faturas recentes</h2>
        {(!data?.invoices || data.invoices.length === 0) ? (
          <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {(inv.currency ?? "BRL").toUpperCase()} {((inv.amount ?? 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.created_at).toLocaleDateString("pt-BR")} · {inv.status}
                  </p>
                </div>
                {inv.pdf_url && (
                  <a
                    href={inv.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    PDF <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
