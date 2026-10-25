import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Palette } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, normalizeLocale } from "@/lib/i18n";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Aparência · EletricAI" }] }),
  component: AppearancePage,
});

type Theme = "dark" | "light" | "system";
type Density = "comfortable" | "compact";

interface AppearanceState {
  theme: Theme;
  density: Density;
  language: string;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  setLanguage: (l: string) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: "dark",
      density: "comfortable",
      language: "pt-BR",
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
    }),
    { name: "eletricai-appearance" },
  ),
);

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (t === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else {
    root.classList.add(t);
  }
}

function AppearancePage() {
  const { theme, density, setTheme, setDensity } = useAppearance();
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleLanguageChange = (val: string) => {
    const normalized = normalizeLocale(val);
    setLocale(normalized);
    useAppearance.getState().setLanguage(normalized);
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" /> {t("settings.appearance")}
        </h1>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label>{t("settings.appearanceTheme")}</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">{t("settings.appearanceThemeDark")}</SelectItem>
                  <SelectItem value="light">{t("settings.appearanceThemeLight")}</SelectItem>
                  <SelectItem value="system">{t("settings.appearanceThemeSystem")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("settings.appearanceDensity")}</Label>
              <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">{t("settings.appearanceDensityComfortable")}</SelectItem>
                  <SelectItem value="compact">{t("settings.appearanceDensityCompact")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("settings.appearanceLanguage")}</Label>
              <Select value={locale} onValueChange={handleLanguageChange}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">{t("settings.appearanceLanguagePt")}</SelectItem>
                  <SelectItem value="en">{t("settings.appearanceLanguageEn")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
