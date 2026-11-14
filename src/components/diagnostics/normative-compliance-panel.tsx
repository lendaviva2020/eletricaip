import { useMemo } from "react";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import {
  evaluateNormativeEngineeringCompliance,
  type EngineeringComplianceStatus,
} from "@/lib/diagram/connection/graph-validator";
import { AiFixButton } from "@/components/diagnostics/ai-fix-button";
import { buildDiagnosticContextFromNormFinding } from "@/lib/diagnostics/ai-repair-context";
import { cn } from "@/lib/utils";
import { WarningCircle, CheckCircle, Question, Wrench } from "@phosphor-icons/react";

const STATUS_META: Record<
  EngineeringComplianceStatus,
  { label: string; badgeClass: string; textClass: string }
> = {
  VALID: {
    label: "VALID",
    badgeClass: "bg-success/15 text-success border-success/30",
    textClass: "text-success",
  },
  INVALID: {
    label: "INVALID",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    textClass: "text-destructive",
  },
  WARNING: {
    label: "WARNING",
    badgeClass: "bg-warning/15 text-warning border-warning/30",
    textClass: "text-warning",
  },
  INCOMPLETE: {
    label: "INCOMPLETE",
    badgeClass: "bg-warning/15 text-warning border-warning/30",
    textClass: "text-warning",
  },
  REQUIRES_ENGINEERING_REVIEW: {
    label: "REQUIRES_REVIEW",
    badgeClass: "bg-orange-500/15 text-orange-500 border-orange-500/30",
    textClass: "text-orange-500",
  },
  NOT_VERIFIABLE: {
    label: "NOT_VERIFIABLE",
    badgeClass: "bg-muted text-muted-foreground border-border",
    textClass: "text-muted-foreground",
  },
};

function mapNormStandard(
  standard: string,
): "IEC 60617" | "ISA-18.2" | "NBR 5410" | "NR-10" | "NBR 14039" | "NR-12" | "IEC 61131" {
  if (
    standard === "IEC 60617" ||
    standard === "ISA-18.2" ||
    standard === "NBR 5410" ||
    standard === "NR-10" ||
    standard === "NBR 14039" ||
    standard === "NR-12" ||
    standard === "IEC 61131"
  ) {
    return standard;
  }
  return "NBR 5410";
}

export function NormativeCompliancePanel() {
  const doc = useDiagramStore((s) => s.doc);
  const projectId = useProjectStore((s) => s.projectId) || "proj_active";
  const setConsoleTab = useEditorStore((s) => s.setConsoleTab);
  const setConsoleOpen = useEditorStore((s) => s.setConsoleOpen);

  const report = useMemo(() => evaluateNormativeEngineeringCompliance(doc), [doc]);
  const overall = STATUS_META[report.overallStatus];
  const actionableContexts = useMemo(
    () =>
      report.findings
        .filter((f) => f.status !== "VALID" && f.status !== "NOT_VERIFIABLE")
        .map((finding) =>
          buildDiagnosticContextFromNormFinding(
            {
              id: finding.id,
              norm: mapNormStandard(finding.standard),
              severity: finding.status === "INVALID" ? "error" : "warn",
              title: `${finding.title} (${finding.clause})`,
              detail: `[${finding.standard} ${finding.clause}] ${finding.detail}`,
              nodeId: finding.entityIds[0],
            },
            projectId,
          ),
        ),
    [report.findings, projectId],
  );

  return (
    <div className="space-y-2.5" data-testid="normative-compliance-panel">
      <div className="rounded-md border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Auditoria Normativa Real
          </div>
          <span
            data-testid="normative-overall-status"
            className={cn(
              "px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold uppercase",
              overall.badgeClass,
            )}
          >
            {overall.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
          <div className="rounded bg-muted/40 px-1.5 py-1">
            <div className="text-foreground font-semibold">{report.summary.valid}</div>
            <div className="text-muted-foreground">Valid</div>
          </div>
          <div className="rounded bg-muted/40 px-1.5 py-1">
            <div className="text-warning font-semibold">
              {report.summary.warning + report.summary.incomplete + report.summary.requiresReview}
            </div>
            <div className="text-muted-foreground">Pend./Rev.</div>
          </div>
          <div className="rounded bg-muted/40 px-1.5 py-1">
            <div className="text-muted-foreground font-semibold">
              {report.summary.notVerifiable + report.summary.invalid}
            </div>
            <div className="text-muted-foreground">Não Verif./Inv.</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setConsoleTab("diagnosticos");
              setConsoleOpen(true);
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 transition-colors cursor-pointer"
          >
            <Wrench className="h-3 w-3" />
            Diagnósticos &amp; Corrigir com IA
          </button>
          {actionableContexts.length > 0 && (
            <AiFixButton batch={actionableContexts} size="sm" variant="primary" />
          )}
        </div>
      </div>

      {report.findings.map((finding) => {
        const meta = STATUS_META[finding.status];
        const Icon =
          finding.status === "VALID"
            ? CheckCircle
            : finding.status === "NOT_VERIFIABLE"
              ? Question
              : WarningCircle;
        const findingDiagnostic =
          finding.status !== "VALID" && finding.status !== "NOT_VERIFIABLE"
            ? buildDiagnosticContextFromNormFinding(
                {
                  id: finding.id,
                  norm: mapNormStandard(finding.standard),
                  severity: finding.status === "INVALID" ? "error" : "warn",
                  title: `${finding.title} (${finding.clause})`,
                  detail: `[${finding.standard} ${finding.clause}] ${finding.detail}`,
                  nodeId: finding.entityIds[0],
                },
                projectId,
              )
            : null;
        return (
          <div
            key={finding.id}
            data-testid={`normative-finding-${finding.id}`}
            className="rounded-md border border-border bg-card p-2.5 space-y-1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.textClass)} />
                <span className="text-[11px] font-semibold truncate">{finding.standard}</span>
              </div>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase shrink-0",
                  meta.badgeClass,
                )}
              >
                {meta.label}
              </span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">{finding.clause}</div>
            <div className="text-[11px] font-medium text-foreground leading-snug">
              {finding.title}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{finding.detail}</p>
            {findingDiagnostic && (
              <div className="pt-1 flex justify-end">
                <AiFixButton diagnostic={findingDiagnostic} size="xs" variant="compact" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
