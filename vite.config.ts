// @lovable.dev/vite-tanstack-config already includes the TanStack Start, React,
// Tailwind and path-alias plugins. Nitro is pinned to Vercel so external CI
// produces the Build Output API structure expected by the platform.
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Carrega as variáveis do .env e mescla no process.env para garantir que o Vinxi e o Vite as vejam
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (
              id.includes("three") ||
              id.includes("@react-three") ||
              id.includes("camera-controls")
            ) {
              return "vendor-3d";
            }
            if (id.includes("konva")) return "vendor-konva";
            if (id.includes("reactflow") || id.includes("@xyflow")) return "vendor-reactflow";
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) {
              return "vendor-charts";
            }
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
              return "vendor-react";
            }
            if (id.includes("@tanstack")) return "vendor-tanstack";
            if (id.includes("node_modules")) return "vendor-misc";
            return undefined;
          },
        },
      },
    },
  },
});
