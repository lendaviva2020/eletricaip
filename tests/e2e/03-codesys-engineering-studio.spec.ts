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

test.describe("Phase 3: CODESYS Functional Parity Engineering Studio E2E", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  test("opens Studio IEC mode and verifies CODESYS parity interface and security lock", async ({
    page,
  }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    // Click Studio IEC mode tab
    const studioTab = page
      .locator('button[data-tour="mode-studio"], button:has-text("Studio IEC")')
      .first();
    await expect(studioTab).toBeVisible({ timeout: 15000 });
    await studioTab.click();

    // Verify Studio header title
    await expect(page.locator("text=CODESYS PARITY STUDIO")).toBeVisible({ timeout: 10000 });

    // Verify physical control lock badge
    const securityLock = page.locator("text=PHYSICAL CONTROL LOCK: ACTIVE");
    await expect(securityLock).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "studio_header_and_security_lock.png"),
    });
  });

  test("loads sample station, compiles IEC project, and validates integrity", async ({ page }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    const studioTab = page
      .locator('button[data-tour="mode-studio"], button:has-text("Studio IEC")')
      .first();
    await studioTab.click();

    // 1. Click "Carregar Estação Exemplo"
    const loadSampleBtn = page.locator('button:has-text("Carregar Estação Exemplo")');
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();
    await page.waitForTimeout(500);

    // 2. Click "Build All (Compilar IEC)"
    const buildBtn = page.locator('button:has-text("Build All")');
    await expect(buildBtn).toBeVisible();
    await buildBtn.click();
    await page.waitForTimeout(1000);

    // Check bottom dock build output
    const buildTabActive = page
      .locator('button:has-text("Build"), div:has-text("Compilação")')
      .first();
    await expect(buildTabActive).toBeVisible();

    // 3. Click "Validar Integridade"
    const integrityBtn = page.locator('button:has-text("Validar Integridade")');
    await expect(integrityBtn).toBeVisible();
    await integrityBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_build_and_integrity.png") });
  });

  test("switches across all studio navigation tabs: Device Tree, HMI, Safety, Motion", async ({
    page,
  }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    const studioTab = page
      .locator('button[data-tour="mode-studio"], button:has-text("Studio IEC")')
      .first();
    await studioTab.click();

    // Device Tree tab (Rack & E/S)
    const deviceTreeTab = page.locator('button:has-text("Rack & E/S")');
    if (await deviceTreeTab.isVisible()) {
      await deviceTreeTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_tab_device_tree.png") });
    }

    // HMI View tab
    const hmiTab = page.locator('button:has-text("IHM Operacional")');
    if (await hmiTab.isVisible()) {
      await hmiTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_tab_hmi_view.png") });
    }

    // Safety Panel tab
    const safetyTab = page.locator('button:has-text("Safety & Interlocks")');
    if (await safetyTab.isVisible()) {
      await safetyTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_tab_safety_panel.png") });
    }

    // Motion Panel tab
    const motionTab = page.locator('button:has-text("Motion & CNC")');
    if (await motionTab.isVisible()) {
      await motionTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_tab_motion_panel.png") });
    }
  });

  test("runs deterministic simulation, steps scan cycle, and checks barrier in simulation monitor", async ({
    page,
  }) => {
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    const studioTab = page
      .locator('button[data-tour="mode-studio"], button:has-text("Studio IEC")')
      .first();
    await expect(studioTab).toBeVisible({ timeout: 15000 });
    await studioTab.click();

    // Wait for Studio header to ensure EngineeringStudio component is mounted
    await expect(page.locator("text=CODESYS PARITY STUDIO")).toBeVisible({ timeout: 15000 });

    // Select "Simulador & Forcing" bottom dock tab
    const simTab = page.locator('button:has-text("Simulador & Forcing")').first();
    await expect(simTab).toBeVisible({ timeout: 5000 });
    await simTab.click();

    // Verify active barrier notice
    const barrier = page.locator("text=BARREIRA ATIVA: IS_PHYSICAL_CONTROL_ALLOWED: FALSE");
    await expect(barrier).toBeVisible({ timeout: 5000 });

    // Step cycle button
    const stepBtn = page.locator('button:has-text("Passo")');
    if (await stepBtn.isVisible()) {
      await stepBtn.click();
      await page.waitForTimeout(300);
      await stepBtn.click();
      await page.waitForTimeout(300);
    }

    // Play / Run simulation
    const playBtn = page.locator('button:has-text("Executar Simulação")');
    if (await playBtn.isVisible()) {
      await playBtn.click();
      await page.waitForTimeout(1000);

      // Pause simulation
      const pauseBtn = page.locator('button:has-text("Pausar")');
      if (await pauseBtn.isVisible()) {
        await pauseBtn.click();
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "studio_simulation_monitor.png") });
  });
});
