// Unifilar → Ladder: o MESMO projeto nos dois editores. PURO e determinístico.
//
// Cada equipamento de comando do unifilar vira redes Ladder com a função real
// dele (IEC 61131-3 / NR-12 / IEC 60204-1):
//  • Motor com partida direta ou soft-starter: selo partida/parada da bobina do
//    contator, em série com emergência, disjuntor-motor (contato auxiliar) e relé
//    térmico 95-96 — contatos de segurança NF (fail-safe: fio rompido = parada).
//  • Motor com inversor: comando de marcha do inversor (+ pronto/sem falha).
//  • Estrela-triângulo: contator de linha + estrela + triângulo com temporizador
//    de comutação e intertravamento elétrico Y ↔ Δ.
//  • Contator que alimenta outra carga (iluminação, tomadas, resistência): selo
//    liga/desliga com as proteções do circuito.
//  • Sinalização de falha (térmico/disjuntor/inversor) por motor.
//
// Operandos simbólicos derivados das TAGS do unifilar (K1, F1, Q1, M1 …): o
// engenheiro reconhece o mesmo equipamento nos dois editores. Nenhum endereço
// físico é inventado — o mapeamento %I/%Q é feito no editor do CLP.
//
// Sincronização (`mergeUnifilarRungs`): redes geradas têm id `uf-…` e guardam a
// assinatura do que foi gerado. Rede gerada que o engenheiro EDITOU passa a ser
// dele (não é sobrescrita); as não editadas acompanham o unifilar; redes do
// usuário nunca são tocadas.
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import type { EditorTag } from "@/lib/editor/store";
import { buildMotorFleet, type FleetMotor } from "@/lib/simulation/motor-fleet";
import {
  buildTopologyFromCells,
  emptyCell,
  type LadderBranch,
  type LadderCell,
  type LadderRung,
} from "./types";

export const UF_RUNG_PREFIX = "uf-";
/** Tempo de comutação estrela → triângulo sugerido (ajustar à curva de partida). */
export const STAR_DELTA_DEFAULT_MS = 5000;

export interface UnifilarLadderResult {
  rungs: LadderRung[];
  tags: EditorTag[];
  warnings: string[];
}

type Role = "coil" | "start" | "stop" | "safety" | "feedback" | "timer" | "alarm";

function sym(raw: string): string {
  const s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return /^[A-Z_]/.test(s) ? s : `X_${s}`;
}

function tagOf(n: DiagramNode | undefined): string | undefined {
  if (!n) return undefined;
  const t = typeof n.params.tag === "string" ? n.params.tag.trim() : "";
  return sym(t || n.label?.trim() || n.id);
}

const contact = (operand: string, kind: "XIC" | "XIO" = "XIC"): LadderCell => ({
  kind,
  operand,
});

function branchSig(b: LadderBranch): string {
  return b.items
    .map((it) =>
      it.type === "instruction"
        ? `${it.instruction.kind}:${it.instruction.operand}:${it.instruction.preset ?? ""}`
        : `(${it.branches.map(branchSig).join("||")})`,
    )
    .join(",");
}

/**
 * Assinatura estável da rede: lógica EFETIVA (topologia — é o que o editor altera
 * ao mover/excluir elementos), rótulo e comentário. Ids e estado de execução não
 * entram. Divergiu do que foi gerado → o engenheiro editou.
 */
export function rungSignature(
  r: Pick<LadderRung, "id" | "cells" | "cols" | "topology" | "label" | "comment">,
): string {
  const topo = r.topology ?? buildTopologyFromCells({ ...r } as LadderRung);
  const outs = topo.outputs.map((o) => `${o.kind}:${o.operand}:${o.preset ?? ""}`).join("+");
  return `${branchSig(topo.rootBranch)}=>${outs}#${r.label}#${r.comment ?? ""}`;
}

function withSource(r: Omit<LadderRung, "source">, equipmentId: string): LadderRung {
  return { ...r, source: { kind: "unifilar", equipmentId, signature: rungSignature(r) } };
}

/**
 * Rede em série com selo opcional: `series` em série; o último contato da série
 * tem `seal` em paralelo (linha 2); saída no fim.
 */
