# SCADA SUPERVISÓRIO — Segurança Cibernética Industrial (IEC 62443)

**Documento:** Requisitos de Segurança da Informação e Controle de Acesso  
**Norma:** ISA/IEC 62443 (Security for Industrial Automation and Control Systems)

---

## 1. Controle de Acesso Baseado em Papéis (RBAC)

O SCADA implementa separação de privilégios em 4 níveis hierárquicos:

| Perfil (Role) | Privilégios Concedidos |
|---|---|
| **OPERATOR** | Visualização de sinóticos, tendências e alarmes; reconhecimento de alarmes; comandos de partida/parada em modo MANUAL; chaveamento AUTO/MANUAL. |
| **ENGINEER** | Todos do Operador + Forçamento de TAGs (com justificativa); calibração de instrumentos; edição de telas no Editor HMI e programação em script sandbox. |
| **SUPERVISOR** | Todos do Engenheiro + Homologação e emissão de relatórios oficiais; redefinição de limites operacionais; liberação de intertravamentos de segurança sob regra de dois operadores. |
| **ADMIN** | Todos do Supervisor + Configuração de portas de rede dos gateways; gerenciamento de usuários e chaves criptográficas de comunicação. |

---

## 2. Regra dos Dois Operadores (Two-Person Rule)

Para comandos com potencial de descontinuidade severa ou risco a pessoas (como rearmar disjuntor de média tensão ou sobrescrever proteções de sobrecarga):
- A interface bloqueia a execução direta com botão único.
- Exige validação secundária com chave de autenticação ou aprovação de supervisor registrado na mesma sessão.

---

## 3. Trilha de Auditoria Imutável (21 CFR Part 11)

Toda ação de controle é registrada na trilha de auditoria contendo:
- Timestamp em milissegundos
- Identificação do operador
- TAG ou Equipamento afetado
- Valor anterior e novo valor
- Resultado da execução
