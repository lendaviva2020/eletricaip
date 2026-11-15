# 10 — Canvas e Integridade de Dados

**Estado: lote B6 não executado neste ciclo.** Nada aqui deve ser lido como "sem defeitos".

## Evidências preliminares

- Os diagramas são persistidos como JSON em `diagrams.canvas_data` (a RPC de BOM itera `canvas_data->'nodes'`, `20260518183000:~200`). As ferramentas de IA operam sobre `DiagramDoc { nodes: Record<id,node>, edges: Record<id,edge> }` com `sourcePort`/`targetPort` (`engineering-tools.server.ts:824-940`). Logo, a conexão é lógica (por id e porta), e não apenas geométrica, pelo menos no modelo da IA.
- `repairDiagramConnections` e `autoLayoutIndustrialDiagram` reescrevem o doc a cada chamada de ferramenta. Precisa verificar se o reparo automático altera conexões sem consentimento.
- Várias stores paralelas (P2-ARCH-037) indicam risco de divergência entre o modelo em memória e o persistido.
- 17 arquivos de produção usam `localStorage` (inventário por grep). Falta classificar quais guardam dados de projeto em vez de preferências.

## Testes planejados para o próximo ciclo

1. Criar projeto → Unifilar com 3 cargas → salvar → recarregar → comparar o hash de nodes e edges.
2. Alternar Unifilar → Multifilar → Ladder → FBD → SCADA e verificar ids e tags preservados.
3. Importar JSON com ids duplicados, arestas órfãs e tipo desconhecido, e verificar a mensagem de erro (sem descarte silencioso).
4. Zoom e fit-to-view em 1440×900, 768 e 375.

## Ciclo 2: persistência (lida)

| ID | Sev. | Achado | Evidência |
|---|---|---|---|
| P1-DATA-044 | P1 | **Perda de dados silenciosa:** se `SnapshotSchema.safeParse` falhar no load, o servidor devolve `EMPTY_SNAPSHOT` com a `version` real; o próximo autosave (com `expectedVersion` correto) sobrescreve o projeto com o estado vazio | `projects.functions.ts:366-376`; `use-project-persistence.ts:80-84,236-243` |
| P1-DATA-043 | P1 | O controle otimista é read-then-write: `SELECT version` e depois `UPDATE … .eq("id")` sem `.eq("version", expected)`. Saves concorrentes perdem atualizações; `expectedVersion` é opcional | `projects.functions.ts:388-436` |
| P1-DATA-046 | P1 | O Engineering Studio persiste o projeto canônico **só em localStorage** (`eletricai:studio:project:<id>`), com autor fixo "Lead Automation Engineer" e histórico e checksum locais; o objeto do estado é mutado diretamente | `studio/studio-store.ts:215-300` |
| P2-DATA-045 | P2 | `restoreProjectVersion` não incrementa `diagrams.version` (clientes abertos não detectam conflito); `version_number` calculado como MAX+1 sem lock | `projects.functions.ts:668-700, 447-466` |
| P2-DATA-047 | P2 | SCADA persistido em localStorage (`eletricai_scada_store_v4`) em paralelo a `snapshot.project.scadaLayout` | `scada/scada-store.ts:125,1097` |
| P2-ARCH-037 | P2 (reforçado) | Um único snapshot guarda o mesmo projeto em ≥ 6 representações (`project.nodes/edges` legado, `voltai`, `diagram`, `unifiedDoc`, `editor.rungs/fbd`, `plc`, `compactStudio`), quase tudo `z.any()` | `projects.functions.ts:52-126` |

Pontos corretos: o load preserva o `DiagramDoc` sem inventar conexões (`use-project-persistence.ts:95-115`); a síntese legada descarta arestas não elétricas com aviso; o conflito de versão é sinalizado ao usuário, e o `force` só ocorre na escolha manual "sobrescrever" (exceto no helper de versão em `use-project-persistence.ts:378`, que sempre usa `force: true`).

## Ciclo 4: reprodução em Supabase local

**P1-DATA-043, perda de atualização: REPRODUZIDO.** `tools/race-check.ts` chama a função real `saveProjectRecord` com a sessão de um usuário de teste:
- Com 2 saves concorrentes, o conflito foi detectado (um aceito, outro rejeitado com `VERSION_CONFLICT`).
- Com 5 rodadas de 10 saves simultâneos e o mesmo `expectedVersion`, os aceitos foram 6/10, 10/10, 10/10, 10/10 e 10/10. **41 atualizações foram perdidas silenciosamente**, e a versão subiu só 1 por rodada.

**P1-DATA-044, snapshot descartado: REPRODUZIDO.** `tools/snapshot-check.ts` com o `SnapshotSchema` real: um snapshot válido passa; já `plc.cycleTimeMs: "10"` (string), `schemaVersion: 0`, `fbdSim.scans: -1` ou `project.nodes` como objeto fazem o parse **inteiro** falhar. Nesse caso `loadProject` devolve `EMPTY_SNAPSHOT` e descarta o diagrama válido junto.

**Canvas pelo navegador com o Supabase local: BLOQUEADO pelo próprio código (P2-DX-060).** `env.ts` (`assertSupabaseProject` + `isAuthorizedLocalSupabaseUrl`) só aceita URL local quando `process.env.ALLOW_LOCAL_SUPABASE`, `NODE_ENV=test` ou `VITEST` estão definidos, e no browser `process` não existe. Logo o cliente rejeita `127.0.0.1:54321`, e não há modo suportado de rodar a aplicação contra um Supabase local. Isso impede testes E2E reprodutíveis sem tocar no projeto de produção.
