/**
 * Referência cruzada do Ladder (bobina ↔ contatos) ao vivo, a partir das
 * redes abertas no editor. Clicar numa rede rola o editor até ela.
 */
import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  ListMagnifyingGlass,
  Warning,
  XCircle,
  Info,
} from "@phosphor-icons/react";
import { useEditorStore } from "@/lib/editor/store";
import { buildLadderXref } from "@/lib/ladder/cross-reference";
import { normalizeSearch } from "./sidebar-primitives";

const INPUT_ADDRESS_RE = /^%?I[XWBD]?\d/i;

function goToRung(location: string) {
  const n = /\d+/.exec(location)?.[0];
  if (!n || typeof document === "undefined") return;
  document
    .querySelector(`[data-rung-index="${n}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function Locations({ label, list }: { label: string; list: readonly string[] }) {
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground w-9 shrink-0">
        {label}
      </span>
      {list.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => goToRung(loc)}
          className="px-1 rounded bg-muted/60 hover:bg-accent text-[10px] font-mono"
        >
          {loc.replace("Rede ", "R")}
        </button>
      ))}
    </div>
  );
}

export function LadderCrossReferencePanel() {
  const rungs = useEditorStore((s) => s.rungs);
  const tags = useEditorStore((s) => s.editorTags);
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");

  const xref = useMemo(() => {
    const inputTags = new Set<string>();
    for (const tag of Object.values(tags)) {
      if (INPUT_ADDRESS_RE.test(tag.id)) {
        inputTags.add(tag.name.toUpperCase());
        inputTags.add(tag.id.toUpperCase());
      }
    }
    return buildLadderXref(rungs, { inputTags });
  }, [rungs, tags]);

  const q = normalizeSearch(query);
  const rows = q ? xref.rows.filter((r) => normalizeSearch(r.operand).includes(q)) : xref.rows;
  const problems = xref.issues.filter((i) => i.severity !== "info");

  return (
    <section className="border-t border-border px-2 py-2" data-testid="ladder-xref">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
      >
        {open ? <CaretDown className="h-3 w-3" /> : <CaretRight className="h-3 w-3" />}
        <ListMagnifyingGlass className="h-3 w-3" /> Referência cruzada
        <span className="ml-auto font-mono normal-case tracking-normal">
          {xref.rows.length}
          {problems.length > 0 && <span className="text-destructive"> · {problems.length}!</span>}
        </span>
      </button>
      {open && (
        <div className="space-y-2">
          {xref.rows.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Nenhum contato ou bobina nas redes ainda.
            </p>
          ) : (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar operando…"
                aria-label="Filtrar referência cruzada"
                className="h-7 w-full rounded border border-border bg-background px-2 text-[11px]"
              />
              {xref.issues.length > 0 && (
                <ul className="space-y-1" data-testid="ladder-xref-issues">
                  {xref.issues.map((issue) => {
                    const Icon =
                      issue.severity === "error"
                        ? XCircle
                        : issue.severity === "warning"
                          ? Warning
                          : Info;
                    const color =
                      issue.severity === "error"
                        ? "text-destructive"
                        : issue.severity === "warning"
                          ? "text-warning"
                          : "text-muted-foreground";
                    return (
                      <li
                        key={`${issue.kind}-${issue.operand}`}
                        className={`flex gap-1 text-[10px] ${color}`}
                      >
                        <Icon className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{issue.message}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ul className="space-y-1.5 max-h-72 overflow-auto scrollbar-thin">
                {rows.map((row) => (
                  <li key={row.operand} className="rounded border border-border/60 p-1.5">
                    <p className="font-mono text-[11px] text-foreground truncate">{row.operand}</p>
                    <div className="mt-1 space-y-0.5">
                      <Locations label="Bob." list={row.coils} />
                      <Locations label="Set" list={row.sets} />
                      <Locations label="Reset" list={row.resets} />
                      <Locations label="NA" list={row.contactsNo} />
                      <Locations label="NF" list={row.contactsNc} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
