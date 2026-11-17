/**
 * Gravação da trilha de auditoria (somente servidor, service role).
 *
 * O cliente não grava `audit_logs` (sem policy de INSERT — correto). Aqui o
 * servidor, depois de autorizar o projeto, encadeia cada registro ao anterior
 * da empresa (SHA-256). A unicidade (tenant_id, previous_hash) impede que duas
 * gravações simultâneas bifurquem a cadeia: quem perde a corrida relê o último
 * hash e tenta de novo.
 */
import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AUDIT_TRAIL_GENESIS_HASH, computeAuditChainHash } from "./audit-verifier";

export interface AuditAppendInput {
  action: string;
  resourceId: string;
  resourceType: string;
  details: Record<string, unknown>;
  /** ms; usado como created_at (ordem real do evento). */
  timestamp?: number;
}

const MAX_RETRIES = 5;

interface ChainTip {
  hash: string;
  createdAtMs: number;
}

async function chainTip(tenantId: string): Promise<ChainTip> {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("chain_hash, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`AUDIT_LOG_ERROR: ${error.code ?? "read"}`);
  const created = data?.created_at ? Date.parse(data.created_at) : 0;
  return {
    hash: data?.chain_hash || AUDIT_TRAIL_GENESIS_HASH,
    createdAtMs: Number.isFinite(created) ? created : 0,
  };
}

/**
 * Acrescenta os registros em ordem, um a um (a cadeia é sequencial).
 * Devolve quantos entraram e o hash da ponta; lança no primeiro erro definitivo.
 */
export async function appendAuditEntries(
  tenantId: string,
  userId: string,
  entries: readonly AuditAppendInput[],
): Promise<{ inserted: number; lastHash: string }> {
  let tip = await chainTip(tenantId);
  let inserted = 0;
  for (const entry of entries) {
    let attempt = 0;
    for (;;) {
      // created_at estritamente crescente na cadeia (a verificação ordena por
      // ele) e nunca no futuro do relógio do servidor.
      const ts = Math.max(Math.min(entry.timestamp ?? Date.now(), Date.now()), tip.createdAtMs + 1);
      const createdAt = new Date(ts).toISOString();
      const previous = tip.hash;
      const chainHash = computeAuditChainHash({
        previousHash: previous,
        tenantId,
        userId,
        action: entry.action,
        details: entry.details,
        createdAt,
      });
      const { error } = await supabaseAdmin.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        action: entry.action,
        resource_id: entry.resourceId,
        resource_type: entry.resourceType,
        details: entry.details as Json,
        previous_hash: previous,
        chain_hash: chainHash,
        created_at: createdAt,
      });
      if (!error) {
        tip = { hash: chainHash, createdAtMs: ts };
        inserted++;
        break;
      }
      // 23505 = outra gravação usou o mesmo elo: relê a ponta e refaz.
      if (error.code === "23505" && attempt < MAX_RETRIES) {
        attempt++;
        tip = await chainTip(tenantId);
        continue;
      }
      console.error("[scada.audit] gravação:", error.code ?? "", error.message ?? "");
      throw new Error("AUDIT_LOG_ERROR: falha ao gravar a auditoria.");
    }
  }
  return { inserted, lastHash: tip.hash };
}
