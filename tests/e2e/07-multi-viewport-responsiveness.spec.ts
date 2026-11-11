import { test, expect } from "@playwright/test";

const DEMO_ETE_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

test.describe("Phase 7: Multi-Viewport & Industrial Responsiveness Homologation", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  const viewports = [
    { name: "1280x720 (Standard HD)", width: 1280, height: 720 },
    { name: "1920x1080 (Full HD)", width: 1920, height: 1080 },
    { name: "1440x900 (Desktop Wide)", width: 1440, height: 900 },
    { name: "390x844 (Mobile Industrial)", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    test(`renders workspace and SCADA cleanly on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Check workspace
      await page.goto(`/workspace?projectId=${DEMO_ETE_PROJECT_ID}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1000);
      const workspaceBody = await page.locator("body").boundingBox();
      expect(workspaceBody).not.toBeNull();
      expect(workspaceBody!.width).toBe(vp.width);

      // Verify no critical crash overlay
      const errorOverlay = page.locator("vite-error-overlay");
      await expect(errorOverlay).toHaveCount(0);

      // 2. Check SCADA
      await page.goto(`/scada?projectId=${DEMO_ETE_PROJECT_ID}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const scadaBody = await page.locator("body").boundingBox();
      expect(scadaBody).not.toBeNull();
      expect(scadaBody!.width).toBe(vp.width);
      await expect(errorOverlay).toHaveCount(0);
    });
  }
});
