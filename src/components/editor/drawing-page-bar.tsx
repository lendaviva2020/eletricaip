// Barra de folhas do unifilar/multifilar: abas das folhas, nova folha,
// renomear, excluir (só vazia), mover seleção, formato, moldura e carimbo.
// Toda mudança é um comando reversível (Ctrl+Z).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, PencilSimple, Trash, Stamp, ArrowSquareOut, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { useDiagramStore } from "@/lib/diagram/store";
import {
  DRAWING_FORMATS,
  canRemovePage,
  drawingSetupOf,
  pageIdOf,
  withDeclaredPages,
  withAddedPage,
  withRemovedPage,
  withRenamedPage,
} from "@/lib/diagram/pages";
import {
  DrawingFormatSchema,
  TitleBlockSchema,
  type DrawingPage,
  type DrawingSetup,
  type SheetKind,
  type TitleBlock,
} from "@/lib/diagram/schema";
import type { Command } from "@/lib/diagram/commands";

/** Abre o editor do carimbo de qualquer lugar do editor (ex.: botão de configurações). */
export const OPEN_TITLE_BLOCK_EVENT = "eletricai-open-title-block";

interface DrawingPageBarProps {
  sheet: SheetKind;
  pages: DrawingPage[];
  currentPageId: string;
  outsideCount: number;
  crossRefCount: number;
}

type NameDialog = { mode: "add" } | { mode: "rename"; pageId: string; title: string } | null;

const TITLE_BLOCK_FIELDS: Array<{ key: keyof TitleBlock; i18n: string; max: number }> = [
  { key: "company", i18n: "drawingPages.company", max: 120 },
  { key: "client", i18n: "drawingPages.client", max: 120 },
  { key: "site", i18n: "drawingPages.site", max: 120 },
  { key: "drawingNumber", i18n: "drawingPages.drawingNumber", max: 60 },
  { key: "revision", i18n: "drawingPages.revision", max: 12 },
  { key: "date", i18n: "drawingPages.date", max: 20 },
  { key: "drawnBy", i18n: "drawingPages.drawnBy", max: 80 },
  { key: "checkedBy", i18n: "drawingPages.checkedBy", max: 80 },
  { key: "approvedBy", i18n: "drawingPages.approvedBy", max: 80 },
  { key: "responsible", i18n: "drawingPages.responsible", max: 120 },
  { key: "registration", i18n: "drawingPages.registration", max: 60 },
];

