import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkle,
  ShieldCheck,
  Wrench,
  SlidersHorizontal,
  PaperPlaneRight,
  GitBranch,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NormativeCompliancePanel } from "@/components/diagnostics/normative-compliance-panel";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { RightPropertyPanel } from "@/components/editor/right-property-panel";
import { RevisionHistory } from "@/components/revision-history";
import { useI18n } from "@/lib/i18n";
import { useDiagramStore } from "@/lib/diagram/store";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { buildDiagnosticContextFromMultifilar } from "@/lib/diagnostics/ai-repair-context";
import { AiFixButton } from "@/components/diagnostics/ai-fix-button";
import { applyCableSizing, openCableTable } from "@/components/editor/cable-table";

const TABS = [
  { id: "props", key: "rightPanel.props" as const, icon: SlidersHorizontal },
  { id: "ai", key: "rightPanel.ai" as const, icon: Sparkle },
  { id: "norms", key: "rightPanel.norms" as const, icon: ShieldCheck },
  { id: "versions", key: "rightPanel.versions" as const, icon: GitBranch },
  { id: "maint", key: "rightPanel.maint" as const, icon: Wrench },
] as const;

const STRUCTURED_MODES = new Set(["unifilar", "multifilar", "ladder", "fbd"]);

export function RightPanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("props");

  return (
    <aside className="flex w-[300px] sm:w-[340px] lg:w-full max-w-[88vw] h-full shrink-0 flex-col border-l border-border bg-panel">
      <div className="h-9 flex items-center px-2 border-b border-border overflow-x-auto scrollbar-none gap-0.5">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "h-7 px-2.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
                tab === tabItem.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(tabItem.key)}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {tab === "props" && <PropsPanel />}
        {tab === "ai" && <AiPanel />}
        {tab === "norms" && <NormsPanel />}
        {tab === "versions" && <VersionsPanel />}
        {tab === "maint" && <MaintPanel />}
      </div>
    </aside>
  );
}

function PropsPanel() {
  const activeMode = useEditorStore((s) => s.activeMode);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);

  // Structured editors (Unifilar/Ladder/FBD): use Zod-validated panel
  if (STRUCTURED_MODES.has(activeMode)) {
    return <RightPropertyPanel />;
  }

  // Legacy demo path for SCADA / generic project nodes
  return <LegacyProjectNodeProps />;
}

function LegacyProjectNodeProps() {
  const { t } = useI18n();
  const node = useProjectStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const removeNode = useProjectStore((s) => s.removeNode);

  if (!node) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        {t("rightPanel.selectScadaOrTwin")}
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3 text-[12px]">
      <Section title="Selecionado">
        <div className="text-sm font-medium">
          {node.label} · {node.kind.toUpperCase()}
        </div>
        <div className="text-[11px] text-muted-foreground capitalize">{node.category}</div>
      </Section>
      <Section title="Parâmetros">
        <Row k="Tag" v={node.id} />
        <Row k="Categoria" v={node.category} />
        <Row k="Energizado" v={node.energized ? "● SIM" : "○ NÃO"} />
        {Object.entries(node.params).map(([k, v]) => (
          <Row key={k} k={k} v={String(v)} />
        ))}
      </Section>
      <button
        onClick={() => removeNode(node.id)}
        className="w-full text-[11px] py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        Remover do projeto
      </button>
    </div>
  );
}

/** Envia um pedido livre ao chat de IA do workspace (o mesmo do canvas). */
function sendToWorkspaceAi(prompt: string, forcePatch: boolean) {
  window.dispatchEvent(new CustomEvent("eletricai-ai-prompt", { detail: { prompt, forcePatch } }));
}

const MAX_PENDING_LISTED = 4;

