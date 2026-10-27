import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, type SignOutResult } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface LogoutButtonProps {
  variant?: "default" | "destructive" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  scope?: "local" | "global";
  label?: string;
  redirectTo?: string;
  onLogoutSuccess?: () => void;
}

/**
 * Botão funcional e seguro para encerramento de sessão no ElétricAi.
 * - Confirmação via modal acessível (Radix AlertDialog).
 * - Encerramento real no Supabase Auth coordenado via useAuth.signOut.
 * - Limpeza integral de caches privados no React Query.
 * - Diferenciação clara entre revogação remota confirmada vs. erro de conexão.
 * - useAuth.signOut é o ÚNICO responsável pela navegação pós-logout (para /),
 *   evitando redirecionamentos duplicados e garantindo substituição de histórico.
 */
export function LogoutButton({
  variant = "outline",
  size = "sm",
  className,
  scope = "local",
  label = "Sair da conta",
  redirectTo = "/",
  onLogoutSuccess,
}: LogoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    setLoading(true);

    try {
      // 1. Encerramento da sessão via useAuth (responsável único pela navegação e projeto)
      let res: SignOutResult | null = null;
      if (signOut) {
        res = await signOut({ scope, redirectTo });
      } else {
        const { error } = await supabase.auth.signOut({ scope });
        res = {
          error: error ? new Error(error.message) : null,
          localSignedOut: true,
          remoteStatus: error ? "unconfirmed" : "confirmed",
          remoteRevoked: !error,
          storageError: null,
        };
      }

      // 2. Limpeza de caches privados do React Query
      // Em logout voluntário a sessão local foi removida; purgamos todo o cache imediatamente.
      queryClient.clear();

      // 3. Diferenciação transparente de feedback ao usuário
      if (res?.error || res?.remoteStatus === "unconfirmed") {
        const detail = res?.error?.message ?? "Falha de rede";
        console.warn("[Logout] Revogação remota não confirmada:", detail);
        if (scope === "global") {
          toast.warning(
            `Sessão deste dispositivo encerrada. Não foi possível confirmar a desconexão nos demais dispositivos (${detail}).`,
          );
        } else {
          toast.warning(
            `Sessão encerrada neste dispositivo. A revogação no servidor não pôde ser confirmada (${detail}).`,
          );
        }
      } else {
        toast.success(
          scope === "global"
            ? "Todas as sessões foram encerradas com sucesso."
            : "Sessão encerrada com sucesso.",
        );
      }

      if (res && !res.localSignedOut) {
        console.error("[Logout] Falha na confirmação da sessão local:", res.storageError);
        toast.error(
          "Aviso: Não foi possível confirmar a exclusão dos dados de sessão no armazenamento deste dispositivo.",
        );
      }

      setOpen(false);
      onLogoutSuccess?.();
    } catch (err) {
      try {
        queryClient.clear();
      } catch (e) {
        console.warn("[Logout] Falha ao limpar cache em fallback:", e);
      }
      console.error("[Logout] Erro inesperado:", err);
      toast.warning("Sessão finalizada localmente com aviso de conexão.");
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          type="button"
          aria-label={label}
        >
          <LogOut className="h-4 w-4" />
          <span>{label}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-card border-border max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold">
            <LogOut className="h-4 w-4 text-destructive" />
            <span>
              {scope === "global" ? "Encerrar todas as sessões?" : "Deseja sair da sua conta?"}
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground mt-2">
            {scope === "global"
              ? "Esta ação desconectará todos os seus dispositivos e navegadores ativos. Você precisará fazer login novamente."
              : "Sua sessão neste dispositivo será finalizada com segurança. Todos os seus dados, configurações e projetos salvos permanecerão preservados."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2">
          <AlertDialogCancel disabled={loading} className="text-xs">
            Cancelar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading}
            onClick={handleLogout}
            className="text-xs inline-flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saindo…</span>
              </>
            ) : (
              <>
                <LogOut className="h-3.5 w-3.5" />
                <span>{scope === "global" ? "Encerrar todas" : "Sim, sair da conta"}</span>
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
