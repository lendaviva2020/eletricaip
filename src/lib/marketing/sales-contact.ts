/**
 * Contato comercial da landing — PURO.
 *
 * Não há backend de leads (nenhuma tabela foi criada para isso): o pedido de
 * demonstração é montado aqui, validado por Zod e entregue pelo canal REAL que a
 * empresa configurar no build (WhatsApp comercial e/ou e-mail). Sem canal
 * configurado, a página diz isso — nunca finge que enviou.
 *
 * Variáveis PÚBLICAS (aparecem na página, não são segredo):
 *   VITE_SALES_WHATSAPP  — número com DDI, só dígitos (ex.: 55 + DDD + número)
 *   VITE_SALES_EMAIL     — e-mail comercial (cai para VITE_LEGAL_CONTACT_EMAIL)
 */
import { z } from "zod";

export const TEAM_SIZES = ["1", "2-5", "6-20", "21-100", "100+"] as const;
export type TeamSize = (typeof TEAM_SIZES)[number];

export const INTERESTS = ["demonstracao", "piloto", "corporativo", "duvida-tecnica"] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  demonstracao: "Demonstração guiada",
  piloto: "Programa piloto (empresas fundadoras)",
  corporativo: "Plano Corporativo (proposta comercial)",
  "duvida-tecnica": "Dúvida técnica",
};

/** Remove caracteres de controle (inclusive quebras forjadas) e espaços repetidos. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

function clean(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

const Text = (min: number, max: number) =>
  z.string().transform(clean).pipe(z.string().min(min).max(max));

export const DemoRequestSchema = z.object({
  name: Text(2, 80),
  company: Text(2, 120),
  role: Text(2, 80),
  email: z.string().trim().toLowerCase().max(160).email("e-mail inválido"),
  teamSize: z.enum(TEAM_SIZES),
  interest: z.enum(INTERESTS),
  message: z.string().transform(clean).pipe(z.string().max(600)).optional().default(""),
});

export type DemoRequest = z.infer<typeof DemoRequestSchema>;

export interface SalesChannels {
  /** Número só com dígitos (10 a 15), ou null se não configurado/ inválido. */
  whatsapp: string | null;
  email: string | null;
}

const EmailOnly = z.string().trim().email().max(160);

/** Lê e valida os canais. Valor inválido vira null (nunca link quebrado). */
export function resolveSalesChannels(env: Record<string, string | undefined>): SalesChannels {
  const rawPhone = (env.VITE_SALES_WHATSAPP ?? "").replace(/\D+/g, "");
  const whatsapp = /^\d{10,15}$/.test(rawPhone) ? rawPhone : null;
  const rawEmail = env.VITE_SALES_EMAIL?.trim() || env.VITE_LEGAL_CONTACT_EMAIL?.trim() || "";
  const email = EmailOnly.safeParse(rawEmail).success ? rawEmail : null;
  return { whatsapp, email };
}

export function salesChannelsFromBuild(): SalesChannels {
  return resolveSalesChannels(import.meta.env as Record<string, string | undefined>);
}

/** Texto do pedido (mesmo conteúdo no WhatsApp e no e-mail). */
export function buildDemoRequestText(r: DemoRequest): string {
  return [
    `Pedido: ${INTEREST_LABELS[r.interest]}`,
    `Nome: ${r.name}`,
    `Empresa: ${r.company}`,
    `Cargo: ${r.role}`,
    `E-mail: ${r.email}`,
    `Equipe de engenharia: ${r.teamSize} pessoa(s)`,
    ...(r.message ? [`Mensagem: ${r.message}`] : []),
  ].join("\n");
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function demoRequestSubject(r: DemoRequest): string {
  return `EletricAI — ${INTEREST_LABELS[r.interest]} — ${r.company}`;
}

/** JSON para `<script type="application/ld+json">` sem permitir fechar a tag. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
