import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "@phosphor-icons/react";
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
import { useTheme, type Theme, type Density } from "@/lib/design-system/theme";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({ meta: [{ title: "Aparência · EletricAI" }] }),
  component: AppearancePage,
});

export const useAppearance = useTheme;

function AppearancePage() {
  const { theme, density, setTheme, setDensity } = useTheme();
  const { locale, setLocale, t } = useI18n();

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
                  <SelectItem value="comfortable">
                    {t("settings.appearanceDensityComfortable")}
                  </SelectItem>
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
