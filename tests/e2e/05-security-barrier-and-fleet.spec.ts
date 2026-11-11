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

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "settings_protocols_page.png") });
  });
});
