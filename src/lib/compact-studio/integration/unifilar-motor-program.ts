/**
 * Gerador de lógica de comando de motores no FB Electric Studio a partir do UNIFILAR.
 *
 * Fonte única (AGENTS.md §11.1/§12.1): cada motor do unifilar (via `buildMotorFleet`)
 * vira um circuito de comando partida/parada com selo, reset dominante:
 *
 *   K_<tag> := NOT (PARADA_NF ∧ TÉRMICO_95-96 ∧ EMERGÊNCIA_NF)  →  R1 (reset dominante)
 *              PARTIDA_NA                                     →  S
 *
 * Contatos de segurança são NF (fail-safe): fio rompido = parada. Os valores
 * iniciais simulados desses contatos são TRUE (circuito íntegro).
 *
 * Idempotente: tudo que é gerado vive na página `uf-motors` com IDs `uf_*`.
 * Regenerar substitui só essa página; páginas e símbolos do usuário ficam
 * intactos, e endereços já usados por eles NÃO são reaproveitados.
 */
import type { DiagramDoc } from "@/lib/diagram/schema";
import { buildMotorFleet, type FleetMotor } from "@/lib/simulation/motor-fleet";
import type {
  CompactConnection,
  CompactIoSymbol,
  CompactNode,
  CompactPage,
  CompactProgramModel,
  CompactVisualNodeLayout,
} from "../domain/types";

export const UF_PAGE_ID = "uf-motors";
const UF_PREFIX = "uf_";

export interface UnifilarProgramResult {
  model: CompactProgramModel;
  motorsGenerated: number;
  warnings: string[];
}

function sym(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
  return /^[A-Z_]/.test(cleaned) ? cleaned : `M_${cleaned}`;
}

/** Aloca o próximo endereço livre `I<n>` / `Q<n>` não usado pelo usuário. */
function addressAllocator(prefix: "I" | "Q", taken: Set<string>) {
  let n = 1;
  return (): string => {
    while (taken.has(`${prefix}${n}`)) n++;
    const addr = `${prefix}${n}`;
    taken.add(addr);
    n++;
    return addr;
  };
}

const BOOL = "BOOL" as const;

function ioNode(
  id: string,
  blockType: "INPUT_DI" | "OUTPUT_QO",
  symbol: CompactIoSymbol,
): CompactNode {
  const isOut = blockType === "OUTPUT_QO";
  return {
    id,
    pageId: UF_PAGE_ID,
    blockType,
    instanceName: symbol.symbolicName,
    category: "io",
    libraryVersion: "1.0.0",
    params: { address: symbol.address },
    inputs: isOut ? [{ id: "in", name: "IN", direction: "input", signalType: BOOL }] : [],
    outputs: isOut ? [] : [{ id: "out", name: "OUT", direction: "output", signalType: BOOL }],
    ioSymbolId: symbol.id,
    comment: symbol.comment,
  };
}

function link(
  id: string,
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): CompactConnection {
  return {
    id,
    pageId: UF_PAGE_ID,
    fromNodeId: from,
    fromPortId: fromPort,
    toNodeId: to,
    toPortId: toPort,
    signalType: BOOL,
  };
}

/**
 * Gera/atualiza a página de comando de motores no programa do Studio.
 * `nowIso` é injetável para determinismo em testes.
 */
