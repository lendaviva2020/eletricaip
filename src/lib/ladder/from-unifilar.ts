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
import { buildMotorFleet } from "@/lib/simulation/motor-fleet";
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
): LadderRung {
  const cols = Math.max(3, series.length + 1);
  const row0: LadderCell[] = Array.from({ length: cols }, emptyCell);
  series.forEach((c, i) => (row0[i] = c));
  row0[cols - 1] = output;
  const cells: LadderCell[][] = [row0];
  if (seal) {
    const row1: LadderCell[] = Array.from({ length: cols }, emptyCell);
    row1[series.length - 1] = seal;
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
  const estop = `${tagOf(estopNode) ?? "S0"}_OK`;
  const usedContactors = new Set<string>();

  const fleet = buildMotorFleet(doc);
  for (const m of fleet) {
    const motorNode = doc.nodes[m.nodeId];
    const M = tagOf(motorNode)!;
    const Q = tagOf(m.chain.breakerId ? doc.nodes[m.chain.breakerId] : undefined);
    const F = tagOf(m.chain.thermalRelayId ? doc.nodes[m.chain.thermalRelayId] : undefined);
    const driveNode = m.chain.driveId ? doc.nodes[m.chain.driveId] : undefined;
    const D = tagOf(driveNode);
    const K = tagOf(m.chain.contactorId ? doc.nodes[m.chain.contactorId] : undefined);
    if (m.chain.contactorId) usedContactors.add(m.chain.contactorId);
    const method = m.config.startMethod;

    const protections: LadderCell[] = [contact(estop)];
    addTag(estop, "safety", true);
    if (Q) {
      protections.push(contact(`${Q}_OK`));
      addTag(`${Q}_OK`, "safety", true);
    }
    if (F) {
      protections.push(contact(`${F}_OK`));
      addTag(`${F}_OK`, "safety", true);
    }
    if (driveNode?.params.kind === "vfd" && D) {
      protections.push(contact(`${D}_PRONTO`));
      addTag(`${D}_PRONTO`, "safety", true);
    }
    const stop = `${M}_PARAR`;
    const start = `${M}_PARTIR`;
    addTag(stop, "stop", true);
    addTag(start, "start", false);

    // Bobina comandada: contator; com inversor sem contator, o comando de marcha do inversor.
    let coil: string | undefined = K;
    if (driveNode?.params.kind === "vfd" && (!K || method === "VFD")) coil = `${D}_MARCHA`;
    else if (!K && driveNode?.params.kind === "softstarter" && D) coil = `${D}_MARCHA`;
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
            : "partida direta";
    const chainText = [Q, K, F, D].filter(Boolean).join(" → ");

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

    if (method === "STAR_DELTA" && K) {
      const T = `${M}_T_YD`;
      const KY = `${K}_Y`;
      const KD = `${K}_D`;
      addTag(T, "timer", false);
      addTag(KY, "coil", false);
      addTag(KD, "coil", false);
      warnings.push(
        `${M}: estrela-triângulo usa três contatores — linha ${K}, estrela ${KY} e triângulo ${KD}. Desenhe ${KY} e ${KD} no unifilar e ajuste o tempo de comutação (${STAR_DELTA_DEFAULT_MS / 1000} s sugeridos) à curva de partida.`,
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
    const faults = [
      F && `${F}_OK`,
      Q && `${Q}_OK`,
      driveNode?.params.kind === "vfd" && D && `${D}_PRONTO`,
    ].filter(Boolean) as string[];
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
