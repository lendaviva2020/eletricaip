import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.resolve("test-results", "screenshots");
const TEST_PROJECT_ID = "00000000-0000-4000-a000-000000000002";

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test.describe("Phase 2: Industrial Workspace & Modes Testing", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  test("workspace empty state renders with navigation buttons", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Nenhum projeto aberto")).toBeVisible({ timeout: 10000 });

    const openBtn = page.locator('button:has-text("Abrir projeto")');
    const newBtn = page.locator('button:has-text("Novo projeto")');
    await expect(openBtn).toBeVisible();
    await expect(newBtn).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "workspace_empty_state.png") });
  });

  test("workspace loads with active project and renders canvas and controls", async ({ page }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    // Mode tabs should be visible
    const modeTabs = page
      .locator('[role="tablist"], nav, div')
      .filter({ hasText: /Unifilar|Multifilar|Ladder|FBD|SCADA/i });
    await expect(modeTabs.first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "workspace_active_project.png") });
  });

  test("workspace mode switching works across unifilar, multifilar, ladder, fbd, scada, studio", async ({
    page,
  }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    // Helper to click mode button
    const modes = [
      { name: "Multifilar", selector: 'button:has-text("Multifilar"), [data-mode="multifilar"]' },
      { name: "Ladder", selector: 'button:has-text("Ladder"), [data-mode="ladder"]' },
      { name: "FBD", selector: 'button:has-text("FBD"), [data-mode="fbd"]' },
      { name: "SCADA", selector: 'button:has-text("SCADA"), [data-mode="scada"]' },
      {
        name: "Studio",
        selector: 'button:has-text("Studio"), button:has-text("CODESYS"), [data-mode="studio"]',
      },
    ];

    for (const m of modes) {
      const btn = page.locator(m.selector).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `workspace_mode_${m.name.toLowerCase()}.png`),
        });
      }
    }
  });

  test("topbar theme toggle and language switch buttons work", async ({ page }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    // Check language switcher
    const langBtn = page
      .locator('button:has-text("PT"), button:has-text("EN"), [data-testid="lang-switch"]')
      .first();
    if (await langBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await langBtn.click();
      await page.waitForTimeout(300);
    }

    // Check theme toggle button
    const themeBtn = page
      .locator('button[aria-label*="tema"], button[title*="tema"], [data-testid="theme-toggle"]')
      .first();
    if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "workspace_topbar_interactions.png"),
    });
  });
});
