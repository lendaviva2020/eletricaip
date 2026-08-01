# Mapa das causas de tela branca (renderização vazia)

## O que eu confirmei lendo/rodando o app agora

**1. `AuthGate` renderiza literalmente nada em rota protegida sem sessão — causa nº 1 confirmada**
`src/routes/__root.tsx` (linhas 140-142): quando `loading === false` e `user === null` numa rota não pública, o gate faz `return null`. Não há fallback, nem skeleton, nem redirect síncrono — a página fica em branco e depende inteiramente de `useAuthRedirect` conseguir navegar. Se o redirect não dispara (sessão expirada, falha de rede no `getSession`, hidratação divergente, rota nova fora de `isPublicPath`), o resultado visual é exatamente "tela branca sem nada".

Isso também explica o comportamento que observei no navegador: `/workspace` e `/digital-twin` retornam 200 mas exibem só o conteúdo de marketing/login — o gate está trocando a árvore em runtime.

**2. Bibliotecas pesadas entram no grafo do SSR via `React.lazy`**
`src/components/industrial-workspace.tsx` faz `lazy()` de 8 canvases, e `src/components/canvases/lazy.tsx` de Monaco/Konva/Three. Durante SSR o React resolve esses `lazy()` (não é gate de import), então Pixi, Three, Konva e Monaco são avaliados no servidor. Medida real: o processo do dev server está com **2,5 GB de RSS**, e requisições SSR a `/workspace` e `/digital-twin` chegaram a fechar a conexão sem resposta (`code=000`) enquanto `/analytics` e `/settings/profile` responderam 200. Nenhum desses canvases está atrás de `<ClientOnly>`.

**3. Erro em SSR não vira tela branca, vira página de erro genérica — e isso está mascarando diagnóstico**
`src/server.ts` normaliza o 500 do h3 para o HTML de `src/lib/error-page.ts` ("This page didn't load"). Confirmei no log do dev server: `Error: h3 swallowed SSR error: {"status":500,...}`. Ou seja, parte dos relatos de "não renderiza nada" é essa página, não React vazio — e a mensagem não diz qual módulo falhou.

**4. `manualChunks` atual está correto e não é a causa**
`vite.config.ts` não separa React/scheduler/@tanstack (só 3D, konva, pixi, reactflow, charts, monaco, pdf). Esse vetor de tela branca já foi eliminado; não vou mexer nele sem evidência do build de produção.

**5. Ainda não verificado (vira etapa 1 do plano, não afirmo como causa)**
Não rodei build de produção nem prerender neste modo. Falta confirmar: se alguma rota protegida está sendo pré-renderizada com `user=null` (o que congela o caso 1 no HTML estático), e se o bundle de produção quebra na avaliação de algum chunk. Sem esse dado eu não sei ainda se a tela branca da Vercel é o caso 1, o caso 2 ou os dois.

# Plano de correção

## Etapa 1 — Reproduzir com build de produção (diagnóstico, antes de qualquer fix)
Rodar `npm run build` completo, ler a saída de prerender (quantas páginas, quais rotas, quais erros), e servir o build para carregar `/`, `/workspace`, `/digital-twin`, `/dashboard`, `/analytics` no navegador headless capturando console + `pageerror`. Sem isso, qualquer correção é chute.

## Etapa 2 — Eliminar a tela branca do AuthGate (fix definitivo do caso 1)
- Trocar `return null` por um estado visível: card "Sessão expirada / Entrar" com link para `/login`, mais o skeleton enquanto o redirect está em voo.
- Fazer o redirect de rota protegida acontecer de forma determinística (não só num `useEffect` best-effort), preservando `redirect=<path>` para voltar depois do login.
- Garantir que uma rota desconhecida/nova nunca caia num render vazio: default seguro é a tela de login, não `null`.

## Etapa 3 — Tirar Pixi / Three / Konva / Monaco do SSR
- Envolver os canvases em `<ClientOnly>` (gate de render) **e** manter o `lazy()` (gate de download), para que o módulo não seja avaliado no servidor.
- Onde houver import estático de módulo browser-only numa cadeia SSR (ex.: `webgl-canvas.tsx` → `lib/diagram/render/stage.ts` → `pixi.js`), mover o import para dentro do componente client-only e extrair tipos/constantes compartilhadas para um módulo browser-safe.
- Meta verificável: RSS do dev server cai substancialmente e `/workspace` e `/digital-twin` respondem SSR de forma estável em requisições repetidas.

## Etapa 4 — Tornar a falha diagnosticável em vez de silenciosa
- No `normalizeCatastrophicSsrResponse`, logar o `url` e o `Error` capturado com stack (hoje o log não diz a rota).
- Registrar essas ocorrências no painel `/settings/diagnostics` que já existe, separando 500 de SSR de 500 de server function.

## Etapa 5 — Verificação final
Rebuild de produção, prerender ≥ 1 página, e passada no navegador headless por todas as rotas principais (logado e deslogado) confirmando que nenhuma renderiza vazio. Rodar a suíte de testes (`npm run test`) para não regredir os 101 testes atuais.

# Detalhes técnicos

- Arquivos que serão editados: `src/routes/__root.tsx` (AuthGate + redirect), `src/components/industrial-workspace.tsx` e `src/components/canvases/lazy.tsx` (ClientOnly), `src/components/canvases/webgl-canvas.tsx` + `src/lib/diagram/render/stage.ts` (fronteira de import Pixi), `src/server.ts` (log com URL), `src/lib/diagnostics-counter.ts` / `src/routes/settings.diagnostics.tsx` (visibilidade).
- Nada de mudança em `manualChunks` sem evidência do build; nada de mudança de banco ou RLS nesta onda.
- `vercel.json` (CSP) e `package.json` (`nitro` beta pinado) ficam sob observação na etapa 1 — só toco se o build/console apontar bloqueio real.
