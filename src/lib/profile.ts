/**
 * Perfil do usuário (puro, cliente e servidor).
 *
 * `profiles.role` é o PAPEL DE SEGURANÇA usado pelo RLS — o usuário não o
 * altera (o trigger anti-escalação desfaz a mudança). O cargo profissional
 * ("Engenheiro eletricista") fica em `profiles.preferences.job_title`.
 */
import { z } from "zod";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/types";
import { toSafeExternalHref } from "@/lib/security/url-safety";

export const PROFILE_LIMITS = { fullName: 120, jobTitle: 80, avatarUrl: 2048 } as const;

const LocaleSchema = z.enum(
  SUPPORTED_LOCALES as unknown as [SupportedLocale, ...SupportedLocale[]],
);

/** Só HTTPS: imagem por HTTP vira conteúdo misto e expõe o IP do usuário. */
export function normalizeAvatarUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.length > PROFILE_LIMITS.avatarUrl) return null;
  const safe = toSafeExternalHref(v);
  return safe && safe.startsWith("https://") ? safe : null;
}

export const ProfileUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1, "Informe seu nome.").max(PROFILE_LIMITS.fullName),
    jobTitle: z.string().trim().max(PROFILE_LIMITS.jobTitle),
    locale: LocaleSchema,
    avatarUrl: z.string().max(PROFILE_LIMITS.avatarUrl),
  })
  .superRefine((v, ctx) => {
    if (v.avatarUrl.trim() && !normalizeAvatarUrl(v.avatarUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["avatarUrl"],
        message: "Use um endereço de imagem HTTPS válido.",
      });
    }
  });
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

export interface MyProfile {
  email: string;
  createdAt: string | null;
  fullName: string;
  jobTitle: string;
  locale: SupportedLocale;
  avatarUrl: string;
  /** Foto do provedor de login (Google), usada quando não há avatar próprio. */
  providerAvatarUrl: string | null;
  organization: { name: string; role: string } | null;
}

export function readJobTitle(preferences: unknown): string {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return "";
  const v = (preferences as Record<string, unknown>).job_title;
  return typeof v === "string" ? v.slice(0, PROFILE_LIMITS.jobTitle) : "";
}

export function mergePreferences(preferences: unknown, jobTitle: string): Record<string, unknown> {
  const base =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? { ...(preferences as Record<string, unknown>) }
      : {};
  if (jobTitle) base.job_title = jobTitle;
  else delete base.job_title;
  return base;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  engineer: "Engenheiro",
  operator: "Operador",
  viewer: "Visualizador",
};

export function organizationRoleLabel(role: string): string {
  return ROLE_LABEL[role] ?? "Membro";
}

export function readProviderAvatar(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const raw = typeof m.avatar_url === "string" ? m.avatar_url : m.picture;
  return typeof raw === "string" ? normalizeAvatarUrl(raw) : null;
}
