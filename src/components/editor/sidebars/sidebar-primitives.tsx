import { MagnifyingGlass } from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";

export function SidebarSearch({
  title,
  placeholder,
  value,
  onChange,
}: {
  title: string;
  placeholder: string;
  /** Texto da busca (controlado). Sem `onChange`, o campo não é exibido. */
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <>
      <div className="h-9 flex items-center px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {onChange && (
        <div className="px-2 py-2">
          <div className="relative">
            <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label={`Buscar em ${title}`}
              title={`Buscar em ${title}`}
              placeholder={placeholder}
              type="search"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value.slice(0, 80))}
              className="w-full h-8 pl-8 pr-2 rounded bg-input/60 border border-border text-[11px] outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Normaliza para busca: minúsculas e sem acento ("Proteção" casa com "protecao"). */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function PaletteGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

export function SidebarShell({
  width = 220,
  children,
  footer,
}: {
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="flex h-full shrink-0 flex-col border-r border-border bg-panel lg:w-full!"
      style={{ width }}
    >
      {children}
      {footer && (
        <div className="mt-auto p-3 border-t border-border text-[10px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
