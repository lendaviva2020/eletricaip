import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Input } from "./login";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova senha - EletricAI" }] }),
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setError("Link inválido ou expirado. Solicite outro email.");
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    await supabase.auth.signOut();
    router.navigate({ to: "/login", search: { redirect: "/dashboard" } });
  };

  return (
    <AuthShell title="Definir nova senha" subtitle="Escolha uma senha segura para sua conta.">
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="Nova senha"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        <Input
          label="Confirmar senha"
          type="password"
          value={confirm}
          onChange={setConfirm}
          required
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <button
          disabled={loading || !ready}
          type="submit"
          className="h-9 w-full rounded-md bg-primary hover:bg-primary/90 text-[13px] font-medium text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {loading && <CircleNotch className="h-4 w-4 animate-spin" />} Atualizar senha
        </button>
      </form>
    </AuthShell>
  );
}
