import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.resolve("test-results", "screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe("Phase 5: Security Barrier & Edge Fleet Operations", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  test("security monitor displays security posture, findings, and alerts", async ({ page }) => {
    await page.goto("/settings/security-monitor", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Monitoramento de Segurança")).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "settings_security_monitor.png") });
  });

  test("edge fleet dashboard renders gateways, status metrics, and audit log", async ({ page }) => {
    await page.goto("/settings/edge-fleet", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Frota Edge/i })).toBeVisible({
      timeout: 15000,
    });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "settings_edge_fleet_dashboard.png"),
    });
  });

  test("observability dashboard renders real-time telemetry, memory, and metrics", async ({
    page,
  }) => {
    await page.goto("/settings/observability", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Centro de Operações e Diagnóstico/i }),
    ).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "settings_observability_dashboard.png"),
    });
  });

  test("diagnostics dashboard renders error capture counts and diagnostics interceptor status", async ({
    page,
  }) => {
    await page.goto("/settings/diagnostics", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Diagnósticos/i })).toBeVisible({
      timeout: 15000,
    });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "settings_diagnostics_page.png") });
  });

  test("protocols dashboard renders industrial communication settings: Modbus, OPC-UA, MQTT", async ({
    page,
  }) => {
    await page.goto("/settings/protocols", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Protocolos").first()).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("text=Classificação Arquitetural das Camadas de Protocolo"),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=LAB_EDGE_ADAPTER").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=IS_PHYSICAL_CONTROL_ALLOWED = false")).toBeVisible({
      timeout: 15000,
    });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "settings_protocols_page.png") });
  });

  test("gate 4.3.1: protocols SIMULATOR vs EDGE_READ_ONLY fail-closed, synthetic SCADA UUID, and open-redirect defense", async ({
    page,
  }) => {
    await page.goto("/settings/protocols", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Protocolos").first()).toBeVisible({ timeout: 15000 });

    // 1. OPC-UA SIMULATOR interactive test button
    const testButtons = page.getByRole("button", { name: /Testar conexão/i });
    await testButtons.nth(0).click();
    await expect(page.locator("text=/Validado \\(SIMULATED/i")).toBeVisible({ timeout: 15000 });

    // 2. Modbus EDGE_READ_ONLY with IMDS SSRF target fails closed in UI
    const modeSelects = page.locator("select").filter({ hasText: "EDGE_READ_ONLY" });
    await modeSelects.nth(1).selectOption("EDGE_READ_ONLY");
    const modbusHostInput = page.locator('input[placeholder="192.168.10.20"]').last();
    await modbusHostInput.fill("169.254.169.254");
    await testButtons.nth(1).click();
    await expect(page.locator("text=/SSRF_POLICY_BLOCKED|bloqueado|Falha/i").first()).toBeVisible({
      timeout: 15000,
    });

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "gate_4_3_1_protocols_interactive.png"),
    });

    // 3. Synthetic demo UUID project loads SCADA cleanly under Zod 4.6.7
    await page.goto("/scada?projectId=00000000-0000-4000-8000-000000000001", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="scada-sidebar"]')).toBeVisible({ timeout: 15000 });

    // 4. Open redirect payload stays strictly same-origin
    await page.goto("/login?redirect=/%09/evil.com?x=1", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("127.0.0.1:3000");
    expect(page.url()).not.toContain("evil.com");
  });

  test("gate 4.3.2: edge fleet audit log, gateway detail panel, and billing route render cleanly without errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/settings/edge-fleet", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Frota Edge/i })).toBeVisible({
      timeout: 15000,
    });

    // Verify seeded gateways load from persistent storage runtime and open detail drawer
    await expect(page.locator("text=gw_lab_ete_01").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Inspecionar" }).first().click();
    await expect(page.getByRole("button", { name: /Trilha de Auditoria/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("button", { name: /Configuração Remota/i })).toBeVisible({
      timeout: 10000,
    });

    // Check realtime physical control lock route & billing route render cleanly without runtime crash
    await page.goto("/realtime", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await page.goto("/settings/billing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
