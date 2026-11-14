// Engineering Context Builder for Multi-Discipline Industrial Environments.
// Unifies Unifilar, Multifilar, Ladder, FBD, SCADA, PLC, Simulation, Alarms,
// Studio IEC, and Eletric Studio CLP (LOGO! 8) around the same project state and memory.
import { BRIEFING_SECURITY_DIRECTIVE } from "../context-sanitizer";
import { IS_PHYSICAL_CONTROL_ALLOWED, type AiModuleDiscipline } from "./types";

const MODULE_DISCIPLINE_GUIDES: Record<AiModuleDiscipline, string> = {
  unifilar:
    "Foco em topologia elétrica de potência (alimentador, QGBT/CCM, proteção, manobra, relé térmico, cabos NBR 5410 e cargas). Nunca invente conexões físicas sem confirmação do engenheiro.",
  multifilar:
    "Foco em expansão condutor a condutor (L1, L2, L3, N, PE, A1, A2, 13/14, 95/96) conforme IEC 60617 e correspondência biunívoca com o diagrama Unifilar.",
  ladder:
    "Foco em programação Ladder IEC 61131-3 (redes/rungs, contatos NA/NF XIC/XIO, bobinas OTE/OTL/OTU, temporizadores TON/TOF/TP, intertravamentos E-STOP NR-12).",
  fbd:
    "Foco em Diagrama de Blocos de Função (FBD IEC 61131-3), malhas lógicas, PID, blocos aritméticos e comparadores sincronizados com a base de variáveis do projeto.",
  scada:
    "Foco em supervisório industrial, tags em tempo real, telas sinóticas, historiador e receitas, mantendo coerência com os endereços do CLP e equipamentos do Unifilar.",
  plc:
    "Foco em arquitetura de hardware de CLP, rack, CPU, cartões DI/DO/AI/AO, tabela de variáveis (%I, %Q, %M, %MW, %IW, %QW) e diagnóstico de varredura.",
  simulation:
    "Foco em simulação dinâmica virtual (motores, partidas DOL/Estrela-Triângulo/VFD, correntes de partida, queda de tensão e resposta de malhas). Controle físico bloqueado (IS_PHYSICAL_CONTROL_ALLOWED = false).",
  alarms:
    "Foco em gerenciamento de alarmes industriais conforme ANSI/ISA-18.2 (prioridades, deadband/histerese, supressão de chattering e árvore de causa-efeito).",
  studio_iec:
    "Foco no ambiente completo IEC 61131-3 (ST, LD, FBD, SFC), tarefas cíclicas, bibliotecas verificadas e verificação estática.",
  compact_studio:
    "Foco no Eletric Studio CLP (classe LOGO! 8 / V8.4), módulos base e expansões digitais/analógicas, blocos especiais (PI, Rampa, Texto de Mensagem, Astrônomo) e simulação offline.",
  hardware:
    "Foco em seleção, dimensionamento e compatibilidade de módulos de hardware industrial, fontes 24 Vcc e barramentos.",
  io:
    "Foco em mapeamento de entradas e saídas (I/O), endereçamento físico/simbólico e detecção de conflitos ou canais órfãos.",
  comms:
    "Foco em redes industriais (Modbus TCP/RTU, OPC-UA, Sparkplug B / MQTT, Profinet, EtherNet/IP) em modo seguro de telemetria.",
  importer:
    "Foco em importação e normalização sem perdas de projetos externos (JSON, CSV, XML, Structured Text, Netlist) preservando tags e tipos reais de componentes.",
  validation:
    "Foco em auditoria normativa determinística (ABNT NBR 5410, NBR 14039, NR-10, NR-12, IEC 60909, IEC 61439, IEC 60204-1).",
  general:
    "Engenharia elétrica e automação industrial integrada entre potência, comando, CLP, SCADA e normas técnicas.",
};

