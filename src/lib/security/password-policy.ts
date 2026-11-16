/**
 * Política ÚNICA de senha para cadastro, redefinição e troca (RISK-024).
 * Antes o cadastro aceitava 6 caracteres e a redefinição exigia 8.
 *
 * - mínimo 8 (NIST SP 800-63B §5.1.1.2) e máximo 72 bytes (limite do bcrypt
 *   usado pelo Supabase Auth: bytes além de 72 são ignorados silenciosamente);
 * - ao menos uma letra e um dígito;
 * - não pode ser um único caractere repetido.
 * Validação de cliente é UX; a política efetiva deve ser configurada também
 * no Supabase Auth (Password requirements + Leaked password protection).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordIssue = "too_short" | "too_long" | "needs_letter" | "needs_digit" | "repeated";

export function validatePassword(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) issues.push("too_long");
  if (!/\p{L}/u.test(password)) issues.push("needs_letter");
  if (!/\d/.test(password)) issues.push("needs_digit");
  if (password.length > 0 && new Set(password).size === 1) issues.push("repeated");
  return issues;
}

const MESSAGES_PT: Record<PasswordIssue, string> = {
  too_short: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  too_long: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes.`,
  needs_letter: "A senha precisa conter ao menos uma letra.",
  needs_digit: "A senha precisa conter ao menos um número.",
  repeated: "A senha não pode ser um único caractere repetido.",
};

/** Primeira mensagem de erro (pt-BR) ou `null` se a senha atende à política. */
export function passwordPolicyError(password: string): string | null {
  const [first] = validatePassword(password);
  return first ? MESSAGES_PT[first] : null;
}
