import { Search } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export function SidebarSearch({ title, placeholder }: { title: string; placeholder: string }) {
  return (
    <>
      <div className="h-9 flex items-center px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label={`Buscar em ${title}`}
            title={`Buscar em ${title}`}
            placeholder={placeholder}
            className="w-full h-8 pl-8 pr-2 rounded bg-input/60 border border-border text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </>
  );
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
    <div className="flex shrink-0 flex-col border-r border-border bg-panel/50" style={{ width }}>
      {children}
      {footer && (
        <div className="mt-auto p-3 border-t border-border text-[10px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
