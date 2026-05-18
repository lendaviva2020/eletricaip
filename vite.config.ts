// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Carrega as variáveis do .env e mescla no process.env para garantir que o Vinxi e o Vite as vejam
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, env);

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("reactflow")) return "vendor-reactflow";
            if (id.includes("konva") || id.includes("react-konva")) return "vendor-konva";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@tanstack") || id.includes("react") || id.includes("scheduler")) {
              return "vendor-react";
            }
            return undefined;
          },
        },
      },
    },
  },
});
