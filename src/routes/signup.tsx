import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell, Input, Divider, GoogleIcon } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Criar conta · EletricAI" }] }),
  component: SignupPage,
});

function SignupPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.navigate({ to: "/dashboard" });
  }, [router, user]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess("Confirme seu email para ativar a conta.");
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) setError(error.message);
  };

  return (
    <AuthShell title="Criar conta" subtitle="Comece grátis em menos de 60 segundos.">
      <button
        onClick={handleGoogle}
        className="h-11 w-full rounded-md border border-border bg-card hover:bg-accent transition flex items-center justify-center gap-2 text-sm font-medium"
      >
        <GoogleIcon /> Continuar com Google
      </button>
      <Divider />
      <form onSubmit={handleEmail} className="space-y-3">
        <Input label="Nome completo" type="text" value={name} onChange={setName} required />
        <Input label="Email corporativo" type="email" value={email} onChange={setEmail} required />
        <Input
          label="Senha (mín. 6 caracteres)"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {success && <p className="text-xs text-success">{success}</p>}
        <button
          disabled={loading}
          type="submit"
          className="h-11 w-full rounded-md text-sm font-semibold text-primary-foreground glow-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Criar conta grátis
        </button>
      </form>
      <p className="text-[10px] text-muted-foreground mt-3 text-center">
        Ao criar conta, você concorda com os Termos e a Política de Privacidade.
      </p>
      <p className="text-xs text-center text-muted-foreground mt-6">
        Já tem conta?{" "}
        <Link
          to="/login"
          search={{ redirect: "/dashboard" }}
          className="text-primary hover:underline"
        >
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
