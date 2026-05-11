import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Input } from "./login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Recuperar senha · EletricAI" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
  };

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para redefinir sua senha.">
      {sent ? (
        <div className="rounded-md border border-success/40 bg-success/10 p-4 text-sm">
          Enviamos um email para <span className="font-mono">{email}</span>. Verifique sua caixa de entrada.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Input label="Email" type="email" value={email} onChange={setEmail} required />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button disabled={loading} type="submit" className="h-11 w-full rounded-md text-sm font-semibold text-primary-foreground glow-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "var(--gradient-primary)" }}>
            {loading && <Loader2 className="h-4 w-4 animate-spin"/>} Enviar link
          </button>
        </form>
      )}
      <p className="text-xs text-center text-muted-foreground mt-6">
        <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
      </p>
    </AuthShell>
  );
}
