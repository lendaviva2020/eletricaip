// Derivação da frota de motores do CCM a partir do diagrama unifilar.
//
// Single Source of Truth (AGENTS.md §11.1/§12.1): o CCM NÃO cria motores
// próprios — cada motor desenhado no unifilar vira um acionamento supervisionado,
// com a cadeia de manobra/proteção descoberta pela TOPOLOGIA (arestas de
// potência), nunca por proximidade geométrica no canvas.
//
// Puro e determinístico: mesma entrada → mesma frota (ordem por tag/id).
import type { DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "@/lib/diagram/schema";
import { motorNominalCurrent } from "@/lib/electrical-calc";
import type {
  BreakerCurve,
  MotorDriveConfig,
  MotorStartMethod,
  ThermalTripClass,
} from "./motor-protection-engine";

/** Nós de manobra/proteção relevantes do ramal de um motor. */
export interface MotorFeederChain {
  breakerId?: string;
  contactorId?: string;
  thermalRelayId?: string;
  driveId?: string; // VFD ou soft-starter
  fuseId?: string;
}

/** Endereços (imagem de processo IEC 61131-3) atribuídos deterministicamente. */
export interface MotorPlcIo {
  /** Saída digital — bobina do contator K (comando de marcha). */
  commandOutput: string;
  /** Entrada digital — contato auxiliar 13-14 de K (confirmação de marcha). */
  runFeedbackInput: string;
  /** Entrada digital — contato 95-96/97-98 do relé térmico / disparo. */
  faultInput: string;
  /** Entrada analógica — corrente do motor (transdutor 4-20 mA). */
  currentAnalogInput: string;
  /** Entrada analógica — velocidade (encoder/tacômetro). */
  speedAnalogInput: string;
}

export interface FleetMotor {
  config: MotorDriveConfig;
  nodeId: string;
  chain: MotorFeederChain;
  io: MotorPlcIo;
  /** Avisos de engenharia sobre o ramal (proteções ausentes, subdimensionamento). */
  issues: string[];
}

const MAX_CHAIN_DEPTH = 12;
const STOP_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  "busbar",
  "ccm",
  "transformer",
  "generator",
  "motor",
  "load",
  "lamp",
  "socket",
]);

