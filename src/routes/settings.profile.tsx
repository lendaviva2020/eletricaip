import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  User,
  Copy,
  Check,
  Camera,
  CircleNotch,
  EnvelopeSimple,
  Globe,
  Briefcase,
  Buildings,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useI18n, useI18nStore } from "@/lib/i18n";
import type { SupportedLocale } from "@/lib/i18n/types";
import { AccountTypeCard } from "@/components/settings/account-type-card";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import {
  PROFILE_LIMITS,
  ProfileUpdateSchema,
  normalizeAvatarUrl,
  organizationRoleLabel,
  type ProfileUpdate,
} from "@/lib/profile";

export const Route = createFileRoute("/settings/profile")({
  head: () => ({ meta: [{ title: "Perfil · EletricAI" }] }),
  component: ProfilePage,
});

const EMPTY: ProfileUpdate = { fullName: "", jobTitle: "", locale: "pt-BR", avatarUrl: "" };

function errorMessage(e: unknown): string {
  if (e instanceof Response) return "Não foi possível concluir. Tente novamente.";
  return e instanceof Error && e.message ? e.message : "Não foi possível concluir.";
}

function ProfilePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getMyProfile);
  const saveFn = useServerFn(updateMyProfile);
  const [copied, setCopied] = useState(false);
  const [initial, setInitial] = useState<ProfileUpdate>(EMPTY);
  const [form, setForm] = useState<ProfileUpdate>(EMPTY);

  const q = useQuery({ queryKey: ["my-profile"], queryFn: () => getFn(), retry: 1 });

  useEffect(() => {
    if (!q.data) return;
    const next: ProfileUpdate = {
      fullName: q.data.fullName,
      jobTitle: q.data.jobTitle,
      locale: q.data.locale,
      avatarUrl: q.data.avatarUrl,
    };
    setInitial(next);
    setForm(next);
    // O idioma salvo no perfil vale em qualquer dispositivo.
    if (useI18nStore.getState().locale !== q.data.locale) {
      useI18nStore.getState().setLocale(q.data.locale, { syncProfile: false });
    }
  }, [q.data]);

  const dirty = useMemo(
    () => (Object.keys(form) as (keyof ProfileUpdate)[]).some((k) => form[k] !== initial[k]),
    [form, initial],
  );
  const validation = ProfileUpdateSchema.safeParse(form);
  const fieldError = (field: keyof ProfileUpdate): string | null => {
    if (validation.success || !dirty) return null;
    return validation.error.issues.find((i) => i.path[0] === field)?.message ?? null;
  };

  const save = useMutation({
    mutationFn: (data: ProfileUpdate) => saveFn({ data }),
    onSuccess: (_r, data) => {
      setInitial(data);
      useI18nStore.getState().setLocale(data.locale, { syncProfile: false });
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Perfil atualizado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copyEmail = async () => {
    if (!q.data?.email) return;
    try {
      await navigator.clipboard.writeText(q.data.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (q.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <CircleNotch className="h-4 w-4 animate-spin" /> Carregando perfil…
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="p-6 space-y-3 text-sm text-muted-foreground">
        <p>{q.isError ? "Não foi possível carregar o perfil." : t("pages.profNeedAuth")}</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const profile = q.data;
  const avatarSrc = normalizeAvatarUrl(form.avatarUrl) ?? profile.providerAvatarUrl ?? undefined;
  const initials = (form.fullName || profile.email || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Perfil
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suas informações pessoais e preferências de conta.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 flex items-start gap-5 flex-wrap">
            <Avatar className="h-20 w-20 ring-2 ring-border">
              <AvatarImage
                src={avatarSrc}
                alt={form.fullName || profile.email}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback className="text-lg font-semibold bg-primary/15 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate">
                  {form.fullName || "Sem nome definido"}
                </h2>
                {form.jobTitle && <Badge variant="outline">{form.jobTitle}</Badge>}
              </div>
              <button
                type="button"
                onClick={copyEmail}
                className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Copiar e-mail"
              >
                <EnvelopeSimple className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.email}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5 opacity-60" />
                )}
              </button>
              {profile.organization && (
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Buildings className="h-3.5 w-3.5" /> {profile.organization.name}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {organizationRoleLabel(profile.organization.role)}
                  </span>
                </p>
              )}
              {profile.createdAt && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Membro desde {new Date(profile.createdAt).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" value={profile.email} disabled className="mt-1.5" />
              <p className="text-[11px] text-muted-foreground mt-1">
                O e-mail de login não é alterado por aqui.
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
                  maxLength={PROFILE_LIMITS.fullName}
                  className="mt-1.5"
                  aria-invalid={Boolean(fieldError("fullName"))}
                />
                {fieldError("fullName") && (
                  <p className="text-[11px] text-destructive mt-1">{fieldError("fullName")}</p>
                )}
              </div>
              <div>
                <Label htmlFor="jobTitle" className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> Cargo / profissão
                </Label>
                <Input
                  id="jobTitle"
                  value={form.jobTitle}
                  onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                  placeholder="Ex.: Engenheiro eletricista"
                  maxLength={PROFILE_LIMITS.jobTitle}
                  className="mt-1.5"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Só informativo. As permissões na empresa são definidas em Equipe.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="avatarUrl" className="flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Foto (endereço HTTPS)
                </Label>
                <Input
                  id="avatarUrl"
                  value={form.avatarUrl}
                  onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))}
                  placeholder={
                    profile.providerAvatarUrl ? "Usando a foto da conta Google" : "https://…"
                  }
                  maxLength={PROFILE_LIMITS.avatarUrl}
                  inputMode="url"
                  className="mt-1.5"
                  aria-invalid={Boolean(fieldError("avatarUrl"))}
                />
                {fieldError("avatarUrl") && (
                  <p className="text-[11px] text-destructive mt-1">{fieldError("avatarUrl")}</p>
                )}
              </div>
              <div>
                <Label htmlFor="locale" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Idioma
                </Label>
                <select
                  id="locale"
                  value={form.locale}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, locale: e.target.value as SupportedLocale }))
                  }
                  className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English (US)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                onClick={() => validation.success && save.mutate(validation.data)}
                disabled={save.isPending || !dirty || !validation.success}
              >
                {save.isPending ? (
                  <>
                    <CircleNotch className="h-4 w-4 animate-spin" /> Salvando…
                  </>
                ) : (
                  "Salvar alterações"
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setForm(initial)}
                disabled={save.isPending || !dirty}
              >
                Descartar
              </Button>
              {dirty && (
                <span className="text-[11px] text-muted-foreground">Há alterações não salvas</span>
              )}
            </div>
          </CardContent>
        </Card>

        <AccountTypeCard />
      </div>
    </div>
  );
}
