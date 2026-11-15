# 12 — Desempenho e Estabilidade

Medições reais deste ciclo (únicas disponíveis; não há outras métricas inventadas):

| Medição | Valor | Fonte |
|---|---|---|
| `tsc --noEmit` | 33,9 s | `test-out/typecheck.txt` |
| `eslint .` | 26,0 s | `test-out/lint.txt` |
| `vitest run` (165 arquivos, 1.372 testes) | 64,7 s | `test-out/vitest.txt` |
| Build existente `.vercel/output` | 669 arquivos, 0 source maps | listagem |
| Binários do edge daemon | ~81-86 MB cada (linux-x64, linux-arm64, win) | `dist-edge/` |

Observações estáticas:
- `vite.config.ts` define vendor chunks para Konva, Pixi, ReactFlow, Recharts, Monaco e jsPDF; `chunkSizeWarningLimit: 900`.
- O FBD declara virtualização acima de 1.000 blocos (commit `94a2e25`): NOT_VERIFIED.
- Tempo de abertura do workspace e de projetos, memória, listeners e WebSockets: **NOT_VERIFIED** (navegação no browser não executada neste ciclo).

## Ciclo 3: medições no dev server (Vite 7.3.7, primeira compilação; não representam produção)

| Rota (SSR, fetch) | Tempo |
|---|---|
| `/` | 85 ms |
| `/dashboard` | 1.187 ms |
| `/workspace` | 2.114 ms |
| `/chat` | 1.693 ms |
| `/settings/security-monitor` | 3.330 ms |
| Vite ready | 4.475 ms |

Tempos de dev incluem a transformação sob demanda. Métricas de produção e de canvas com projeto: NOT_VERIFIED.
