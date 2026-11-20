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
import { estopOperand, motorControlPlan } from "@/lib/ladder/from-unifilar";
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
  // Posição que o engenheiro deu ao bloco é preservada na regeneração.
  const keepPos = (id: string, x: number, yy: number): CompactVisualNodeLayout =>
    program.layout.fbd[id] ?? { x, y: yy };

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

  // Mesmos operandos do Ladder (fonte única `motorControlPlan`): o engenheiro vê
  // K1, F1_OK, M1_PARTIR… nos dois editores.
  const generatedByName = new Map<string, CompactIoSymbol>();
  const symbolFor = (
    kind: "DI" | "DO",
    name: string,
    comment: string,
    initialValue: boolean,
  ): CompactIoSymbol | null => {
    const key = sym(name);
    const existing = generatedByName.get(key);
    if (existing) return existing;
    const s = makeSymbol(`${UF_PREFIX}sym_${key}`, kind, name, comment, initialValue);
    if (s) generatedByName.set(key, s);
    return s;
  };
  const inputNode = (
    s: CompactIoSymbol,
    id: string,
    x: number,
    y: number,
    instanceName?: string,
  ) => {
    const n = ioNode(id, "INPUT_DI", s);
    nodes.push(instanceName ? { ...n, instanceName } : n);
    fbdLayout[id] = keepPos(id, x, y);
    return id;
  };
  const gate = (
    id: string,
    blockType: "NAND" | "OR",
    instanceName: string,
    comment: string,
    x: number,
    y: number,
  ) => {
    const pins = blockType === "NAND" ? 4 : 2;
    nodes.push({
      id,
      pageId: UF_PAGE_ID,
      blockType,
      instanceName,
      category: "logic",
      libraryVersion: "1.0.0",
      params: {},
      inputs: Array.from({ length: pins }, (_, n) => ({
        id: `in${n + 1}`,
        name: `IN${n + 1}`,
        direction: "input" as const,
        signalType: BOOL,
        ...(blockType === "NAND" && n >= 2 ? { defaultValue: true } : {}),
      })),
      outputs: [{ id: "out", name: "OUT", direction: "output", signalType: BOOL }],
      comment,
    });
    fbdLayout[id] = keepPos(id, x, y);
  };
  const selo = (id: string, instanceName: string, x: number, y: number) => {
    nodes.push({
      id,
      pageId: UF_PAGE_ID,
      blockType: "RS",
      instanceName,
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
    fbdLayout[id] = keepPos(id, x, y);
  };
  const output = (s: CompactIoSymbol, id: string, x: number, y: number) => {
    nodes.push(ioNode(id, "OUTPUT_QO", s));
    fbdLayout[id] = keepPos(id, x, y);
  };

  const estopName = estopOperand(doc);
  let estopNodeId: string | undefined;
  if (fleet.length > 0) {
    const estop = symbolFor(
      "DI",
      estopName,
      "Cadeia de emergência NF (1 = íntegra) — circuito físico obrigatório (NR-12)",
      true,
    );
    if (estop) estopNodeId = inputNode(estop, `${UF_PREFIX}di_estop`, 40, 20);
  }

  let y = 120;
  for (const m of fleet) {
    const plan = motorControlPlan(doc, m);
    const k = sym(plan.M);
    if (!plan.coil) {
      warnings.push(`${plan.M}: sem contator nem inversor no ramal — nada a comandar pelo CLP`);
      continue;
    }
    // Desligamento: qualquer contato NF aberto (parada, emergência, disjuntor, térmico, inversor).
    const stopSym = symbolFor(
      "DI",
      plan.stop,
      `${plan.M} — botoeira de parada NF (1 = repouso)`,
      true,
    );
    const tripSignals: string[] = [];
    if (stopSym) tripSignals.push(inputNode(stopSym, `${UF_PREFIX}di_stop_${k}`, 40, y));
    if (estopNodeId) tripSignals.push(estopNodeId);
    plan.protections.forEach((op, idx) => {
      const ps = symbolFor(
        "DI",
        op,
        `${op.replace(/_(OK|PRONTO)$/, "")} — contato NF (1 = sem disparo)`,
        true,
      );
      if (ps)
        tripSignals.push(inputNode(ps, `${UF_PREFIX}di_${sym(op)}_${k}`, 40, y + 50 * (idx + 1)));
    });
    // NAND de 4 entradas; com mais sinais, dois NAND somados por OR.
    const nandA = `${UF_PREFIX}nand_${k}`;
    gate(nandA, "NAND", `DESLIGA_${k}`, "Qualquer contato NF aberto desliga", 260, y + 50);
    tripSignals
      .slice(0, 4)
      .forEach((src, n) =>
        connections.push(link(`${UF_PREFIX}c_trip${n}_${k}`, src, "out", nandA, `in${n + 1}`)),
      );
    let tripOut = nandA;
    if (tripSignals.length > 4) {
      const nandB = `${UF_PREFIX}nandb_${k}`;
      gate(nandB, "NAND", `DESLIGA_B_${k}`, "Demais contatos NF", 260, y + 150);
      tripSignals
        .slice(4, 8)
        .forEach((src, n) =>
          connections.push(link(`${UF_PREFIX}c_tripb${n}_${k}`, src, "out", nandB, `in${n + 1}`)),
        );
      const or = `${UF_PREFIX}ortrip_${k}`;
      gate(or, "OR", `DESLIGA_OU_${k}`, "Desliga se qualquer grupo abrir", 360, y + 100);
      connections.push(
        link(`${UF_PREFIX}c_ora_${k}`, nandA, "out", or, "in1"),
        link(`${UF_PREFIX}c_orb_${k}`, nandB, "out", or, "in2"),
      );
      tripOut = or;
    }

    if (plan.reversing) {
      const { fwd, rev, KF, KR } = plan.reversing;
      const sF = symbolFor("DI", fwd, `${plan.M} — botoeira sentido horário NA`, false);
      const sR = symbolFor("DI", rev, `${plan.M} — botoeira sentido anti-horário NA`, false);
      const oF = symbolFor("DO", KF, `${plan.M} — contator horário`, false);
      const oR = symbolFor("DO", KR, `${plan.M} — contator anti-horário`, false);
      if (!sF || !sR || !oF || !oR) continue;
      const nF = inputNode(sF, `${UF_PREFIX}di_fwd_${k}`, 460, y);
      const nR = inputNode(sR, `${UF_PREFIX}di_rev_${k}`, 460, y + 120);
      // Intertravamento: o outro sentido ligado reseta este (leitura da saída no
      // ciclo anterior — quebra o laço como num CLP real).
      const fbF = inputNode(oF, `${UF_PREFIX}fb_fwd_${k}`, 460, y + 60, `${sym(KF)}_RET`);
      const fbR = inputNode(oR, `${UF_PREFIX}fb_rev_${k}`, 460, y + 180, `${sym(KR)}_RET`);
      const orF = `${UF_PREFIX}or_fwd_${k}`;
      const orR = `${UF_PREFIX}or_rev_${k}`;
      gate(orF, "OR", `RESET_HOR_${k}`, `Desliga ou ${KR} ligado`, 600, y + 30);
      gate(orR, "OR", `RESET_ANTI_${k}`, `Desliga ou ${KF} ligado`, 600, y + 150);
      const rsF = `${UF_PREFIX}rs_fwd_${k}`;
      const rsR = `${UF_PREFIX}rs_rev_${k}`;
      selo(rsF, `SELO_HOR_${k}`, 760, y);
      selo(rsR, `SELO_ANTI_${k}`, 760, y + 120);
      output(oF, `${UF_PREFIX}qo_fwd_${k}`, 940, y);
      output(oR, `${UF_PREFIX}qo_rev_${k}`, 940, y + 120);
      connections.push(
        link(`${UF_PREFIX}c_orf1_${k}`, tripOut, "out", orF, "in1"),
        link(`${UF_PREFIX}c_orf2_${k}`, fbR, "out", orF, "in2"),
        link(`${UF_PREFIX}c_orr1_${k}`, tripOut, "out", orR, "in1"),
        link(`${UF_PREFIX}c_orr2_${k}`, fbF, "out", orR, "in2"),
        link(`${UF_PREFIX}c_sf_${k}`, nF, "out", rsF, "s"),
        link(`${UF_PREFIX}c_sr_${k}`, nR, "out", rsR, "s"),
        link(`${UF_PREFIX}c_rf_${k}`, orF, "out", rsF, "r1"),
        link(`${UF_PREFIX}c_rr_${k}`, orR, "out", rsR, "r1"),
        link(`${UF_PREFIX}c_qf_${k}`, rsF, "q1", `${UF_PREFIX}qo_fwd_${k}`, "in"),
        link(`${UF_PREFIX}c_qr_${k}`, rsR, "q1", `${UF_PREFIX}qo_rev_${k}`, "in"),
      );
      y += 280;
    } else {
      const startSym = symbolFor("DI", plan.start, `${plan.M} — botoeira de partida NA`, false);
      const out = symbolFor("DO", plan.coil, `${plan.M} — bobina (${plan.chainText})`, false);
      if (!startSym || !out) continue;
      const nStart = inputNode(startSym, `${UF_PREFIX}di_start_${k}`, 460, y);
      const nMem = `${UF_PREFIX}rs_${k}`;
      const nOut = `${UF_PREFIX}qo_${k}`;
      selo(nMem, `SELO_${k}`, 660, y);
      output(out, nOut, 860, y);
      connections.push(
        link(`${UF_PREFIX}c_start_${k}`, nStart, "out", nMem, "s"),
        link(`${UF_PREFIX}c_trip_${k}`, tripOut, "out", nMem, "r1"),
        link(`${UF_PREFIX}c_out_${k}`, nMem, "q1", nOut, "in"),
      );
      if (plan.starDelta) {
        warnings.push(
          `${plan.M}: estrela-triângulo — a comutação Y/Δ (${plan.starDelta.KY}/${plan.starDelta.KD}) está no Ladder; aqui o comando de linha ${plan.coil}.`,
        );
      }
      y += Math.max(200, 50 * (plan.protections.length + 2));
    }
    for (const issue of m.issues) warnings.push(`${plan.M}: ${issue}`);
  }

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
            gridRows: Math.min(200, Math.max(16, Math.ceil(y / 40) + 2)),
          },
        ]
      : userPages;

  if (fleet.length > 0) {
    const page = pages.find((pg) => pg.id === UF_PAGE_ID);
    if (page)
      page.source = { kind: "unifilar", signature: ufPageSignature(nodes, connections, symbols) };
  }

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

