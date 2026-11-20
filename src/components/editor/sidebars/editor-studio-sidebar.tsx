/**
 * Barra lateral do FB Electric Studio: páginas (com navegação), estado da
 * sincronização com o unifilar, diagnósticos do programa e símbolos de E/S.
 * Lê o MESMO modelo do Studio (`useUnifiedProjectStore.doc.compactStudio`).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { SidebarShell, normalizeSearch } from "./sidebar-primitives";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useStudioNavigation } from "@/lib/compact-studio/integration/plc-block-pages";
import { validateCompactProgram } from "@/lib/compact-studio/domain/validation";
import {
  UF_PAGE_ID,
  syncMotorLogicFromUnifilar,
} from "@/lib/compact-studio/integration/unifilar-motor-program";
import { useDiagramStore } from "@/lib/diagram/store";
import { useLadderUnifilarSync } from "@/lib/ladder/unifilar-sync-store";
import { useEditorStore } from "@/lib/editor/store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Section(props: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1">
          {open ? <CaretDown className="h-3 w-3" /> : <CaretRight className="h-3 w-3" />}
          {props.title}
        </span>
        {props.count !== undefined && <span className="font-mono">{props.count}</span>}
      </button>
      {open && <div className="px-2 pb-2">{props.children}</div>}
    </div>
  );
}

export function EditorStudioSidebar() {
  const { t } = useI18n();
  const program = useUnifiedProjectStore((s) => s.doc.compactStudio);
  const setProgram = useUnifiedProjectStore((s) => s.setCompactStudioProgram);
  const syncEnabled = useLadderUnifilarSync((s) => s.enabled);
  const syncWarnings = useLadderUnifilarSync((s) => s.warnings);
  const [query, setQuery] = useState("");

  const diagnostics = useMemo(() => {
    if (!program) return [];
    try {
      return validateCompactProgram(program).diagnostics;
    } catch {
      return [];
    }
  }, [program]);

  const symbols = useMemo(() => {
    const q = normalizeSearch(query);
    return (program?.ioSymbols ?? []).filter(
      (s) => !q || normalizeSearch(`${s.symbolicName} ${s.address} ${s.comment ?? ""}`).includes(q),
    );
  }, [program, query]);

  const openPage = (pageId: string) => {
    useStudioNavigation.getState().requestPage(pageId);
    useEditorStore.getState().setActiveMode("compactStudio");
  };

  const generateFromUnifilar = () => {
    const base = useUnifiedProjectStore.getState().doc.compactStudio;
    if (!base) return;
    const r = syncMotorLogicFromUnifilar(base, useDiagramStore.getState().doc);
    if (r.motorsGenerated === 0) {
      toast.info(t("studioSidebar.noMotors"));
      return;
    }
    setProgram(r.model);
    openPage(UF_PAGE_ID);
    toast.success(t("studioSidebar.generated", { n: r.motorsGenerated }));
  };

  const errors = diagnostics.filter((d) => d.severity === "error");
  const studioWarnings = syncWarnings.filter((w) => w.startsWith("FB Electric Studio"));
  const ufPage = program?.pages.find((p) => p.id === UF_PAGE_ID);

  return (
    <SidebarShell width={260}>
      <div className="flex-1 overflow-y-auto scrollbar-thin" data-testid="editor-studio-sidebar">
        <Section title={t("studioSidebar.sync")}>
          <p className="px-1 text-[11px] text-muted-foreground">
            {!syncEnabled
              ? t("studioSidebar.syncOff")
              : studioWarnings.length > 0
                ? t("studioSidebar.syncEdited")
                : ufPage
                  ? t("studioSidebar.syncOn")
                  : t("studioSidebar.syncNoMotors")}
          </p>
          <button
            type="button"
            onClick={generateFromUnifilar}
            className="mt-2 w-full rounded border border-primary/40 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
            data-testid="studio-sidebar-generate"
          >
            {t("studioSidebar.generate")}
          </button>
        </Section>

        <Section title={t("studioSidebar.pages")} count={program?.pages.length ?? 0}>
          {(program?.pages ?? [])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((p) => {
              const n = program!.nodes.filter((x) => x.pageId === p.id).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPage(p.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
                  data-testid={`studio-page-${p.id}`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
                </button>
              );
            })}
          {!program && (
            <p className="px-1 text-[11px] italic text-muted-foreground">
              {t("studioSidebar.empty")}
            </p>
          )}
        </Section>

        <Section
          title={t("studioSidebar.diagnostics")}
          count={diagnostics.length}
          defaultOpen={errors.length > 0}
        >
          {diagnostics.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">{t("studioSidebar.noDiag")}</p>
          ) : (
            diagnostics.slice(0, 40).map((d, i) => (
              <button
                key={`${d.code}-${i}`}
                type="button"
                onClick={() => d.pageId && openPage(d.pageId)}
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-muted/50",
                  d.severity === "error"
                    ? "text-destructive"
                    : "text-amber-600 dark:text-amber-300",
                )}
              >
                {d.message}
              </button>
            ))
          )}
        </Section>

        <Section title={t("studioSidebar.symbols")} count={program?.ioSymbols.length ?? 0}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 80))}
            placeholder={t("studioSidebar.searchSymbols")}
            aria-label={t("studioSidebar.searchSymbols")}
            className="h-7 w-full rounded border border-border bg-input/60 px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-1 space-y-0.5">
            {symbols.slice(0, 200).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-0.5 text-[11px]"
                title={s.comment}
              >
                <span className="truncate font-mono text-foreground">{s.symbolicName}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {s.ioKind} {s.address}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </SidebarShell>
  );
}
