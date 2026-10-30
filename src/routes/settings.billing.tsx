import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle,
  ArrowSquareOut,
  Warning,
  WarningCircle,
  CreditCard,
  Sparkle,
  Shield,
  Lightning,
  Clock,
  FileText,
  ArrowsClockwise,
  Crown,
  CircleNotch,
  Prohibit,
  Users,
  Robot,
  Cpu,
  HardDrives,
  PiggyBank,
  Timer,
  CaretRight,
  Plus,
  Buildings,
  WifiHigh,
  MagnifyingGlass,
  DownloadSimple,
  Lock,
  Hexagon,
  ChartBar,
  TrendUp,
  Wallet,
  Receipt,
  CurrencyDollar,
} from "@phosphor-icons/react";
import {
  getBillingOverview,
  createStripeCheckout,
  createMpPreference,
  cancelSubscription,
  changePlanManual,
  getIsPlatformAdmin,
} from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUBSCRIPTION_PLANS, getPlan } from "@/lib/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NeuralBg } from "@/components/premium/neural-bg";
import { MetricCard } from "@/components/premium/metric-card";
import { CircularProgress } from "@/components/premium/circular-progress";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { prefetchRouteQuery } from "@/lib/query-prefetch";

export const Route = createFileRoute("/settings/billing")({
  // Admin gate runs client-side in the component (see useEffect below).
  // It cannot live in beforeLoad because SSR has no bearer token, so the
  // protected server fn would 500 the whole route.
  ssr: false,
  loader: ({ context }) => {
    prefetchRouteQuery(context.queryClient, {
      queryKey: ["billing-overview"],
      queryFn: () => getBillingOverview({}),
    });
    prefetchRouteQuery(context.queryClient, {
      queryKey: ["is-platform-admin"],
      queryFn: () => getIsPlatformAdmin({}),
    });
  },
  head: () => ({ meta: [{ title: "Central Financeira · EletricAI" }] }),
  component: BillingPage,
});

type PaidPlan = "basic" | "pro" | "premium";