// ── Sincronização automática ───────────────────────────────────────────────

/** FNV-1a 32 bits — assinatura curta e estável (não é segurança, só detecção de edição). */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Assinatura da LÓGICA da página gerada (blocos, parâmetros, ligações e
 * símbolos) — sem posições: mover blocos não é editar a lógica.
 */
function ufPageSignature(
  nodes: readonly CompactNode[],
  connections: readonly CompactConnection[],
  symbols: readonly CompactIoSymbol[],
): string {
  const n = nodes
    .filter((x) => x.pageId === UF_PAGE_ID)
    .map(
      (x) =>
        `${x.id}|${x.blockType}|${x.instanceName}|${JSON.stringify(x.params)}|${x.ioSymbolId ?? ""}`,
    )
    .sort();
  const c = connections
    .filter((x) => x.pageId === UF_PAGE_ID)
    .map((x) => `${x.fromNodeId}.${x.fromPortId}>${x.toNodeId}.${x.toPortId}`)
    .sort();
  const s = symbols
    .filter((x) => x.id.startsWith(UF_PREFIX))
    .map((x) => `${x.id}|${x.symbolicName}|${x.ioKind}`)
    .sort();
  return `${fnv1a(n.join("\n"))}${fnv1a(c.join("\n"))}${fnv1a(s.join("\n"))}`;
}

