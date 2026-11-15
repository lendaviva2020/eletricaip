# 00 — Sumário Executivo da Auditoria Forense (ciclo 1)

**Projeto:** ElétricAi Industrial OS · **Repo:** `eletricaip` @ `3d78bbb` (branch `feat/ai-continuity-unifilar-connectivity-fix`) · **Data:** 2026-11-15 · **Modo:** somente leitura, offline · **Parecer:** AUDITORIA INCOMPLETA, com P0 confirmados (doc 17) · **Ciclo:** 4

## O que é preciso saber agora

1. **P0-SEC-020: segredo JWT versionado.** O valor de `SUPABASE_JWT_SECRET` está em claro em `docs/security/GATE_3_8_2_1_TRIVY_EVIDENCE.json`, rastreado no git e no remoto GitHub. O middleware do servidor aceita tokens HS256 assinados com esse segredo, o que permite personificar qualquer usuário e, se for o segredo do projeto, contornar toda a RLS. **Ação:** rotacionar o segredo, remover o ramo HS256 e purgar o histórico.
2. **P0-SEC-001: PAT do Supabase (`sbp_`) no `.env` local.** O valor também apareceu numa saída de ferramenta desta auditoria. **Ação:** revogar o token.
3. **P1-DB-005: isolamento multi-tenant frágil.** `get_user_tenant_id()` confia em `profiles.tenant_id` sem verificar membership, e o INSERT de profile não restringe `tenant_id`. Pode permitir leitura cross-tenant. Confirmação requer Supabase local.
4. **Cálculos não conservadores** (`electrical-calc.ts`): Iz superestimada ~5% no método padrão C (PVC, 3 condutores, ≥ 25 mm²); ρ a 20 °C rotulado como 70 °C (queda subestimada ~15-20%); queda monofásica calculada sobre 380 V; limite único de 5% sem acumulação; "300 mm²" retornado silenciosamente; t > 5 s e T > 60 °C truncados.
5. **A branch não passa no CI:** 25 erros de typecheck, 29 de lint e 7 arquivos fora do prettier. Os 1.372 testes passam, mas não detectam os erros de cálculo.
6. **IA:** o histórico do chat realmente é recarregado e enviado ao modelo. As ferramentas da IA são puras (sem escrita física nem no banco). Há uma chave Gemini local, ao contrário do informado, e três convenções de provedor (Gemini, DeepSeek, Lovable).
7. **Controle físico:** nos caminhos lidos, `IS_PHYSICAL_CONTROL_ALLOWED = false` é aplicado no backend (`enqueueIotCommand` retorna antes de qualquer escrita). Edge daemon e `lib/edge` ainda não foram lidos.

## Ciclo 2: novidades

8. **P1-DATA-044, perda de dados silenciosa.** Se o snapshot salvo falhar na validação, o servidor devolve um projeto vazio com a versão real, e o autosave seguinte sobrescreve o projeto. **P1-DATA-043:** saves concorrentes perdem atualizações (a checagem de versão não é atômica). **P1-DATA-046:** o Engineering Studio salva o projeto só no localStorage do navegador.
9. **P1-SEC-053.** O e-mail pessoal do proprietário está no código como regra de platform admin e de isenção de cota de IA. Somado ao P0-SEC-020, isso amplia o impacto de JWTs forjados (o mesmo vale para a claim `platform_role` na frota).
10. **P1-CALC-050/051.** O diagnóstico de queda de tensão do canvas (`multifilar.ts`) é um segundo motor, com ρ, limite, cosφ, η e fórmula de corrente diferentes do dimensionador. O mesmo circuito dá 2,7% num e 2,16% no outro, e o canvas mostra "OK — conforme" sobre valores default.
11. **P1-INC-048.** Os drivers Modbus, OPC UA e Sparkplug do edge e o envio para a nuvem são simulações: o daemon registra "conectado" sem nenhuma conexão real. A escrita física é impossível por construção (ponto positivo).
12. **Ladder:** o executor de scan roda a lógica de verdade (TON conforme IEC).