function makeRung(
  id: string,
  label: string,
  comment: string,
  series: LadderCell[],
  output: LadderCell,
  seal?: LadderCell,
  equipmentId?: string,
  /** Posição na série do contato que recebe o selo em paralelo (padrão: o último). */
  sealIndex?: number,
): LadderRung {
  const cols = Math.max(3, series.length + 1);
  const row0: LadderCell[] = Array.from({ length: cols }, emptyCell);
  series.forEach((c, i) => (row0[i] = c));
  row0[cols - 1] = output;
  const cells: LadderCell[][] = [row0];
  if (seal) {
    const row1: LadderCell[] = Array.from({ length: cols }, emptyCell);
    row1[sealIndex ?? series.length - 1] = seal;
    cells.push(row1);
  }
  return withSource({ id, label, comment, cols, cells }, equipmentId ?? id);
}

const isPower = (e: DiagramEdge) => e.kind === "power" && e.sheet === "unifilar";

/** Contatores e proteções a montante de uma carga não motora (ramal até barramento). */
function upstreamChain(doc: DiagramDoc, loadId: string) {
  const inn = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (!isPower(e)) continue;
    (inn.get(e.target) ?? inn.set(e.target, []).get(e.target)!).push(e);
  }
  const out: { breaker?: DiagramNode; contactor?: DiagramNode; thermal?: DiagramNode } = {};
  let cur = loadId;
  const seen = new Set([cur]);
  for (let i = 0; i < 12; i++) {
    const e = (inn.get(cur) ?? [])[0];
    const up = e ? doc.nodes[e.source] : undefined;
    if (!up || seen.has(up.id)) break;
    seen.add(up.id);
    const k = up.params.kind;
    if (k === "busbar" || k === "ccm" || k === "transformer" || k === "generator") break;
    if (k === "contactor" && !out.contactor) out.contactor = up;
    else if (k === "thermal_relay" && !out.thermal) out.thermal = up;
    else if (k === "breaker" && !out.breaker) out.breaker = up;
    cur = up.id;
  }
  return out;
}

/** Operando da emergência: botão do diagrama (tag) ou a entrada padrão S0 do relé de segurança. */
export function estopOperand(doc: DiagramDoc): string {
  const node = Object.values(doc.nodes).find(
    (n) => n.sheet === "unifilar" && n.params.kind === "estop",
  );
  return `${tagOf(node) ?? "S0"}_OK`;
}

/**
 * Nomes de comando de UM motor — fonte única para Ladder e FB Electric Studio
 * (os dois editores usam exatamente os mesmos operandos).
 */
export interface MotorControlPlan {
  M: string;
  method: FleetMotor["config"]["startMethod"];
  stop: string;
  start: string;
  /** Contatos NF de proteção do ramal (sem a emergência): disjuntor, térmico, inversor pronto. */
  protections: string[];
  /** Bobina principal (contator de linha/horário ou marcha do inversor). */
  coil?: string;
  chainText: string;
  reversing?: { fwd: string; rev: string; KF: string; KR: string; rolesDeclared: boolean };
  starDelta?: { K: string; KY: string; KD: string; T: string; drawn: boolean };
  contactorIds: string[];
}

export function motorControlPlan(doc: DiagramDoc, m: FleetMotor): MotorControlPlan {
  const node = (id?: string) => (id ? doc.nodes[id] : undefined);
  const roleOf = (id: string) => (doc.nodes[id]?.params as { role?: string } | undefined)?.role;
  const M = tagOf(node(m.nodeId))!;
  const Q = tagOf(node(m.chain.breakerId));
  const F = tagOf(node(m.chain.thermalRelayId));
  const driveNode = node(m.chain.driveId);
  const D = tagOf(driveNode);
  const K = tagOf(node(m.chain.contactorId));
  const contactorIds = m.chain.contactorIds ?? (m.chain.contactorId ? [m.chain.contactorId] : []);
  const declared = m.config.startMethod;
  // Dois contatores sem inversor → reversão, mesmo que o motor diga "DOL".
  const method =
    declared === "DOL" && contactorIds.length === 2 && !driveNode ? "REVERSING" : declared;
  const protections = [
    Q && `${Q}_OK`,
    F && `${F}_OK`,
    driveNode?.params.kind === "vfd" && D && `${D}_PRONTO`,
  ].filter(Boolean) as string[];
  let coil: string | undefined = K;
  if (driveNode?.params.kind === "vfd" && (!K || method === "VFD")) coil = `${D}_MARCHA`;
  else if (!K && driveNode?.params.kind === "softstarter" && D) coil = `${D}_MARCHA`;

  const plan: MotorControlPlan = {
    M,
    method,
    stop: `${M}_PARAR`,
    start: `${M}_PARTIR`,
    protections,
    coil,
    chainText: [Q, K, F, D].filter(Boolean).join(" → "),
    contactorIds,
  };
  if (method === "REVERSING" && contactorIds.length >= 2) {
    const fwdId = contactorIds.find((id) => roleOf(id) === "forward") ?? contactorIds[0];
    const revId =
      contactorIds.find((id) => roleOf(id) === "reverse" && id !== fwdId) ??
      contactorIds.find((id) => id !== fwdId)!;
    plan.reversing = {
      fwd: `${M}_HORARIO`,
      rev: `${M}_ANTI_HORARIO`,
      KF: tagOf(node(fwdId))!,
      KR: tagOf(node(revId))!,
      rolesDeclared: roleOf(fwdId) === "forward" && roleOf(revId) === "reverse",
    };
  }
  if (method === "STAR_DELTA" && K) {
    const starId = contactorIds.find((id) => roleOf(id) === "star");
    const deltaId = contactorIds.find((id) => roleOf(id) === "delta");
    plan.starDelta = {
      K,
      KY: starId ? tagOf(node(starId))! : `${K}_Y`,
      KD: deltaId ? tagOf(node(deltaId))! : `${K}_D`,
      T: `${M}_T_YD`,
      drawn: !!(starId && deltaId),
    };
  }
  return plan;
}