/** Lê número finito e positivo de params arbitrários (o union do Zod já validou o tipo). */
function num(params: object, key: string): number | undefined {
  const v = (params as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

function str(params: object, key: string): string | undefined {
  const v = (params as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function powerAdjacency(doc: DiagramDoc): Map<string, DiagramEdge[]> {
  const adj = new Map<string, DiagramEdge[]>();
  for (const e of Object.values(doc.edges)) {
    if (e.kind !== "power" || e.sheet !== "unifilar") continue;
    for (const end of [e.source, e.target]) {
      const list = adj.get(end);
      if (list) list.push(e);
      else adj.set(end, [e]);
    }
  }
  return adj;
}

/**
 * Sobe pelo ramal a partir do motor (BFS sobre arestas de potência) até
 * encontrar barramento/fonte/outra carga. Registra o primeiro dispositivo de
 * cada tipo — o mais próximo do motor, que é o que o protege.
 */
export function discoverFeederChain(
  doc: DiagramDoc,
  motorId: string,
  adj: Map<string, DiagramEdge[]> = powerAdjacency(doc),
): MotorFeederChain {
  const chain: MotorFeederChain = {};
  const visited = new Set<string>([motorId]);
  let frontier: string[] = [motorId];
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of adj.get(id) ?? []) {
        const other = e.source === id ? e.target : e.source;
        if (visited.has(other)) continue;
        visited.add(other);
        const node = doc.nodes[other];
        if (!node) continue;
        const kind = node.params.kind;
        if (STOP_KINDS.has(kind)) continue;
        if (kind === "breaker" && !chain.breakerId) chain.breakerId = node.id;
        else if (kind === "contactor" && !chain.contactorId) chain.contactorId = node.id;
        else if (kind === "thermal_relay" && !chain.thermalRelayId) chain.thermalRelayId = node.id;
        else if ((kind === "vfd" || kind === "softstarter") && !chain.driveId)
          chain.driveId = node.id;
        else if (kind === "fuse" && !chain.fuseId) chain.fuseId = node.id;
        // Ponto de derivação (alimenta mais de um ramal, ex.: disjuntor geral
        // sem barramento): conta como proteção a montante, mas a busca não
        // desce pelos ramais vizinhos — antes M1 herdava o inversor de M2.
        if ((adj.get(other)?.length ?? 0) > 2) continue;
        next.push(other);
      }
    }
    frontier = next;
  }
  return chain;
}

/** Endereçamento S7-like: 8 bits por byte; analógicas em palavras pares a partir de IW64. */
export function assignPlcIo(index: number): MotorPlcIo {
  const byte = Math.floor(index / 8);
  const bit = index % 8;
  return {
    commandOutput: `%Q${byte}.${bit}`,
    runFeedbackInput: `%I${byte}.${bit}`,
    faultInput: `%I${byte + 10}.${bit}`,
    currentAnalogInput: `%IW${64 + index * 4}`,
    speedAnalogInput: `%IW${66 + index * 4}`,
  };
}

function parseTripClass(raw: string | undefined): ThermalTripClass {
  const n = raw ? Number.parseInt(raw, 10) : 10;
  return n === 20 ? 20 : n === 30 ? 30 : 10;
}

function parseCurve(raw: string | undefined): BreakerCurve {
  return raw === "B" || raw === "D" ? raw : raw === "C" ? "C" : "D";
}

/** Disjuntor-motor padrão: menor valor comercial ≥ 1,25·In (NBR 5410 §6.5.1.4 via catálogo). */
const COMMERCIAL_BREAKERS_A = [
  1, 1.6, 2, 2.5, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400,
  500, 630, 800,
];

export function defaultBreakerFor(In_A: number): number {
  const target = In_A * 1.25;
  return COMMERCIAL_BREAKERS_A.find((b) => b >= target) ?? COMMERCIAL_BREAKERS_A.at(-1)!;
}

function motorStartMethod(
  node: DiagramNode,
  chain: MotorFeederChain,
  doc: DiagramDoc,
): MotorStartMethod {
  const declared = str(node.params, "startMethod");
  if (chain.driveId) {
    const k = doc.nodes[chain.driveId]?.params.kind;
    if (k === "vfd") return "VFD";
    if (k === "softstarter") return "SOFT";
  }
  if (
    declared === "VFD" ||
    declared === "SOFT" ||
    declared === "STAR_DELTA" ||
    declared === "DOL"
  ) {
    return declared;
  }
  return "DOL";
}

export interface FleetOptions {
  /** Corrente de curto presumida no CCM (A). Padrão 10 kA (CCM BT típico). */
  prospectiveIk_A?: number;
  ambient_C?: number;
}

/** Constrói a frota a partir dos motores da folha unifilar. */
export function buildMotorFleet(doc: DiagramDoc, opts: FleetOptions = {}): FleetMotor[] {
  const adj = powerAdjacency(doc);
  const motors = Object.values(doc.nodes)
    .filter((n) => n.sheet === "unifilar" && n.params.kind === "motor")
    .sort((a, b) => {
      const ta = (a.params.tag ?? a.label ?? a.id).toString();
      const tb = (b.params.tag ?? b.label ?? b.id).toString();
      return ta.localeCompare(tb, "pt-BR", { numeric: true }) || a.id.localeCompare(b.id);
    });

  return motors.map((node, index) => {
    const p = node.params;
    const issues: string[] = [];
    const power_kW = num(p, "power_kW") ?? 0;
    const voltage_V = num(p, "voltage_V") ?? 380;
    const declaredIn = num(p, "fla_A") ?? num(p, "current_A");
    const In_A = declaredIn ?? motorNominalCurrent({ id: node.id, power_kW, voltage_V });
    if (power_kW <= 0) issues.push("Potência do motor ausente ou inválida");

    const chain = discoverFeederChain(doc, node.id, adj);
    const breaker = chain.breakerId ? doc.nodes[chain.breakerId] : undefined;
    const thermal = chain.thermalRelayId ? doc.nodes[chain.thermalRelayId] : undefined;
    const contactor = chain.contactorId ? doc.nodes[chain.contactorId] : undefined;
    const startMethod = motorStartMethod(node, chain, doc);

    if (!breaker && !chain.fuseId)
      issues.push("Ramal sem proteção contra curto-circuito (disjuntor/fusível)");
    if (!contactor && !chain.driveId)
      issues.push("Ramal sem contator ou inversor — comando remoto impossível");
    if (!thermal && !chain.driveId)
      issues.push("Ramal sem relé térmico — proteção de sobrecarga assumida no disjuntor-motor");

    const breakerIn_A = breaker
      ? (num(breaker.params, "in_A") ?? defaultBreakerFor(In_A))
      : defaultBreakerFor(In_A);
    if (breaker && breakerIn_A < In_A) {
      issues.push(`Disjuntor ${breakerIn_A} A abaixo da corrente nominal ${In_A.toFixed(1)} A`);
    }
    // Relé térmico ajustado em In (prática NBR 5410 §6.5.1.5); se o componente
    // declara faixa menor que In, mantém o valor declarado e acusa subdimensionamento.
    const relayIn = thermal ? num(thermal.params, "in_A") : undefined;
    const thermalSetting_A = relayIn !== undefined && relayIn < In_A * 0.99 ? relayIn : In_A;
    if (relayIn !== undefined && relayIn < In_A * 0.99) {
      issues.push(
        `Relé térmico (${relayIn} A) abaixo de In (${In_A.toFixed(1)} A) — disparos indevidos`,
      );
    }
    const contactorIn = contactor ? num(contactor.params, "in_A") : undefined;
    if (contactorIn !== undefined && contactorIn < In_A * 0.99) {
      issues.push(`Contator (${contactorIn} A) abaixo de In (${In_A.toFixed(1)} A)`);
    }

    const tag = str(p, "tag") ?? (node.label?.trim() || `M${String(index + 1).padStart(2, "0")}`);
    const config: MotorDriveConfig = {
      id: node.id,
      tag,
      label: node.label?.trim() || tag,
      power_kW,
      voltage_V,
      In_A: Math.max(In_A, 0.01),
      startMethod,
      ratedRpm: 1750,
      loadFactor: 0.85,
      thermalSetting_A: Math.max(thermalSetting_A, 0.01),
      thermalClass: parseTripClass(thermal ? str(thermal.params, "trip_class") : undefined),
      breakerIn_A,
      // Disjuntor-motor (sem curva declarada) usa curva D/magnético 13–20·In.
      breakerCurve: parseCurve(breaker ? str(breaker.params, "curve") : undefined),
      prospectiveIk_A: opts.prospectiveIk_A ?? 10_000,
      ambient_C: opts.ambient_C ?? 40,
    };
    return { config, nodeId: node.id, chain, io: assignPlcIo(index), issues };
  });
}
