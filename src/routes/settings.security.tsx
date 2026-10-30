import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Shield, SignOut } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "@/components/auth/logout-dialog";

export const Route = createFileRoute("/settings/security")({
  head: () => ({ meta: [{ title: "Segurança · EletricAI" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  const changePw = async () => {
    if (pw.length < 8) return toast.error("Senha deve ter ao menos 8 caracteres");
    if (pw !== pw2) return toast.error("Senhas não conferem");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Senha atualizada");
      setPw("");
      setPw2("");
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" /> Segurança
        </h1>
        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold">Trocar senha</h2>
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Confirmar senha</Label>
              <Input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <Button onClick={changePw} disabled={saving}>
              {saving ? "Salvando…" : "Atualizar senha"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Sair deste dispositivo</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Encerre sua sessão atual com segurança neste navegador.
              </p>
            </div>
            <LogoutButton variant="outline" label="Sair da conta" scope="local" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Encerrar em todos os dispositivos</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Encerra todas as sessões ativas em todos os computadores, tablets e celulares.
              </p>
            </div>
            <LogoutButton variant="destructive" label="Encerrar todas" scope="global" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
