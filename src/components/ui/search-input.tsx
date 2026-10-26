import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  shortcut?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onChange, onClear, shortcut, ...props }, ref) => {
    const hasValue = Boolean(value);

    return (
      <div className="relative w-full">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={onChange}
          aria-label={props["aria-label"] ?? props.placeholder ?? "Pesquisar"}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-input/40 px-9 py-1 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpar pesquisa"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-sm"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {!hasValue && shortcut && (
          <kbd className="hidden sm:inline-flex items-center absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border pointer-events-none select-none">
            {shortcut}
          </kbd>
        )}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";
