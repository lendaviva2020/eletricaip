import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environmentMatchGlobs: [
      ["src/__tests__/settings-store.test.tsx", "jsdom"],
      ["src/__tests__/settings-switches-ui.test.tsx", "jsdom"],
      ["src/__tests__/onboarding-tour.test.tsx", "jsdom"],
    ],
  },
});