export interface EngineeringProjectSnapshot {
  projectId?: string;
  projectName?: string;
  module: AiModuleDiscipline;
  nodesCount?: number;
  edgesCount?: number;
  equipmentSummary?: string[];
  variablesSummary?: string[];
  ladderRungsCount?: number;
  fbdBlocksCount?: number;
  scadaTagsCount?: number;
  activeAlarmsCount?: number;
  diagnosticsSummary?: string[];
  memorySummaryBlock?: string;
}

/**
 * Extracts a compact, cross-module technical snapshot from any project state object
 * without duplicating large raw JSON blobs.
 */
export function extractEngineeringSnapshotFromState(
  module: AiModuleDiscipline,
  rawState?: Record<string, unknown> | null,
  memorySummaryBlock?: string,
): EngineeringProjectSnapshot {
  if (!rawState || typeof rawState !== "object") {
    return {
      module,
      memorySummaryBlock,
    };
  }

  const nodesObj =
    (rawState.nodes as Record<string, any> | undefined) ??
    ((rawState.diagram as any)?.nodes as Record<string, any> | undefined) ??
    {};
  const edgesObj =
    (rawState.edges as Record<string, any> | undefined) ??
    ((rawState.diagram as any)?.edges as Record<string, any> | undefined) ??
    {};

  const nodeList = Array.isArray(nodesObj) ? nodesObj : Object.values(nodesObj);
  const edgeList = Array.isArray(edgesObj) ? edgesObj : Object.values(edgesObj);

  const equipmentSummary = nodeList.slice(0, 30).map((n: any) => {
    const kind = n?.params?.kind || n?.kind || n?.type || "component";
    const label = n?.label || n?.tag || n?.id || "?";
    return `${label} (${kind})`;
  });

  const rawVars =
    (rawState.variables as any[] | undefined) ??
    (rawState.ioVariables as any[] | undefined) ??
    (rawState.tags as any[] | undefined) ??
    [];
  const variablesSummary = Array.isArray(rawVars)
    ? rawVars.slice(0, 25).map((v: any) => `${v?.name || v?.tag || v?.id}:${v?.address || v?.type || "VAR"}`)
    : [];

  const ladderRungs =
    (rawState.rungs as any[] | undefined) ??
    ((rawState.ladder as any)?.rungs as any[] | undefined) ??
    [];
  const fbdBlocks =
    (rawState.fbdBlocks as any[] | undefined) ??
    ((rawState.fbd as any)?.blocks as any[] | undefined) ??
    [];
  const scadaTags =
    (rawState.scadaTags as any[] | undefined) ??
    ((rawState.scada as any)?.tags as any[] | undefined) ??
    [];
  const alarms =
    (rawState.alarms as any[] | undefined) ??
    ((rawState.scada as any)?.alarms as any[] | undefined) ??
    [];

  return {
    projectId: typeof rawState.projectId === "string" ? rawState.projectId : undefined,
    projectName:
      typeof rawState.projectName === "string"
        ? rawState.projectName
        : typeof (rawState.metadata as any)?.title === "string"
          ? (rawState.metadata as any).title
          : undefined,
    module,
    nodesCount: nodeList.length,
    edgesCount: edgeList.length,
    equipmentSummary,
    variablesSummary,
    ladderRungsCount: Array.isArray(ladderRungs) ? ladderRungs.length : 0,
    fbdBlocksCount: Array.isArray(fbdBlocks) ? fbdBlocks.length : 0,
    scadaTagsCount: Array.isArray(scadaTags) ? scadaTags.length : 0,
    activeAlarmsCount: Array.isArray(alarms) ? alarms.length : 0,
    memorySummaryBlock,
  };
}

/**
 * Builds the unified system instruction for the AI Gateway across all ElétricAi modules.
 */