export type StudioAutoSyncResult =
  | { status: "unchanged" }
  | { status: "edited_by_user" }
  | { status: "updated"; model: CompactProgramModel; warnings: string[] };

/**
 * Mantém a página "Motores (unifilar)" acompanhando o unifilar:
 *  • página editada pelo engenheiro (lógica diferente da assinatura gerada) → é dele, não mexe;
 *  • sem mudança → nada;
 *  • senão → regenera preservando posições e o que é do usuário.
 */
export function autoSyncStudioFromUnifilar(
  program: CompactProgramModel,
  doc: DiagramDoc,
  nowIso: string = new Date().toISOString(),
): StudioAutoSyncResult {
  const page = program.pages.find((p) => p.id === UF_PAGE_ID);
  if (page?.source) {
    const current = ufPageSignature(program.nodes, program.connections, program.ioSymbols);
    if (current !== page.source.signature) return { status: "edited_by_user" };
  }
  const next = syncMotorLogicFromUnifilar(program, doc, nowIso);
  const nextPage = next.model.pages.find((p) => p.id === UF_PAGE_ID);
  const sameLogic =
    (!page && !nextPage) ||
    (!!page?.source && !!nextPage?.source && page.source.signature === nextPage.source.signature);
  if (sameLogic) return { status: "unchanged" };
  return { status: "updated", model: next.model, warnings: next.warnings };
}
