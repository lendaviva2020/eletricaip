// Types and contracts for the Centralized Internationalization Engine (pt-BR / en)

export type SupportedLocale = "pt-BR" | "en";

export type TranslationKey = string;

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["pt-BR", "en"] as const;

export const DEFAULT_LOCALE: SupportedLocale = "pt-BR";

export function normalizeLocale(rawLocale: string | null | undefined): SupportedLocale {
  if (!rawLocale) return DEFAULT_LOCALE;
  const lower = rawLocale.toLowerCase().trim();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("pt")) return "pt-BR";
  return DEFAULT_LOCALE;
}

export interface I18nFormatters {
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatRelativeTime: (date: Date | string | number) => string;
}
