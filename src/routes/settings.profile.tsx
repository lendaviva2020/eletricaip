import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings/profile")({
  head: () => ({ meta: [{ title: "Perfil · EletricAI" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [locale, setLocale] = useState("pt-BR");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (uErr || !u.user) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (cancelled) return;
        setUserId(u.user.id);
        setEmail(u.user.email ?? "");
        const { data: p, error: pErr } = await supabase
          .from("profiles")
          .select("full_name, locale")
          .eq("id", u.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (pErr) {
          toast.error(`Falha ao carregar perfil: ${pErr.message}`);
        } else if (p) {
          setFullName(p.full_name ?? "");
          setLocale(p.locale ?? "pt-BR");
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, locale })
      .eq("id", userId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Perfil atualizado");
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <User className="h-5 w-5 text-primary" /> Perfil
        </h1>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label>Email</Label>
              <Input value={email} disabled className="mt-1.5" />
            </div>
            <div>
              <Label>Nome completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Idioma</Label>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                aria-label="Idioma"
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en-US">English (US)</option>
                <option value="es-ES">Español</option>
              </select>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
