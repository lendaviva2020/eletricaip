// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8: INDUSTRIAL RUNBOOK LIBRARY
// Phase 6: Versioned Technical Procedures across 12 Industrial Categories
// Standards: ISA-95, IEC 62443, NR-10 / IEC 61508 Safety Boundaries
// =============================================================================

import type { FleetRole, IndustrialRunbook, RunbookCategory, RunbookStep } from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

const ROLE_LEVEL: Record<FleetRole, number> = {
  VIEWER: 1,
  EDGE_OPERATOR: 2,
  ENGINEER: 3,
  AUDITOR: 3,
  PLANT_ADMIN: 4,
  TENANT_ADMIN: 5,
  PLATFORM_ADMIN: 6,
};

export const OFFICIAL_INDUSTRIAL_RUNBOOKS: readonly IndustrialRunbook[] = Object.freeze([
  // 1. CLOUD
  {
    runbookId: "RB_CLOUD_DEGRADATION_RESPONSE",
    title: "Diagnóstico e Recuperação de Degradação na Camada ElétricAi Cloud",
    category: "CLOUD",
    affectedComponentTypes: ["CLOUD_SERVICE", "CLOUD_API", "DATA_PIPELINE"],
    symptoms: [
      "Latência HTTP p95 > 1200ms nos endpoints de ingestão ou RPC",
      "Erros HTTP 5xx nos workers Cloud com Edge operando em modo autônomo",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Verificar no Centro de Operações se os Edge Gateways entraram em modo Store-and-Forward autônomo.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome: "Confirmação de que a coleta local na planta não sofreu interrupção.",
      },
      {
        stepNumber: 2,
        instruction:
          "Inspecionar métricas de latência da API Cloud versus latência do banco PostgreSQL.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome:
          "Isolamento entre falha de worker de aplicação (RULE_13) e falha de persistência (RULE_12).",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "PLANT_ADMIN", "TENANT_ADMIN", "PLATFORM_ADMIN"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — Nenhuma operação na Cloud altera estados de PLCs ou inversores.",
      "Não limpar filas de ingestão antes da confirmação de drenagem do Outbox dos gateways.",
    ],
    expectedEvidence: [
      "Snapshots de saúde CLOUD_API HEALTHY",
      "Taxa de erro 5xx = 0% por 3 janelas consecutivas",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Reequilibrar pool de conexões e workers de ingestão na camada de administração Cloud.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome: "Workers Cloud respondendo com HTTP 200 e latência < 300ms.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Aguardar 3 ciclos consecutivos de health probe com estado HEALTHY e drenagem do Outbox.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Retorno do SLO Cloud Service Availability para conformidade.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Reliability Engineering",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Architecture Board",
        summary: "Homologação oficial Gate 3.8 para diagnóstico Cloud.",
      },
    ],
  },

  // 2. EDGE
  {
    runbookId: "RB_EDGE_OFFLINE_RECOVERY",
    title: "Investigação e Recuperação de Edge Gateway Offline ou Saturado",
    category: "EDGE",
    affectedComponentTypes: ["EDGE_GATEWAY", "EDGE_FLEET"],
    symptoms: [
      "Ausência de heartbeat assinado do Edge Gateway (> 90s)",
      "Saturação de CPU/Memória (> 90%) ou falha pós-atualização do agente Edge",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Conferir timestamp do último heartbeat válido e status de revogação/expiração do certificado.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome:
          "Identificação do momento exato da perda de sinal e exclusão de bloqueio por certificado.",
      },
      {
        stepNumber: 2,
        instruction:
          "Verificar se houve deploy de configuração ou atualização recente no gateway (RULE_25).",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Correlação entre mudança de versão e parada de sincronismo.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "PLANT_ADMIN", "TENANT_ADMIN"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — O reinício do serviço de software do Edge não envia comandos de escrita aos PLCs.",
      "Intervenções elétricas no painel do gateway em campo exigem profissional habilitado (NR-10).",
    ],
    expectedEvidence: [
      "3 heartbeats assinados consecutivos recebidos",
      "CPU < 75% e Memória < 80%",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Caso acessível via canal administrativo seguro, executar rollback de configuração do daemon Edge.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "PLANT_ADMIN",
        expectedOutcome: "Daemon Edge reiniciado com última configuração estável conhecida.",
      },
      {
        stepNumber: 2,
        instruction:
          "Se sem conectividade WAN/LAN, solicitar inspeção presencial de alimentação 24Vcc e switch OT no painel.",
        actionType: "QUALIFIED_HUMAN_FIELD_INTERVENTION",
        minimumRole: "ENGINEER",
        expectedOutcome:
          "Restabelecimento físico da energia ou link Ethernet do Edge Gateway em campo.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar recebimento de >= 3 amostras consecutivas de heartbeat e início da drenagem do SQLite WAL.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Gateway em estado HEALTHY e telemetria normalizada.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Edge Fleet Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Edge Fleet Team",
        summary: "Procedimento canônico para indisponibilidade e sobrecarga de Edge Gateway.",
      },
    ],
  },

  // 3. EDGE DISK & SQLITE
  {
    runbookId: "RB_EDGE_DISK_CLEANUP_AND_WAL",
    title: "Mitigação de Saturação de Disco e Falha de Escrita SQLite WAL no Edge",
    category: "EDGE",
    affectedComponentTypes: ["EDGE_GATEWAY", "DATA_PIPELINE"],
    symptoms: [
      "Uso de disco do Edge >= 85% (RULE_09)",
      "Erro de escrita SQLite WAL / SQLITE_FULL (RULE_10)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Inspecionar tamanho do arquivo WAL e quantidade de registros retidos no Outbox.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome:
          "Determinação se o consumo decorre de backlog longo ou logs de sistema não rotacionados.",
      },
    ],
    requiredPermissions: ["PLANT_ADMIN", "TENANT_ADMIN"],
    safetyWarnings: [
      "Nunca truncar o banco SQLite WAL com lotes pendentes antes de concluir a sincronização com o Historian.",
    ],
    expectedEvidence: ["Uso de disco < 75%", "Checkpoint WAL concluído sem erros de I/O"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Acionar rotação administrativa de logs antigos e executar PRAGMA wal_checkpoint(TRUNCATE) após drenagem.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "PLANT_ADMIN",
        expectedOutcome: "Espaço em disco liberado preservando 100% das amostras industriais.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Verificar 3 ciclos consecutivos de escrita no buffer local com zero erros de I/O.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Armazenamento local do Edge íntegro.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Edge Storage Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Edge Storage Team",
        summary: "Runbook de proteção de armazenamento SQLite WAL.",
      },
    ],
  },

  // 4. MODBUS
  {
    runbookId: "RB_MODBUS_TIMEOUT_DIAGNOSIS",
    title: "Diagnóstico de Timeouts Recorrentes e Indisponibilidade em Modbus TCP",
    category: "MODBUS",
    affectedComponentTypes: ["PROTOCOL_MODBUS_TCP", "INDUSTRIAL_EQUIPMENT"],
    symptoms: [
      "3 ou mais timeouts consecutivos no coletor Modbus TCP (RULE_03)",
      "Gateway online mas equipamento físico sem resposta (RULE_02)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction: "Verificar se o Edge Gateway que hospeda o driver Modbus está HEALTHY.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome:
          "Confirmação de que a falha é restrita ao enlace OT/equipamento e não ao gateway.",
      },
      {
        stepNumber: 2,
        instruction:
          "Conferir latência média de polling, Unit ID e limite de conexões simultâneas do escravo Modbus.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Identificação de sobrecarga de polling ou queda física do equipamento.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "ENGINEER", "PLANT_ADMIN"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — Utilize exclusivamente Function Codes de leitura (FC03/FC04). Proibido FC05/FC06/FC15/FC16.",
      "Verificações físicas em painéis de inversores/PLCs devem ser realizadas por eletricista habilitado (NR-10).",
    ],
    expectedEvidence: [
      "Taxa de timeout Modbus = 0%",
      "Qualidade das tags retornando para GOOD por >= 3 ciclos",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Ajustar scan rate ou timeout de leitura na configuração administrativa do coletor se houver saturação do escravo.",
        actionType: "AUTHORIZED_ENGINEER_REQUIRED",
        minimumRole: "ENGINEER",
        expectedOutcome: "Redução de contenção TCP na interface de rede do PLC/medidor.",
      },
      {
        stepNumber: 2,
        instruction:
          "Verificar cabeamento Ethernet industrial, switch OT e alimentação do escravo Modbus em campo.",
        actionType: "QUALIFIED_HUMAN_FIELD_INTERVENTION",
        minimumRole: "ENGINEER",
        expectedOutcome: "Link físico restabelecido na porta 502.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar 3 ciclos de leitura Modbus TCP consecutivos com qualidade GOOD e persistência no Historian.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Canal Modbus TCP normalizado.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Protocols Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Industrial Protocols Team",
        summary: "Runbook de diagnóstico read-only para Modbus TCP.",
      },
    ],
  },

  // 5. OPC UA
  {
    runbookId: "RB_OPCUA_SESSION_RECOVERY",
    title: "Recuperação de Queda de Sessão e Canal Seguro OPC UA",
    category: "OPC_UA",
    affectedComponentTypes: ["PROTOCOL_OPC_UA", "INDUSTRIAL_EQUIPMENT"],
    symptoms: ["Perda de sessão OPC UA ou BadSessionIdInvalid / BadSecureChannelClosed (RULE_04)"],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Inspecionar código de status OPC UA retornado no último ciclo de Subscription/Read.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome:
          "Distinção entre timeout de rede, limite de sessões no servidor PLC ou rejeição de certificado.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "PLANT_ADMIN"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — Sessão OPC UA opera estritamente em modo Read/Subscribe. Chamadas Write e Method Call são bloqueadas.",
    ],
    expectedEvidence: [
      "Sessão OPC UA ativa",
      "Subscriptions entregando PublishResponses com qualidade GOOD",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Validar sincronismo de relógio NTP e lista de confiança X.509 entre o Edge e o servidor OPC UA.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "PLANT_ADMIN",
        expectedOutcome: "Reestabelecimento do SecureChannel OPC UA.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar recebimento contínuo de MonitoredItems por >= 3 ciclos consecutivos.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Coleta OPC UA estabilizada.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Protocols Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Industrial Protocols Team",
        summary: "Runbook oficial OPC UA Gate 3.8.",
      },
    ],
  },

  // 6. MQTT
  {
    runbookId: "RB_MQTT_BROKER_RECONNECT",
    title: "Diagnóstico de Queda de Broker MQTT Sparkplug B e Reconexão",
    category: "MQTT",
    affectedComponentTypes: ["PROTOCOL_MQTT_SPARKPLUG", "EDGE_GATEWAY"],
    symptoms: [
      "Desconexão do broker MQTT Sparkplug B (RULE_05)",
      "Recebimento de NDEATH/DDEATH ou ausência de pacotes NDATA",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Verificar no grafo de impacto se múltiplos dispositivos MQTT compartilham o mesmo Broker.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome:
          "Confirmação de falha centralizada no Broker vs falha isolada de um Edge Node.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "PLANT_ADMIN"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — Proibida publicação de tópicos NCMD ou DCMD para atuação física.",
    ],
    expectedEvidence: [
      "Conexão TLS MQTT ativa",
      "Birth Certificate (NBIRTH) atualizado e sequência bdSeq coerente",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Verificar saúde do serviço Broker MQTT, certificados TLS e ACLs de subscrição.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "PLANT_ADMIN",
        expectedOutcome: "Reconexão dos clientes Sparkplug B e emissão de NBIRTH.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction: "Confirmar fluxo contínuo de NDATA/DDATA por 3 janelas consecutivas.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Telemetria MQTT normalizada no SCADA e Historian.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Protocols Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Industrial Protocols Team",
        summary: "Runbook MQTT Sparkplug B read-only.",
      },
    ],
  },

  // 7. HISTORIAN
  {
    runbookId: "RB_HISTORIAN_INGESTION_RECOVERY",
    title: "Recuperação de Persistência e Consultas no Industrial Historian",
    category: "HISTORIAN",
    affectedComponentTypes: ["HISTORIAN_STORAGE", "CLOUD_DATABASE"],
    symptoms: [
      "Historian sem gravar novas amostras enquanto SCADA recebe tempo real (RULE_14)",
      "Falha ou timeout em consultas históricas (RULE_29)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Comparar contadores de pacotes recebidos no barramento SCADA versus registros inseridos no Historian.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Confirmação de gargalo exclusivo no writer histórico.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "TENANT_ADMIN"],
    safetyWarnings: [
      "Preservar integridade das partições temporais e chaves de idempotência para evitar duplicação durante o backfill.",
    ],
    expectedEvidence: [
      "Lag de escrita do Historian < 2000ms",
      "Consultas históricas respondendo < 1000ms",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Reprocessar fila de batch insert do Historian e validar índices de partição temporal.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome: "Retomada imediata da gravação de séries temporais e backfill concluído.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Verificar persistência confirmada de >= 3 lotes consecutivos no Historian sem lacunas.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "SLO Historian Completeness restabelecido.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Data Platform Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Data Platform Team",
        summary: "Runbook de recuperação do Historian.",
      },
    ],
  },

  // 8. SCADA
  {
    runbookId: "RB_SCADA_STALE_DATA_INVESTIGATION",
    title: "Investigação de Dados STALE ou UNKNOWN nas Sinópticas SCADA",
    category: "SCADA",
    affectedComponentTypes: ["SCADA_CORE", "INDUSTRIAL_EQUIPMENT"],
    symptoms: ["Tags exibidas com badge STALE (RULE_22) ou estado UNKNOWN (RULE_21) no SCADA"],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Consultar o Grafo de Dependências para verificar se o Edge Gateway ou Protocolo upstream está offline.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome:
          "Determinação se a tag STALE é sintoma secundário de queda de gateway/protocolo.",
      },
      {
        stepNumber: 2,
        instruction: "Verificar se a tag possui deadband ativo e sinal físico estável (RULE_23).",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome:
          "Descarte de falso positivo quando o valor físico não variou além da banda morta.",
      },
    ],
    requiredPermissions: ["VIEWER", "EDGE_OPERATOR", "ENGINEER"],
    safetyWarnings: [
      "Nunca assumir que um componente em estado UNKNOWN está seguro ou desligado em campo.",
    ],
    expectedEvidence: ["Timestamp de amostra atualizado dentro do scan rate", "Qualidade GOOD"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Restabelecer o componente upstream identificado no grafo de dependências (Gateway ou Driver).",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Retorno automático da atualização das tags dependentes no SCADA.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar remoção automática do badge STALE após >= 3 amostras consecutivas com qualidade GOOD.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome: "Visualização SCADA íntegra e confiável.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi SCADA Engineering",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi SCADA Engineering",
        summary: "Runbook de investigação de tags STALE e UNKNOWN.",
      },
    ],
  },

  // 9. DATABASE
  {
    runbookId: "RB_DATABASE_CONNECTIVITY_RECOVERY",
    title: "Diagnóstico e Recuperação de Conectividade com o Banco de Dados Central",
    category: "DATABASE",
    affectedComponentTypes: ["CLOUD_DATABASE"],
    symptoms: ["Cloud saudável com falha de conexão ou timeout no PostgreSQL (RULE_12)"],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Inspecionar saturação do pool de conexões, queries bloqueadas e latência de escrita.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome:
          "Identificação de contenção de locks ou indisponibilidade de rede do banco.",
      },
    ],
    requiredPermissions: ["TENANT_ADMIN", "PLATFORM_ADMIN"],
    safetyWarnings: [
      "Manter todas as políticas RLS ativas durante qualquer procedimento de manutenção no banco.",
    ],
    expectedEvidence: ["Queries de health check respondendo < 50ms", "Zero timeouts de transação"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction: "Encerrar sessões órfãs em deadlock e reciclar o pool de conexões gerenciado.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome: "Normalização imediata da persistência transacional.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction: "Validar 3 verificações consecutivas de escrita e leitura com sucesso.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome: "Camada CLOUD_DATABASE em estado HEALTHY.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Database Reliability Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Database Reliability Team",
        summary: "Runbook de recuperação de banco de dados.",
      },
    ],
  },

  // 10. CERTIFICATES
  {
    runbookId: "RB_CERT_ROTATION_RENEWAL",
    title: "Renovação e Rotação de Certificados X.509 de Gateways e Sessões Industriais",
    category: "CERTIFICATES",
    affectedComponentTypes: ["EDGE_GATEWAY", "AUTH_SECURITY_SERVICE", "PROTOCOL_OPC_UA"],
    symptoms: [
      "Certificado expirado (RULE_06), revogado (RULE_07) ou falha mTLS na reconexão (RULE_24)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Verificar validade (notBefore/notAfter), fingerprint SHA-256 e status de revogação no Fleet Manager.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "AUDITOR",
        expectedOutcome: "Identificação exata da credencial inválida.",
      },
    ],
    requiredPermissions: ["PLANT_ADMIN", "AUDITOR", "TENANT_ADMIN"],
    safetyWarnings: [
      "Nunca desabilitar validação de certificado TLS/mTLS ou usar modo Insecure/None em produção.",
    ],
    expectedEvidence: [
      "Novo certificado X.509 ativo e verificado",
      "Handshake mTLS concluído com sucesso",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Emitir e provisionar novo certificado assinado pela CA da organização via Edge Fleet Manager.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "PLANT_ADMIN",
        expectedOutcome: "Credencial criptográfica renovada com auditoria SHA-256.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction: "Confirmar reconexão autenticada e 3 heartbeats assinados válidos.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "AUDITOR",
        expectedOutcome: "Comunicação segura restabelecida.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Security Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Industrial Security Team",
        summary: "Runbook de gestão de ciclo de vida de certificados X.509.",
      },
    ],
  },

  // 11. SECURITY
  {
    runbookId: "RB_SECURITY_INCIDENT_RESPONSE",
    title: "Resposta a Eventos de Segurança, Falha de Autenticação e Bloqueio Cross-Tenant",
    category: "SECURITY",
    affectedComponentTypes: ["AUTH_SECURITY_SERVICE", "EDGE_GATEWAY"],
    symptoms: [
      "Falha de autenticação de gateway (RULE_27) ou tentativa de acesso cross-tenant bloqueada (RULE_28)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Auditar trilha de segurança imutável (correlationId, actorId, tenantId alvo e assinatura).",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "AUDITOR",
        expectedOutcome:
          "Determinação se o evento decorre de erro de configuração ou tentativa de intrusão.",
      },
    ],
    requiredPermissions: ["AUDITOR", "TENANT_ADMIN", "PLATFORM_ADMIN"],
    safetyWarnings: ["Manter bloqueio preventivo ativo até conclusão da auditoria de segurança."],
    expectedEvidence: [
      "Integridade da cadeia de auditoria SHA-256 verificada",
      "Zero acessos não autorizados",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Revogar credenciais comprometidas e rotacionar chaves de identidade do gateway/usuário.",
        actionType: "SOFTWARE_ADMIN_PROCEDURE",
        minimumRole: "TENANT_ADMIN",
        expectedOutcome: "Isolamento completo do vetor de risco.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Verificar ausência de novas rejeições de autenticação por 3 janelas de observação.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "AUDITOR",
        expectedOutcome: "Postura de segurança validada.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Industrial Security Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Industrial Security Team",
        summary: "Runbook de resposta a incidentes de segurança OT/IT.",
      },
    ],
  },

  // 12. SYNCHRONIZATION
  {
    runbookId: "RB_SYNC_OUTBOX_DRAIN",
    title: "Drenagem de Fila Store-and-Forward (Outbox) e Reconciliação de Sequência",
    category: "SYNCHRONIZATION",
    affectedComponentTypes: ["DATA_PIPELINE", "EDGE_GATEWAY", "HISTORIAN_STORAGE"],
    symptoms: [
      "Outbox acumulando (RULE_08), atraso elevado (RULE_15), lacuna de sequência (RULE_16), duplicatas (RULE_17) ou fora de ordem (RULE_18)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Inspecionar tamanho do backlog no Outbox do Edge e taxa de transferência de sincronização.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome:
          "Estimativa do tempo necessário para drenagem completa (Data Recovery Time).",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "PLANT_ADMIN"],
    safetyWarnings: [
      "O motor de ingestão deve manter deduplicação idempotente ativa durante toda a drenagem.",
    ],
    expectedEvidence: [
      "Outbox = 0 registros pendentes",
      "Sequência contínua reconciliada no Historian",
    ],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Monitorar o replay controlado de lotes Store-and-Forward preservando os timestamps originais de coleta.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Drenagem progressiva sem sobrecarga da API Cloud.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar backlog zerado e persistência histórica verificada por >= 3 ciclos.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Sincronização Cloud-Edge 100% convergente.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Data Pipeline Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Data Pipeline Team",
        summary: "Runbook de reconciliação Store-and-Forward.",
      },
    ],
  },

  // 13. DATA_QUALITY (Clock Drift, Bad Sensor, Deadband)
  {
    runbookId: "RB_DATA_QUALITY_CLOCK_DRIFT",
    title: "Correção de Desalinhamento de Relógio (Clock Drift) entre Fonte, Edge e Cloud",
    category: "DATA_QUALITY",
    affectedComponentTypes: ["EDGE_GATEWAY", "INDUSTRIAL_EQUIPMENT", "DATA_PIPELINE"],
    symptoms: ["Desvio de relógio > 5000ms detectado entre sourceTimestamp e observedAt (RULE_19)"],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Comparar sourceTimestamp do PLC, timestamp do Edge Gateway e timestamp da Cloud.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Identificação de qual nó está sem sincronismo NTP/PTP.",
      },
    ],
    requiredPermissions: ["ENGINEER", "PLANT_ADMIN"],
    safetyWarnings: [
      "Não reescrever timestamps históricos já persistidos; preservar sempre o sourceTimestamp original.",
    ],
    expectedEvidence: ["Clock drift < 500ms por 3 ciclos consecutivos"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Ressincronizar serviço NTP/Chrony no Edge Gateway e solicitar ajuste de relógio RTC no PLC à engenharia.",
        actionType: "AUTHORIZED_ENGINEER_REQUIRED",
        minimumRole: "ENGINEER",
        expectedOutcome: "Alinhamento temporal < 500ms entre todas as camadas.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction: "Confirmar clockDriftMs < 1000ms em >= 3 pacotes consecutivos.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Precisão temporal restabelecida.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Metrology & Quality Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Metrology & Quality Team",
        summary: "Runbook para correção de clock drift.",
      },
    ],
  },
  {
    runbookId: "RB_DATA_QUALITY_BAD_SENSOR",
    title: "Investigação de Qualidade BAD Persistente em Sensor ou Registrador Industrial",
    category: "DATA_QUALITY",
    affectedComponentTypes: ["INDUSTRIAL_EQUIPMENT"],
    symptoms: ["Tag reportando qualidade BAD persistente com gateway e protocolo online (RULE_20)"],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction: "Verificar se outras tags do mesmo equipamento estão com qualidade GOOD.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome: "Isolamento da falha a um canal analógico/digital específico.",
      },
    ],
    requiredPermissions: ["EDGE_OPERATOR", "ENGINEER"],
    safetyWarnings: [
      "isPhysicalControlAllowed: false — Proibido forçar valores (FORCED) via Cloud para mascarar sensor com defeito.",
      "Inspeção de malha de corrente 4-20mA / PT100 em campo deve ser executada por instrumentista habilitado.",
    ],
    expectedEvidence: ["Qualidade da tag retornando para GOOD com leitura física plausível"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Inspecionar em campo o transdutor, fusível de bornes e cartão de entrada do PLC.",
        actionType: "QUALIFIED_HUMAN_FIELD_INTERVENTION",
        minimumRole: "ENGINEER",
        expectedOutcome: "Reparo ou substituição do elemento sensor em campo.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Confirmar >= 3 amostras consecutivas com qualidade GOOD e persistência no Historian.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "EDGE_OPERATOR",
        expectedOutcome: "Qualidade metrológica restabelecida.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Metrology & Quality Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Metrology & Quality Team",
        summary: "Runbook de diagnóstico de qualidade BAD em instrumentação.",
      },
    ],
  },
  {
    runbookId: "RB_DATA_QUALITY_DEADBAND_VERIFY",
    title: "Verificação de Comportamento Normal de Deadband (Banda Morta)",
    category: "DATA_QUALITY",
    affectedComponentTypes: ["INDUSTRIAL_EQUIPMENT", "SCADA_CORE"],
    symptoms: [
      "Ausência de novas amostras de valor quando a grandeza física permanece estável dentro do deadband (RULE_23)",
    ],
    diagnosticChecks: [
      {
        stepNumber: 1,
        instruction:
          "Conferir se o heartbeat do gateway e a sessão do protocolo estão ativos e saudáveis.",
        actionType: "READ_ONLY_VERIFICATION",
        minimumRole: "VIEWER",
        expectedOutcome: "Confirmação de operação normal sem falha de comunicação.",
      },
    ],
    requiredPermissions: ["VIEWER", "EDGE_OPERATOR"],
    safetyWarnings: [
      "Não abrir incidente de indisponibilidade quando o diagnóstico confirmar RULE_23_DEADBAND_NO_CHANGE_HEALTHY.",
    ],
    expectedEvidence: ["Gateway HEALTHY", "Protocolo HEALTHY", "Deadband ativo configurado"],
    recoveryProcedure: [
      {
        stepNumber: 1,
        instruction:
          "Nenhuma ação corretiva necessária — comportamento normal de otimização de banda.",
        actionType: "INFORMATIVE",
        minimumRole: "VIEWER",
        expectedOutcome: "Operação mantida sem alarmes falsos.",
      },
    ],
    validationProcedure: [
      {
        stepNumber: 1,
        instruction: "Manter monitoramento passivo padrão.",
        actionType: "INFORMATIVE",
        minimumRole: "VIEWER",
        expectedOutcome: "Conformidade operacional.",
      },
    ],
    version: "3.8.0",
    author: "ElétricAi Metrology & Quality Team",
    approvalStatus: "APPROVED",
    revisionHistory: [
      {
        version: "3.8.0",
        date: "2026-11-08",
        author: "ElétricAi Metrology & Quality Team",
        summary: "Prevenção de falso positivo para deadband ativo.",
      },
    ],
  },
]);

