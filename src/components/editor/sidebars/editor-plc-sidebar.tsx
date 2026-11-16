/**
 * Árvore do projeto de CLP — lida do projeto ABERTO (`usePlcStore`): módulos
 * do rack, variáveis e blocos de programa. Clicar leva à aba correspondente
 * do editor de PLC (e seleciona o bloco). Antes esta barra exibia uma árvore
 * fixa e fictícia, igual para todo projeto.
 */
import { useMemo, useState } from "react";
import { Cpu, FileCode, Function } from "@phosphor-icons/react";
import { SidebarSearch, SidebarShell, normalizeSearch } from "./sidebar-primitives";
import { usePlcStore } from "@/lib/plc/store";
import { useI18n } from "@/lib/i18n";

interface TreeItem {
  key: string;
  primary: string;
  secondary: string;
  onSelect: () => void;
  active?: boolean;
}

interface TreeGroup {
  key: string;
  icon: typeof Cpu;
  title: string;
  total: number;
  items: TreeItem[];
}

const LANG_LABEL: Readonly<Record<string, string>> = { ladder: "Ladder", fbd: "FBD", st: "ST" };

export function EditorPlcSidebar() {
  const { t } = useI18n();
  const project = usePlcStore((s) => s.project);
  const activeBlockId = usePlcStore((s) => s.activeBlockId);
  const [query, setQuery] = useState("");

  const groups = useMemo<TreeGroup[]>(() => {
    const { setActiveTab, setActiveBlock } = usePlcStore.getState();
    const q = normalizeSearch(query);
    const match = (...parts: string[]) => !q || normalizeSearch(parts.join(" ")).includes(q);

    const modules = [...project.rack.modules].sort((a, b) => a.slot - b.slot);
    const hardware: TreeItem[] = modules
      .filter((m) => match(m.label, m.catalogKey, m.category, m.description))
      .map((m) => ({
        key: m.id,
        primary: `${t("plcTree.slot")} ${m.slot} · ${m.label}`,
        secondary:
          m.channels > 0
            ? `${m.category.toUpperCase()} · ${m.channels} ch`
            : m.category.toUpperCase(),
        onSelect: () => setActiveTab("hardware"),
      }));

    const variables: TreeItem[] = project.variables
      .filter((v) => match(v.name, v.address, v.type, v.comment))
      .map((v) => ({
        key: v.id,
        primary: v.name,
        secondary: `${v.address || "—"} · ${v.type}`,
        onSelect: () => setActiveTab("variables"),
      }));

    const blocks: TreeItem[] = [...project.programBlocks]
      .sort((a, b) => a.type.localeCompare(b.type) || a.number - b.number)
      .filter((b) => match(b.name, `${b.type}${b.number}`, b.language, b.comment))
      .map((b) => ({
        key: b.id,
        primary: `${b.type}${b.number} · ${b.name}`,
        secondary: LANG_LABEL[b.language] ?? b.language,
        active: b.id === activeBlockId,
        onSelect: () => {
          setActiveTab("blocks");
          setActiveBlock(b.id);
        },
      }));

    return [
      {
        key: "hw",
        icon: Cpu,
        title: t("plcTree.hardware"),
        total: modules.length,
        items: hardware,
      },
      {
        key: "vars",
        icon: Function,
        title: t("plcTree.variables"),
        total: project.variables.length,
        items: variables,
      },
      {
        key: "blocks",
        icon: FileCode,
        title: t("plcTree.blocks"),
        total: project.programBlocks.length,
        items: blocks,
      },
    ];
  }, [project, activeBlockId, query, t]);

  return (
    <SidebarShell width={240}>
      <SidebarSearch
        title={t("plcTree.title")}
        placeholder={t("plcTree.search")}
        value={query}
        onChange={setQuery}
      />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin" data-testid="plc-tree">
        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.key}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Icon className="h-3 w-3" /> {g.title}
                <span className="ml-auto font-mono normal-case tracking-normal">{g.total}</span>
              </div>
              <div className="grid gap-0.5 pl-4">
                {g.items.length === 0 ? (
                  <span className="px-2 py-1 text-[11px] text-muted-foreground">
                    {g.total === 0 ? t("plcTree.empty") : t("sidebarSearch.noResults")}
                  </span>
                ) : (
                  g.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onSelect}
                      aria-current={item.active ? "true" : undefined}
                      className={
                        item.active
                          ? "flex flex-col text-left px-2 py-1 rounded text-[11px] bg-accent text-foreground"
                          : "flex flex-col text-left px-2 py-1 rounded text-[11px] hover:bg-accent text-foreground/85"
                      }
                    >
                      <span className="truncate">{item.primary}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {item.secondary}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SidebarShell>
  );
}
