# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# REVISÃO DE SEGURANÇA, ISOLAMENTO MULTI-TENANT E RBAC

## 1. Invariante Permanente de Segurança Física

Em todas as camadas do Gate 3.8, a constante `IS_PHYSICAL_CONTROL_ALLOWED = false` (`isPhysicalControlAllowed: false`) permanece imutável.

Operações estritamente proibidas e bloqueadas:
- Escrita em registradores ou bobinas Modbus (`FC05`, `FC06`, `FC15`, `FC16`)
- `OPC UA Write` ou `Method Call` em equipamentos físicos
- Publicação de comandos `NCMD` ou `DCMD` MQTT Sparkplug B
- Partida ou parada de motores, abertura ou fechamento de disjuntores
- Alteração remota de lógica PLC ou acionamento automático por runbook ou IA

---

## 2. Isolamento Multi-Tenant e RLS

1. **Grafo de Dependências**: `IndustrialDependencyGraph` isola nós e arestas por chave composta `${tenantId}:${plantId}:${componentId}` e bloqueia qualquer tentativa de criar relação entre tenants ou plantas distintas (`CROSS_BOUNDARY_DEPENDENCY_FORBIDDEN`).
2. **Assistente de IA**: `AiDiagnosticAssistant.enforceTenantBoundary()` verifica o `tenantId` do incidente, dos diagnósticos determinísticos, do grafo de impacto, dos eventos correlacionados e do resumo do Historian, bloqueando imediatamente com `CROSS_TENANT_AI_ACCESS_FORBIDDEN`.
3. **Banco de Dados (PostgreSQL RLS)**: A migração [`20261108110000_gate3_8_industrial_diagnostics.sql`](../../supabase/migrations/20261108110000_gate3_8_industrial_diagnostics.sql) habilita `ROW LEVEL SECURITY` em `industrial_dependency_edges`, `industrial_diagnostic_records` e `industrial_incident_rejected_hypotheses`.

---

## 3. Controle de Acesso Baseado em Papéis (RBAC)

| Papel (`FleetRole`) | Visualizar Diagnósticos / Grafo | Investigar / Reconhecer / Resolver Incidente | Executar Procedimento Admin de Runbook | Auditoria de Segurança |
|---|---|---|---|---|
| `VIEWER` | Permitido (Read-Only) | **Bloqueado (`RBAC_FORBIDDEN`)** | **Bloqueado** | Somente Leitura |
| `EDGE_OPERATOR` | Permitido | Permitido | Passos de Operador | Leitura |
| `ENGINEER` | Permitido | Permitido | Passos de Engenharia | Leitura |
| `AUDITOR` | Permitido | Permitido | Verificação de Segurança | Completo |
| `PLANT_ADMIN` | Permitido | Permitido | Administração da Planta | Completo |
| `TENANT_ADMIN` | Permitido | Permitido | Administração do Tenant | Completo |
| `PLATFORM_ADMIN` | Permitido | Permitido | Completo | Completo |
