/**
 * Diálogo de Revisão e Homologação de Diagnósticos Corretivos com IA (Fase 8).
 *
 * Princípios de Design e Engenharia:
 * 1. Interface de ferramenta de engenharia: densa, sóbria, sem gradientes roxos ou efeitos mágicos.
 * 2. Diff explícito antes/depois, efeitos colaterais e matriz de verificações de engenharia.
 * 3. APROVAÇÃO EXPLÍCITA: nada é aplicado ao modelo sem que o usuário clique em "Aprovar e aplicar".
 * 4. Total conformidade com a ABNT NBR 5410.
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Warning,
  Info,
  ShieldCheck,
  Cpu,
  ArrowRight,
} from "@phosphor-icons/react";
import { useI18n } from "@/lib/i18n";
import type { FixProposal } from "@/lib/diagnostics/contract";

export interface AiFixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: FixProposal | null;
  rationalePt?: string;
  isApplying?: boolean;
  onApprove: (proposal: FixProposal) => void;
}

export const AiFixDialog: React.FC<AiFixDialogProps> = ({
  open,
  onOpenChange,
  proposal,
  rationalePt,
  isApplying = false,
  onApprove,
}) => {
  const { t } = useI18n();

  if (!proposal) return null;

  const currentRationale = rationalePt || proposal.rationalePt || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-panel border-border text-foreground font-sans p-6 select-none sm:rounded-md shadow-xl">
        <DialogHeader className="space-y-1.5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-secondary grid place-items-center text-primary border border-border">
              <Cpu className="h-4 w-4" />
            </div>
            <DialogTitle className="text-sm font-semibold tracking-wide uppercase font-mono">
              {t("aiFix.dialogTitle")}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground font-sans">
            {t("aiFix.dialogSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 max-h-[60vh] overflow-y-auto pr-1 text-xs scrollbar-thin">
          {/* 1. Alerta de Segurança / Verificações Indisponíveis */}
          {proposal.unavailableChecks.length > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded text-amber-200 flex items-start gap-2.5">
              <Warning className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block font-mono text-[11px] uppercase tracking-wider text-amber-300">
                  Validação de Engenharia Necessária
                </span>
                <p className="text-[11px] leading-relaxed text-amber-200/90 font-sans">
                  {proposal.blockReason ||
                    "Algumas verificações térmicas (como suportabilidade a curto-circuito) não estão implementadas no motor determinístico e exigem validação manual do engenheiro responsável."}
                </p>
              </div>
            </div>
          )}

          {/* 2. Tabela de Diff Antes / Depois */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("aiFix.diffTableTitle")}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {proposal.operations.length} condutor(es) alterado(s)
              </span>
            </div>

            <div className="border border-border rounded overflow-hidden bg-card/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-[11px] font-mono text-muted-foreground">
                    <th className="py-1.5 px-3">{t("aiFix.cableCol")}</th>
                    <th className="py-1.5 px-3">{t("aiFix.currentSectionCol")}</th>
                    <th className="py-1.5 px-3 text-primary">{t("aiFix.proposedSectionCol")}</th>
                    <th className="py-1.5 px-3">{t("aiFix.currentDropCol")}</th>
                    <th className="py-1.5 px-3 text-success">{t("aiFix.estimatedDropCol")}</th>
                    <th className="py-1.5 px-3 text-muted-foreground">{t("aiFix.normLimitCol")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {proposal.metrics.map((m, idx) => {
                    const op = proposal.operations.find((o) => o.conductorId === m.elementId);
                    return (
                      <tr key={idx} className="hover:bg-accent/30 transition-colors">
                        <td className="py-1.5 px-3 font-semibold text-foreground">
                          {m.elementId}
                        </td>
                        <td className="py-1.5 px-3 text-muted-foreground">
                          {m.metric === "voltage_drop_pct"
                            ? `${(proposal.metrics.find((x) => x.elementId === m.elementId && x.metric === "section_mm2")?.before ?? "—")} mm²`
                            : `${m.before} ${m.unit}`}
                        </td>
                        <td className="py-1.5 px-3 text-primary font-bold">
                          {op ? `${op.sectionMm2} mm²` : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-destructive">
                          {m.metric === "voltage_drop_pct"
                            ? `${m.before}%`
                            : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-success font-semibold">
                          {m.metric === "voltage_drop_pct"
                            ? `${m.after}%`
                            : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-muted-foreground">
                          {m.limit} {m.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Matriz de Verificações de Engenharia */}
          <div className="space-y-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
              {t("aiFix.checksTitle")}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proposal.verifiedChecks.map((chk, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded bg-card/60 border border-border text-[11px] font-mono text-foreground"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                  <span className="truncate">{chk}</span>
                </div>
              ))}
              {proposal.unavailableChecks.map((chk, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded bg-card/60 border border-amber-500/30 text-[11px] font-mono text-amber-200"
                >
                  <Warning className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{chk}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Efeitos Colaterais Conhecidos */}
          {proposal.sideEffects.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                {t("aiFix.sideEffectsTitle")}
              </span>
              <ul className="space-y-1 bg-card/60 p-2.5 rounded border border-border">
                {proposal.sideEffects.map((effect, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground font-sans">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{effect}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 5. Justificativa Técnica */}
          {currentRationale && (
            <div className="space-y-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-semibold block">
                {t("aiFix.rationaleTitle")}
              </span>
              <div className="p-3 bg-muted/40 border border-border rounded font-sans text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {currentRationale}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
            className="text-xs font-mono"
          >
            {t("aiFix.cancel")}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => onApprove(proposal)}
            disabled={isApplying}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-mono font-semibold flex items-center gap-1.5 shadow-none"
            data-testid="ai-fix-approve-button"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{isApplying ? t("aiFix.applying") : t("aiFix.approveAndApply")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
