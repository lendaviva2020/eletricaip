// Centralized i18n Store with persist, HTML lang sync, and profile synchronization
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ptBR, type TranslationCatalog } from "./catalogs/pt-BR";
import { en } from "./catalogs/en";
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type SupportedLocale,
} from "./types";
import { recordMissingKey } from "./missing-key-detector";
import { formatCurrency, formatDate, formatNumber, formatRelativeTime } from "./format";
import { supabase } from "@/integrations/supabase/client";

const catalogs: Record<SupportedLocale, TranslationCatalog> = {
  "pt-BR": ptBR,
  en,
};

interface I18nStoreState {
  locale: SupportedLocale;
  setLocale: (locale: string, opts?: { syncProfile?: boolean }) => void;
  toggleLocale: () => void;
}

export const useI18nStore = create<I18nStoreState>()(
  persist(
    (set, get) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (rawLocale, opts = { syncProfile: true }) => {
        const next = normalizeLocale(rawLocale);
        set({ locale: next });

        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
        }

        // Sincroniza em background com o perfil no Supabase se houver usuário autenticado
        if (opts.syncProfile && typeof window !== "undefined") {
          void (async () => {
            try {
              const { data } = await supabase.auth.getSession();
              const userId = data?.session?.user?.id;
              if (userId) {
                await supabase
                  .from("profiles")
                  .update({ locale: next, updated_at: new Date().toISOString() })
                  .eq("id", userId);
              }
            } catch {
              // Ignore background sync errors
            }
          })();
        }
      },
      toggleLocale: () => {
        const current = get().locale;
        const next = current === "pt-BR" ? "en" : "pt-BR";
        get().setLocale(next);
      },
    }),
    {
      name: "eletricai-locale",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          document.documentElement.lang = state.locale;
        }
      },
    },
  ),
);

// Resolução de chave com suporte a notação ponto e interpolação {param}
export function translate(
  key: string,
  params?: Record<string, string | number>,
  forcedLocale?: SupportedLocale,
): string {
  const currentLocale = forcedLocale ?? useI18nStore.getState().locale;
  const catalog = catalogs[currentLocale] ?? ptBR;

  const parts = key.split(".");
  let current: any = catalog;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      current = undefined;
      break;
    }
  }

  // Fallback para pt-BR caso falte no catálogo ativo
  if (current === undefined && currentLocale !== "pt-BR") {
    let fallback: any = ptBR;
    for (const part of parts) {
      if (fallback && typeof fallback === "object" && part in fallback) {
        fallback = fallback[part];
      } else {
        fallback = undefined;
        break;
      }
    }
    current = fallback;
    recordMissingKey(key, currentLocale);
  }

  if (current === undefined) {
    recordMissingKey(key, currentLocale);
    return key;
  }

  if (typeof current !== "string") {
    return key;
  }

  if (!params) {
    return current;
  }

  return current.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

export const t = translate;

export function getLocale(): SupportedLocale {
  return useI18nStore.getState().locale;
}

// Hook unificado para uso em componentes React
export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const toggleLocale = useI18nStore((s) => s.toggleLocale);

  const boundT = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(key, params, locale),
    [locale],
  );
  const boundFormatNumber = useCallback(
    (val: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(val, locale, options),
    [locale],
  );
  const boundFormatCurrency = useCallback(
    (val: number, currency?: string) =>
      formatCurrency(val, locale, currency),
    [locale],
  );
  const boundFormatDate = useCallback(
    (d: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(d, locale, options),
    [locale],
  );
  const boundFormatRelativeTime = useCallback(
    (d: Date | string | number) =>
      formatRelativeTime(d, locale),
    [locale],
  );

  return useMemo(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t: boundT,
      formatNumber: boundFormatNumber,
      formatCurrency: boundFormatCurrency,
      formatDate: boundFormatDate,
      formatRelativeTime: boundFormatRelativeTime,
    }),
    [
      locale,
      setLocale,
      toggleLocale,
      boundT,
      boundFormatNumber,
      boundFormatCurrency,
      boundFormatDate,
      boundFormatRelativeTime,
    ],
  );
}
