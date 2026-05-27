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
  const { theme, density, language, setTheme, setDensity, setLanguage } = useAppearance();
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" /> Aparência
        </h1>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <Label>Tema</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Escuro</SelectItem>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Densidade</Label>
              <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Confortável</SelectItem>
                  <SelectItem value="compact">Compacta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
