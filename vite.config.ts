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
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // ── 3D / Three.js (lazy, só carrega na rota Digital Twin) ──
            if (
              id.includes("/three/") ||
              id.includes("@react-three") ||
              id.includes("camera-controls") ||
              id.includes("troika-") ||
              id.includes("leva")
            )
              return "vendor-3d";

            // ── Konva / Canvas 2D ──
            if (id.includes("/konva/") || id.includes("react-konva")) {
              return "vendor-konva";
            }

            // ── React Flow / XY Flow ──
            if (id.includes("reactflow") || id.includes("@xyflow")) {
              return "vendor-reactflow";
            }

            // ── Charts / D3 ──
            if (
              id.includes("recharts") ||
              id.includes("/d3") ||
              id.includes("d3-") ||
              id.includes("victory")
            )
              return "vendor-charts";

            // ── Supabase ──
            if (id.includes("@supabase")) return "vendor-supabase";

            // ── Radix UI ──
            if (id.includes("@radix-ui")) return "vendor-radix";

            // ── Lucide icons ──
            if (id.includes("lucide-react")) return "vendor-icons";

            // ── TanStack ──
            if (id.includes("@tanstack")) return "vendor-tanstack";

            // ── React core APENAS ──
            if (
              id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/scheduler/")
            )
              return "vendor-react";

            // ── Utilitários leves ──
            if (
              id.includes("date-fns") ||
              id.includes("/clsx/") ||
              id.includes("/zod/") ||
              id.includes("class-variance-authority") ||
              id.includes("tailwind-merge") ||
              id.includes("/cmdk/")
            )
              return "vendor-utils";

            // ── i18n ──
            if (id.includes("i18next") || id.includes("react-i18next")) {
              return "vendor-i18n";
            }

            // ── Restante do node_modules: dividido por letra inicial ──
            if (id.includes("node_modules")) {
              const match = id.match(/node_modules\/(?:@([^/]+)\/([^/]+)|([^/]+))/);
              if (match) {
                const pkg = match[1] ? `${match[1]}-${match[2]}` : match[3];
                const prefix = pkg.charAt(0).toLowerCase();
                if ("abcd".includes(prefix)) return "vendor-libs-abcd";
                if ("efgh".includes(prefix)) return "vendor-libs-efgh";
                if ("ijkl".includes(prefix)) return "vendor-libs-ijkl";
                if ("mnop".includes(prefix)) return "vendor-libs-mnop";
                if ("qrst".includes(prefix)) return "vendor-libs-qrst";
                return "vendor-libs-uvwxyz";
              }
            }
            return undefined;
          },
        },
      },
    },
  },
});
