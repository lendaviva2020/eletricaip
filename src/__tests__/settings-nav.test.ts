import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settingsSrc = readFileSync(
  resolve(__dirname, "../routes/settings.tsx"),
  "utf8",
);
const routeTreeSrc = readFileSync(
  resolve(__dirname, "../routeTree.gen.ts"),
  "utf8",
);

// Extract every `to="..."` declared by SettingsLinkCard / Link usage.
function extractToTargets(src: string): string[] {
  const re = /\bto=\{?["']([^"']+)["']\}?/g;
  const out = new Set<string>();
  for (const m of src.matchAll(re)) out.add(m[1]);
  return [...out];
}

const REGISTERED_ROUTES = new Set(
  Array.from(routeTreeSrc.matchAll(/'(\/[^']*)'/g)).map((m) => m[1]),
);

describe("Settings page navigation", () => {
  const targets = extractToTargets(settingsSrc);

  it("declares at least the documented set of cards", () => {
    // sanity: catches accidental removal of major sections
    expect(targets.length).toBeGreaterThanOrEqual(13);
  });

  it.each(extractToTargets(settingsSrc))(
    "links to a registered route: %s",
    (target) => {
      expect(REGISTERED_ROUTES.has(target)).toBe(true);
    },
  );

  it("gates the billing card behind isPlatformAdmin", () => {
    // The billing card must be inside an `isPlatformAdmin && (...)` block.
    const billingIdx = settingsSrc.indexOf('to="/settings/billing"');
    expect(billingIdx).toBeGreaterThan(-1);
    const before = settingsSrc.slice(0, billingIdx);
    const lastGuard = before.lastIndexOf("isPlatformAdmin &&");
    const lastClose = before.lastIndexOf(")}");
    expect(lastGuard).toBeGreaterThan(lastClose);
  });

  it("gates the rate-limits card behind isPlatformAdmin", () => {
    const rlIdx = settingsSrc.indexOf('to="/settings/rate-limits"');
    expect(rlIdx).toBeGreaterThan(-1);
    const before = settingsSrc.slice(0, rlIdx);
    const lastGuard = before.lastIndexOf("isPlatformAdmin &&");
    const lastClose = before.lastIndexOf(")}");
    expect(lastGuard).toBeGreaterThan(lastClose);
  });

  it("does not gate non-admin cards (profile, security, team) behind admin", () => {
    for (const path of ["/settings/profile", "/settings/security", "/settings/team"]) {
      const idx = settingsSrc.indexOf(`to="${path}"`);
      expect(idx).toBeGreaterThan(-1);
      const before = settingsSrc.slice(0, idx);
      // either no guard, or the guard was already closed before this card
      const lastGuard = before.lastIndexOf("isPlatformAdmin &&");
      const lastClose = before.lastIndexOf(")}");
      expect(lastGuard).toBeLessThan(lastClose);
    }
  });

  it("computes isIndex correctly so the Outlet renders sub-routes", () => {
    expect(settingsSrc).toMatch(/if\s*\(!isIndex\)\s*return\s*<Outlet\s*\/?>/);
    expect(settingsSrc).toMatch(/routeId === "\/settings"/);
  });

  it("wires protocol/norma switches to the tenant store toggles", () => {
    expect(settingsSrc).toMatch(/onCheckedChange=\{\(\) => toggleProtocol\(p\.name\)\}/);
    expect(settingsSrc).toMatch(/onCheckedChange=\{\(\) => toggleNorma\(n\.name\)\}/);
  });
});