function AiPanel() {
  const { t } = useI18n();
  const [msg, setMsg] = useState("");
  const activeMode = useEditorStore((s) => s.activeMode);
  const rungsCount = useEditorStore((s) => s.rungs.length);
  const tagsCount = useEditorStore((s) => Object.keys(s.editorTags).length);
  const doc = useDiagramStore((s) => s.doc);
  const projectId = useProjectStore((s) => s.projectId);
  const isElectrical = activeMode === "unifilar" || activeMode === "multifilar";

  // Tudo abaixo vem do projeto aberto — nada de exemplo fixo.
  const pending = useMemo(() => {
    if (!isElectrical) return [];
    try {
      return runDiagramDiagnostics(doc).filter((d) => d.type === "ERRO" || d.type === "AVISO");
    } catch {
      return [];
    }
  }, [isElectrical, doc]);

  const summary = useMemo(() => {
    const nodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
    const power = Object.values(doc.edges).filter(
      (e) => e.sheet === "unifilar" && e.kind === "power",
    );
    return { eq: nodes.length, pw: power.length };
  }, [doc]);

  const submit = () => {
    const p = msg.trim();
    if (!p) return;
    sendToWorkspaceAi(p, isElectrical);
    setMsg("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="rounded-md p-3 bg-card border border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-primary mb-1">
            <Sparkle className="h-3.5 w-3.5" /> {t("rightPanel.copilotTitle")}
          </div>
          <p className="text-[12px] text-foreground/90 leading-relaxed">
            {t("rightPanel.copilotGreeting")}
          </p>
          <div className="mt-2 text-[11px] font-mono text-muted-foreground italic">
            {t("rightPanel.copilotExample")}
          </div>
        </div>

        <div className="rounded-md p-3 bg-card border border-border" data-testid="ai-panel-pending">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            {t("rightPanel.pendingTitle")}
          </div>
          {!isElectrical ? (
            <p className="text-[12px] text-muted-foreground">
              {t("rightPanel.pendingOnlyElectrical")}
            </p>
          ) : pending.length === 0 ? (
            <p className="text-[12px] text-emerald-400">{t("rightPanel.noPending")}</p>
          ) : (
            <ul className="space-y-2">
              {pending.slice(0, MAX_PENDING_LISTED).map((d) => (
                <li key={d.id} className="text-[12px] leading-snug">
                  <span
                    className={cn(
                      "mr-1.5 rounded px-1 text-[10px] font-bold",
                      d.type === "ERRO" ? "bg-destructive text-white" : "bg-amber-500 text-black",
                    )}
                  >
                    {d.type}
                  </span>
                  {d.message}
                  <div className="mt-1">
                    {d.id === "vd_missing_data" ? (
                      <button
                        type="button"
                        onClick={() => openCableTable(d.edgeId)}
                        className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground"
                      >
                        {t("cableTable.enterLengths")}
                      </button>
                    ) : d.id === "cond_section_missing" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const { changed } = applyCableSizing();
                          if (changed > 0) toast.success(t("cableTable.sized", { n: changed }));
                          else toast.info(t("cableTable.nothingToSize"));
                        }}
                        className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground"
                      >
                        {t("cableTable.sizeNow")}
                      </button>
                    ) : (
                      <AiFixButton
                        diagnostic={buildDiagnosticContextFromMultifilar(
                          d,
                          projectId || "proj_active",
                        )}
                        size="xs"
                        variant="compact"
                      />
                    )}
                  </div>
                </li>
              ))}
              {pending.length > MAX_PENDING_LISTED && (
                <li className="text-[11px] text-muted-foreground">
                  {t("rightPanel.morePending", { n: pending.length - MAX_PENDING_LISTED })}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-md p-3 bg-card border border-border" data-testid="ai-panel-summary">
          <div className="text-[11px] text-muted-foreground mb-1">
            {t("rightPanel.summaryTitle")}
          </div>
          <p className="text-[12px]">
            {t("rightPanel.summaryLine", {
              eq: summary.eq,
              pw: summary.pw,
              rungs: rungsCount,
              tags: tagsCount,
            })}
          </p>
        </div>
      </div>

      <form
        className="p-2 border-t border-border"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative">
          <input
            aria-label={t("rightPanel.inputPlaceholder")}
            title={t("rightPanel.inputPlaceholder")}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={t("rightPanel.inputPlaceholder")}
            className="w-full h-9 pl-3 pr-9 rounded-md bg-input border border-border text-[12px] outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!msg.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded text-primary hover:bg-accent disabled:opacity-40"
            title={t("rightPanel.sendAria")}
            aria-label={t("rightPanel.sendAria")}
          >
            <PaperPlaneRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function NormsPanel() {
  return (
    <div className="p-4 space-y-3">
      <NormativeCompliancePanel />
      <div
        role="note"
        className="rounded-md border border-warning/40 bg-warning/10 p-3 text-[10px] text-muted-foreground leading-relaxed"
      >
        <strong className="text-foreground">Aviso Técnico-Legal (CREA/CFT):</strong> Os estudos e
        dimensionamentos servem como apoio de engenharia e exigem validação e emissão de ART/TRT por
        profissional legalmente habilitado.
      </div>
    </div>
  );
}

function VersionsPanel() {
  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        Histórico & Auditoria
      </div>
      <RevisionHistory />
      <div className="rounded-md border border-border bg-card p-3 text-[10px] text-muted-foreground">
        <p>
          Cada snapshot é um registro imutável de auditoria normativa. Para compliance com NR-10 e
          ISO 9001, salve revisões antes de cada entrega ou modificação significativa.
        </p>
      </div>
    </div>
  );
}

function MaintPanel() {
  const { t } = useI18n();
  // Sem fonte real de manutenção no projeto: nada de MTBF/alertas inventados.
  return (
    <div className="p-4 text-[12px] text-muted-foreground" data-testid="maint-empty">
      {t("rightPanel.maintEmpty")}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {title}
      </div>
      <div className="rounded-md border border-border bg-card p-3 space-y-1">{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground">{v}</span>
    </div>
  );
}
