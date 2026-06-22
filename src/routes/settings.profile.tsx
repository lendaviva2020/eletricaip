import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { User, Copy, Check, Camera, Loader2, Mail, Globe, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings/profile")({
  head: () => ({ meta: [{ title: "Perfil · EletricAI" }] }),
  component: ProfilePage,
});

interface ProfileState {
  fullName: string;
  locale: string;
  role: string;
  avatarUrl: string;
}

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileState>({
    fullName: "",
    locale: "pt-BR",
    role: "",
    avatarUrl: "",
  });
  const [form, setForm] = useState<ProfileState>(initial);

  const dirty = useMemo(
    () =>
      form.fullName !== initial.fullName ||
      form.locale !== initial.locale ||
      form.role !== initial.role ||
      form.avatarUrl !== initial.avatarUrl,
    [form, initial],
  );

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
        setCreatedAt(u.user.created_at ?? null);
        const { data: p, error: pErr } = await supabase
          .from("profiles")
          .select("full_name, locale, role, avatar_url")
          .eq("id", u.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (pErr) {
          toast.error(`Falha ao carregar perfil: ${pErr.message}`);
        } else if (p) {
          const next: ProfileState = {
            fullName: p.full_name ?? "",
            locale: p.locale ?? "pt-BR",
            role: p.role ?? "",
            avatarUrl: p.avatar_url ?? "",
          };
          setInitial(next);
          setForm(next);
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
      .update({
        full_name: form.fullName.trim(),
        locale: form.locale,
        role: form.role.trim(),
        avatar_url: form.avatarUrl.trim() || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      setInitial(form);
      toast.success("Perfil atualizado com sucesso");
    }
  };

  const reset = () => setForm(initial);

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const initials = (form.fullName || email || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil…
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Você precisa estar autenticado para editar o perfil.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Perfil
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suas informações pessoais e preferências de conta.
          </p>
        </div>

        {/* Hero card */}
        <Card>
          <CardContent className="p-6 flex items-start gap-5 flex-wrap">
            <div className="relative">
              <Avatar className="h-20 w-20 ring-2 ring-border">
                <AvatarImage src={form.avatarUrl || undefined} alt={form.fullName || email} />
                <AvatarFallback className="text-lg font-semibold bg-primary/15 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-card border border-border grid place-items-center">
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate">
                  {form.fullName || "Sem nome definido"}
                </h2>
                {form.role && (
                  <Badge variant="outline" className="capitalize">
                    {form.role}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={copyEmail}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Copiar email"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="truncate">{email}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5 opacity-60" />
                )}
              </button>
              {createdAt && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Membro desde {new Date(createdAt).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Editable fields */}
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="mt-1.5" />
              <p className="text-[11px] text-muted-foreground mt-1">
                O email é gerenciado pelo provedor de autenticação.
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Seu nome"
                  maxLength={120}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="role" className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> Cargo
                </Label>
                <Input
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                  placeholder="Ex.: Engenheiro Eletricista"
                  maxLength={80}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="avatarUrl" className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> URL do avatar
                </Label>
                <Input
                  id="avatarUrl"
                  value={form.avatarUrl}
                  onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="locale" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Idioma
                </Label>
                <select
                  id="locale"
                  value={form.locale}
                  onChange={(e) => setForm((p) => ({ ...p, locale: e.target.value }))}
                  className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  aria-label="Idioma"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                  </>
                ) : (
                  "Salvar alterações"
                )}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={saving || !dirty}>
                Descartar
              </Button>
              {dirty && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  Há alterações não salvas
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
