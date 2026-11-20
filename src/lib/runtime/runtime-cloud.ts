// Regras da nuvem para o Runtime (PURO): contrato do relatório do gateway,
// telemetria por exceção e o que responder a cada dispositivo.
import { z } from "zod";

const Tag = z.string().regex(/^[A-Za-z_%][A-Za-z0-9_.%]{0,47}$/);

export const RuntimeReportSchema = z.object({
  mode: z.enum(["SHADOW", "RUN", "SAFE"]),
  blockers: z.array(z.string().max(200)).max(20).default([]),
  packageHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  scans: z.number().int().nonnegative(),
  lastScanMs: z.number().nonnegative().max(60_000),
  connections: z
    .array(
      z.object({
        id: z.string().max(32),
        kind: z.string().max(24),
        ok: z.boolean(),
        lastError: z.string().max(300).nullable(),
        lastOkAt: z.number().nullable(),
      }),
    )
    .max(32)
    .default([]),
  faults: z.array(z.string().max(300)).max(20).default([]),
  tags: z
    .record(Tag, z.union([z.boolean(), z.number().finite()]))
    .refine((r) => Object.keys(r).length <= 500, "tags demais")
    .default({}),
  events: z
    .array(
      z.object({
        at: z.string().max(40),
        kind: z.enum([
          "ARM",
          "DISARM",
          "SAFE",
          "PACKAGE_LOADED",
          "WRITE_FAULT",
          "COMMAND",
          "LOGIN_FAILED",
        ]),
        message: z.string().max(500),
      }),
    )
    .max(100)
    .default([]),
});
export type RuntimeReport = z.infer<typeof RuntimeReportSchema>;

export const MAX_REPORT_BYTES = 256_000;

/** Telemetria por exceção: só tags que mudaram desde o último relatório. */
export function changedTags(
  prev: Readonly<Record<string, unknown>> | undefined,
  next: Readonly<Record<string, boolean | number>>,
): Array<{ tag: string; value: number }> {
  const out: Array<{ tag: string; value: number }> = [];
  for (const [tag, v] of Object.entries(next)) {
    if (prev && prev[tag] === v) continue;
    out.push({ tag, value: typeof v === "boolean" ? (v ? 1 : 0) : v });
  }
  return out;
}

export interface PackageRowLite {
  id: string;
  sha256: string;
  approved_at: string | null;
  revoked_at: string | null;
}

export interface DesiredPackage {
  packageId: string;
  hash: string;
  approved: boolean;
}

/**
 * O que o dispositivo deve executar:
 *  - o alvo aprovado e não revogado; ou
 *  - se o pacote que ele roda foi revogado, o MESMO pacote com approved=false
 *    (o Runtime desarma e fica em sombra); ou
 *  - nada.
 */
export function desiredFor(
  target: PackageRowLite | null,
  current: PackageRowLite | null,
): DesiredPackage | null {
  if (target && target.approved_at && !target.revoked_at) {
    return { packageId: target.id, hash: target.sha256, approved: true };
  }
  if (current && (current.revoked_at || !current.approved_at)) {
    return { packageId: current.id, hash: current.sha256, approved: false };
  }
  return null;
}

/** Token do dispositivo: `ert_` + 43 caracteres base64url. */
export function looksLikeDeviceToken(token: string): boolean {
  return /^ert_[A-Za-z0-9_-]{43}$/.test(token);
}
