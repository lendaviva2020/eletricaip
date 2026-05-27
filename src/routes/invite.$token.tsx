import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { acceptInviteByToken } from "@/lib/tenants.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Aceitar convite - EletricAI" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const accept = useServerFn(acceptInviteByToken);
  const [status, setStatus] = useState<"loading" | "needs-auth" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function acceptInvite() {
      const { data: userResult } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!userResult.user) {
        setStatus("needs-auth");
        return;
      }

      try {
        await accept({ data: { token } });
        if (!mounted) return;
        setStatus("ok");
        setTimeout(() => navigate({ to: "/dashboard" }), 1200);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error).message);
        setStatus("error");
      }
    }

    void acceptInvite();

    return () => {
      mounted = false;
    };
  }, [token, accept, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
            <p>Processando convite...</p>
          </>
        )}
        {status === "needs-auth" && (
          <>
            <h1 className="text-xl font-semibold">Faça login para aceitar o convite</h1>
            <p className="text-sm text-muted-foreground">
              Use o email para o qual o convite foi enviado.
            </p>
            <Button
              onClick={() =>
                navigate({ to: "/login", search: { redirect: `/invite/${token}` } as never })
              }
            >
              Entrar
            </Button>
          </>
        )}
        {status === "ok" && (
          <>
            <h1 className="text-xl font-semibold">Convite aceito!</h1>
            <p className="text-sm text-muted-foreground">Redirecionando...</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold text-destructive">Não foi possível aceitar</h1>
            <p className="text-sm">{error}</p>
          </>
        )}
      </div>
    </div>
  );
}
