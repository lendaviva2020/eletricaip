// Server-side Continuous Project Engineering Memory & Tenant Authorization Helper
// Ensures full conversation persistence, multi-module LLM injection, long-conversation windowing,
// and strict multi-tenant project authorization (defense-in-depth alongside RLS).

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizePromptText } from "./context-sanitizer";

export interface StoredAiMessageRow {
  id?: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  created_at?: string;
}

export interface GeminiContentTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface ProjectMemoryModelContext {
  summaryBlock: string;
  recentTurns: GeminiContentTurn[];
  totalConversations: number;
  totalMessages: number;
  summarizedCount: number;
  recentFixes: Array<{ role: string; content: string; created_at: string }>;
}

const DEFAULT_RECENT_WINDOW = 24;
const MAX_SUMMARY_CHARS = 3500;
const TECHNICAL_DECISION_PATTERN =
  /\b(NBR\s*5410|NBR\s*14039|NR-?10|NR-?12|IEC\s*\d+|ISA-?18\.2|QF\d+|KM\d+|TR\d+|BUS\d+|M\d+|DR\d+|kVA|kW|kvar|\d+\s*A|\d+\s*V|mm²|mm2|FD|FBD|LADDER|UNIFILAR|MULTIFILAR|OPC-UA|MODBUS|PATCH|CORRIGID|APROVAD)\b/i;

/**
 * Verifies in TypeScript (defense-in-depth alongside PostgreSQL RLS) that the authenticated user
 * is an active member of the tenant owning `projectId` (or creator).
 */
export async function assertProjectTenantAccess(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<{ projectId: string; tenantId: string | null }> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, tenant_id, created_by")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao validar acesso ao projeto: ${error.message}`);
  }
  if (!project) {
    throw new Error(
      "FORBIDDEN_PROJECT_ACCESS: Projeto não encontrado ou sem permissão no tenant ativo.",
    );
  }

  if (project.created_by === userId) {
    return { projectId: project.id, tenantId: project.tenant_id ?? null };
  }

  if (project.tenant_id) {
    const { data: membership, error: memErr } = await supabase
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", project.tenant_id)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!memErr && membership) {
      return { projectId: project.id, tenantId: project.tenant_id };
    }
  }

  throw new Error(
    "FORBIDDEN_PROJECT_ACCESS: Usuário não pertence ao tenant proprietário deste projeto.",
  );
}

/**
 * Condenses long conversation histories while preserving ALL recent turns in chronological order
 * and retaining key engineering decisions from earlier turns.
 * Never deletes or overwrites raw stored messages.
 */
export function buildModelConversationContext(
  allMessagesAsc: ReadonlyArray<StoredAiMessageRow>,
  opts?: {
    recentLimit?: number;
    maxCharsPerMsg?: number;
    auditDecisions?: ReadonlyArray<string>;
  },
): {
  summaryBlock: string;
  recentTurns: GeminiContentTurn[];
  totalHistoryCount: number;
  summarizedCount: number;
} {
  const recentLimit = Math.max(4, Math.min(opts?.recentLimit ?? DEFAULT_RECENT_WINDOW, 60));
  const maxCharsPerMsg = Math.max(200, Math.min(opts?.maxCharsPerMsg ?? 1600, 4000));

  const cleaned = allMessagesAsc.filter(
    (m) => typeof m.content === "string" && m.content.trim().length > 0,
  );
  const totalHistoryCount = cleaned.length;
  const splitIdx = Math.max(0, cleaned.length - recentLimit);
  const older = cleaned.slice(0, splitIdx);
  const recent = cleaned.slice(splitIdx);

  const summaryLines: string[] = [];
  if (older.length > 0) {
    const decisionLines: string[] = [];
    for (const msg of older) {
      const sanitized = sanitizePromptText(msg.content, 400).replace(/\s+/g, " ").trim();
      if (!sanitized) continue;
      if (TECHNICAL_DECISION_PATTERN.test(sanitized) || msg.role === "assistant") {
        decisionLines.push(
          `- [${msg.role === "assistant" ? "IA" : "ENG"}]: ${sanitized.slice(0, 220)}`,
        );
      }
    }
    const picked =
      decisionLines.length <= 14
        ? decisionLines
        : [...decisionLines.slice(0, 3), ...decisionLines.slice(-11)];
    if (picked.length > 0) {
      summaryLines.push(
        `Histórico anterior condensado (${older.length} mensagens anteriores preservadas no banco):`,
        ...picked,
      );
    } else {
      summaryLines.push(
        `Histórico anterior: ${older.length} mensagens anteriores preservadas no banco de dados.`,
      );
    }
  }

  if (opts?.auditDecisions && opts.auditDecisions.length > 0) {
    summaryLines.push(
      "Correções/Decisões de Auditoria Registradas:",
      ...opts.auditDecisions.slice(0, 8).map((d) => `- ${sanitizePromptText(d, 220)}`),
    );
  }

  let summaryBlock = summaryLines.join("\n").trim();
  if (summaryBlock.length > MAX_SUMMARY_CHARS) {
    summaryBlock = `${summaryBlock.slice(0, MAX_SUMMARY_CHARS - 3)}...`;
  }

  // Merge consecutive same-role turns for strict Gemini chat turn alternation
  const recentTurns: GeminiContentTurn[] = [];
  for (const m of recent) {
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const text = sanitizePromptText(m.content, maxCharsPerMsg);
    if (!text) continue;
    const prev = recentTurns[recentTurns.length - 1];
    if (prev && prev.role === role) {
      prev.parts.push({ text });
    } else {
      recentTurns.push({ role, parts: [{ text }] });
    }
  }

  return {
    summaryBlock,
    recentTurns,
    totalHistoryCount,
    summarizedCount: older.length,
  };
}

