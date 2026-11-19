import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformMetricsSchema, estimateMrrBrl } from "@/lib/platform-metrics.functions";
import { SUBSCRIPTION_PLANS } from "@/lib/plans";

const MIG = resolve(__dirname, "../../supabase/migrations");
const read = (f: string) => readFileSync(resolve(MIG, f), "utf8");

describe("métricas da plataforma — regras", () => {
  it("MRR usa o preço de tabela e ignora planos desconhecidos", () => {
    expect(estimateMrrBrl({ free: 10, basic: 2, pro: 1, premium: 1, legado: 99 })).toBe(
      2 * SUBSCRIPTION_PLANS.basic.priceBRL +
        SUBSCRIPTION_PLANS.pro.priceBRL +
        SUBSCRIPTION_PLANS.premium.priceBRL,
    );
    expect(estimateMrrBrl({})).toBe(0);
  });

  it("schema aceita a resposta real da RPC e rejeita valores negativos (fail-closed)", () => {
    const ok = {
      generatedAt: "2026-11-16T06:16:37.191825",
      months: [
        {
          month: "2026-11",
          newTenants: 0,
          newUsers: 0,
          newProjects: 4,
          bomItems: 0,
          bomQuantity: 0,
          bomValueBrl: 0,
          bomUnpricedItems: 0,
          aiCalls: 0,
          aiCredits: 0,
        },
      ],
      tenantsByPlan: { free: 1, premium: 2 },
      totals: {
        tenants: 3,
        users: 3,
        projects: 5,
        bomItems: 0,
        catalogComponents: 0,
        iotDevices: 0,
      },
    };
    expect(PlatformMetricsSchema.safeParse(ok).success).toBe(true);
    const bad = structuredClone(ok);
    bad.months[0].newProjects = -1;
    expect(PlatformMetricsSchema.safeParse(bad).success).toBe(false);
  });

  it("servidor confere is_platform_admin com o token do usuário ANTES da service role", () => {
    const src = readFileSync(resolve(__dirname, "../lib/platform-metrics.functions.ts"), "utf8");
    const check = src.indexOf('context.supabase.rpc("is_platform_admin")');
    const admin = src.indexOf("client.server");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(admin);
    expect(src).toContain("requireSupabaseAuth");
  });

  it("RPC de métricas só é executável pela service role e não devolve PII", () => {
    const sql = read("20261116100000_platform_monthly_metrics.sql");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.platform_monthly_metrics\(integer\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.platform_monthly_metrics\(integer\) TO service_role/,
    );
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).not.toMatch(/email|full_name|\bslug\b|stripe_customer_id/i);
  });
});

