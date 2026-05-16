// Dual-target build: SPA puro para Vercel, sem Cloudflare/Workers/TanStack SSR.
// Usado por `npm run build:vercel` (configurado no vercel.json).
// O fluxo Lovable continua usando vite.config.ts (Cloudflare Workers + TanStack Start SSR).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("reactflow")) return "vendor-reactflow";
          if (id.includes("konva") || id.includes("react-konva")) return "vendor-konva";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("sonner")) {
            return "vendor-ui";
          }
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
});
