# Plano — Executar VOLTAI Master Prompt no ELETRICAI

O arquivo enviado tem 14 blocos. Foi escrito para Next.js 14, mas nosso projeto é **TanStack Start + Supabase + Lovable Cloud**. Vou adaptar cada bloco à nossa stack (server functions em vez de API routes, `vercel.json` headers já existem, etc.) e executar **um bloco por mensagem** para você revisar antes de seguir.

## Mapeamento dos 14 blocos


| #   | Bloco                                                                                                      | Status provável no ELETRICAI                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Segurança crítica (SVG sanitize, RLS WITH CHECK, créditos atômicos, rate-limit, headers, prompt-injection) | Parcial — créditos atômicos e rate-limit já feitos na Fase 5; faltam SVG sanitizer + auditoria de WITH CHECK + headers |
| 2   | Refatorar `editorStore` em 3 stores atômicos                                                               | A avaliar — já corrigimos o #185 com `useMemo`; refator completo é grande                                              |
| 3   | Validação Zod no diagram patch IA                                                                          | A verificar em `src/lib/diagram/ai.functions.ts`                                                                       |
| 4   | Repair loop com timeout/limites                                                                            | A verificar                                                                                                            |
| 5   | Autosave sem memory leak                                                                                   | Verificar `use-project-persistence.ts`                                                                                 |
| 6   | Error boundary no canvas                                                                                   | Já existe `error-boundary.tsx` — verificar cobertura                                                                   |
| 7   | Lazy loading de módulos pesados (Konva, Monaco, 3D)                                                        | Verificar                                                                                                              |
| 8   | Monaco: dispose no unmount                                                                                 | Verificar                                                                                                              |
| 9   | EditorAiConfigBanner corrigido                                                                             | Verificar                                                                                                              |
| 10  | Verificação de plano na função IoT                                                                         | Migrar para server function (já temos `iot.ingest.ts`)                                                                 |
| 11  | Ladder executor com timeout                                                                                | Verificar `ladder/runtime.ts`                                                                                          |
| 12  | IDs únicos sem variável global mutável                                                                     | `usePlcStore` usa `modCounter` global — corrigir                                                                       |
| 13  | Verificação final + build                                                                                  | Última etapa                                                                                                           |
| 14  | styled-jsx → CSS Modules                                                                                   | Provavelmente N/A (não usamos styled-jsx)                                                                              |


## Adaptações de stack (obrigatórias)

- **Next.js API routes → TanStack `createServerFn**` ou `src/routes/api/public/*`
- **Upstash Redis** → manter padrão atual (Supabase RPC + janela por período), a menos que você queira adicionar Upstash agora
- `**vercel.json` headers** → aplicar mesmo assim (já temos `vercel.json`)
- **Edge functions Supabase** → preferir server functions; só mexer em `supabase/functions/*` se já existirem
- **Nome "VOLTAI"** em strings/comentários → trocar por **ELETRICAI**

## Execução proposta (1 mensagem por bloco)

1. **Bloco 1** — Segurança: criar `svg-sanitizer.ts`, varrer `dangerouslySetInnerHTML`, auditar políticas RLS faltando `WITH CHECK` (migration), adicionar headers no `vercel.json`, sanitização anti-prompt-injection. **Pular** o que já está feito (créditos atômicos, rate-limit) e te avisar.
2. **Bloco 2** — Decidir junto: refator completo do `editorStore` em 3 stores **ou** apenas hardening dos seletores (mais seguro/menor risco). Recomendo a opção menor agora.
3. **Bloco 3** — Zod no patch IA.
4. **Bloco 4** — Repair loop limites.
5. **Bloco 5** — Autosave sem leak.
6. **Bloco 6** — Cobertura de ErrorBoundary nos canvases.
7. **Bloco 7** — Lazy loading (Konva/Monaco/3D).
8. **Bloco 8** — Monaco dispose.
9. **Bloco 9** — EditorAiConfigBanner.
10. **Bloco 10** — Plan-check no IoT ingest.
11. **Bloco 11** — Ladder timeout.
12. **Bloco 12** — IDs únicos (`crypto.randomUUID()`).
13. **Bloco 13** — Build/typecheck final + correção de pendências.
14. **Bloco 14** — Pular se não houver `styled-jsx` no repo.

Ao final de cada bloco te entrego um resumo e espero "próximo" para seguir. Se preferir rodar **vários blocos de uma vez** (ex.: 1+3+12 que são pequenos), me diga.

## Perguntas antes de começar

1. Quer mesmo o **Bloco 2 (refator do editorStore)** agora? É invasivo e pode reintroduzir bugs como o #185. Recomendo **adiar** e fazer só hardening.
2. Adicionar **Upstash Redis** para rate-limit (Bloco 1.4) ou manter o que já temos via Supabase RPC?
3. Posso começar **agora pelo Bloco 1**?

Eu quero o bloco 2 para segurança!! Adicionar upstash redis tambem. Pode começar pelo bloco 1