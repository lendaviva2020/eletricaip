/**
 * Perfil da conta: engenheiro que trabalha por uma EMPRESA (equipe, convites,
 * faturamento em nome da empresa) ou PROFISSIONAL AUTÔNOMO (pessoa física,
 * atende vários clientes com o próprio workspace).
 *
 * Fica em `tenants.settings.account_type` (a organização é a unidade de
 * cobrança e de dados). Na criação da conta, vem do cadastro
 * (`user_metadata.account_type`).
 */
import { z } from "zod";

export const ACCOUNT_TYPES = ["empresa", "autonomo"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);

export const ACCOUNT_TYPE_LABEL: Readonly<Record<AccountType, string>> = {
  empresa: "Empresa / equipe de engenharia",
  autonomo: "Profissional autônomo (pessoa física)",
};

export const ACCOUNT_TYPE_HINT: Readonly<Record<AccountType, string>> = {
  empresa: "Para integradoras, indústrias e escritórios: equipe, papéis e projetos da empresa.",
  autonomo: "Para engenheiros e técnicos que atendem vários clientes por conta própria.",
};

export const CompanyNameSchema = z.string().trim().min(2).max(120);

/** Tipo informado no cadastro (metadata não confiável → validado). */
export function accountTypeFromMetadata(meta: unknown): AccountType | null {
  if (!meta || typeof meta !== "object") return null;
  const parsed = AccountTypeSchema.safeParse((meta as Record<string, unknown>).account_type);
  return parsed.success ? parsed.data : null;
}

/** Valor de `?perfil=` em links de divulgação (páginas por público). */
export function accountTypeFromSearch(raw: unknown): AccountType | undefined {
  const parsed = AccountTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Nome da organização. Empresa usa a razão/nome informado; autônomo usa o
 * nome da pessoa. Nunca sobrescreve um nome que o usuário já mudou.
 */
export function organizationNameFor(input: {
  readonly type: AccountType;
  readonly fullName?: string | null;
  readonly companyName?: string | null;
  readonly currentName: string;
}): string {
  const isDefault = /^Workspace de /.test(input.currentName);
  if (!isDefault) return input.currentName;
  const company = input.companyName?.trim();
  if (input.type === "empresa" && company) return company.slice(0, 120);
  const person = input.fullName?.trim();
  if (input.type === "autonomo" && person) return `${person} — Engenharia`.slice(0, 120);
  return input.currentName;
}
