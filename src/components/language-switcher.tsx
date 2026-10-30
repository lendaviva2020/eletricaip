import { Globe } from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({
  variant = "ghost",
  className = "",
}: {
  variant?: "ghost" | "outline" | "default";
  className?: string;
}) {
  const { locale, toggleLocale } = useI18n();

  return (
    <Button
      size="sm"
      variant={variant}
      onClick={toggleLocale}
      className={`h-8 px-2 gap-1.5 text-xs font-mono font-medium hover:bg-accent ${className}`}
      title={locale === "pt-BR" ? "Alternar para Inglês (EN)" : "Switch to Portuguese (PT-BR)"}
      aria-label="Alternar idioma"
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{locale === "pt-BR" ? "PT" : "EN"}</span>
    </Button>
  );
}