export function syncMotorLogicFromUnifilar(
  program: CompactProgramModel,
  doc: DiagramDoc,
  nowIso: string = new Date().toISOString(),
): UnifilarProgramResult {
  const fleet: FleetMotor[] = buildMotorFleet(doc);
  const warnings: string[] = [];

  // 1. Remove a geração anterior (idempotência).
  const userNodes = program.nodes.filter((n) => n.pageId !== UF_PAGE_ID);
  const userConnections = program.connections.filter((c) => c.pageId !== UF_PAGE_ID);
  const userSymbols = program.ioSymbols.filter((s) => !s.id.startsWith(UF_PREFIX));
  const userPages = program.pages.filter((p) => p.id !== UF_PAGE_ID);
  const keepLayout = <T>(rec: Record<string, T>, ids: Set<string>) =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => ids.has(k)));
  const userNodeIds = new Set(userNodes.map((n) => n.id));
  const userConnIds = new Set(userConnections.map((c) => c.id));

  const takenAddr = new Set(userSymbols.map((s) => s.address.toUpperCase()));
  const takenNames = new Set(userSymbols.map((s) => s.symbolicName.toUpperCase()));
  const nextI = addressAllocator("I", takenAddr);
  const nextQ = addressAllocator("Q", takenAddr);

  const symbols: CompactIoSymbol[] = [];
  const nodes: CompactNode[] = [];
  const connections: CompactConnection[] = [];
  const fbdLayout: Record<string, CompactVisualNodeLayout> = {};

  const makeSymbol = (
    id: string,
    kind: "DI" | "DO",
    name: string,
    comment: string,
    initialValue: boolean,
  ): CompactIoSymbol | null => {
    let symbolicName = sym(name);
    if (takenNames.has(symbolicName)) {
      warnings.push(
        `Símbolo "${symbolicName}" já existe no programa — gerado como "${symbolicName}_UF"`,
      );
      symbolicName = `${symbolicName}_UF`;
    }
    takenNames.add(symbolicName);
    const s: CompactIoSymbol = {
      id,
      ioKind: kind,
      address: kind === "DI" ? nextI() : nextQ(),
      symbolicName,
      signalType: BOOL,
      comment,
      retentive: false,
      initialValue,
    };
    symbols.push(s);
    return s;
  };

  if (fleet.length > 0) {
    const estop = makeSymbol(
      `${UF_PREFIX}sym_estop`,
      "DI",
      "EMERG_OK",
      "Cadeia de emergência NF (1 = íntegra) — circuito físico obrigatório (NR-12)",
      true,
    );
    if (estop) {
      nodes.push(ioNode(`${UF_PREFIX}di_estop`, "INPUT_DI", estop));
      fbdLayout[`${UF_PREFIX}di_estop`] = { x: 40, y: 20 };
    }
  }

  fleet.forEach((m, i) => {
    const tag = m.config.tag;
    const k = sym(tag);
    const y = 120 + i * 200;
    const start = makeSymbol(
      `${UF_PREFIX}sym_start_${k}`,
      "DI",
      `PARTIDA_${k}`,
      `${tag} — botoeira de partida NA`,
      false,
    );
    const stop = makeSymbol(
      `${UF_PREFIX}sym_stop_${k}`,
      "DI",
      `PARADA_${k}`,
      `${tag} — botoeira de parada NF (1 = repouso)`,
      true,
    );
    const ol = makeSymbol(
      `${UF_PREFIX}sym_ol_${k}`,
      "DI",
      `TERMICO_${k}`,
      `${tag} — relé térmico 95-96 NF (1 = sem disparo)`,
      true,
    );
    const out = makeSymbol(
      `${UF_PREFIX}sym_k_${k}`,
      "DO",
      `K_${k}`,
      `${tag} — bobina do contator (CCM ${m.io.commandOutput})`,
      false,
    );
    if (!start || !stop || !ol || !out) return;

    const nStart = `${UF_PREFIX}di_start_${k}`;
    const nStop = `${UF_PREFIX}di_stop_${k}`;
    const nOl = `${UF_PREFIX}di_ol_${k}`;
    const nTrip = `${UF_PREFIX}nand_${k}`;
    const nMem = `${UF_PREFIX}rs_${k}`;
    const nOut = `${UF_PREFIX}qo_${k}`;

    nodes.push(
      ioNode(nStart, "INPUT_DI", start),
      ioNode(nStop, "INPUT_DI", stop),
      ioNode(nOl, "INPUT_DI", ol),
    );
    nodes.push({
      id: nTrip,
      pageId: UF_PAGE_ID,
      blockType: "NAND",
      instanceName: `DESLIGA_${k}`,
      category: "logic",
      libraryVersion: "1.0.0",
      params: {},
      inputs: [
        { id: "in1", name: "IN1", direction: "input", signalType: BOOL },
        { id: "in2", name: "IN2", direction: "input", signalType: BOOL },
        { id: "in3", name: "IN3", direction: "input", signalType: BOOL, defaultValue: true },
        { id: "in4", name: "IN4", direction: "input", signalType: BOOL, defaultValue: true },
      ],
      outputs: [{ id: "out", name: "OUT", direction: "output", signalType: BOOL }],
      comment: "Qualquer contato NF aberto (parada, térmico, emergência) desliga",
    });
    nodes.push({
      id: nMem,
      pageId: UF_PAGE_ID,
      blockType: "RS",
      instanceName: `SELO_${k}`,
      category: "logic",
      libraryVersion: "1.0.0",
      params: {},
      inputs: [
        { id: "s", name: "S", direction: "input", signalType: BOOL },
        { id: "r1", name: "R1", direction: "input", signalType: BOOL },
      ],
      outputs: [{ id: "q1", name: "Q1", direction: "output", signalType: BOOL }],
      comment: "Selo com reset dominante (parada prevalece sobre partida)",
    });
    nodes.push(ioNode(nOut, "OUTPUT_QO", out));

    connections.push(
      link(`${UF_PREFIX}c_start_${k}`, nStart, "out", nMem, "s"),
      link(`${UF_PREFIX}c_stop_${k}`, nStop, "out", nTrip, "in1"),
      link(`${UF_PREFIX}c_ol_${k}`, nOl, "out", nTrip, "in2"),
      link(`${UF_PREFIX}c_estop_${k}`, `${UF_PREFIX}di_estop`, "out", nTrip, "in3"),
      link(`${UF_PREFIX}c_trip_${k}`, nTrip, "out", nMem, "r1"),
      link(`${UF_PREFIX}c_out_${k}`, nMem, "q1", nOut, "in"),
    );
    fbdLayout[nStart] = { x: 40, y };
    fbdLayout[nStop] = { x: 40, y: y + 50 };
    fbdLayout[nOl] = { x: 40, y: y + 100 };
    fbdLayout[nTrip] = { x: 260, y: y + 50 };
    fbdLayout[nMem] = { x: 460, y };
    fbdLayout[nOut] = { x: 660, y };

    for (const issue of m.issues) warnings.push(`${tag}: ${issue}`);
  });

  const hw = program.hardware;
  const diCount = [...userSymbols, ...symbols].filter((s) => s.ioKind === "DI").length;
  const doCount = [...userSymbols, ...symbols].filter((s) => s.ioKind === "DO").length;
  if (hw.maxDigitalInputs > 0 && diCount > hw.maxDigitalInputs) {
    warnings.push(
      `Hardware: ${diCount} entradas digitais necessárias, CLP configurado suporta ${hw.maxDigitalInputs} — adicione módulos de expansão`,
    );
  }
  const maxDo = hw.maxDigitalOutputs;
  if (maxDo > 0 && doCount > maxDo) {
    warnings.push(
      `Hardware: ${doCount} saídas digitais necessárias, CLP configurado suporta ${maxDo} — adicione módulos de expansão`,
    );
  }

  const pages: CompactPage[] =
    fleet.length > 0
      ? [
          ...userPages,
          {
            id: UF_PAGE_ID,
            name: "Motores (unifilar)",
            order: userPages.reduce((m, p) => Math.max(m, p.order), -1) + 1,
            description:
              "Gerada automaticamente a partir do diagrama unifilar — regenerar sobrescreve esta página",
            gridCols: 24,
            gridRows: Math.max(16, Math.ceil((120 + fleet.length * 200) / 40)),
          },
        ]
      : userPages;

  return {
    motorsGenerated: fleet.length,
    warnings,
    model: {
      ...program,
      updatedAt: nowIso,
      pages,
      nodes: [...userNodes, ...nodes],
      connections: [...userConnections, ...connections],
      ioSymbols: [...userSymbols, ...symbols],
      layout: {
        ...program.layout,
        fbd: { ...keepLayout(program.layout.fbd, userNodeIds), ...fbdLayout },
        lad: keepLayout(program.layout.lad, userNodeIds),
        edgesFbd: keepLayout(program.layout.edgesFbd, userConnIds),
        edgesLad: keepLayout(program.layout.edgesLad, userConnIds),
      },
    },
  };
}
