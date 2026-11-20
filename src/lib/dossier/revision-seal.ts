// Selo de revisão aprovada — integridade do projeto emitido. PURO (Web Crypto).
//
// Na aprovação, o servidor calcula o SHA-256 do snapshot do projeto em JSON
// CANÔNICO (chaves ordenadas — o JSONB do Postgres reordena as chaves, então a
// serialização crua não seria reprodutível) junto com o memorial de cálculo do
// unifilar. O hash vai para a revisão gravada E para a trilha de auditoria
// encadeada (que o cliente não consegue escrever). Na verificação, o hash é
// recalculado a partir da revisão gravada: se alguém alterar a revisão no
// banco, o hash diverge do registro de auditoria — adulteração detectável.
import type { DiagramDoc } from "@/lib/diagram/schema";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { sizeDiagramCables } from "@/lib/diagram/connection/cable-sizing";

/** Campos acrescentados à revisão na emissão — não fazem parte do conteúdo selado. */
export const SEAL_EXCLUDED_KEYS = [
  "engineeringDossierApproval",
  "revisionSeal",
  "calculationMemorial",
] as const;

export interface RevisionSeal {
  algorithm: "SHA-256";
  /** Hash do snapshot (sem os campos de emissão) + memorial, em hexadecimal. */
  hash: string;
  revision: number;
  approvedAt: string;
  approvedBy: string;
  engineerName: string;
  professionalRegistration: string;
  /** Número da ART/RRT/TRT informado pelo responsável técnico (opcional). */
  artNumber?: string;
}

/** JSON canônico: chaves de objeto ordenadas, `undefined` omitido (como no JSON.stringify). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return "null";
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== "function")
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Remove os campos de emissão para que o hash cubra só o conteúdo de engenharia. */
export function sealableContent(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...snapshot };
  for (const k of SEAL_EXCLUDED_KEYS) delete out[k];
  return out;
}

// ---------------- Memorial de cálculo do unifilar ----------------

export interface UnifilarMemorial {
  generatedFrom: "unifilar";
  points: Array<{ id: string; Ik3max_kA?: number; Ik1min_kA?: number; dropTotal_pct?: number }>;
  cables: Array<{
    id: string;
    name: string;
    Ib_A: number;
    section_mm2?: number;
    required_mm2?: number;
    length_m?: number;
    drop_pct?: number;
    status: string;
  }>;
  findings: Array<{ id: string; severity: string; message: string }>;
  premises: string[];
}

/** Memorial determinístico (mesmos motores do editor), ordenado para ser reprodutível. */
export function buildUnifilarMemorial(doc: DiagramDoc | undefined): UnifilarMemorial | null {
  if (!doc || Object.keys(doc.nodes ?? {}).length === 0) return null;
  const network = analyzeNetwork(doc);
  const cables = sizeDiagramCables(doc);
  const diagnostics = runDiagramDiagnostics(doc);
  return {
    generatedFrom: "unifilar",
    points: Object.values(network.nodes)
      .map((r) => ({
        id: r.nodeId,
        Ik3max_kA: r.Ik3max_kA,
        Ik1min_kA: r.Ik1min_kA,
        dropTotal_pct: r.dropTotal_pct,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    cables: cables.rows
      .map((r) => ({
        id: r.edgeId,
        name: r.name,
        Ib_A: r.Ib_A,
        section_mm2: r.section_mm2,
        required_mm2: r.required_mm2,
        length_m: r.length_m,
        drop_pct: r.drop_pct,
        status: r.status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    findings: diagnostics
      .filter((d) => d.type === "ERRO" || d.type === "AVISO")
      .map((d) => ({ id: d.id, severity: d.type, message: d.message }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    premises: [...new Set([...network.premises, ...cables.premises])].sort(),
  };
}

/** Erros do unifilar que impedem a emissão formal (conectividade, proteção, rede, DPS). */
export function blockingUnifilarErrors(doc: DiagramDoc | undefined): string[] {
  if (!doc) return [];
  // Erros + valores padrão da biblioteca não confirmados: não se emite projeto
  // com dado nominal que o engenheiro não informou.
  return runDiagramDiagnostics(doc)
    .filter((d) => d.type === "ERRO" || d.id.startsWith("defaults_"))
    .map((d) => d.message);
}

/** Hash selado: conteúdo do snapshot + memorial, em JSON canônico. */
export async function computeRevisionHash(
  snapshot: Record<string, unknown>,
  memorial: UnifilarMemorial | null,
): Promise<string> {
  return sha256Hex(canonicalJson({ content: sealableContent(snapshot), memorial }));
}

export type SealVerification =
  | { status: "intact"; hash: string }
  | { status: "tampered"; expected: string; actual: string }
  | { status: "unsealed" };

/**
 * Recalcula o hash de uma revisão gravada e compara com o hash registrado na
 * auditoria (fonte confiável) — ou, sem auditoria, com o do próprio selo.
 */
export async function verifyRevision(
  storedSnapshot: Record<string, unknown>,
  auditedHash: string | undefined,
): Promise<SealVerification> {
  const seal = storedSnapshot.revisionSeal as RevisionSeal | undefined;
  const memorial = (storedSnapshot.calculationMemorial as UnifilarMemorial | null) ?? null;
  if (!seal?.hash && !auditedHash) return { status: "unsealed" };
  const actual = await computeRevisionHash(storedSnapshot, memorial);
  const expected = auditedHash ?? seal!.hash;
  return actual === expected
    ? { status: "intact", hash: actual }
    : { status: "tampered", expected, actual };
}
