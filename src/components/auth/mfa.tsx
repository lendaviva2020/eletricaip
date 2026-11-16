/**
 * Verificação em duas etapas (TOTP) — RISK-017.
 *
 * - `useMfaRequirement`: decide se a sessão atual precisa do segundo fator
 *   (usuário tem fator verificado, mas a sessão ainda é aal1).
 * - `MfaChallenge`: tela de código que substitui TODO o conteúdo privado até
 *   a verificação (o AuthGate não renderiza rotas enquanto estiver pendente).
 * - `MfaSettingsCard`: ativar/desativar o autenticador em Configurações → Segurança.
 *
 * A exigência real também é aplicada no servidor (`mfa-enforcement.ts`): esta
 * camada de interface é conveniência, não a fronteira de segurança.
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type MfaRequirement = "checking" | "ok" | "required" | "error";

const CODE_RE = /^\d{6}$/;

function isDevBypassUser(user: User | null): boolean {
  return Boolean(import.meta.env.DEV && user?.app_metadata?.isDevBypass);
}

export function useMfaRequirement(user: User | null): {
  state: MfaRequirement;
  recheck: () => void;
} {
  const [state, setState] = useState<MfaRequirement>("checking");
  const [nonce, setNonce] = useState(0);
  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setState("ok");
      return;
    }
    if (isDevBypassUser(user)) {
      setState("ok");
      return;
    }
    setState("checking");
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          // Fail-closed: sem saber o nível, não libera o conteúdo privado.
          setState("error");
          return;
        }
        setState(data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? "required" : "ok");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [user, nonce]);

  return { state, recheck };
}

/** Não foi possível determinar o nível da sessão: bloqueia (fail-closed) com opção de tentar de novo. */
export function MfaCheckError({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="min-h-screen grid place-items-center bg-background p-4"
      data-testid="mfa-check-error"
    >
      <div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm">{t("mfa.checkFailed")}</p>
        <Button className="w-full" onClick={onRetry}>
          {t("mfa.retry")}
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-xs text-muted-foreground underline"
        >
          {t("mfa.signOut")}
        </button>
      </div>
    </div>
  );
}

export function MfaChallenge({
  onVerified,
  onSignOut,
}: {
  onVerified: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!CODE_RE.test(code)) {
      setError(t("mfa.invalidFormat"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === "verified");
      if (listErr || !factor) throw new Error(t("mfa.noFactor"));
      const { error: vErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (vErr) throw new Error(t("mfa.wrongCode"));
      setCode("");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("mfa.wrongCode"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen grid place-items-center bg-background p-4"
      data-testid="mfa-challenge"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">{t("mfa.challengeTitle")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("mfa.challengeDesc")}</p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-label={t("mfa.codeLabel")}
          className="h-11 w-full rounded-md border border-input bg-background text-center font-mono text-2xl tracking-[0.5em]"
          autoFocus
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? t("mfa.verifying") : t("mfa.verify")}
        </Button>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full text-center text-xs text-muted-foreground underline"
        >
          {t("mfa.signOut")}
        </button>
      </form>
    </div>
  );
}

interface FactorRow {
  id: string;
  friendly_name?: string;
  status: string;
  created_at: string;
}

export function MfaSettingsCard() {
  const { t } = useI18n();
  const [factors, setFactors] = useState<FactorRow[]>([]);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as FactorRow[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    setMessage(null);
    // Fatores não verificados antigos impedem novo cadastro: remove-os antes.
    for (const f of factors.filter((x) => x.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `EletricAI ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error || !data) {
      setMessage({ tone: "err", text: error?.message ?? t("mfa.enrollFailed") });
      return;
    }
    // QR vem do próprio Supabase como SVG em data URL; só aceitamos esse formato
    // e o exibimos via <img> (que não executa scripts embutidos).
    const qr = data.totp.qr_code.startsWith("data:image/svg+xml") ? data.totp.qr_code : "";
    setEnrolling({ id: data.id, qr, secret: data.totp.secret });
  };

  const confirmEnroll = async () => {
    if (!enrolling || !CODE_RE.test(code)) {
      setMessage({ tone: "err", text: t("mfa.invalidFormat") });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.id,
      code,
    });
    setBusy(false);
    if (error) {
      setMessage({ tone: "err", text: t("mfa.wrongCode") });
      return;
    }
    setEnrolling(null);
    setCode("");
    setMessage({ tone: "ok", text: t("mfa.enabled") });
    await supabase.auth.refreshSession();
    await refresh();
  };

  const remove = async (factorId: string) => {
    if (!window.confirm(t("mfa.confirmRemove"))) return;
    setBusy(true);
    // O Supabase só permite remover fator com sessão aal2 (código já verificado).
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      setMessage({ tone: "err", text: error.message });
      return;
    }
    setMessage({ tone: "ok", text: t("mfa.removed") });
    await supabase.auth.refreshSession();
    await refresh();
  };

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      data-testid="mfa-settings"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{t("mfa.title")}</h2>
        <span
          className={
            verified.length
              ? "ml-auto rounded bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success"
              : "ml-auto rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          }
        >
          {verified.length ? t("mfa.on") : t("mfa.off")}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("mfa.desc")}</p>

      {verified.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
          <span>{f.friendly_name ?? "TOTP"}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove(f.id)}>
            {t("mfa.remove")}
          </Button>
        </div>
      ))}

      {!verified.length && !enrolling && (
        <Button size="sm" disabled={busy} onClick={() => void startEnroll()}>
          {t("mfa.enable")}
        </Button>
      )}

      {enrolling && (
        <div className="space-y-2">
          <p className="text-xs">{t("mfa.scan")}</p>
          {enrolling.qr && (
            <img
              src={enrolling.qr}
              alt={t("mfa.qrAlt")}
              className="h-44 w-44 rounded bg-white p-2"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            {t("mfa.secret")}: <code className="break-all font-mono">{enrolling.secret}</code>
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label={t("mfa.codeLabel")}
              className="h-9 w-32 rounded-md border border-input bg-background text-center font-mono"
            />
            <Button
              size="sm"
              disabled={busy || code.length !== 6}
              onClick={() => void confirmEnroll()}
            >
              {t("mfa.confirm")}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.tone === "err" ? "alert" : "status"}
          className={message.tone === "err" ? "text-xs text-destructive" : "text-xs text-success"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
