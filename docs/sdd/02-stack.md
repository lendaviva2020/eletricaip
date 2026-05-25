---
status: done
owner: equipe
last_review: 2026-05-25
---

# 02 · Stack Tecnológica

| Camada | Tecnologia | Nota |
|---|---|---|
| Framework | TanStack Start v1 (Vite 7) | SSR + server functions |
| UI | React 19 + TypeScript estrito | `strict: true` |
| Estilo | TailwindCSS v4 + CSS vars | `src/styles.css`, tema dark industrial |
| Roteamento | TanStack Router | File-based em `src/routes/` |
| Estado | Zustand | múltiplos stores, sem Redux |
| Servidor | TanStack Server Functions | runtime Cloudflare Workers (nodejs_compat) |
| Banco | Supabase Postgres + RLS + Realtime | ref `hcjkwqyxqxnbqikwltvc` |
| Auth | Supabase Auth + JWT Bearer | middleware `requireSupabaseAuth` |
| Canvas 2D | ReactFlow v11 | Unifilar legado, FBD |
| Canvas WebGL | Pixi.js v8 + pixi-viewport | `DiagramStage` (Unifilar novo) |
| Canvas 3D | Three.js + @react-three/fiber + drei | Digital Twin |
| Canvas SCADA | React Konva | Widgets HMI |
| IA | DeepSeek Chat API (tool-calling) | `deepseek-chat` |
| Billing | Stripe + MercadoPago | webhooks em `api/public/` |
| Protocolos | OPC-UA (sim) + Modbus TCP (`net`) | server functions |
| Query | `@tanstack/react-query` v5 | padrão `ensureQueryData` + `useSuspenseQuery` |
| Validação | Zod | schemas compartilhados |
| Notificações | Sonner + Zustand + Supabase Realtime | — |
| Export | jsPDF + DXF builder custom | — |

## Restrições do runtime servidor

Cloudflare Workers com `nodejs_compat`. **Não usar** `child_process`, `sharp`, `canvas`, `puppeteer`, `fs.watch`, `os.cpus()`. **Safe**: `fs`, `path`, `crypto`, `Buffer`, `stream`, `net`, `http`, `https`, `zlib`.

## Gaps

Nenhum nesta camada.