describe("banco — correções da auditoria 2026-11-16", () => {
  it("tenants: cliente não grava plano, status de assinatura nem ids Stripe", () => {
    const sql = read("20261116091000_fix_tenant_billing_columns_and_owner_demotion.sql");
    expect(sql).toContain("REVOKE UPDATE ON public.tenants FROM authenticated, anon;");
    const grant = /GRANT UPDATE \(([^)]+)\) ON public\.tenants TO authenticated/.exec(sql);
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    for (const forbidden of [
      "plan",
      "subscription_status",
      "stripe_customer_id",
      "stripe_subscription_id",
      "status",
    ]) {
      expect(cols).not.toContain(forbidden);
    }
  });

  it("tenant_memberships: USING do UPDATE protege a linha do owner", () => {
    const sql = read("20261116091000_fix_tenant_billing_columns_and_owner_demotion.sql");
    const using = sql.slice(sql.indexOf("USING ("), sql.indexOf("WITH CHECK ("));
    expect(using).toMatch(/role <> 'owner'/);
    expect(using).toMatch(/m2\.role = 'owner'/);
  });

  it("funções de trigger e ingest IoT não são RPC; anon perde funções que exigem login", () => {
    const sql = read("20261116090000_harden_function_grants.sql");
    for (const fn of [
      "update_updated_at_column()",
      "rls_auto_enable()",
      "notify_schema_change()",
      "ingest_iot_reading(text, text, double precision, text, text, integer)",
    ]) {
      expect(sql).toContain(`'public.${fn}'`);
    }
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    for (const fn of ["consume_ai_credits(text)", "get_user_role()", "iot_enqueue_command("]) {
      expect(sql).toContain(`'public.${fn}`);
    }
  });

  it("ingest IoT continua chamado só pelo servidor com service role", () => {
    const src = readFileSync(resolve(__dirname, "../routes/api/public/iot.ingest.ts"), "utf8");
    expect(src).toContain('supabaseAdmin.rpc("ingest_iot_reading"');
  });

  it("plan_limits espelha os planos anunciados (planos v2: usuários, IoT, IA)", () => {
    const sql = read("20261116150000_plans_v2_iot_limits_expiry.sql");
    const row = (plan: string) => {
      const m = new RegExp(
        `\\('${plan}',\\s*(-?\\d+),\\s*(-?\\d+),\\s*(-?\\d+),\\s*(-?\\d+),\\s*(-?\\d+),`,
      ).exec(sql);
      expect(m, plan).not.toBeNull();
      return {
        maxProjects: Number(m![1]),
        aiCredits: Number(m![2]),
        maxUsers: Number(m![4]),
        maxIot: Number(m![5]),
      };
    };
    for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
      const r = row(plan.id);
      expect(r.maxProjects, plan.id).toBe(plan.maxProjects);
      expect(r.aiCredits, plan.id).toBe(plan.aiCreditsPerMonth ?? -1);
      expect(r.maxUsers, plan.id).toBe(plan.maxUsers);
      expect(r.maxIot, plan.id).toBe(plan.maxIotDevices);
    }
    expect(sql).toMatch(/'pro'.*"realtime"/);
    expect(sql).not.toMatch(/'free'.*"realtime"/);
    expect(sql).not.toMatch(/'basic'.*"realtime"/);
  });

  it("toda operação de IA usada no código tem custo cadastrado", () => {
    const seeded = read("20261116101000_seed_plan_limits_and_ai_costs.sql");
    const known = new Set([
      "generate_single_line",
      "generate_panel",
      "generate_digital_twin",
      "analyze_safety",
      "suggest_optimization",
    ]);
    for (const m of seeded.matchAll(/\('([a-z_]+)', \d+, '/g)) known.add(m[1]);
    const files = [
      "../lib/diagram/ai.functions.ts",
      "../lib/ai-architect.functions.ts",
      "../lib/diagnostics/ai-fix.functions.ts",
      // Edge Functions de IA removidas no pentest 2026-11-19 (operações agora via server).
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      for (const m of src.matchAll(/p_operation:\s*"([a-z_]+)"/g)) {
        expect(known.has(m[1]), `${f}: ${m[1]}`).toBe(true);
      }
    }
  });

  it("check_ai_quota trata plano ilimitado (-1)", () => {
    const sql = read("20261116102000_fix_check_ai_quota_unlimited.sql");
    expect(sql).toContain("(v_max < 0 OR v_used < v_max)");
  });

  it("nenhuma migration nova concede privilégio por e-mail fixo", () => {
    for (const f of readdirSync(MIG).filter((x) => x >= "20261115")) {
      expect(read(f), f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    }
  });
});

describe("banco — desempenho (advisors 0001/0003/0004)", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261116110000_perf_rls_initplan_fk_indexes.sql"),
    "utf8",
  );

  it("envolve auth.*() em SELECT sem duplicar envoltório já existente (idempotente)", () => {
    expect(sql).toContain("(?<!SELECT )auth\\.(uid|jwt|role|email)\\(\\)");
    expect(sql).toContain("'(SELECT auth.\\1())'");
    // só reescreve a expressão: não recria policy (preserva roles/comando/permissive)
    expect(sql).toContain("ALTER POLICY %I ON %I.%I");
    expect(sql).not.toMatch(/DROP POLICY|CREATE POLICY/);
  });

  it("índices de FK com IF NOT EXISTS e PKs só por índice único existente ou sem duplicatas", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
    expect(sql).toContain("PRIMARY KEY USING INDEX uq_mp_webhook_processed_payment_id");
    expect(sql).toContain("PRIMARY KEY USING INDEX uq_stripe_webhook_events_event_id");
    expect(sql).toMatch(/GROUP BY tag_id HAVING count\(\*\) > 1/);
    expect(sql).not.toMatch(/DROP INDEX/);
  });
});
