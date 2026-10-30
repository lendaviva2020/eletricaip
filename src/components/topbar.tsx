import { useState } from "react";
import {
  MagnifyingGlass,
  FloppyDisk,
  ShareNetwork,
  GitBranch,
  CircleNotch,
  Check,
  Sun,
  Moon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { RuntimeStatus } from "@/components/runtime-status";
import { MobileMenu } from "@/components/mobile-menu";
import { AiCreditsBadge } from "@/components/ai-credits-badge";
import { NotificationDropdown } from "@/components/ui/notification-dropdown";
import { LanguageSwitcher } from "@/components/language-switcher";
import { saveManualVersion } from "@/lib/ai-architect-client";
import { useNotifications } from "@/hooks/use-notifications";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/design-system/theme";

export function Topbar() {
  useNotifications();
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const [saving, setSaving] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const onSave = async () => {
    setSaving("busy");
    setSavedMsg(null);
    const result = await saveManualVersion(`Snapshot ${new Date().toLocaleString("pt-BR")}`);
    if (result.ok) {
      setSaving("ok");
      setSavedMsg(`v${result.version} salva`);
      setTimeout(() => {
        setSaving("idle");
        setSavedMsg(null);
      }, 2500);
    } else {
      setSaving("err");
      setSavedMsg(result.error ?? t("common.errorSaving"));
      setTimeout(() => {
        setSaving("idle");
        setSavedMsg(null);
      }, 4000);
    }
  };

  return (
    <header className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-panel">
      <MobileMenu />
      <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono text-[11px]">main</span>
        <span className="text-border">/</span>
        <span className="text-foreground font-medium text-xs">Planta - Linha 03</span>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <div className="relative w-full max-w-md">
          <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            aria-label={t("common.search")}
            title={t("common.search")}
            placeholder={t("common.searchPlaceholder")}
            onFocus={() => window.dispatchEvent(new CustomEvent("eletricai-open-command-palette"))}
            onClick={() => window.dispatchEvent(new CustomEvent("eletricai-open-command-palette"))}
            readOnly
            className="w-full h-7 pl-8 pr-14 rounded-md bg-background border border-input text-xs cursor-pointer
                       outline-none focus-visible:ring-2 focus-visible:ring-ring
                       placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:block absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground border border-border pointer-events-none">
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant={saving === "ok" ? "default" : saving === "err" ? "destructive" : "ghost"}
          onClick={onSave}
          disabled={saving === "busy"}
          aria-label={savedMsg ?? t("common.save")}
          className="h-7 px-2 gap-1.5 text-xs"
          title={savedMsg ?? t("common.save")}
        >
          {saving === "busy" ? (
            <CircleNotch className="h-3.5 w-3.5 animate-spin" />
          ) : saving === "ok" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <FloppyDisk className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">
            {saving === "ok" ? savedMsg : saving === "err" ? t("common.error") : t("common.save")}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex h-7 px-2 gap-1.5 text-xs"
          onClick={() => window.dispatchEvent(new Event("trigger-share-modal"))}
        >
          <ShareNetwork className="h-3.5 w-3.5" /> {t("common.share")}
        </Button>
        <div className="hidden md:block h-4 w-px bg-border mx-1" />
        <RuntimeStatus />
        <AiCreditsBadge />
        <div className="hidden sm:block h-4 w-px bg-border mx-1" />
        <NotificationDropdown />
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={
            resolvedTheme === "dark"
              ? t("settings.appearanceThemeLight") || "Tema Claro"
              : t("settings.appearanceThemeDark") || "Tema Escuro"
          }
          title={
            resolvedTheme === "dark"
              ? t("settings.appearanceThemeLight") || "Tema Claro"
              : t("settings.appearanceThemeDark") || "Tema Escuro"
          }
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="h-3.5 w-3.5 text-warning" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-primary" />
          )}
        </Button>
        <div
          className="h-6 w-6 rounded-sm border border-border bg-secondary flex items-center justify-center text-[10px] font-mono font-semibold text-muted-foreground select-none"
          aria-hidden="true"
        >
          EA
        </div>
      </div>
    </header>
  );
}
