import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowsClockwise, ShieldWarning, Warning } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getIsPlatformAdmin } from "@/lib/billing.functions";
import { getPlatformMonthlyMetrics } from "@/lib/platform-metrics.functions";
import { SUBSCRIPTION_PLANS, type PlanId } from "@/lib/plans";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/settings/platform-metrics")({
  head: () => ({ meta: [{ title: "Métricas da plataforma · EletricAI" }] }),
  component: PlatformMetricsPage,
});

const PERIODS = [3, 6, 12] as const;
const PLAN_ORDER: PlanId[] = ["free", "basic", "pro", "premium"];

function PlatformMetricsPage() {
  const { t, locale } = useI18n();
  const [months, setMonths] = useState<(typeof PERIODS)[number]>(6);
  const adminFn = useServerFn(getIsPlatformAdmin);
  const metricsFn = useServerFn(getPlatformMonthlyMetrics);

  const adminQ = useQuery({ queryKey: ["is-platform-admin"], queryFn: () => adminFn() });
  const isAdmin = adminQ.data?.isPlatformAdmin === true;
  const metricsQ = useQuery({
    queryKey: ["platform-metrics", months],
    queryFn: () => metricsFn({ data: { months } }),
    enabled: isAdmin,
  });

  const nf = new Intl.NumberFormat(locale);
  const brl = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" });

  if (adminQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t("platformMetrics.checking")}</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <ShieldWarning className="h-5 w-5 text-destructive" />
            <div>
              <div className="font-medium">{t("platformMetrics.restricted")}</div>
              <div className="text-sm text-muted-foreground">
                {t("platformMetrics.restrictedDesc")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const m = metricsQ.data;
  const unpriced = m?.months.some((r) => r.bomUnpricedItems > 0) ?? false;

  return (
    <div className="space-y-6 p-4 sm:p-6" data-testid="platform-metrics">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("platformMetrics.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("platformMetrics.desc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="pm-period">
            {t("platformMetrics.period")}
          </label>
          <select
            id="pm-period"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as (typeof PERIODS)[number])}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t("platformMetrics.months", { n: p })}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void metricsQ.refetch()}>
            <ArrowsClockwise className="mr-2 h-4 w-4" />
            {t("platformMetrics.reload")}
          </Button>
        </div>
      </header>

      {metricsQ.isLoading && (
        <p className="text-sm text-muted-foreground">{t("platformMetrics.loading")}</p>
      )}
      {metricsQ.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("platformMetrics.loadFailed")}
        </p>
      )}

      {m && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("platformMetrics.tenants")} value={nf.format(m.totals.tenants)} />
            <Kpi label={t("platformMetrics.users")} value={nf.format(m.totals.users)} />
            <Kpi label={t("platformMetrics.projects")} value={nf.format(m.totals.projects)} />
            <Kpi
              label={t("platformMetrics.mrr")}
              value={brl.format(m.estimatedMrrBrl)}
              hint={t("platformMetrics.mrrHint")}
            />
          </section>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t("platformMetrics.byPlan")}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLAN_ORDER.map((plan) => (
                  <div key={plan} className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">
                      {SUBSCRIPTION_PLANS[plan].name}
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {nf.format(m.tenantsByPlan[plan] ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("platformMetrics.testPlans")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t("platformMetrics.monthly")}</h2>
              {unpriced && (
                <p className="flex items-center gap-2 text-xs text-warning">
                  <Warning className="h-4 w-4" /> {t("platformMetrics.unpricedWarn")}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">{t("platformMetrics.colMonth")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colTenants")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colUsers")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colProjects")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colBomItems")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colBomValue")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colUnpriced")}</th>
                      <th className="py-2 pr-3 text-right">{t("platformMetrics.colAiCalls")}</th>
                      <th className="py-2 text-right">{t("platformMetrics.colAiCredits")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...m.months].reverse().map((r) => (
                      <tr key={r.month} className="border-b border-border/50 tabular-nums">
                        <td className="py-2 pr-3 font-mono">{r.month}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.newTenants)}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.newUsers)}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.newProjects)}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.bomItems)}</td>
                        <td className="py-2 pr-3 text-right">{brl.format(r.bomValueBrl)}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.bomUnpricedItems)}</td>
                        <td className="py-2 pr-3 text-right">{nf.format(r.aiCalls)}</td>
                        <td className="py-2 text-right">{nf.format(r.aiCredits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <section className="grid grid-cols-2 gap-3">
            <Kpi
              label={t("platformMetrics.catalog")}
              value={nf.format(m.totals.catalogComponents)}
            />
            <Kpi label={t("platformMetrics.iot")} value={nf.format(m.totals.iotDevices)} />
          </section>
          <p className="text-xs text-muted-foreground">
            {t("platformMetrics.generatedAt", { at: m.generatedAt.slice(0, 16).replace("T", " ") })}
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