function BillingPage() {
  const navigate = useNavigate();
  const overviewFn = useServerFn(getBillingOverview);
  const stripeFn = useServerFn(createStripeCheckout);
  const mpFn = useServerFn(createMpPreference);
  const cancelFn = useServerFn(cancelSubscription);
  const manualFn = useServerFn(changePlanManual);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const adminFn = useServerFn(getIsPlatformAdmin);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["billing-overview"],
    queryFn: () => overviewFn({}),
  });
  const { data: adminInfo } = useQuery({
    queryKey: ["is-platform-admin"],
    queryFn: async () => {
      try {
        return await adminFn({});
      } catch {
        return { isPlatformAdmin: false };
      }
    },
  });
  const isPlatformAdmin = !!adminInfo?.isPlatformAdmin;

  // Client-side gate: redirect non-admins after the check resolves.
  useEffect(() => {
    if (adminInfo && !adminInfo.isPlatformAdmin) {
      navigate({ to: "/settings" });
    }
  }, [adminInfo, navigate]);

  const currentPlan = data?.plan ?? "free";
  const plan = getPlan(currentPlan);

  const usageChart = useMemo(() => {
    const now = new Date();
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86400000);
      return {
        label: days[d.getDay()],
        calls: 0,
        tokens: 0,
        automations: 0,
      };
    });
  }, []);

  async function handleCheckout(provider: "stripe" | "mp", plan: PaidPlan) {
    setBusy(`${provider}:${plan}`);
    try {
      const res =
        provider === "stripe" ? await stripeFn({ data: { plan } }) : await mpFn({ data: { plan } });
      window.open(res.url, "_blank");
      toast.success(`Redirecionando para ${provider.toUpperCase()}...`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    setBusy("cancel");
    try {
      if (!confirm("Cancelar assinatura ao final do período?")) return;
      await cancelFn({});
      toast.success("Assinatura será cancelada no fim do período.");
      await qc.invalidateQueries({ queryKey: ["billing-overview"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleManual(pl: "free" | PaidPlan) {
    setBusy(`manual:${pl}`);
    try {
      if (!confirm(`Forçar mudança para o plano ${pl} (admin override, sem cobrança)?`)) return;
      await manualFn({ data: { plan: pl } });
      toast.success("Plano atualizado.");
      await qc.invalidateQueries({ queryKey: ["billing-overview"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh() {
    await refetch();
    toast.success("Dados atualizados.");
  }

  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    if (!invoiceSearch.trim()) return data.invoices;
    const q = invoiceSearch.toLowerCase();
    return data.invoices.filter(
      (inv: any) =>
        inv.id?.toLowerCase().includes(q) ||
        inv.status?.toLowerCase().includes(q) ||
        `${(inv.amount ?? 0) / 100}`.includes(q),
    );
  }, [data?.invoices, invoiceSearch]);

  const planIcons: Record<string, typeof Shield> = {
    free: Shield,
    basic: Sparkle,
    pro: Hexagon,
    premium: Crown,
  };
  const CurrentIcon = planIcons[currentPlan] || Shield;

  const daysLeft = data?.usage?.period ? 28 - new Date().getDate() : 14;
  const aiCredits = plan.aiCreditsPerMonth;
  const creditsUsed = data?.usage?.ai_tokens_used ?? 0;
  const usagePct =
    aiCredits && aiCredits > 0 ? Math.min(100, Math.round((creditsUsed / aiCredits) * 100)) : 68;

  return (
    <div className="flex-1 flex flex-col">
      {/* ─── Fixed Top Header ─── */}
      <header className="h-12 shrink-0 border-b border-border bg-panel flex items-center px-6 z-20">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            aria-label="Voltar para configurações"
            onClick={() => navigate({ to: "/settings" })}
            className="flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <CurrentIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{plan.name}</p>
              <p className="text-[10px] text-muted-foreground/60">
                EletricAI Industrial · {data?.tenantId ?? "demo"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
              Consumo mensal
            </p>
            <p className="text-xs font-semibold">R$ {plan.priceBRL}</p>
          </div>
          <div className="w-px h-8 bg-border/40 hidden sm:block" />
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
              Próxima cobrança
            </p>
            <p className="text-xs font-semibold">
              {data?.subscriptionStatus === "active" ? "Renovação automática" : "—"}
            </p>
          </div>
          <div className="w-px h-8 bg-border/40" />
          <Badge
            variant={
              data?.subscriptionStatus === "active" || data?.subscriptionStatus === "trialing"
                ? "default"
                : "destructive"
            }
            className="h-7 text-[10px] gap-1.5"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${data?.subscriptionStatus === "active" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            />
            {data?.subscriptionStatus === "active"
              ? "Licença ativa"
              : data?.subscriptionStatus === "trialing"
                ? "Teste"
                : data?.subscriptionStatus === "past_due"
                  ? "Pendente"
                  : "Cancelada"}
          </Badge>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => window.dispatchEvent(new Event("trigger-upgrade-modal"))}
          >
            <TrendUp className="h-3.5 w-3.5" /> Upgrade
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            EA
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <WarningCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Falha ao carregar dados financeiros</h2>
          <p className="text-xs text-muted-foreground max-w-md">
            Não foi possível carregar as informações financeiras e de faturamento do tenant.
            {error instanceof Error ? ` Detalhes: ${error.message}` : ""}
          </p>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <ArrowsClockwise className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex-1 overflow-auto scrollbar-thin">
          <div className="max-w-6xl mx-auto p-6 space-y-8">
            <Skeleton className="h-[280px] w-full rounded-md" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] rounded-md" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[320px] rounded-md" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin">
          <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* ─── Hero Section ─── */}
            <section className="relative overflow-hidden rounded-md border border-border bg-card">
              <div className="relative z-10 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Status Card */}
                  <div className="lg:col-span-3 space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 font-medium">
                          Status operacional
                        </span>
                        <h2 className="text-lg font-semibold mt-1">Central Financeira</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRefresh}
                          className="h-7 text-xs gap-1"
                        >
                          <ArrowsClockwise
                            className={`h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`}
                          />{" "}
                          Sincronizar
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-background rounded-md border border-border p-3">
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <HardDrives className="h-3 w-3" /> Armazenamento
                        </span>
                        <p className="text-lg font-semibold mt-1">
                          {data?.usage?.storage_used_mb ?? 0}{" "}
                          <span className="text-xs text-muted-foreground/60 font-normal">MB</span>
                        </p>
                      </div>
                      <div className="bg-background rounded-md border border-border p-3">
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Robot className="h-3 w-3" /> Uso de IA
                        </span>
                        <p className="text-lg font-semibold mt-1">{usagePct}%</p>
                      </div>
                      <div className="bg-background rounded-md border border-border p-3">
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Cpu className="h-3 w-3" /> Automações
                        </span>
                        <p className="text-lg font-semibold mt-1">
                          {data?.usage?.simulations_run ?? 0}{" "}
                          <span className="text-xs text-muted-foreground/60 font-normal">
                            / mês
                          </span>
                        </p>
                      </div>
                      <div className="bg-background rounded-md border border-border p-3">
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <HardDrives className="h-3 w-3" /> Armazenamento
                        </span>
                        <p className="text-lg font-semibold mt-1">
                          {data?.usage?.storage_used_mb ?? 0}{" "}
                          <span className="text-xs text-muted-foreground/60 font-normal">MB</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" /> {daysLeft} dias restantes no ciclo
                      </span>
                      <span className="flex items-center gap-1">
                        <WifiHigh className="h-3 w-3" /> {usagePct}% da cota utilizada
                      </span>
                    </div>
                  </div>
                  {/* Chart */}
                  <div className="lg:col-span-2 bg-background rounded-md border border-border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 font-medium">
                        Consumo (7 dias)
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                        <ChartBar className="h-3 w-3" /> Chamadas
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={120}>
                      <AreaChart data={usageChart}>
                        <defs>
                          <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3fb6d6" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#3fb6d6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          strokeOpacity={0.3}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 11,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="calls"
                          stroke="#3fb6d6"
                          fill="url(#usageGrad)"
                          dot={false}
                          activeDot={{ r: 3, fill: "#3fb6d6" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="automations"
                          stroke="#22c55e"
                          fill="none"
                          dot={false}
                          strokeDasharray="4 2"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>

            {/* ─── Metrics Grid ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={<Wallet className="h-4 w-4" />}
                label="Gasto total"
                value={`R$ ${(
                  (data?.invoices ?? [])
                    .filter((inv) => inv.status === "paid")
                    .reduce((acc, inv) => acc + (inv.amount ?? 0), 0) / 100
                )
                  .toFixed(2)
                  .replace(".", ",")}`}
                sub="Total faturado"
              />
              <MetricCard
                icon={<TrendUp className="h-4 w-4" />}
                label="Plano atual"
                value={plan.name}
                sub={plan.features[0] ?? "Assinatura ativa"}
              />
              <MetricCard
                icon={<PiggyBank className="h-4 w-4" />}
                label="Automações executadas"
                value={String(data?.usage?.simulations_run ?? 0)}
                sub="Neste ciclo mensal"
              />
              <MetricCard
                icon={<CurrencyDollar className="h-4 w-4" />}
                label="Tokens IA utilizados"
                value={String(data?.usage?.ai_tokens_used ?? 0)}
                sub={aiCredits ? `Cota: ${aiCredits.toLocaleString()}` : "Sem cota"}
              />
            </div>

            {/* ─── Planos ─── */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                  Planos
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.values(SUBSCRIPTION_PLANS).map((p) => {
                  const isCurrent = currentPlan === p.id;
                  const PlanIcon = planIcons[p.id] || Shield;
                  return (
                    <div
                      key={p.id}
                      className={`group relative overflow-hidden rounded-md border bg-card transition-colors ${
                        isCurrent ? "border-primary" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
                      )}
                      <div className={`p-5 ${isCurrent ? "pt-6" : ""}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl ${isCurrent ? "bg-primary/15" : "bg-muted/40"} transition-colors group-hover:bg-primary/10`}
                            >
                              <PlanIcon
                                className={`h-5 w-5 ${isCurrent ? "text-primary" : "text-muted-foreground/60"}`}
                              />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{p.name}</p>
                              {p.id === "pro" && (
                                <Badge variant="default" className="text-[8px] h-4 mt-0.5">
                                  RECOMENDADO
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isCurrent && (
                            <Badge className="text-[9px] h-5 gap-1 whitespace-nowrap">
                              <CheckCircle className="h-2.5 w-2.5" /> Atual
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1 mb-4">
                          <span className="text-3xl font-bold">R$ {p.priceBRL}</span>
                          <span className="text-[11px] text-muted-foreground/60">/mês</span>
                        </div>
                        <ul className="text-xs text-muted-foreground/80 space-y-1.5 mb-5">
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                            {p.maxProjects < 0
                              ? "Projetos ilimitados"
                              : `Até ${p.maxProjects} projetos`}
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                            {p.aiCreditsPerMonth === null
                              ? "Créditos IA ilimitados"
                              : `${p.aiCreditsPerMonth} créditos IA/mês`}
                          </li>
                          {p.realtime && (
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                              Realtime OPC-UA / Modbus
                            </li>
                          )}
                          {p.features.slice(0, 3).map((f) => (
                            <li key={f} className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                              {f}
                            </li>
                          ))}
                          {p.features.length > 3 && (
                            <li className="text-muted-foreground/40">
                              +{p.features.length - 3} recursos
                            </li>
                          )}
                        </ul>
                        {!isCurrent && p.id !== "free" && (
                          <div className="space-y-2">
                            <Button
                              size="sm"
                              className="w-full gap-1.5 text-xs h-9"
                              disabled={!!busy}
                              onClick={() => handleCheckout("stripe", p.id as PaidPlan)}
                            >
                              {busy === `stripe:${p.id}` ? (
                                <CircleNotch className="h-3 w-3 animate-spin" />
                              ) : (
                                <CreditCard className="h-3 w-3" />
                              )}
                              Assinar com Stripe
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-1.5 text-xs h-9"
                              disabled={!!busy}
                              onClick={() => handleCheckout("mp", p.id as PaidPlan)}
                            >
                              {busy === `mp:${p.id}` ? (
                                <CircleNotch className="h-3 w-3 animate-spin" />
                              ) : (
                                <Lightning className="h-3 w-3" />
                              )}
                              Mercado Pago
                            </Button>
                          </div>
                        )}
                        {isCurrent && currentPlan !== "free" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1.5 text-xs h-9 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={handleCancel}
                          >
                            <Prohibit className="h-3 w-3" /> Cancelar
                          </Button>
                        )}
                        {isCurrent && currentPlan === "free" && (
                          <div className="text-center text-[11px] text-muted-foreground/50 py-2.5 border border-dashed border-border/40 rounded-lg">
                            Plano gratuito — faça upgrade
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {isPlatformAdmin && (
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Warning className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold">Override de administrador</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["free", "basic", "pro", "premium"] as const).map((pl) => (
                      <Button
                        key={pl}
                        size="sm"
                        variant={currentPlan === pl ? "default" : "outline"}
                        onClick={() => handleManual(pl)}
                        disabled={!!busy}
                        className="text-xs h-8 gap-1"
                      >
                        {busy === `manual:${pl}` && (
                          <CircleNotch className="h-3 w-3 animate-spin" />
                        )}
                        {pl.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ─── Grid: Histórico + Métodos + IA Usage ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Histórico Financeiro */}
              <div className="lg:col-span-2">
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                        Histórico financeiro
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                        <Input
                          value={invoiceSearch}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                          placeholder="Filtrar faturas..."
                          className="h-8 w-44 pl-7 text-xs rounded-lg"
                        />
                      </div>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <DownloadSimple className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {!data?.invoices || data.invoices.length === 0 ? (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <Receipt className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">Nenhuma fatura encontrada.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border/40 bg-muted/20">
                              <th className="text-left font-medium text-muted-foreground/60 px-4 py-3 uppercase tracking-[0.05em]">
                                Data
                              </th>
                              <th className="text-left font-medium text-muted-foreground/60 px-4 py-3 uppercase tracking-[0.05em]">
                                Descrição
                              </th>
                              <th className="text-right font-medium text-muted-foreground/60 px-4 py-3 uppercase tracking-[0.05em]">
                                Valor
                              </th>
                              <th className="text-center font-medium text-muted-foreground/60 px-4 py-3 uppercase tracking-[0.05em]">
                                Status
                              </th>
                              <th className="text-center font-medium text-muted-foreground/60 px-4 py-3 uppercase tracking-[0.05em]">
                                NF
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/20">
                            {filteredInvoices.map((inv: any, i: number) => (
                              <tr key={inv.id || i} className="hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-3 text-muted-foreground/80 font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3 w-3 text-muted-foreground/40" />
                                    {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-medium text-foreground/80">
                                  Assinatura {plan.name}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold">
                                  {(inv.currency ?? "BRL").toUpperCase()}{" "}
                                  {((inv.amount ?? 0) / 100).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Badge
                                    variant={
                                      inv.status === "paid" || inv.status === "completed"
                                        ? "default"
                                        : inv.status === "pending" || inv.status === "open"
                                          ? "secondary"
                                          : "destructive"
                                    }
                                    className="text-[9px] h-5"
                                  >
                                    {inv.status === "paid" || inv.status === "completed"
                                      ? "Pago"
                                      : inv.status === "pending" || inv.status === "open"
                                        ? "Pendente"
                                        : inv.status === "overdue"
                                          ? "Vencido"
                                          : inv.status === "canceled"
                                            ? "Cancelado"
                                            : inv.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {inv.pdf_url ? (
                                    <a
                                      href={inv.pdf_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-primary hover:underline text-[10px]"
                                    >
                                      <FileText className="h-3 w-3" /> PDF
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/10">
                        <span className="text-[10px] text-muted-foreground/50">
                          {filteredInvoices.length} faturas
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-[10px]"
                            disabled
                          >
                            ‹
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-6 min-w-6 p-0 text-[10px]"
                          >
                            1
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[10px]">
                            2
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[10px]">
                            3
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[10px]">
                            ›
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </section>
              </div>

              {/* Métodos de Pagamento */}
              <div>
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                      Pagamento
                    </span>
                  </div>
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="rounded-md border border-border bg-secondary/40 p-3.5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                            <CreditCard className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold">Cartão principal</p>
                            <p className="text-[10px] text-muted-foreground/60 font-mono">
                              •••• 4242
                            </p>
                          </div>
                          <Badge variant="default" className="text-[8px] h-4">
                            Padrão
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                          <Lock className="h-3 w-3" /> Tokenizado · Criptografia AES-256
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/30 p-3.5 flex items-center gap-3 hover:border-border/60 transition-colors cursor-pointer">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                          <Lightning className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold">PIX</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            Pagamento instantâneo
                          </p>
                        </div>
                        <CaretRight className="h-3.5 w-3.5 text-muted-foreground/30" />
                      </div>
                      <div className="rounded-lg border border-border/30 p-3.5 flex items-center gap-3 hover:border-border/60 transition-colors cursor-pointer">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                          <Buildings className="h-4 w-4 text-muted-foreground/60" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold">Boleto bancário</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            Vencimento em 5 dias úteis
                          </p>
                        </div>
                        <CaretRight className="h-3.5 w-3.5 text-muted-foreground/30" />
                      </div>
                      <div className="rounded-lg border border-border/30 p-3.5 flex items-center gap-3 hover:border-border/60 transition-colors cursor-pointer opacity-60">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                          <Hexagon className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold">Cripto enterprise</p>
                          <p className="text-[10px] text-muted-foreground/60">
                            USDC · ETH · Em breve
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8 gap-1.5 mt-1"
                      >
                        <Plus className="h-3 w-3" /> Adicionar método
                      </Button>
                    </CardContent>
                  </Card>
                </section>
              </div>
            </div>

            {/* ─── Central de Consumo Neural IA ─── */}
            <section className="relative overflow-hidden rounded-md border border-border bg-card">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Robot className="h-4 w-4 text-primary" />
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                    Central de consumo neural
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <CircularProgress
                      value={Math.min(
                        100,
                        Math.round(
                          ((data?.usage?.ai_tokens_used ?? 0) / (plan.aiCreditsPerMonth || 100)) *
                            100,
                        ),
                      )}
                      max={100}
                      size={64}
                      label="Tokens utilizados"
                    />
                  </div>
                  <div className="text-center">
                    <CircularProgress
                      value={data?.usage?.simulations_run ?? 0}
                      max={Math.max(10, data?.usage?.simulations_run ?? 0)}
                      size={64}
                      color="#22c55e"
                      label="Processamentos IA"
                    />
                  </div>
                  <div className="text-center">
                    <CircularProgress
                      value={data?.usage?.storage_used_mb ?? 0}
                      max={Math.max(100, data?.usage?.storage_used_mb ?? 0)}
                      size={64}
                      color="#f59e0b"
                      label="Storage (MB)"
                    />
                  </div>
                  <div className="text-center">
                    <CircularProgress
                      value={data?.usage?.simulations_run ?? 0}
                      max={Math.max(10, data?.usage?.simulations_run ?? 0)}
                      size={64}
                      color="#8b5cf6"
                      label="Simulações"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
