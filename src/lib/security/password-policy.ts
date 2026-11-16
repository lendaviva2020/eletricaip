/**
 * Política ÚNICA de senha para cadastro, redefinição e troca (RISK-024).
 * Antes o cadastro aceitava 6 caracteres e a redefinição exigia 8.
 *
 * - mínimo 8 (NIST SP 800-63B §5.1.1.2) e máximo 72 bytes (limite do bcrypt
 *   usado pelo Supabase Auth: bytes além de 72 são ignorados silenciosamente);
 * - minúscula, maiúscula, dígito e símbolo — ESPELHA a configuração do painel
 *   do Supabase (Auth → E-mail → "Requisitos de senha": letras minúsculas,
 *   maiúsculas, dígitos e símbolos). Divergir faz o app aceitar uma senha que o
 *   Supabase recusa com mensagem genérica em inglês;
 * - não pode ser um único caractere repetido.
 * Validação de cliente é UX; a política efetiva deve ser configurada também
 * no Supabase Auth (Password requirements + Leaked password protection).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
/** Símbolos aceitos pelo Supabase Auth na regra "dígitos e símbolos". */
export const SUPABASE_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export type PasswordIssue =
  | "too_short"
  | "too_long"
  | "needs_lower"
  | "needs_upper"
  | "needs_digit"
  | "needs_symbol"
  | "repeated";

export function validatePassword(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) issues.push("too_long");
  // Conjuntos EXATOS do Supabase Auth (GoTrue): só ASCII. "ç"/"ã" não contam
  // como minúscula lá, então também não contam aqui.
  if (!/[a-z]/.test(password)) issues.push("needs_lower");
  if (!/[A-Z]/.test(password)) issues.push("needs_upper");
  if (!/[0-9]/.test(password)) issues.push("needs_digit");
  if (![...password].some((ch) => SUPABASE_SYMBOLS.includes(ch))) issues.push("needs_symbol");
  if (password.length > 0 && new Set(password).size === 1) issues.push("repeated");
  return issues;
}

const MESSAGES_PT: Record<PasswordIssue, string> = {
  too_short: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  too_long: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes.`,
  needs_lower: "A senha precisa conter ao menos uma letra minúscula.",
  needs_upper: "A senha precisa conter ao menos uma letra maiúscula.",
  needs_digit: "A senha precisa conter ao menos um número.",
  needs_symbol: "A senha precisa conter ao menos um símbolo (ex.: ! @ # $ % & * ?).",
  repeated: "A senha não pode ser um único caractere repetido.",
};

/** Primeira mensagem de erro (pt-BR) ou `null` se a senha atende à política. */
export function passwordPolicyError(password: string): string | null {
  const [first] = validatePassword(password);
  return first ? MESSAGES_PT[first] : null;
}