export class IndustrialRunbookLibrary {
  public getAllRunbooks(): readonly IndustrialRunbook[] {
    return OFFICIAL_INDUSTRIAL_RUNBOOKS;
  }

  public getRunbookById(runbookId: string): IndustrialRunbook | undefined {
    return OFFICIAL_INDUSTRIAL_RUNBOOKS.find((r) => r.runbookId === runbookId);
  }

  public getRunbooksByCategory(category: RunbookCategory): IndustrialRunbook[] {
    return OFFICIAL_INDUSTRIAL_RUNBOOKS.filter((r) => r.category === category);
  }

  /**
   * Retorna um runbook adaptando a visibilidade de execução dos passos conforme o papel RBAC do usuário.
   * Nunca retorna procedimentos que violem o limite de segurança `IS_PHYSICAL_CONTROL_ALLOWED = false`.
   */
  public getRunbookForRole(
    runbookId: string,
    userRole: FleetRole,
  ): {
    runbook: IndustrialRunbook;
    userCanExecuteRecovery: boolean;
    allowedDiagnosticSteps: RunbookStep[];
    allowedRecoverySteps: RunbookStep[];
    restrictedRecoveryStepsCount: number;
  } | null {
    const rb = this.getRunbookById(runbookId);
    if (!rb) return null;

    const userLvl = ROLE_LEVEL[userRole] ?? 1;

    const allowedDiagnosticSteps = rb.diagnosticChecks.filter(
      (s) => userLvl >= (ROLE_LEVEL[s.minimumRole] ?? 1),
    );
    const allowedRecoverySteps = rb.recoveryProcedure.filter(
      (s) => userLvl >= (ROLE_LEVEL[s.minimumRole] ?? 5),
    );

    return {
      runbook: rb,
      userCanExecuteRecovery: userRole !== "VIEWER" && allowedRecoverySteps.length > 0,
      allowedDiagnosticSteps,
      allowedRecoverySteps,
      restrictedRecoveryStepsCount: rb.recoveryProcedure.length - allowedRecoverySteps.length,
    };
  }
}

export const industrialRunbookLibrary = new IndustrialRunbookLibrary();
export { IS_PHYSICAL_CONTROL_ALLOWED };
