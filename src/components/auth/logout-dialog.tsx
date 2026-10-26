import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProject } from "@/lib/current-project";
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
}

/**
 * Botão funcional e seguro para encerramento de sessão no ElétricAi.
 * - Confirmação via modal acessível (Radix AlertDialog).
 * - Encerramento real no Supabase Auth.
 * - Limpeza total de caches privados no React Query e estado de projeto.
 * - Redirecionamento completo para /login impedindo navegação retrógrada.
 */
export function LogoutButton({
  variant = "outline",
  size = "sm",
  className,
  scope = "local",
  label = "Sair da conta",
}: LogoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    setLoading(true);
    try {
      // 1. Encerramento real da sessão via cliente oficial Supabase
      const { error } = await supabase.auth.signOut({ scope });
      if (error) {
        console.warn("[Logout] Aviso ao encerrar sessão:", error.message);
        toast.error(`Falha ao encerrar sessão: ${error.message}`);
        setLoading(false);
        return;
      }

      // 2. Limpeza de estado de projeto ativo em memória e storage
      try {
        useCurrentProject.getState().setProject(null);
      } catch (e) {
        console.warn("[Logout] Limpeza de projeto em memória:", e);
      }

      // 3. Invalidação e limpeza total da memória em cache do React Query
      queryClient.clear();

      toast.success(
        scope === "global"
          ? "Todas as sessões foram encerradas com sucesso."
          : "Sessão encerrada com sucesso."
      );

      // 4. Redirecionamento completo para a tela de login
      // O uso de location.assign garante que o heap de memória seja resetado
      // e impede que o botão 'Voltar' do navegador renderize dados privados
      if (typeof window !== "undefined") {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("[Logout] Erro inesperado:", err);
      toast.error("Ocorreu um erro ao encerrar a sessão. Tente novamente.");
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
            <span>{scope === "global" ? "Encerrar todas as sessões?" : "Deseja sair da sua conta?"}</span>
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