## Documentos

| Doc | Conteúdo |
|---|---|
| [01](01_REPOSITORY_COMPLETE_INVENTORY.md) | Inventário e estado git |
| [02](02_FILE_REVIEW_COVERAGE.md) | Ledger de cobertura, arquivo por arquivo |
| [03](03_SYSTEM_ARCHITECTURE_AUDIT.md) | Arquitetura |
| [04](04_MODULE_BY_MODULE_AUDIT.md) | Módulos e os 20 problemas conhecidos |
| [05](05_ELECTRICAL_CALCULATIONS_AUDIT.md) | Cálculos elétricos |
| [06](06_NORMATIVE_COMPLIANCE_REVIEW.md) | Conformidade normativa |
| [07](07_SECURITY_AND_THREAT_MODEL.md) | Segurança e ameaças |
| [08](08_SUPABASE_AND_MULTI_TENANT_AUDIT.md) | Supabase, RLS e multi-tenant |
| [09](09_AI_AND_MEMORY_AUDIT.md) | IA e memória |
| [10](10_CANVAS_AND_DATA_INTEGRITY_AUDIT.md) | Canvas e integridade (pendente) |
| [11](11_TEST_EXECUTION_RESULTS.md) | Testes executados |
| [12](12_PERFORMANCE_AND_STABILITY_AUDIT.md) | Desempenho |
| [13](13_TECHNICAL_DEBT_REGISTER.md) | Dívida técnica |
| [14](14_ROOT_CAUSE_FINDINGS.md) | Causa raiz |
| [15](15_MASTER_REMEDIATION_PLAN.md) | Plano mestre e continuação |
| [16](16_RISK_AND_DEPENDENCY_MATRIX.md) | Riscos e dependências |
| [17](17_FINAL_AUDIT_VERDICT.md) | Parecer |

Ferramentas da auditoria (scratchpad, não versionadas): `inventory.mjs`, `rls.mjs`, `secret-scan.mjs`, `calc-check.ts`, `ledger.mjs`.

## Ciclo 3: novidades

- **Navegação offline:** as rotas protegidas redirecionam para o login no cliente; as server functions sem token devolvem 401; o redirect pós-login bloqueia URLs externas; sem overflow horizontal em 375 px. No bundle de produção, o bypass dev do cliente está inerte e o e-mail do proprietário não aparece.
- **Importador:** tem limites de tamanho e profundidade e bloqueia chaves perigosas, mas descarta conexões órfãs sem avisar (P2-IMP-055) e converte tipos desconhecidos em carga genérica (P2-IMP-056).
- **Motor de conexões:** não inventa ligações; as propostas exigem aprovação. O problema conhecido nº 1 está mitigado no código.
- **Ainda bloqueado:** canvas, Ladder, FBD e SCADA com projeto real exigem Supabase (offline não é possível criar projeto).

## Ciclo 4: testes em Supabase local (Docker)

- **P0-DB-005, confirmado: o isolamento entre empresas está quebrado.** Num banco real com as 71 migrations, um usuário de outra empresa gravou o `tenant_id` da empresa A no próprio perfil e leu o projeto, o tenant e os perfis de A. O trigger que deveria impedir isso nunca age, porque é `SECURITY DEFINER` e testa `current_user`, que ali sempre vale `postgres`. A escrita nos projetos de A continuou bloqueada.
- **P1-DATA-043, reproduzido:** 41 de 50 salvamentos concorrentes perderam atualizações sem aviso.
- **P1-DATA-044, reproduzido:** um único campo com tipo errado faz o carregamento descartar o projeto inteiro.
- As 71 migrations aplicam do zero (o schema é reconstruível localmente). A aplicação, porém, recusa conectar a um Supabase local (`env.ts`), o que impede E2E reprodutível (P2-DX-060).
