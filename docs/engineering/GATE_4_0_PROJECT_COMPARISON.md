# GATE 4.0 — PROJECT COMPARISON, SEMANTIC DIFF & VERSION CONTROL
## COMPARAÇÃO ESTRUTURAL PROFUNDA, DIFF SEMÂNTICO E MESCLAGEM AUTOMATIZADA

### 1. OBJETIVO E VISÃO GERAL

O módulo `ProjectComparisonEngine` do ElétricAi Industrial OS implementa paridade funcional com a ferramenta de comparação de projetos (Project Compare) e controle de versão do CODESYS V3.5.

Diferente de ferramentas de comparação de texto puro (como o Git diff padrão), o comparador industrial compreende a semântica de entidades de automação:
- Identifica se um bloco foi apenas renomeado ou se seu conteúdo interno foi modificado.
- Compara parâmetros de tempo de tarefas, prioridades e limites de watchdogs.
- Rastreia inclusão e remoção de módulos de I/O na árvore de dispositivos.
- Analisa mudanças de escala, tipos de dados e endereçamento de tags.

---

### 2. CLASSIFICAÇÃO DE MUDANÇAS

| Classificação | Descrição | Exemplo de Aplicação |
|---|---|---|
| `ADDED` | Nova entidade inserida no projeto de destino | Novo POU de controle de pressão ou nova tag analógica |
| `REMOVED` | Entidade existente na origem ausente no destino | Remoção de uma tarefa obsoleta ou exclusão de canal |
| `MODIFIED` | Mesmo identificador, porém com alterações de código ou configuração | Ajuste no tempo de ciclo de 10ms para 20ms ou lógica ST alterada |
| `RENAMED` | Mesmo identificador canônico (UUID), porém rótulo/nome alterado | Tag `Bomba_01` renomeada para `PUMP_101_RUN` |
| `MOVED` | Entidade relocalizada dentro da hierarquia da árvore de dispositivos | Módulo de I/O transferido do Slot 1 para o Slot 3 |

---

### 3. MESCLAGEM (MERGE) E RESOLUÇÃO DE CONFLITOS

O motor de comparação suporta mesclagem de três vias (Three-Way Merge):
1. **Mudanças Não Conflitantes**: Se o Engenheiro A adicionou novos POUs em sua branch enquanto a Base permaneceu inalterada naquele módulo, a mesclagem ocorre automaticamente de forma limpa.
2. **Conflitos Semânticos**: Se ambos os ramos alteraram o mesmo POU ou modificaram o tipo de dado da mesma tag de formas incompatíveis, um objeto `MergeConflict` é gerado, exigindo que o engenheiro sênior decida entre:
   - `ACCEPT_SOURCE`: Mantém a versão da origem.
   - `ACCEPT_TARGET`: Adota a versão do destino.
   - `MANUAL`: Resolução personalizada via editor de código unificado.