export function buildLadderFromUnifilar(doc: DiagramDoc): UnifilarLadderResult {
  const rungs: LadderRung[] = [];
  const warnings: string[] = [];
  const tags = new Map<string, EditorTag>();
  const roleOf = new Map<string, Role>();
  const addTag = (
    name: string,
    role: Role,
    value: boolean | number = false,
    type: EditorTag["type"] = "BOOL",
  ) => {
    const direction: EditorTag["direction"] =
      role === "coil" || role === "alarm" ? "output" : role === "timer" ? "memory" : "input";
    if (!tags.has(name)) tags.set(name, { id: name, name, type, value, forced: false, direction });
    roleOf.set(name, role);
  };

  const unifilar = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  if (unifilar.length === 0) return { rungs, tags: [], warnings };

  // Emergência: botão do diagrama (tag) ou a entrada padrão S0 do circuito de segurança.
  const estopNode = unifilar.find((n) => n.params.kind === "estop");
  const estop = estopOperand(doc);
  const usedContactors = new Set<string>();

  const fleet = buildMotorFleet(doc);
  for (const m of fleet) {
    const plan = motorControlPlan(doc, m);
    const { M, method, stop, start, coil, chainText } = plan;
    for (const id of plan.contactorIds) usedContactors.add(id);
    const protections: LadderCell[] = [contact(estop)];
    addTag(estop, "safety", true);
    for (const op of plan.protections) {
      protections.push(contact(op));
      addTag(op, "safety", true);
    }
    addTag(stop, "stop", true);
    addTag(start, "start", false);
    if (!coil) {
      warnings.push(
        `${M}: sem contator nem inversor no ramal — não há o que comandar pelo CLP. Desenhe o contator no unifilar.`,
      );
      continue;
    }
    addTag(coil, "coil", false);

    const methodLabel =
      method === "VFD"
        ? "inversor de frequência"
        : method === "SOFT"
          ? "soft-starter"
          : method === "STAR_DELTA"
            ? "estrela-triângulo"
            : method === "REVERSING"
              ? "partida com reversão"
              : "partida direta";

    if (plan.reversing) {
      const { KF, KR, fwd, rev } = plan.reversing;
      addTag(fwd, "start", false);
      addTag(rev, "start", false);
      addTag(KF, "coil", false);
      addTag(KR, "coil", false);
      const sealAt = protections.length + 1; // depois do Parar
      rungs.push(
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-fwd`,
          `${M} — sentido horário (${KF})`,
          `${M} — horário: selo ${KF}, intertravado com ${KR} (NF) — para inverter, pare antes`,
          [...protections, contact(stop), contact(fwd), contact(KR, "XIO")],
          { kind: "OTE", operand: KF },
          contact(KF),
          m.nodeId,
          sealAt,
        ),
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-rev`,
          `${M} — sentido anti-horário (${KR})`,
          `${M} — anti-horário: selo ${KR}, intertravado com ${KF} (NF)`,
          [...protections, contact(stop), contact(rev), contact(KF, "XIO")],
          { kind: "OTE", operand: KR },
          contact(KR),
          m.nodeId,
          sealAt,
        ),
      );
      if (!plan.reversing.rolesDeclared) {
        warnings.push(
          `${M}: dois contatores no ramal — tratados como reversão (${KF} horário, ${KR} anti-horário). Defina a função de cada contator nas propriedades para confirmar. Faça também o intertravamento elétrico pelos contatos auxiliares NF.`,
        );
      }
    } else
      rungs.push(
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-cmd`,
          `${M} — ${methodLabel}`,
          `${M} — ${methodLabel}: ${chainText} → ${M} · proteções NF (1 = íntegro) · selo ${coil}`,
          [...protections, contact(stop), contact(start)],
          { kind: "OTE", operand: coil },
          contact(coil),
          m.nodeId,
        ),
      );

    if (plan.starDelta) {
      const { K, KY, KD, T } = plan.starDelta;
      addTag(T, "timer", false);
      addTag(KY, "coil", false);
      addTag(KD, "coil", false);
      warnings.push(
        plan.starDelta.drawn
          ? `${M}: tempo de comutação estrela → triângulo sugerido de ${STAR_DELTA_DEFAULT_MS / 1000} s — ajuste à curva de partida da carga.`
          : `${M}: estrela-triângulo usa três contatores — linha ${K}, estrela ${KY} e triângulo ${KD}. Desenhe os que faltam (com a função "estrela"/"triângulo" nas propriedades) e ajuste o tempo de comutação (${STAR_DELTA_DEFAULT_MS / 1000} s sugeridos).`,
      );
      rungs.push(
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-tyd`,
          `${M} — tempo estrela → triângulo`,
          `Conta a partir do fechamento de ${K}. Ajuste o tempo à partida real da carga.`,
          [contact(K)],
          { kind: "TON", operand: T, preset: STAR_DELTA_DEFAULT_MS },
          undefined,
          m.nodeId,
        ),
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-y`,
          `${M} — contator estrela ${KY}`,
          `Estrela enquanto o tempo não terminou; intertravado com ${KD} (nunca os dois juntos).`,
          [contact(K), contact(T, "XIO"), contact(KD, "XIO")],
          { kind: "OTE", operand: KY },
          undefined,
          m.nodeId,
        ),
        makeRung(
          `${UF_RUNG_PREFIX}${m.nodeId}-d`,
          `${M} — contator triângulo ${KD}`,
          `Triângulo após o tempo; intertravado com ${KY}.`,
          [contact(K), contact(T), contact(KY, "XIO")],
          { kind: "OTE", operand: KD },
          undefined,
          m.nodeId,
        ),
      );
    }

    // Sinalização de falha: qualquer proteção do ramal atuada.
    const faults = plan.protections;
    if (faults.length > 0) {
      const alarm = `${M}_FALHA`;
      addTag(alarm, "alarm", false);
      // Falha = algum contato de proteção aberto: XIO em paralelo (OU).
      const cols = 3;
      const cells: LadderCell[][] = faults.map((op, i) => {
        const row: LadderCell[] = Array.from({ length: cols }, emptyCell);
        row[0] = contact(op, "XIO");
        if (i === 0) row[cols - 1] = { kind: "OTE", operand: alarm };
        return row;
      });
      rungs.push(
        withSource(
          {
            id: `${UF_RUNG_PREFIX}${m.nodeId}-falha`,
            label: `${M} — falha (sinalização)`,
            comment: `Sinaliza disparo de ${faults.map((f) => f.replace(/_OK$|_PRONTO$/, "")).join(", ")} (lâmpada/alarme no SCADA).`,
            cols,
            cells,
          },
          m.nodeId,
        ),
      );
    }
  }

  // Contatores que comandam cargas não motoras.
  const LOADS = new Set(["load", "lamp", "socket", "capacitor_bank"]);
  for (const load of unifilar.filter((n) => LOADS.has(n.params.kind))) {
    const chain = upstreamChain(doc, load.id);
    if (!chain.contactor || usedContactors.has(chain.contactor.id)) continue;
    usedContactors.add(chain.contactor.id);
    const L = tagOf(load)!;
    const K = tagOf(chain.contactor)!;
    const Q = tagOf(chain.breaker);
    const F = tagOf(chain.thermal);
    const series: LadderCell[] = [contact(estop)];
    addTag(estop, "safety", true);
    if (Q) {
      series.push(contact(`${Q}_OK`));
      addTag(`${Q}_OK`, "safety", true);
    }
    if (F) {
      series.push(contact(`${F}_OK`));
      addTag(`${F}_OK`, "safety", true);
    }
    addTag(`${L}_DESLIGAR`, "stop", true);
    addTag(`${L}_LIGAR`, "start", false);
    addTag(K, "coil", false);
    rungs.push(
      makeRung(
        `${UF_RUNG_PREFIX}${load.id}-cmd`,
        `${L} — liga/desliga por ${K}`,
        `${L}: ${[Q, K, F].filter(Boolean).join(" → ")} → ${L} · selo ${K}`,
        [...series, contact(`${L}_DESLIGAR`), contact(`${L}_LIGAR`)],
        { kind: "OTE", operand: K },
        contact(K),
        load.id,
      ),
    );
  }

  if (rungs.length > 0 && !estopNode) {
    warnings.push(
      `Sem botão de emergência no unifilar: o programa usa a entrada ${estop} (contato NF do relé de segurança). A emergência física continua obrigatória (NR-12) — o CLP não a substitui.`,
    );
  }
  void roleOf;
  return { rungs, tags: [...tags.values()], warnings };
}

/** Operandos das saídas (última coluna) de uma rede. */
export function outputOperands(r: LadderRung): string[] {
  const cols = r.cols ?? r.cells[0]?.length ?? 0;
  return r.cells
    .map((row) => row[cols - 1])
    .filter((c): c is LadderCell => !!c && c.kind !== "EMPTY" && !!c.operand)
    .map((c) => c.operand);
}

/** Rede gerada que o engenheiro alterou (cells diferentes do que foi gerado). */
export function isUserEditedUnifilarRung(r: LadderRung): boolean {
  return !!r.source && r.source.kind === "unifilar" && rungSignature(r) !== r.source.signature;
}

/**
 * Junta as redes geradas com as atuais:
 *  • redes do usuário (sem `source`) ficam intactas e na mesma ordem;
 *  • redes geradas não editadas são substituídas pela geração nova (ou removidas
 *    se o equipamento saiu do unifilar);
 *  • redes geradas editadas pelo engenheiro são preservadas (viram dele).
 * Retorna a MESMA referência quando nada muda (evita marcar o projeto como alterado).
 */
export function mergeUnifilarRungs(current: LadderRung[], generated: LadderRung[]): LadderRung[] {
  const edited = new Set(current.filter(isUserEditedUnifilarRung).map((r) => r.id));
  // Bobinas que o engenheiro já programa do jeito dele (redes próprias ou geradas
  // e editadas): a rede gerada para a mesma bobina não entra (evita bobina dupla).
  const userCoils = new Set<string>();
  for (const r of current) {
    const own =
      !(r.source?.kind === "unifilar" || r.id.startsWith(UF_RUNG_PREFIX)) || edited.has(r.id);
    if (!own) continue;
    for (const op of outputOperands(r)) userCoils.add(op);
  }
  const fresh = generated.filter(
    (g) => !edited.has(g.id) && !outputOperands(g).some((op) => userCoils.has(op)),
  );
  const freshById = new Map(fresh.map((g) => [g.id, g]));
  const result: LadderRung[] = [];
  const placed = new Set<string>();
  // Mantém a posição das redes geradas existentes; novas entram antes das do usuário.
  let insertedNew = false;
  const insertNew = () => {
    if (insertedNew) return;
    insertedNew = true;
    const existingIds = new Set(current.map((r) => r.id));
    for (const g of fresh)
      if (!existingIds.has(g.id)) {
        result.push(g);
        placed.add(g.id);
      }
  };
  for (const r of current) {
    const isGenerated = r.source?.kind === "unifilar" || r.id.startsWith(UF_RUNG_PREFIX);
    if (!isGenerated) {
      insertNew();
      result.push(r);
      continue;
    }
    if (edited.has(r.id)) {
      result.push(r);
      continue;
    }
    const g = freshById.get(r.id);
    if (g) {
      result.push(g.source?.signature === r.source?.signature ? r : g);
      placed.add(g.id);
    }
    // equipamento removido do unifilar → rede gerada sai
  }
  insertNew();
  for (const g of fresh) if (!placed.has(g.id) && !result.includes(g)) result.push(g);

  const same = result.length === current.length && result.every((r, i) => r === current[i]);
  return same ? current : result;
}
