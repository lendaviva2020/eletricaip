# ELÉTRICAI INDUSTRIAL OS — GATE 4.0
## ESPECIFICAÇÃO DO MODELO CANÔNICO DE ENGENHARIA INDUSTRIAL UNIFICADO

**Data:** 08/11/2026 | **Metodologia:** Clean Room Mode | **Padrão:** IEC 61131-3 Ed. 3 / ISA-101 / PLCopen

---

### 1. Princípio Fundamental: Single Source of Truth por UUID Imutável
No ElétricAi Industrial OS, nenhum objeto de engenharia (como um motor, uma tag analógica de nível ou um alarme de segurança) possui dados duplicados. Cada entidade é instanciada uma única vez no `IndustrialProject`, recebendo um identificador UUID v4 persistente.

Quando um objeto é referenciado em:
- Diagrama Unifilar (IEC 60617);
- Diagrama Multifilar;
- Árvore de Hardware / Módulo de E/S;
- Lógica Ladder (LD);
- Diagrama de Blocos (FBD);
- Algoritmo Structured Text (ST);
- Sequenciador Gráfico (SFC);
- Sinótico de Supervisão SCADA / IHM (ISA-101);
- Historiador de Tendências e Alarmes (ISA-18.2);
- Controlador de Eixo Motion (PLCopen);

a ligação é realizada estritamente pelo campo `tagId`, `pouId` ou `deviceId`. A renomeação ou alteração de escala propaga-se de maneira atômica e transacional através de `CanonicalProjectService.renameEntity`, recalculando o grafo de dependências e preservando a integridade referencial.

---

### 2. Inventário das 42 Entidades Canônicas Modeladas

1. **`IndustrialProject`**: Raiz do projeto com versionamento semântico, auditoria e histórico de commits.
2. **`ProjectVersion`**: Snapshot imutável de versão com autor, mensagem de commit e hash SHA-256.
3. **`Controller`**: CLP virtual ou físico com modelo de hardware, firmware e IP.
4. **`Device`**: Dispositivo de campo (inversor de frequência, medidor de energia, gateway).
5. **`Application`**: Aplicação lógica isolada particionada por controlador.
6. **`HardwareModule`**: Módulo montado em slot de rack (CPU, DI, DO, AI, AO, Gateway).
7. **`IOChannel`**: Canal individual com endereço IEC (`%IX0.0`), tipo elétrico (24VDC, 4-20mA) e escala.
8. **`POU`**: Unidade de Organização de Programa (Program, Function Block, Function).
9. **`ActionDefinition`**: Subrotina/ação associada a uma POU mãe.
10. **`MethodDefinition`**: Método OOP encapsulado com escopo e parâmetros.
11. **`PropertyDefinition`**: Propriedade Get/Set tipada em Function Blocks.
12. **`InterfaceDefinition`**: Contrato abstrato de métodos e propriedades.
13. **`ProgramNetwork`**: Rede lógica numerada para LD, FBD e SFC.
14. **`LadderRung`**: Rung de ladder delimitado por barramentos de alimentação L e R.
15. **`LadderElement`**: Contatos (NA, NF, borda P/N), bobinas (padrão, negada, set, reset), blocos.
16. **`FBDNode`**: Bloco nodal em diagrama de blocos de função.
17. **`FBDPort`**: Porta de entrada/saída tipada com sentido de fluxo de dados.
18. **`FBDConnection`**: Conexão orientada entre portas compatíveis.
19. **`SFCStep`**: Passo sequencial com contadores de tempo e flag de passo inicial.
20. **`SFCAction`**: Ação qualificada associada ao passo (`N`, `S`, `R`, `L`, `P`).
21. **`SFCTransition`**: Condição booleana de disparo entre passos antecessores e sucessores.
22. **`GlobalVariableList`**: GVL com namespace qualificado e persistência (Retain/Constant).
23. **`PLCVariable`**: Variável com escopo (`VAR`, `VAR_INPUT`, `VAR_OUTPUT`, `VAR_GLOBAL`), tipo e endereço.
24. **`DataTypeDefinition`**: DUT (Data Unit Type): Struct, Enum, Array, Subrange, Alias.
25. **`DataTypeField`**: Campo tipado com offset de memória e valor inicial.
26. **`Tag`**: Tag canônica de processo com carimbo de tempo, qualidade e unidade de engenharia.
27. **`TaskConfiguration`**: Tarefa de execução (`CYCLIC`, `EVENT`, `FREEWHEELING`, `STATUS`) com prioridade e watchdog.
28. **`LibraryReference`**: Referência de biblioteca com categoria, versão e dependências transitivas.
29. **`DependencyGraph`**: Grafo acíclico de relacionamentos `READS`, `WRITES`, `BINDS` e `CALLS`.
30. **`HMIPage`**: Tela sinótica de supervisório com fundo e layout responsivo.
31. **`HMIWidget`**: Componente visual (bomba, tanque, válvula, botão, gauge) com data-binding.
32. **`AlarmDefinition`**: Definição de alarme com limites alto/baixo, deadband e severidade ISA-18.2.
33. **`TrendDefinition`**: Definição de amostragem histórica multieixo.
34. **`TraceConfiguration`**: Osciloscópio de captura de sinais com canais e triggers.
35. **`TraceChannel`**: Canal de sinal monitorado com limites de visualização.
36. **`RecipeDefinition`**: Conjunto de parâmetros operacionais de receita com tolerâncias.
37. **`ProtocolConfiguration`**: Configuração de driver de campo (Modbus, OPC UA, MQTT).
38. **`MotionAxis`**: Eixo cinemático PLCopen com posição, velocidade e aceleração máxima.
39. **`MotionGroup`**: Grupo cinemático multi-eixos para interpolação coordenada 2D/3D.
40. **`X509Certificate`**: Certificado digital TLS/OPC UA com CSR, validade e thumbprint SHA-256.
41. **`DigitalTwinState`**: Estado do gêmeo digital (observado vs declarado vs inferido) com status de drift.
42. **`RBACPermission`**: Política de segurança por papel (ADMIN, ENGINEER, OPERATOR) e recurso.

---

### 3. Validação de Integridade Referencial
O serviço `CanonicalProjectService.validateReferentialIntegrity` analisa:
- **Órfãos de Tag:** Qualquer referência a `tagId` que não conste na lista mestra de tags;
- **Órfãos de POU:** Qualquer chamada de POU por tarefas que aponte para ID inexistente;
- **Canais de E/S sem mapeamento:** Alerta informativo de canais físicos não aproveitados;
- **Ciclos Proibidos:** Detecção de dependências circulares ilegais no grafo de chamadas de programas.
