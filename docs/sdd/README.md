# EletricAI · Software Design Document (SDD)

**Versão:** 1.0 · **Última revisão:** 2026-05-25 · **Status global:** Em desenvolvimento ativo

Este diretório é a **fonte única de verdade** do design do EletricAI Industrial OS. Cada arquivo cobre uma seção do SDD original e carrega front-matter com `status`, `owner` e `last_review`. O painel mestre vive em [`12-auditoria-status.md`](./12-auditoria-status.md) e deve ser atualizado a cada PR como parte do *definition of done*.

## Índice

| # | Arquivo | Escopo |
|---|---|---|
| 1 | [01-visao-geral.md](./01-visao-geral.md) | Proposta de valor, usuários-alvo |
| 2 | [02-stack.md](./02-stack.md) | Stack tecnológica completa |
| 3 | [03-arquitetura.md](./03-arquitetura.md) | Diagrama de alto nível, fluxos |
| 4 | [04-rotas.md](./04-rotas.md) | Mapa de rotas TanStack |
| 5 | [05-stores.md](./05-stores.md) | Stores Zustand e seus contratos |
| 6 | [06-workspace-modos.md](./06-workspace-modos.md) | 8 modos do canvas industrial |
| 7 | [07-server-functions.md](./07-server-functions.md) | Camada de servidor + middlewares |
| 8 | [08-database.md](./08-database.md) | Schema Supabase + RLS |
| 9 | [09-ia.md](./09-ia.md) | DeepSeek tool-calling, cotas, patches |
| 10 | [10-seguranca.md](./10-seguranca.md) | Auth, RLS, hardening |
| 11 | [11-billing.md](./11-billing.md) | Stripe + MercadoPago |
| 12 | [12-auditoria-status.md](./12-auditoria-status.md) | **Painel mestre vivo** |
| 13 | [13-backlog.md](./13-backlog.md) | Backlog priorizado por fase |
| 14 | [14-contratos-api.md](./14-contratos-api.md) | Contratos críticos |
| 15 | [15-decisoes-riscos.md](./15-decisoes-riscos.md) | Decisões + riscos abertos |

## ADRs

Decisões arquiteturais imutáveis em [`../adr/`](../adr/). Uma decisão = um arquivo numerado. Substituir só via novo ADR que marca o anterior como *Superseded*.

## Como usar este SDD durante o trabalho

1. Antes de tocar em código de um módulo, abra o arquivo correspondente e a seção dele no painel de auditoria.
2. Ao concluir uma mudança, atualize **status** + **last_review** do arquivo do módulo e marque o item no painel.
3. Gaps novos descobertos durante a implementação viram entradas em [`13-backlog.md`](./13-backlog.md), nunca TODOs soltos no código.
4. Mudanças de arquitetura (novo store, novo motor de canvas, troca de provider) exigem ADR.

## Convenções de status

- ✅ **done** — implementado, testado, sem gap conhecido
- 🟡 **partial** — funcional mas com gaps listados na seção "Gaps" do arquivo
- ❌ **missing** — não existe
- 🔒 **manual** — depende de ação fora do código (ex: Supabase dashboard)
