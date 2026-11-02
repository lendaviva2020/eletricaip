# ADR-003: Contexto de Projeto e Isolamento Multi-Tenant no SCADA

- **Status:** Aceito
- **Data:** 01 de Novembro de 2026
- **Autor:** Principal Security & Cloud Architect
- **Contexto Normativo:** IEC 62443-4-2 (Security for IACS), ISO/IEC 27001, LGPD/GDPR

---

## 1. Contexto do Problema

A auditoria identificou um risco P0 de segurança cibernética (**RSK-P0-02**):
A rota `/scada` descartava silenciosamente o parâmetro `projectId` fornecido na URL e exibia um layout estático fixo sem consultar o backend. Não havia validação de que o usuário possuía associação com o tenant dono daquele projeto, possibilitando que dados e telemetria de uma instalação fabril fossem expostos indevidamente ou misturados com dados demonstrativos.

---

## 2. Decisão Arquitetural

1. **Validação Server-Side Obrigatória (`resolveScadaProjectContext`):**
   - Nenhuma decisão de autorização baseia-se exclusivamente no frontend.
   - A Server Function `resolveScadaProjectContext` executa com o middleware `requireSupabaseAuth`.
   - Valida no banco de dados se `projects.id == data.projectId` e se o usuário autenticado é membro ativo de `projects.tenant_id` (via tabela `tenant_memberships` ou `profiles.tenant_id`).
   - Se houver tentativa de acesso cruzado entre organizações, o servidor rejeita imediatamente com `403 Forbidden` (`FORBIDDEN: Violação de fronteira multi-tenant`).

2. **Isolamento de Estado na Store do Cliente (`useScadaStore.setProjectContext`):**
   - A store mantém `currentProjectId` e `currentTenantId`.
   - Ao trocar de projeto ou ao alternar entre projetos autorizados, a store executa uma **limpeza completa** de telemetria, alarmes, buffers de gráficos e trilha de eventos do projeto anterior.
   - Impede vazamento de equipamentos e TAGs entre abas ou sessões.

3. **Tratamento de Rota e Experiência do Operador:**
   - Se o usuário acessar `/scada` sem `projectId`, a interface apresenta o seletor de projetos pertencentes ao tenant do usuário autenticado (ou atalho explícito para a planta de demonstração ETE).
   - Links diretos com ID forjado ou pertencente a terceiros acionam a tela de bloqueio formal de segurança da IEC 62443.

---

## 3. Consequências

### Positivas:
- Segregação rigorosa entre empresas clientes (multi-tenant RLS 100% estrito).
- Preservação do contexto em F5 / recarregamento de página via query param `projectId`.
- Zero vazamento de telemetria entre projetos.
