// Localized formatting for numbers, currencies, dates, and relative time
import type { SupportedLocale } from "./types";

export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatCurrency(value: number, locale: SupportedLocale, currency = "BRL"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDate(
  date: Date | string | number,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const opts: Intl.DateTimeFormatOptions = options ?? {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return String(date);
  }
}

export function formatRelativeTime(date: Date | string | number, locale: SupportedLocale): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return "";
    const now = Date.now();
    const diffSec = Math.round((now - d.getTime()) / 1000);

    if (diffSec < 10) {
      return locale === "pt-BR" ? "agora" : "just now";
    }
    if (diffSec < 60) {
      return locale === "pt-BR" ? `há ${diffSec}s` : `${diffSec}s ago`;
    }
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) {
      return locale === "pt-BR" ? `há ${diffMin} min` : `${diffMin}m ago`;
    }
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) {
      return locale === "pt-BR" ? `há ${diffHours}h` : `${diffHours}h ago`;
    }
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) {
      return locale === "pt-BR" ? "ontem" : "yesterday";
    }
    if (diffDays < 30) {
      return locale === "pt-BR" ? `há ${diffDays} dias` : `${diffDays}d ago`;
    }
    return formatDate(d, locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}
