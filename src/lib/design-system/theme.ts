// Centralized Theme Manager for ElétricAi Design System
// Handles Dark (default industrial), Light (high-contrast professional), and System themes.
// Persists preferences, synchronizes with CSS classes, and prevents flash of unstyled theme.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";

export interface ThemeState {
  theme: Theme;
  density: Density;
  resolvedTheme: "dark" | "light";
  language: string;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setLanguage: (lang: string) => void;
}

export function resolveSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToDom(theme: Theme): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  const root = document.documentElement;
  const resolved = theme === "system" ? resolveSystemTheme() : theme;

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;

  return resolved;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      density: "comfortable",
      resolvedTheme: "dark",
      language: "pt-BR",
      setTheme: (theme: Theme) => {
        const resolved = applyThemeToDom(theme);
        set({ theme, resolvedTheme: resolved });
      },
      setDensity: (density: Density) => {
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-density", density);
        }
        set({ density });
      },
      setLanguage: (language: string) => {
        set({ language });
      },
    }),
    {
      name: "eletricai-theme",
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== "undefined") {
          const resolved = applyThemeToDom(state.theme);
          state.resolvedTheme = resolved;
          document.documentElement.setAttribute("data-density", state.density);
        }
      },
    },
  ),
);

// Listener para mudanças no esquema de cores do sistema operacional
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemThemeChange = () => {
    const currentTheme = useTheme.getState().theme;
    if (currentTheme === "system") {
      const resolved = applyThemeToDom("system");
      useTheme.setState({ resolvedTheme: resolved });
    }
  };

  mediaQuery.addEventListener("change", handleSystemThemeChange);

  // Inicialização no boot do script
  try {
    const stored = localStorage.getItem("eletricai-theme");
    const parsed = stored ? JSON.parse(stored) : null;
    const initialTheme = parsed?.state?.theme || "dark";
    applyThemeToDom(initialTheme);
  } catch {
    applyThemeToDom("dark");
  }
}

// Retrocompatibilidade para arquivos existentes que utilizavam useAppearance
export const useAppearance = useTheme;
