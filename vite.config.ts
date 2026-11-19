// Configuração de build própria do ElectricAI (sem dependências de terceiros).
// Compõe o stack do TanStack Start diretamente: Tailwind v4, path-alias por
// tsconfig, TanStack Start (com proteção de import servidor→cliente), Nitro
// (preset Vercel, só no build) e o plugin React.
//
// IMPORTANTE: NÃO usar `onlyExplicitManualChunks: true`. Ele altera a ordem de
// inicialização dos chunks e expõe uma dependência circular interna do Pixi como
// TDZ no bundle minificado de produção ("Cannot access 'Tt' before
// initialization" em vendor-pixi), derrubando o canvas do unifilar. Também não
// fazer manualChunks de React/@tanstack: separar esses chunks quebra a ordem de
// avaliação no SSR streaming. Só isolamos libs pesadas por rota (canvas, 3D,
// charts). O chunking padrão do Rollup resolve a ordem dos ciclos corretamente.
import { defineConfig, loadEnv, mergeConfig, type PluginOption } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Expõe todas as variáveis de ambiente (não só VITE_*) no process.env durante o
// build/prerender, como o fluxo anterior fazia.
const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, env);

// Proteção de import: código em **/server/** (ou marcado "server-only") nunca
// pode ser puxado para o bundle do cliente.
const tanstackStartOptions = mergeConfig(
  {
    importProtection: {
      behavior: "error",
      client: {
        files: ["**/server/**"],
        specifiers: ["server-only"],
      },
    },
  },
  { server: { entry: "server" } },
);

function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  // Konva — canvases gráficos
  if (id.includes("/konva/") || id.includes("react-konva")) return "vendor-konva";
  // PixiJS / viewport
  if (id.includes("/pixi.js") || id.includes("pixi-viewport")) return "vendor-pixi";
  // React Flow
  if (id.includes("reactflow") || id.includes("@xyflow")) return "vendor-reactflow";
  // Recharts / D3
  if (id.includes("recharts") || id.includes("/d3-")) return "vendor-charts";
  // Monaco editor — só páginas de código (workers ficam em chunks próprios)
  if (id.includes("monaco-editor") && !id.includes(".worker") && !id.includes("?worker")) {
    return "vendor-monaco";
  }
  // jsPDF
  if (id.includes("jspdf")) return "vendor-pdf";
  return undefined;
}

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(tanstackStartOptions),
  ];

  // Nitro (deploy) só participa do build — no dev o próprio TanStack Start serve.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "vercel" }));
  }

  plugins.push(viteReact());

  return {
    plugins,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        external: [/^cloudflare:/, "cloudflare:workers"],
        output: { manualChunks },
      },
    },
  };
});
