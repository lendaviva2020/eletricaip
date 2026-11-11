import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.resolve("test-results", "screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

const routesToTest = [
  { path: "/", title: "ElétricAi", expectedText: "ElétricAi" },
  { path: "/workspace", title: "Industrial Workspace", expectedText: "Workspace" },
  { path: "/dashboard", title: "Dashboard", expectedText: "Dashboard" },
  { path: "/projects", title: "Projetos", expectedText: "Projeto" },
  { path: "/scada", title: "SCADA", expectedText: "SCADA" },
  { path: "/digital-twin", title: "Digital Twin", expectedText: "Twin" },
  { path: "/analytics", title: "Analytics", expectedText: "Analytics" },
  { path: "/catalog", title: "Catálogo", expectedText: "Catálogo" },
  { path: "/clients", title: "Clientes", expectedText: "Clientes" },
  { path: "/chat", title: "Chat", expectedText: "Chat" },
  { path: "/settings", title: "Configurações", expectedText: "Configurações" },
  { path: "/settings/security", title: "Segurança", expectedText: "Segurança" },
  { path: "/settings/edge-fleet", title: "Edge Fleet", expectedText: "Fleet" },
  { path: "/settings/observability", title: "Observabilidade", expectedText: "Observabilidade" },
  { path: "/settings/diagnostics", title: "Diagnóstico", expectedText: "Diagnóstico" },
  { path: "/settings/protocols", title: "Protocolos", expectedText: "Protocolo" },
  { path: "/privacidade", title: "Privacidade", expectedText: "Privacidade" },
  { path: "/termos", title: "Termos", expectedText: "Termos" },
  { path: "/login", title: "Login", expectedText: "Entrar" },
];

test.describe("Phase 1: Full Application Route Inventory & Navigation", () => {
  for (const route of routesToTest) {
    test(`route ${route.path} loads cleanly without critical errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      page.on("pageerror", (err) => {
        consoleErrors.push(err.message);
      });

      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      expect(response?.status()).toBeLessThan(400);

      // Verify page is rendered and interactive
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();

      const safeName = route.path.replace(/\//g, "_").replace(/^_/, "") || "root";
      const screenshotPath = path.join(SCREENSHOTS_DIR, `route_${safeName}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Ensure no fatal React error boundaries or unhandled exceptions blew up the page
      const hasFatalCrash =
        bodyText?.includes("Algo deu errado") || bodyText?.includes("Unhandled Runtime Error");
      expect(hasFatalCrash).toBeFalsy();
    });
  }
});
