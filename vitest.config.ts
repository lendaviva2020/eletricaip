import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    environmentMatchGlobs: [
      ["src/__tests__/settings-store.test.tsx", "jsdom"],
      ["src/__tests__/settings-switches-ui.test.tsx", "jsdom"],
      ["src/__tests__/onboarding-tour.test.tsx", "jsdom"],
    ],
  },
});
