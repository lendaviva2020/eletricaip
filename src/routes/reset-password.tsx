import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Input } from "./login";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova senha · EletricAI" }] }),
  component: ResetPage,
});

function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses recovery hash on load — the user becomes a temp session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setError("Link inválido ou expirado. Solicite outro email.");
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setError(""); setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  return (
    <AuthShell title="Definir nova senha" subtitle="Escolha uma senha segura para sua conta.">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Nova senha" type="password" value={password} onChange={setPassword} required />
        <Input label="Confirmar senha" type="password" value={confirm} onChange={setConfirm} required />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button disabled={loading || !ready} type="submit" className="h-11 w-full rounded-md text-sm font-semibold text-primary-foreground glow-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}>
          {loading && <Loader2 className="h-4 w-4 animate-spin"/>} Atualizar senha
        </button>
      </form>
    </AuthShell>
  );
}