export function DrawingPageBar({
  sheet,
  pages,
  currentPageId,
  outsideCount,
  crossRefCount,
}: DrawingPageBarProps) {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const dispatch = useDiagramStore((s) => s.dispatch);
  const setActivePage = useDiagramStore((s) => s.setActivePage);
  const selectedNodeIds = useDiagramStore((s) => s.selectedNodeIds);
  const setup = useMemo(() => drawingSetupOf(doc), [doc]);

  const [nameDialog, setNameDialog] = useState<NameDialog>(null);
  const [nameValue, setNameValue] = useState("");
  const [tbOpen, setTbOpen] = useState(false);
  const [tbDraft, setTbDraft] = useState<TitleBlock>({});

  const updateSetup = (to: DrawingSetup) => {
    dispatch({ type: "UpdateDrawingSetup", from: doc.metadata.drawing, to });
  };

  const openAdd = () => {
    setNameValue("");
    setNameDialog({ mode: "add" });
  };
  const openRename = (page: DrawingPage) => {
    setNameValue(page.title);
    setNameDialog({ mode: "rename", pageId: page.id, title: page.title });
  };
  const submitName = () => {
    if (!nameDialog) return;
    if (nameDialog.mode === "add") {
      const { setup: next, page } = withAddedPage(doc, sheet, nameValue);
      updateSetup(next);
      setActivePage(sheet, page.id);
    } else {
      updateSetup(withRenamedPage(doc, sheet, nameDialog.pageId, nameValue));
    }
    setNameDialog(null);
  };

  const removeCurrent = () => {
    if (!canRemovePage(doc, sheet, currentPageId)) {
      toast.error(t("drawingPages.removeBlocked"));
      return;
    }
    const remaining = pages.filter((p) => p.id !== currentPageId);
    updateSetup(withRemovedPage(doc, sheet, currentPageId));
    if (remaining[0]) setActivePage(sheet, remaining[0].id);
  };

  const moveSelectionTo = (targetId: string) => {
    const ids = selectedNodeIds.filter((id) => doc.nodes[id]?.sheet === sheet);
    if (ids.length === 0) {
      toast.info(t("drawingPages.nothingSelected"));
      return;
    }
    const target = pages.find((p) => p.id === targetId);
    if (!target) return;
    const commands: Command[] = [];
    // Folha implícita vira declarada para manter número/título estáveis.
    const declared = withDeclaredPages(doc, sheet);
    if (declared) {
      commands.push({ type: "UpdateDrawingSetup", from: doc.metadata.drawing, to: declared });
    }
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node || pageIdOf(node) === targetId) continue;
      commands.push({ type: "SetNodePage", nodeId: id, from: node.page, to: targetId });
    }
    if (commands.length === 0) return;
    dispatch(commands.length === 1 ? commands[0] : { type: "Batch", commands });
    setActivePage(sheet, targetId);
    toast.success(t("drawingPages.moved", { n: ids.length, page: target.number }));
  };

  const openTitleBlock = () => {
    setTbDraft({ ...setup.titleBlock });
    setTbOpen(true);
  };
  const saveTitleBlock = () => {
    const cleaned: TitleBlock = {};
    for (const f of TITLE_BLOCK_FIELDS) {
      const v = (tbDraft[f.key] ?? "").trim();
      if (v) cleaned[f.key] = v.slice(0, f.max);
    }
    const parsed = TitleBlockSchema.safeParse(cleaned);
    if (!parsed.success) return;
    updateSetup({ ...setup, titleBlock: parsed.data });
    setTbOpen(false);
  };

  useEffect(() => {
    const onOpen = () => {
      setTbDraft({ ...drawingSetupOf(useDiagramStore.getState().doc).titleBlock });
      setTbOpen(true);
    };
    window.addEventListener(OPEN_TITLE_BLOCK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TITLE_BLOCK_EVENT, onOpen);
  }, []);

  const current = pages.find((p) => p.id === currentPageId) ?? pages[0];

  return (
    <div
      className="z-10 shrink-0 flex items-center gap-1.5 px-2 h-9 bg-[#0c1422] border-b border-border/60 overflow-x-auto scrollbar-none text-xs"
      data-testid="drawing-page-bar"
    >
      <span className="text-muted-foreground font-semibold shrink-0 pr-1">
        {t("drawingPages.pages")}
      </span>
      <div className="flex items-center gap-1 shrink-0" role="tablist">
        {pages.map((p) => {
          const active = p.id === currentPageId;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={active}
              onClick={() => setActivePage(sheet, p.id)}
              onDoubleClick={() => openRename(p)}
              title={p.title || t("drawingPages.page", { n: p.number })}
              className={`shrink-0 max-w-[180px] truncate px-2.5 py-1 rounded border transition-colors ${
                active
                  ? "border-[#38bdf8] bg-[#162136] text-[#38bdf8] font-semibold"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-[#162136]/60"
              }`}
            >
              {p.number}
              {p.title ? ` · ${p.title}` : ""}
            </button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 shrink-0"
          onClick={openAdd}
          aria-label={t("drawingPages.addPage")}
          title={t("drawingPages.addPage")}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        {current && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => openRename(current)}
            aria-label={t("drawingPages.rename")}
            title={t("drawingPages.rename")}
          >
            <PencilSimple className="h-3.5 w-3.5" />
          </Button>
        )}
        {pages.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={removeCurrent}
            aria-label={t("drawingPages.remove")}
            title={t("drawingPages.remove")}
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {pages.length > 1 && (
        <label className="flex items-center gap-1 shrink-0 text-muted-foreground">
          <ArrowSquareOut className="h-3.5 w-3.5" />
          <select
            className="h-7 rounded border border-border/60 bg-[#131d2e] px-1 text-foreground"
            value=""
            aria-label={t("drawingPages.moveSelection")}
            onChange={(e) => {
              if (e.target.value) moveSelectionTo(e.target.value);
            }}
          >
            <option value="">{t("drawingPages.moveSelection")}</option>
            {pages
              .filter((p) => p.id !== currentPageId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {t("drawingPages.page", { n: p.number })}
                  {p.title ? ` · ${p.title}` : ""}
                </option>
              ))}
          </select>
        </label>
      )}

      <div className="flex-1" />

      {crossRefCount > 0 && (
        <span className="shrink-0 text-[#38bdf8] font-mono">
          {t("drawingPages.crossRefs", { n: crossRefCount })}
        </span>
      )}
      {setup.showFrame && outsideCount > 0 && (
        <span
          className="shrink-0 flex items-center gap-1 text-amber-400"
          data-testid="drawing-page-overflow"
        >
          <Warning className="h-3.5 w-3.5" />
          {t("drawingPages.overflow", { n: outsideCount })}
        </span>
      )}

      <label className="flex items-center gap-1 shrink-0 text-muted-foreground">
        {t("drawingPages.format")}
        <select
          className="h-7 rounded border border-border/60 bg-[#131d2e] px-1 text-foreground"
          value={setup.format}
          onChange={(e) => {
            const f = DrawingFormatSchema.safeParse(e.target.value);
            if (f.success) updateSetup({ ...setup, format: f.data });
          }}
        >
          {Object.keys(DRAWING_FORMATS).map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 shrink-0 text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={setup.showFrame}
          onChange={(e) => updateSetup({ ...setup, showFrame: e.target.checked })}
        />
        {t("drawingPages.frame")}
      </label>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 shrink-0 bg-[#131d2e] border-border/60"
        onClick={openTitleBlock}
      >
        <Stamp className="h-3.5 w-3.5 text-[#38bdf8]" />
        {t("drawingPages.titleBlock")}
      </Button>

      <Dialog open={nameDialog !== null} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === "add" ? t("drawingPages.addPage") : t("drawingPages.rename")}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitName();
            }}
            className="space-y-2"
          >
            <Label htmlFor="drawing-page-title">
              {nameDialog?.mode === "add"
                ? t("drawingPages.newPageTitle")
                : t("drawingPages.renamePrompt")}
            </Label>
            <Input
              id="drawing-page-title"
              autoFocus
              maxLength={80}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNameDialog(null)}>
                {t("drawingPages.cancel")}
              </Button>
              <Button type="submit">{t("drawingPages.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tbOpen} onOpenChange={setTbOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("drawingPages.titleBlockTitle")}</DialogTitle>
            <DialogDescription>{t("drawingPages.titleBlockHint")}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveTitleBlock();
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {TITLE_BLOCK_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`tb-${f.key}`}>{t(f.i18n)}</Label>
                <Input
                  id={`tb-${f.key}`}
                  maxLength={f.max}
                  value={tbDraft[f.key] ?? ""}
                  onChange={(e) => setTbDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setTbOpen(false)}>
                {t("drawingPages.cancel")}
              </Button>
              <Button type="submit">{t("drawingPages.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
