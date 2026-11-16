import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell, Input, Divider, GoogleIcon } from "./login";
import { passwordPolicyError } from "@/lib/security/password-policy";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_HINT,
  ACCOUNT_TYPE_LABEL,
  CompanyNameSchema,
  accountTypeFromSearch,
  type AccountType,
} from "@/lib/account-type";

export const Route = createFileRoute("/signup")({
  // `?perfil=empresa|autonomo`: links de divulgação por público já chegam com o perfil marcado.
  validateSearch: (search: Record<string, unknown>): { perfil?: AccountType } => ({
    perfil: accountTypeFromSearch(search.perfil),
  }),
  head: () => ({
    meta: [
      { title: "Criar conta - EletricAI" },
      {
        name: "description",
        content:
          "Crie sua conta no EletricAI: projetos elétricos, CLP e supervisório para empresas de engenharia e profissionais autônomos.",
      },
    ],
  }),
  component: SignupPage,
});

const PENDING_TYPE_KEY = "eletricai.pendingAccountType";

function SignupPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const { perfil } = Route.useSearch();
  const [accountType, setAccountType] = useState<AccountType>(perfil ?? "autonomo");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.navigate({ to: "/onboarding" });
  }, [router, user]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!adult) {
      setError("É necessário confirmar que você tem 18 anos ou mais para criar uma conta.");
      return;
    }
    if (accountType === "empresa" && !CompanyNameSchema.safeParse(companyName).success) {
      setError("Informe o nome da empresa (2 a 120 caracteres).");
      return;
    }
    // RISK-024: mesma política do reset/troca (antes o cadastro aceitava 6 caracteres).
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/onboarding`,
        data: {
          full_name: name,
          age_declared_18_plus: true,
          account_type: accountType,
          ...(accountType === "empresa" ? { company_name: companyName.trim() } : {}),
        },
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess("Confirme seu email para ativar a conta.");
  };

  const handleGoogle = async () => {
    setError("");
    if (!adult) {
      setError("É necessário confirmar que você tem 18 anos ou mais para criar uma conta.");
      return;
    }
    // Google não carrega dados do formulário: guarda o perfil para o 1º login.
    try {
      localStorage.setItem(
        PENDING_TYPE_KEY,
        JSON.stringify({ account_type: accountType, company_name: companyName.trim() }),
      );
    } catch {
      // armazenamento indisponível: o perfil pode ser definido depois em Configurações
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=/onboarding` },
    });
    if (error) setError(error.message);
  };

  return (
    <AuthShell title="Criar conta" subtitle="Acesso imediato ao ambiente de engenharia.">
      <button
        type="button"
        onClick={handleGoogle}
        className="h-9 w-full rounded-md border border-border bg-background hover:bg-accent transition-colors flex items-center justify-center gap-2 text-[13px] font-medium"
      >
        <GoogleIcon /> Continuar com Google
      </button>
      <Divider />
      <fieldset className="grid grid-cols-1 gap-2 mb-3" data-testid="account-type-choice">
        <legend className="text-xs text-muted-foreground mb-1">
          Como você vai usar o EletricAI?
        </legend>
        {ACCOUNT_TYPES.map((type) => (
          <label
            key={type}
            className={`flex items-start gap-2 rounded-md border p-2.5 cursor-pointer text-xs ${
              accountType === type ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="account-type"
              value={type}
              checked={accountType === type}
              onChange={() => setAccountType(type)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block font-medium text-foreground">{ACCOUNT_TYPE_LABEL[type]}</span>
              <span className="text-muted-foreground">{ACCOUNT_TYPE_HINT[type]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <form onSubmit={handleEmail} className="space-y-3">
        <Input label="Nome completo" type="text" value={name} onChange={setName} required />
        {accountType === "empresa" && (
          <Input
            label="Nome da empresa"
            type="text"
            value={companyName}
            onChange={setCompanyName}
            required
          />
        )}
        <Input
          label={accountType === "empresa" ? "Email corporativo" : "Email"}
          type="email"
          value={email}
          onChange={setEmail}
          required
        />
        <Input
          label="Senha (mín. 8: maiúscula, minúscula, número e símbolo)"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            aria-label="Confirmo que tenho 18 anos ou mais"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-border accent-primary"
          />
          <span>Confirmo que tenho 18 anos ou mais e uso profissional (B2B).</span>
        </label>
        {typeof error === "string" && error.trim() !== "" && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {typeof success === "string" && success.trim() !== "" && (
          <p role="status" className="text-xs text-success">
            {success}
          </p>
        )}
        <button
          disabled={loading}
          type="submit"
          className="h-9 w-full rounded-md bg-primary hover:bg-primary/90 text-[13px] font-medium text-primary-foreground inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {loading && <CircleNotch className="h-4 w-4 animate-spin" />} Criar conta grátis
        </button>
      </form>
      <p className="text-[10px] text-muted-foreground mt-3 text-center">
        Ao criar conta, você concorda com os{" "}
        <Link to="/termos" className="underline hover:text-foreground">
          Termos
        </Link>{" "}
        e a{" "}
        <Link to="/privacidade" className="underline hover:text-foreground">
          Política de Privacidade
        </Link>
        .
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
