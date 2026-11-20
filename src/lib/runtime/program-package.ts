// Pacote do programa do ElétricAi Runtime — PURO.
//
// Junta, num único documento versionado, o que o Runtime executa: redes Ladder,
// programa do FB Electric Studio, mapa de E/S e tela HMI. O hash SHA-256 do JSON
// CANÔNICO identifica o pacote: a nuvem só entrega ao Runtime um pacote APROVADO
// cujo hash confere, e o Runtime recalcula o hash antes de executar.
import { z } from "zod";
import { canonicalJson, sha256Hex } from "@/lib/dossier/revision-seal";
import { CompactProgramModelSchema } from "@/lib/compact-studio/domain/schemas";
import { HmiDocSchema } from "@/lib/hmi/hmi-model";
import { IoMapSchema, OPERAND_RE } from "./io-map";

export const RUNTIME_PACKAGE_FORMAT = "eletricai.runtime-package" as const;
export const RUNTIME_PACKAGE_VERSION = 1 as const;
/** Tamanho máximo do pacote serializado (protege a nuvem e o Runtime). */
export const MAX_PACKAGE_BYTES = 2_000_000;

const CellSchema = z
  .object({
    kind: z.string().regex(/^[A-Z_]{2,16}$/),
    operand: z.string().max(64).default(""),
    preset: z.number().finite().optional(),
  })
  .passthrough();

/** Estrutura mínima de uma rede; a semântica é do motor de varredura. */
export const PackageRungSchema = z
  .object({
    id: z.string().min(1).max(128),
    label: z.string().max(200).optional(),
    cells: z.array(z.array(CellSchema).max(64)).max(32),
  })
  .passthrough();

const TagValue = z.union([z.boolean(), z.number().finite()]);

export const RuntimePackageSchema = z.object({
  format: z.literal(RUNTIME_PACKAGE_FORMAT),
  formatVersion: z.literal(RUNTIME_PACKAGE_VERSION),
  projectId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(160),
  /** Rótulo livre da versão (ex.: "rev 3 — partida M1"). */
  label: z.string().trim().max(120).default(""),
  scanMs: z.number().int().min(10).max(1000),
  ladder: z.object({ rungs: z.array(PackageRungSchema).max(2000) }),
  studio: CompactProgramModelSchema.nullable(),
  hmi: HmiDocSchema.nullable(),
  ioMap: IoMapSchema,
  /** Valores iniciais das tags de memória (sem valor = falso/0). */
  initialTags: z
    .record(z.string().regex(OPERAND_RE), TagValue)
    .refine((r) => Object.keys(r).length <= 4096, "tags demais"),
});
export type RuntimePackage = z.infer<typeof RuntimePackageSchema>;

export interface BuildPackageInput {
  projectId: string;
  projectName: string;
  label?: string;
  scanMs: number;
  rungs: readonly unknown[];
  studio: unknown;
  hmi: unknown;
  ioMap: unknown;
  initialTags?: Record<string, unknown>;
}

export type BuildPackageResult =
  | { ok: true; pkg: RuntimePackage; hash: string; bytes: number; warnings: string[] }
  | { ok: false; errors: string[] };

function issues(e: z.ZodError): string[] {
  return e.issues.slice(0, 20).map((i) => `${i.path.join(".") || "pacote"}: ${i.message}`);
}

/** Valores iniciais: só tags válidas com valor booleano/numérico finito. */
function sanitizeInitialTags(
  raw: Record<string, unknown> | undefined,
): Record<string, boolean | number> {
  const out: Record<string, boolean | number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!OPERAND_RE.test(k)) continue;
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

/** Monta, valida e calcula o hash do pacote. Nada inválido é empacotado. */
export async function buildRuntimePackage(input: BuildPackageInput): Promise<BuildPackageResult> {
  const candidate = {
    format: RUNTIME_PACKAGE_FORMAT,
    formatVersion: RUNTIME_PACKAGE_VERSION,
    projectId: input.projectId,
    projectName: input.projectName,
    label: input.label ?? "",
    scanMs: input.scanMs,
    ladder: { rungs: input.rungs },
    studio: input.studio ?? null,
    hmi: input.hmi ?? null,
    ioMap: input.ioMap,
    initialTags: sanitizeInitialTags(input.initialTags),
  };
  const r = RuntimePackageSchema.safeParse(candidate);
  if (!r.success) return { ok: false, errors: issues(r.error) };
  const pkg = r.data;
  const warnings: string[] = [];
  if (pkg.ladder.rungs.length === 0 && !pkg.studio) {
    return { ok: false, errors: ["o pacote não tem lógica (Ladder ou FB Studio)"] };
  }
  const programTags = collectProgramTags(pkg);
  for (const p of pkg.ioMap.points) {
    if (!programTags.has(p.tag)) warnings.push(`${p.tag} está mapeada mas não é usada no programa`);
  }
  if (!pkg.ioMap.estopTag && pkg.ioMap.points.some((p) => p.writeEnabled)) {
    warnings.push("sem tag de emergência mapeada: o Runtime não verá a emergência do campo");
  }
  const text = canonicalJson(pkg);
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_PACKAGE_BYTES) {
    return {
      ok: false,
      errors: [`pacote com ${bytes} bytes excede o limite de ${MAX_PACKAGE_BYTES}`],
    };
  }
  return { ok: true, pkg, hash: await sha256Hex(text), bytes, warnings };
}

/** Hash do pacote (o Runtime recalcula antes de executar). */
export async function runtimePackageHash(pkg: RuntimePackage): Promise<string> {
  return sha256Hex(canonicalJson(pkg));
}

/** Tags citadas pelo programa (operandos Ladder + símbolos do Studio). */
export function collectProgramTags(pkg: RuntimePackage): Set<string> {
  const tags = new Set<string>();
  for (const r of pkg.ladder.rungs) {
    for (const row of r.cells) for (const c of row) if (c.operand) tags.add(c.operand);
  }
  for (const s of pkg.studio?.ioSymbols ?? []) {
    tags.add(s.symbolicName);
    if (s.address) tags.add(s.address);
  }
  return tags;
}

/** Valida um pacote recebido (Runtime) e confere o hash esperado. */
export async function verifyRuntimePackage(
  raw: unknown,
  expectedHash: string,
): Promise<{ ok: true; pkg: RuntimePackage } | { ok: false; error: string }> {
  const r = RuntimePackageSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: `pacote inválido: ${issues(r.error)[0]}` };
  const actual = await runtimePackageHash(r.data);
  if (actual !== expectedHash.toLowerCase()) {
    return { ok: false, error: `hash não confere (esperado ${expectedHash}, recebido ${actual})` };
  }
  return { ok: true, pkg: r.data };
}
