import { test, expect } from "@playwright/test";

const TEST_PROJECT_ID = "00000000-0000-4000-a000-000000000002";

const VIEWPORTS = [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "desktop-1600x900", width: 1600, height: 900 },
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1366x768", width: 1366, height: 768 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

test.describe("P0 Workspace Reconstruction, Responsiveness, Zoom & Zero Digital Twin", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      localStorage.setItem("eletricai.dev-auth-bypass", "true");
      localStorage.setItem(
        "eletricai-theme",
        JSON.stringify({ state: { theme: "dark" }, version: 0 }),
      );
    });
  });

  test("rota /digital-twin não existe mais no roteador da aplicação", async ({ page }) => {
    await page.goto("/digital-twin", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=404")).toBeVisible({ timeout: 10000 });
  });

  for (const vp of VIEWPORTS) {
    test(`layout responsivo sem overflow e navegação acessível em ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

      const envBtn = page.getByTestId("environments-menu-btn");
      await expect(envBtn).toBeVisible({ timeout: 15000 });

      const scrollTabs = page.getByTestId("mode-tabs-scroll");
      await expect(scrollTabs).toBeVisible();

      // Nenhum overflow horizontal indesejado na raiz do documento
      const docOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      expect(docOverflow).toBe(false);

      // Menu AMBIENTES DE ENGENHARIA funciona e não lista Digital Twin
      await envBtn.click();
      const popover = page.getByTestId("environments-menu-popover");
      await expect(popover).toBeVisible();
      const popoverText = (await popover.textContent()) ?? "";
      expect(popoverText.toLowerCase()).not.toContain("digital twin");
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
    });
  }

  test("controles de Zoom/Fit-to-View e Modo Foco (Ctrl+Shift+F) funcionam sem ocultar canvas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/workspace?projectId=${TEST_PROJECT_ID}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("canvas-zoom-percent")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("canvas-fit-all")).toBeVisible();
    await expect(page.getByTestId("canvas-fit-selection")).toBeVisible();
    await expect(page.getByTestId("canvas-fit-network")).toBeVisible();
    await expect(page.getByTestId("canvas-auto-zoom")).toBeVisible();

    const dock = page.getByTestId("unified-bottom-dock");
    await expect(dock).toBeVisible();

    // Ativa Modo Foco via atalho Ctrl+Shift+F
    await page.keyboard.press("Control+Shift+f");
    await expect(dock).toBeHidden();
    await expect(page.getByTestId("focus-mode-toggle")).toHaveAttribute("aria-pressed", "true");

    // Sai do Modo Foco
    await page.keyboard.press("Control+Shift+f");
    await expect(dock).toBeVisible();
    await expect(page.getByTestId("focus-mode-toggle")).toHaveAttribute("aria-pressed", "false");
  });
});
