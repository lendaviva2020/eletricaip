// Lado servidor das rotas públicas do Runtime (service role). Autentica o
// dispositivo pelo HASH do token; nunca confia em ids enviados pelo gateway.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appendAuditEntries } from "@/lib/scada/audit-append.server";
import {
  changedTags,
  desiredFor,
  looksLikeDeviceToken,
  type DesiredPackage,
  type PackageRowLite,
  type RuntimeReport,
} from "./runtime-cloud";

const db = supabaseAdmin as unknown as SupabaseClient;

export interface DeviceRecord {
  id: string;
  tenant_id: string;
  project_id: string;
  created_by: string;
  target_package_id: string | null;
  stop_requested: boolean;
  last_state: Record<string, unknown> | null;
  last_package_hash: string | null;
}

export class RuntimeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateDevice(token: string): Promise<DeviceRecord> {
  if (!looksLikeDeviceToken(token)) throw new RuntimeHttpError(401, "unauthorized");
  const { data, error } = await db
    .from("runtime_devices")
    .select(
      "id, tenant_id, project_id, created_by, target_package_id, stop_requested, last_state, last_package_hash",
    )
    .eq("token_hash", tokenKey(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[runtime.cloud] device lookup:", error.code ?? "", error.message ?? "");
    throw new RuntimeHttpError(503, "unavailable");
  }
  if (!data) throw new RuntimeHttpError(401, "unauthorized");
  return data as DeviceRecord;
}

async function packageRow(
  projectId: string,
  by: { id?: string | null; sha256?: string | null },
): Promise<PackageRowLite | null> {
  if (!by.id && !by.sha256) return null;
  let q = db
    .from("runtime_packages")
    .select("id, sha256, approved_at, revoked_at")
    .eq("project_id", projectId);
  q = by.id ? q.eq("id", by.id) : q.eq("sha256", by.sha256 as string);
  const { data, error } = await q.maybeSingle();
  if (error) throw new RuntimeHttpError(503, "unavailable");
  return (data as PackageRowLite | null) ?? null;
}

export async function handleReport(
  device: DeviceRecord,
  report: RuntimeReport,
): Promise<{ desired: DesiredPackage | null; stop: boolean }> {
  const prevTags = (device.last_state?.tags ?? undefined) as Record<string, unknown> | undefined;
  const now = new Date().toISOString();
  const { error } = await db
    .from("runtime_devices")
    .update({
      last_seen_at: now,
      last_mode: report.mode,
      last_package_hash: report.packageHash,
      last_state: {
        at: now,
        blockers: report.blockers,
        faults: report.faults,
        connections: report.connections,
        scans: report.scans,
        lastScanMs: report.lastScanMs,
        tags: report.tags,
      },
    })
    .eq("id", device.id);
  if (error) throw new RuntimeHttpError(503, "unavailable");

  // Histórico (por exceção) com a origem correta: execução real no gateway.
  const changes = changedTags(prevTags, report.tags).slice(0, 500);
  if (changes.length > 0) {
    const { error: tErr } = await db.from("tag_samples").insert(
      changes.map((c) => ({
        project_id: device.project_id,
        tag_name: c.tag,
        value: c.value,
        quality: report.mode === "SHADOW" ? "UNCERTAIN" : "GOOD",
        source: "INTERNAL_RUNTIME",
        sampled_at: now,
        equipment_id: null,
      })),
    );
    if (tErr) console.error("[runtime.cloud] tag_samples:", tErr.code ?? "", tErr.message ?? "");
  }

  // Eventos de segurança do gateway entram na trilha de auditoria da empresa.
  const auditable = report.events.filter((e) => e.kind !== "COMMAND").slice(0, 50);
  if (auditable.length > 0) {
    await appendAuditEntries(
      device.tenant_id,
      device.created_by,
      auditable.map((e) => {
        const t = Date.parse(e.at);
        return {
          action: `RUNTIME_${e.kind}`,
          resourceId: device.id,
          resourceType: "runtime_device",
          details: { message: e.message, at: e.at, origin: "gateway" },
          timestamp: Number.isFinite(t) ? t : undefined,
        };
      }),
    );
  }

  const target = await packageRow(device.project_id, { id: device.target_package_id });
  const current =
    report.packageHash && report.packageHash !== target?.sha256
      ? await packageRow(device.project_id, { sha256: report.packageHash })
      : target;
  return { desired: desiredFor(target, current), stop: device.stop_requested };
}

/** Só entrega o alvo do dispositivo ou o pacote que ele já executa. */
export async function handlePackage(
  device: DeviceRecord,
  packageId: string,
): Promise<{ package: unknown; hash: string; approved: boolean }> {
  const { data, error } = await db
    .from("runtime_packages")
    .select("id, sha256, package, approved_at, revoked_at")
    .eq("id", packageId)
    .eq("project_id", device.project_id)
    .maybeSingle();
  if (error) throw new RuntimeHttpError(503, "unavailable");
  if (!data) throw new RuntimeHttpError(404, "not_found");
  const row = data as PackageRowLite & { package: unknown };
  const allowed = row.id === device.target_package_id || row.sha256 === device.last_package_hash;
  if (!allowed) throw new RuntimeHttpError(403, "forbidden");
  return { package: row.package, hash: row.sha256, approved: !!row.approved_at && !row.revoked_at };
}
