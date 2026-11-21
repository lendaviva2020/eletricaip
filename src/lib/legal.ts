/**
 * Documentos legais: versões vigentes e dados cadastrais da empresa.
 *
 * Os dados da empresa (razão social, CNPJ, endereço, contatos) NÃO podem ser
 * inventados — publicar um CNPJ fictício como real é risco jurídico. Vêm de
 * variáveis PÚBLICAS do build (não são segredo; aparecem na página) e, sem
 * elas, aparecem como "a informar".
 *
 * Mudou o texto dos Termos/Política → suba a versão aqui e no .md: o cadastro
 * grava a versão aceita e a data no perfil do usuário.
 */
export const TERMS_VERSION = "1.2";
export const PRIVACY_VERSION = "1.1";

const PENDING = "a informar";

function env(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export interface LegalEntity {
  readonly legalName: string;
  readonly cnpj: string;
  readonly address: string;
  readonly contactEmail: string;
  readonly privacyEmail: string;
}

export function legalEntity(): LegalEntity {
  return {
    legalName: env("VITE_LEGAL_NAME") ?? `razão social ${PENDING}`,
    cnpj: env("VITE_LEGAL_CNPJ") ?? PENDING,
    address: env("VITE_LEGAL_ADDRESS") ?? PENDING,
    contactEmail: env("VITE_LEGAL_CONTACT_EMAIL") ?? PENDING,
    privacyEmail: env("VITE_LEGAL_PRIVACY_EMAIL") ?? env("VITE_LEGAL_CONTACT_EMAIL") ?? PENDING,
  };
}

/**
 * Só os dados cadastrais REALMENTE informados (para a landing): campo ausente
 * não aparece — melhor do que exibir "a informar" ao visitante.
 */
export function providedLegalEntity(): Partial<LegalEntity> {
  const name = env("VITE_LEGAL_NAME");
  const cnpj = env("VITE_LEGAL_CNPJ");
  const address = env("VITE_LEGAL_ADDRESS");
  const contact = env("VITE_LEGAL_CONTACT_EMAIL");
  const out: Partial<LegalEntity> = {
    ...(name ? { legalName: name } : {}),
    ...(cnpj ? { cnpj } : {}),
    ...(address ? { address } : {}),
    ...(contact ? { contactEmail: contact } : {}),
  };
  return out;
}

/** Substitui {{TOKENS}} dos .md legais pelos dados reais (ou "a informar"). */
export function fillLegalTokens(markdown: string, entity: LegalEntity = legalEntity()): string {
  const map: Record<string, string> = {
    LEGAL_NAME: entity.legalName,
    CNPJ: entity.cnpj,
    ADDRESS: entity.address,
    CONTACT_EMAIL: entity.contactEmail,
    PRIVACY_EMAIL: entity.privacyEmail,
    TERMS_VERSION,
    PRIVACY_VERSION,
  };
  return markdown.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => map[key] ?? whole);
}

/** Registro do aceite gravado no cadastro (user_metadata). */
export function termsAcceptanceRecord(now: Date = new Date()) {
  return {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    terms_accepted_at: now.toISOString(),
  } as const;
}
