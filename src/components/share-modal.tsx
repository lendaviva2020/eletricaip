import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Share2, Copy, Users, Link2, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/lib/project-store";
import { useCollab, type CollabUser } from "@/hooks/use-collab";

export function ShareModal() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const projectId = useProjectStore((s) => s.projectId);
  const { users } = useCollab(projectId);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("trigger-share-modal", handler);
    return () => window.removeEventListener("trigger-share-modal", handler);
  }, []);

  const shareUrl =
    typeof window !== "undefined" && projectId
      ? `${window.location.origin}/workspace?projectId=${projectId}`
      : "";

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-6 bg-card/95 border-border backdrop-blur-md shadow-glow rounded-xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Share2 className="h-5 w-5 text-primary" />
            Compartilhar Workspace
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Envie o link abaixo para colaboradores editarem este projeto em tempo real.
          </p>
        </DialogHeader>

        {/* Share Link */}
        {projectId ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1 block">
                Link de acesso
              </label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="text-xs font-mono bg-muted/30"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5 cursor-pointer"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1.5">
                <Link2 className="inline h-3 w-3 mr-0.5 align-text-bottom" />
                Qualquer membro do tenant com este link pode acessar e editar o canvas em tempo real.
              </p>
            </div>

            {/* Online users */}
            <div>
              <label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2 block">
                <Users className="inline h-3 w-3 mr-0.5 align-text-bottom" />
                Colaboradores online ({users.length})
              </label>
              {users.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">Nenhum colaborador conectado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {users.map((u: CollabUser) => (
                    <div
                      key={u.userId}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-border bg-muted/30 text-[10px]"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0 animate-pulse"
                        style={{ backgroundColor: u.color }}
                      />
                      <span className="font-medium">{u.userName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Abra um projeto no workspace antes de compartilhar.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
