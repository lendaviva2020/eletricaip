/**
 * Exigência de segundo fator (MFA/TOTP) no SERVIDOR — RISK-017.
 *
 * A tela de código no navegador não basta: com a senha roubada, um atacante
 * obtém uma sessão `aal1` e chamaria as server functions diretamente. Aqui,
 * toda requisição com sessão `aal1` de um usuário que TEM fator verificado é
 * recusada. Sessões `aal2` (senha + código) passam sem consulta extra.
 *
 * Política de falha: se não for possível saber se o usuário tem MFA (Auth
 * indisponível), a requisição é negada (fail-closed) — segurança acima de
 * disponibilidade, conforme a regra 20 do AGENTS.md.
 */

export type MfaDecision = "ok" | "mfa_required" | "mfa_check_unavailable";

/** Consulta se o usuário tem fator verificado. `null` = não foi possível saber. */
export type VerifiedFactorLookup = () => Promise<boolean | null>;

interface CacheEntry {
  hasVerifiedFactor: boolean;
  expiresAt: number;
}

export interface MfaGateOptions {
  /** Validade do cache por usuário (ms). Curto para refletir novo cadastro de fator. */
  ttlMs?: number;
  /** Limite de entradas (proteção de memória em instâncias longas). */
  maxEntries?: number;
  now?: () => number;
}

export function createMfaGate(opts: MfaGateOptions = {}) {
  const ttl = opts.ttlMs ?? 30_000;
  const max = opts.maxEntries ?? 10_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  return {
    async check(params: {
      userId: string;
      aal: unknown;
      lookup: VerifiedFactorLookup;
    }): Promise<MfaDecision> {
      if (params.aal === "aal2") return "ok";
      const t = now();
      const hit = cache.get(params.userId);
      let has: boolean | null;
      if (hit && hit.expiresAt > t) {
        has = hit.hasVerifiedFactor;
      } else {
        try {
          has = await params.lookup();
        } catch {
          has = null;
        }
        if (has !== null) {
          if (cache.size >= max) {
            // Remove a entrada mais antiga (Map preserva ordem de inserção).
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.delete(params.userId);
          cache.set(params.userId, { hasVerifiedFactor: has, expiresAt: t + ttl });
        }
      }
      if (has === null) return "mfa_check_unavailable";
      return has ? "mfa_required" : "ok";
    },
    /** Invalida o cache do usuário (ex.: logo após cadastrar/remover um fator). */
    invalidate(userId: string) {
      cache.delete(userId);
    },
    size: () => cache.size,
  };
}

/** Instância de processo usada pelo middleware de autenticação. */
export const mfaGate = createMfaGate();

/** Fatores do objeto `user` do Supabase Auth: há algum TOTP/phone verificado? */
export function userHasVerifiedFactor(user: { factors?: { status?: string }[] | null } | null): boolean {
  return (user?.factors ?? []).some((f) => f.status === "verified");
}
