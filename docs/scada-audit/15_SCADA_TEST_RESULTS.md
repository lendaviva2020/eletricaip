# 15 — Resultados dos testes (antes de qualquer mudança)

Executados em 2026-11-16 sobre `82918fc`, sem alterar código.

## Testes automatizados

`npx vitest run` nos 17 arquivos do SCADA e afins: **17 arquivos, 94 testes, todos passando.**

## Verificação dos 20 itens pedidos

| # | Item | Resultado | Como foi verificado |
|---|---|---|---|
| 1 | Abertura do SCADA | ✅ abre (demo) | Navegador, durante a gravação do vídeo |
| 2 | Persistência | ❌ nada operacional é persistido | Código: funções sem consumidor (doc 02) |
| 3 | Recuperação do projeto | ⚠️ só se o workspace já carregou o documento | `scada-layout.tsx:155-163` |
| 4 | Atualização de variáveis | ⚠️ atualiza a cada 1 s com valores fabricados (cliente) ou senoides (demo) | `scada-header.tsx:65`, `scada-store.ts:727-736` |
| 5 | Estado de comunicação | ❌ constante "CONNECTED" | `scada-store.ts:162-190` |
| 6 | Qualidade de dados | ⚠️ runtime suporta; carga inicial marca "GOOD" sem fonte | `canonical-bridge.ts:94` |
| 7 | Alarmes | ⚠️ funcionam em memória | testes `scada-gate2-alarm-engine` |
| 8 | Reconhecimento | ✅ em memória; ❌ não persiste | idem |
| 9 | Histórico | ❌ não enviado; buffer cresce | `scada-store.ts:804` |
| 10 | Tendências | ⚠️ só 2 min em memória | `scada-trends-view.tsx:42,152` |
| 11 | Navegação | ✅ 12 visões funcionam (demo) | Navegador |
| 12 | Responsividade | Não verificado em celular | — |
| 13 | Permissões | ✅ no servidor; ⚠️ forçar tag sem papel na interface | doc 12 |
| 14 | Isolamento multi-tenant | ✅ servidor recusa projeto alheio (teste `scada-gate1a`) | teste + código |
| 15 | Integração com Ladder | ❌ nenhuma no SCADA | busca no código |
| 16 | Integração com FBD (Studio) | ⚠️ o Studio publica no runtime (`publishCompactFrameToRuntimeStore`), não no `useScadaStore` | AGENTS.md §9ª rodada |
| 17 | Integração com CLP | ❌ nenhuma no SCADA | busca no código |
| 18 | Integração com simulação | ✅ CCM; ⚠️ planta 8M+2EX fora do SCADA | código |
| 19 | Diagnósticos | ⚠️ aba Comunicação com dado fixo | doc 12 |
| 20 | Auditoria de eventos | ❌ só memória | doc 12 |

## Lacunas de teste

1. Nenhum teste garante que a interface **não exibe valor fabricado** (o `real-data-integrity.test.ts` não cobre o SCADA).
2. Nenhum teste de integração de SCADA com o histórico, alarmes persistidos ou auditoria.
3. Nenhum teste de que o projeto de cliente abre com o diagrama vindo do servidor.
4. Nenhum E2E do SCADA com sessão de cliente.
