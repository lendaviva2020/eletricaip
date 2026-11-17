import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Warning } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FORCE_REASON_MAX, FORCE_REASON_MIN, useScadaStore } from "@/lib/scada/scada-store";
import { authorizeTagForce } from "@/lib/scada/scada-operations.functions";
import type { ScadaTagDefinition } from "@/lib/scada/types";

const TTL_OPTIONS: ReadonlyArray<{ label: string; minutes: number | null }> = [
  { label: "15 minutos", minutes: 15 },
  { label: "1 hora", minutes: 60 },
  { label: "8 horas", minutes: 480 },
  { label: "Até remover", minutes: null },
];

/** Converte o texto digitado no tipo do tag; `null` = inválido. */
export function parseForcedValue(
  raw: string,
  dataType: ScadaTagDefinition["dataType"],
): number | boolean | string | null {
  const v = raw.trim();
  if (dataType === "BOOL") {
    if (/^(1|true|ligado|on|sim)$/i.test(v)) return true;
    if (/^(0|false|desligado|off|nao|não)$/i.test(v)) return false;
    return null;
  }
  if (dataType === "STRING") return v.length <= 200 ? v : null;
  const n = Number(v.replace(",", "."));
  return v !== "" && Number.isFinite(n) ? n : null;
}

/**
 * Forçar tag (ISA/IEC 62443: ação privilegiada e auditada). O servidor confere
 * o papel (proprietário, administrador ou engenheiro) e grava a auditoria
 * ANTES de o valor ser aplicado; o motivo é obrigatório e o forçamento expira.
 */
export function ForceTagDialog({
  tag,
  onClose,
}: {
  tag: ScadaTagDefinition | null;
  onClose: () => void;
}) {
  const projectId = useScadaStore((s) => s.currentProjectId);
  const forceTagValue = useScadaStore((s) => s.forceTagValue);
  const authorize = useServerFn(authorizeTagForce);
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState<number | null>(60);
  const [busy, setBusy] = useState(false);

  const value = tag ? parseForcedValue(raw, tag.dataType) : null;
  const reasonOk =
    reason.trim().length >= FORCE_REASON_MIN && reason.trim().length <= FORCE_REASON_MAX;
  const canSubmit = Boolean(tag && projectId && value !== null && reasonOk && !busy);

  const submit = async () => {
    if (!tag || !projectId || value === null || !reasonOk) return;
    setBusy(true);
    try {
      const { operator } = await authorize({
        data: {
          projectId,
          tagName: tag.name,
          value,
          reason: reason.trim(),
          ttlMinutes: ttl,
        },
      });
      forceTagValue(tag.id, value, {
        operator,
        reason: reason.trim(),
        ttlMs: ttl ? ttl * 60_000 : undefined,
      });
      toast.warning(`Tag ${tag.name} forçado para ${String(value)}.`);
      setRaw("");
      setReason("");
      onClose();
    } catch (err) {
      const msg =
        err instanceof Response
          ? err.status === 403
            ? "Seu papel não permite forçar tags (exige engenharia ou administração)."
            : "Não foi possível autorizar o forçamento."
          : err instanceof Error && err.message.startsWith("SAFETY_INTERLOCK")
            ? "Tag crítico de segurança: forçamento bloqueado."
            : "Não foi possível autorizar o forçamento.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(tag)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warning className="h-4 w-4 text-amber-500" /> Forçar tag
          </DialogTitle>
          <DialogDescription>
            {tag ? (
              <>
                <span className="font-mono">{tag.name}</span> — valor atual{" "}
                <span className="font-mono">{String(tag.value)}</span>
                {tag.unit ? ` ${tag.unit}` : ""}. O forçamento fica registrado na auditoria com seu
                nome e o motivo.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="force-value">
              Valor {tag?.dataType === "BOOL" ? "(1/0, ligado/desligado)" : ""}
            </Label>
            <Input
              id="force-value"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              inputMode={tag?.dataType === "REAL" || tag?.dataType === "INT" ? "decimal" : "text"}
              aria-invalid={raw !== "" && value === null}
              className="mt-1.5"
            />
            {raw !== "" && value === null && (
              <p className="text-[11px] text-destructive mt-1">
                Valor inválido para o tipo do tag.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="force-reason">Motivo</Label>
            <Textarea
              id="force-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={FORCE_REASON_MAX}
              rows={3}
              placeholder="Ex.: transmissor em manutenção, OS 1234"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="force-ttl">Expira em</Label>
            <select
              id="force-ttl"
              value={ttl === null ? "" : String(ttl)}
              onChange={(e) => setTtl(e.target.value === "" ? null : Number(e.target.value))}
              className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {TTL_OPTIONS.map((o) => (
                <option key={o.label} value={o.minutes === null ? "" : String(o.minutes)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? "Autorizando…" : "Forçar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
