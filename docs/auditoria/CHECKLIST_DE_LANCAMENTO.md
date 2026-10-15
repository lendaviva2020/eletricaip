# CHECKLIST DE LANÇAMENTO EM PRODUÇÃO — ELETRICAI

**Data:** 14 de Outubro de 2026  
**Finalidade:** Verificação formal pré-lançamento para autorização de entrada de clientes reais pagantes na plataforma.  
**Regra:** Todos os itens marcados como **[OBRIGATÓRIO]** devem estar validados com evidência registrada antes de abrir a plataforma comercialmente.

---

## 1. Segurança e Controle de Acesso

- [ ] **[OBRIGATÓRIO] Desativação da Edge Function de IA desprotegida no CI:** Confirmar que `.github/workflows/ci.yml` não implanta nenhuma Edge Function com a flag `--no-verify-jwt`.
- [ ] **[OBRIGATÓRIO] Isolamento Multi-tenant (RLS) verificado:** Confirmar via testes que nenhum usuário da Organização A consegue visualizar, editar ou excluir projetos, diagramas ou faturas da Organização B.
- [ ] **[OBRIGATÓRIO] Proteção contra vazamento em localStorage:** Avaliar a migração dos tokens de autenticação para cookies `httpOnly` seguros com SameSite lax/strict.
- [ ] **[OBRIGATÓRIO] Rate Limiting em rotas de autenticação:** Limite de 5 tentativas por 15 minutos aplicado a login, cadastro e recuperação de senha.
- [ ] **[OBRIGATÓRIO] Bloqueio de elevação de privilégios:** Confirmar que a policy de `tenant_memberships` impede que um administrador se promova a `owner`.
- [ ] **[OBRIGATÓRIO] Sanitização de entradas e saídas de IA:** Validar que saídas de IA continuam sendo estritamente validadas via esquemas Zod antes de qualquer merge no diagrama.
- [ ] **[RECOMENDADO] Autenticação em Dois Fatores (MFA):** Disponibilizar opção de ativação de TOTP (Google Authenticator) nas configurações de segurança do perfil.

---

## 2. Banco de Dados, Persistência e Infraestrutura

- [ ] **[OBRIGATÓRIO] Reconstrução Canônica do Banco do Zero:** Executar `supabase db reset` em ambiente isolado e confirmar que todas as tabelas centrais (`profiles`, `projects`, `tenants`, etc.) e secundárias sobem sem erro.
- [ ] **[OBRIGATÓRIO] Regeneração de Tipos TypeScript:** Executar `supabase gen types typescript`, eliminar os casts `untyped()` e compilar com `bun run typecheck`.
- [ ] **[OBRIGATÓRIO] Rotina de Backup Automatizado diário:** Backup lógico com retenção de 30 dias configurado em bucket independente e com procedimento de restore testado.
- [ ] **[OBRIGATÓRIO] Resiliência de Salvamento (Autosave):** Confirmar que edições no workspace salvam em 2 segundos e que quedas de conexão exibem alerta claro de retenção local sem perda de dados.
- [ ] **[OBRIGATÓRIO] Histórico de Versões e Restore funcional:** Criar versão de projeto, alterar o diagrama e restaurar a versão anterior com sucesso.

---

## 3. Engenharia Elétrica e Conformidade Técnica

- [ ] **[OBRIGATÓRIO] Dimensionamento NBR 5410 com tabelas canônicas:** Condutores dimensionados com base em método de instalação, temperatura e agrupamento.
- [ ] **[OBRIGATÓRIO] Queda de Tensão com Reatância Indutiva:** Circuito de alta potência calculado com resistência e reatância, garantindo erro inferior a 1%.
- [ ] **[OBRIGATÓRIO] Isenção de Responsabilidade Técnica (Disclaimer Legal):** Confirmação de que todas as telas de cálculos elétricos e relatórios PDF exibem aviso de que o memorial serve como apoio de engenharia e exige validação e ART de profissional habilitado (CFT/CREA).
- [ ] **[OBRIGATÓRIO] Intertravamento de Segurança E-STOP validado:** Teste comprovando que projetos gerados por IA ou por engenheiros contêm intertravamento físico em conformidade com a NR-12.

---

## 4. Transparência da Interface e Experiência do Usuário (UX)

- [ ] **[OBRIGATÓRIO] Remoção de Mocks e Respostas Falsas:**
  - Chat de IA: botão de anexo de PDF removido ou conectado a parser real (sem dados de bombagem fixos).
  - Analytics: gráficos de OEE e consumo kWh exibem dados reais dos dispositivos ou estado vazio honesto.
  - Billing / Team: remoção do fallback silencioso para "modo demo" com faturas e membros falsos.
  - Paleta Ladder: ocultar ou desabilitar as ~30 instruções IEC que o grid não executa.
- [ ] **[OBRIGATÓRIO] Rotulação Clara de Protocolos Industriais:** Modbus TCP identificado formalmente como "Simulação em Nuvem / Laboratório Virtual" para não induzir clientes a acreditar em comunicação com planta física sem gateway de borda.
- [ ] **[OBRIGATÓRIO] Compatibilidade com Tablets Industriais:** Workspace navegável e utilizável com controles de toque e resolução a partir de 1024x768.
- [ ] **[OBRIGATÓRIO] Acessibilidade:** Mensagens de erro e status em formulários com tags ARIA para leitores de tela.

---

## 5. Operação, Observabilidade e Jurídico

- [ ] **[OBRIGATÓRIO] Alinhamento de Domínio de Produção:** O domínio comercial oficial `eletricai.vercel.app` configurado para a build real do TanStack Start.
- [ ] **[OBRIGATÓRIO] Rastreamento de Erros de Runtime (Sentry/Datadog):** Observabilidade de erros 500 no cliente e no servidor com mascaramento de dados sensíveis.
- [ ] **[OBRIGATÓRIO] Conformidade LGPD e Termos de Uso:**
  - Termos de Serviço e Política de Privacidade publicados em `/termos` e `/privacidade`.
  - Fluxo de exclusão e anonimização de conta do usuário verificado.
  - Indicação clara de Encarregado pelo Tratamento de Dados Pessoais (DPO) e canal de contato de suporte.
- [ ] **[OBRIGATÓRIO] Suíte de Testes Automatizados Verde:** Execução de `bun run test` (263+ testes) e `bun run build` com saída exit=0 no pipeline de CI.

---

## Assinatura de Liberação Comercial

| Responsabilidade | Nome / Função | Parecer | Data |
| :--- | :--- | :--- | :---: |
| Arquiteto de Software | Engenharia de Sistemas Industriais | ❌ BLOQUEADO (Pendente Fases 1 a 5) | 14/10/2026 |
| Engenheiro Eletricista | Responsável Técnico | ❌ BLOQUEADO (Pendente NBR 5410 real) | 14/10/2026 |
| Segurança da Informação | Auditor de Segurança Cibernética | ❌ BLOQUEADO (Pendente DDL e JWT CI) | 14/10/2026 |