/**
 * Loads full chronological project memory (conversations, messages, and recent AI fix audits)
 * for injection into ANY AI workflow (Chat, Unifilar Patch, Architecture Generator).
 */
export async function loadProjectAiMemoryContext(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    projectId?: string;
    conversationId?: string;
    recentLimit?: number;
    maxFetchLimit?: number;
  },
): Promise<ProjectMemoryModelContext> {
  if (opts.projectId) {
    await assertProjectTenantAccess(supabase, userId, opts.projectId);
  }

  let convIds: string[] = [];
  let totalConversations = 0;

  if (opts.conversationId) {
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("id, project_id")
      .eq("id", opts.conversationId)
      .maybeSingle();

    if (conv?.project_id) {
      await assertProjectTenantAccess(supabase, userId, conv.project_id);
    }
    if (conv) {
      convIds = [conv.id];
      totalConversations = 1;
    }
  } else if (opts.projectId) {
    const { data: convs, count } = await supabase
      .from("ai_conversations")
      .select("id", { count: "exact" })
      .eq("project_id", opts.projectId)
      .order("updated_at", { ascending: false })
      .limit(10);

    convIds = (convs ?? []).map((c: { id: string }) => c.id);
    totalConversations = count ?? convIds.length;
  }

  if (convIds.length === 0) {
    return {
      summaryBlock: "",
      recentTurns: [],
      totalConversations: 0,
      totalMessages: 0,
      summarizedCount: 0,
      recentFixes: [],
    };
  }

  const maxFetch = Math.max(40, Math.min(opts.maxFetchLimit ?? 250, 500));
  const { data: msgsDesc, count: msgCount } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at", { count: "exact" })
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(maxFetch);

  const msgsAsc = (
    (msgsDesc ?? []) as Array<{ id?: string; role: string; content: string; created_at: string }>
  ).reverse();

  let auditDecisions: string[] = [];
  if (opts.projectId) {
    const { data: audits } = await supabase
      .from("ai_fix_audit")
      .select("module, error_code, error_message, decision, created_at")
      .eq("project_id", opts.projectId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (Array.isArray(audits)) {
      auditDecisions = audits.map(
        (a: { module?: string; error_code?: string; error_message?: string; decision?: string }) =>
          `[${a.module ?? "geral"}/${a.error_code ?? "FIX"}] ${a.decision ?? "applied"}: ${(a.error_message ?? "").slice(0, 140)}`,
      );
    }
  }

  const built = buildModelConversationContext(msgsAsc, {
    recentLimit: opts.recentLimit ?? DEFAULT_RECENT_WINDOW,
    auditDecisions,
  });

  const recentFixes = msgsAsc.slice(-5).map((m) => ({
    role: m.role,
    content: m.content,
    created_at: m.created_at,
  }));

  return {
    summaryBlock: built.summaryBlock,
    recentTurns: built.recentTurns,
    totalConversations,
    totalMessages: msgCount ?? built.totalHistoryCount,
    summarizedCount: built.summarizedCount,
    recentFixes,
  };
}