export function buildUnifiedEngineeringSystemPrompt(options: {
  module?: AiModuleDiscipline;
  locale?: "pt-BR" | "en";
  snapshot?: EngineeringProjectSnapshot;
  memorySummaryBlock?: string;
}): string {
  const module = options.module ?? "general";
  const guide = MODULE_DISCIPLINE_GUIDES[module] || MODULE_DISCIPLINE_GUIDES.general;
  const snap = options.snapshot;
  const mem = options.memorySummaryBlock || snap?.memorySummaryBlock;

  const lines: string[] = [
    `Você é o Agente Central de Engenharia Elétrica e Automação Industrial do ElétricAi Industrial OS.`,
    BRIEFING_SECURITY_DIRECTIVE,
    ``,
    `[DIRETRIZES GLOBAIS INVIOLÁVEIS]`,
    `1. SEGURANÇA FÍSICA: IS_PHYSICAL_CONTROL_ALLOWED = ${String(IS_PHYSICAL_CONTROL_ALLOWED)}. Nenhuma ação ou ferramenta pode escrever em CLP físico, forçar saídas reais ou acionar motores/válvulas reais. Toda simulação e atuação ocorre exclusivamente em ambiente virtual.`,
    `2. INTEGRIDADE TOPOLÓGICA: Nunca invente conexões elétricas silenciosamente. Separe reparos estruturais determinísticos de propostas de engenharia que exigem aprovação do engenheiro.`,
    `3. COERÊNCIA MULTI-MÓDULO: Unifilar, Multifilar, Ladder, FBD, CLP, SCADA, Simulação, Alarmes, Studio IEC e Eletric Studio CLP compartilham o mesmo projeto e a mesma base de tags/variáveis.`,
    `4. NORMAS TÉCNICAS: Cite rigorosamente ABNT NBR 5410, NBR 14039, NR-10, NR-12, IEC 60617, IEC 60909, IEC 61439, IEC 61131-3 e ANSI/ISA-18.2 quando aplicável.`,
    `5. INVARIÂNCIA DE SÍMBOLOS: Preserve tags (QF1, KM1, FT1, M1), terminais IEC (1/L1, 2/T1, A1, A2, 95, 96, U1, V1, W1, PE) e operandos (%I0.0, %Q0.0, %MW10) sem traduzi-los.`,
    ``,
    `[DISCIPLINA ATIVA: ${module.toUpperCase()}]`,
    guide,
  ];

  if (snap) {
    lines.push(``, `[ESTADO TRANSVERSAL DO PROJETO]`);
    if (snap.projectName) lines.push(`- Projeto: ${snap.projectName}`);
    if (snap.nodesCount !== undefined || snap.edgesCount !== undefined) {
      lines.push(
        `- Diagrama Elétrico: ${snap.nodesCount ?? 0} equipamento(s), ${snap.edgesCount ?? 0} conexão(ões)`,
      );
    }
    if (snap.equipmentSummary && snap.equipmentSummary.length > 0) {
      lines.push(`- Equipamentos: ${snap.equipmentSummary.join(", ")}`);
    }
    if (snap.variablesSummary && snap.variablesSummary.length > 0) {
      lines.push(`- Variáveis/Tags compartilhadas: ${snap.variablesSummary.join(", ")}`);
    }
    if (
      (snap.ladderRungsCount ?? 0) > 0 ||
      (snap.fbdBlocksCount ?? 0) > 0 ||
      (snap.scadaTagsCount ?? 0) > 0
    ) {
      lines.push(
        `- Automação/SCADA: ${snap.ladderRungsCount ?? 0} rung(s) Ladder, ${snap.fbdBlocksCount ?? 0} bloco(s) FBD, ${snap.scadaTagsCount ?? 0} tag(s) SCADA, ${snap.activeAlarmsCount ?? 0} alarme(s)`,
      );
    }
  }

  if (mem && mem.trim().length > 0) {
    lines.push(``, `[MEMÓRIA CONTÍNUA DE ENGENHARIA DO PROJETO]`, mem.trim());
  }

  return lines.join("\n");
}
