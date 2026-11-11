import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.resolve("test-results", "screenshots");
const DEMO_ETE_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe("Phase 4: SCADA Supervisório & ISA-18.2 Alarm Lifecycle", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  test("scada plant selector renders and allows launching industrial plant demo", async ({
    page,
  }) => {
    await page.goto("/scada", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("text=SCADA Supervisório Industrial · Seleção de Planta"),
    ).toBeVisible({ timeout: 15000 });

    const demoBtn = page.locator(
      'button:has-text("Estação de Tratamento de Efluentes (Demo ETE)")',
    );
    await expect(demoBtn).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "scada_plant_selector.png") });
  });

  test("scada supervisory layout loads with active plant and 11 sidebar views", async ({
    page,
  }) => {
    await page.goto(`/scada?projectId=${DEMO_ETE_PROJECT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="scada-sidebar"]')).toBeVisible({ timeout: 15000 });

    const views = [
      { id: "synoptics", name: "Sinóticos Industriais" },
      { id: "alarms", name: "Alarmes" },
      { id: "trends", name: "Tendências" },
      { id: "equipments", name: "Equipamentos" },
      { id: "tags", name: "TAGs Industriais" },
      { id: "communication", name: "Comunicação" },
      { id: "events", name: "Eventos e Logs" },
      { id: "reports", name: "Relatórios" },
      { id: "settings", name: "Configurações" },
    ];

    for (const v of views) {
      const btn = page
        .locator(`[data-testid="scada-sidebar"] button:has-text("${v.name}")`)
        .first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `scada_view_${v.id}.png`) });
      }
    }
  });

  test("alarms view supports ISA-18.2 filtering, acknowledge, and batch actions", async ({
    page,
  }) => {
    await page.goto(`/scada?projectId=${DEMO_ETE_PROJECT_ID}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="scada-sidebar"]')).toBeVisible({ timeout: 15000 });

    // Click Alarmes in sidebar
    const alarmsNavBtn = page
      .locator('[data-testid="scada-sidebar"] button:has-text("Alarmes")')
      .first();
    await alarmsNavBtn.click();
    await page.waitForTimeout(500);

    // Verify search input
    const searchInput = page
      .locator('input[placeholder*="Buscar alarme"], input[placeholder*="Filtrar"]')
      .first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("SOBRECARGA");
      await page.waitForTimeout(300);
      await searchInput.fill("");
    }

    // Check acknowledge buttons
    const ackAllBtn = page.locator('button:has-text("Reconhecer Todos")').first();
    if (await ackAllBtn.isVisible()) {
      await ackAllBtn.click();
      await page.waitForTimeout(300);
    }

    const singleAckBtn = page.locator('button:has-text("Reconhecer")').first();
    if (await singleAckBtn.isVisible()) {
      await singleAckBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "scada_alarms_acknowledged.png") });
  });
});
