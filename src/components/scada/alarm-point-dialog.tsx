// Ações ISA-18.2 sobre um ponto de alarme: prateleira (com prazo), fora de
// serviço e racionalização. O servidor confere o papel e grava a auditoria
// antes de mudar; na demonstração a mudança fica só nesta aba.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import {
  RATIONALE_MAX,
  REASON_MAX,
  REASON_MIN,
  SHELVE_DURATIONS_MIN,
  alarmPointKey,
} from "@/lib/scada/alarm-management";
import { updateAlarmPoint } from "@/lib/scada/alarm-management.functions";
import { applyLocalChange, useAlarmMgmtStore } from "@/lib/scada/alarm-management-store";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaAlarmItem } from "@/lib/scada/types";

export type AlarmPointAction = "shelve" | "outOfService" | "rationalize";

const TITLE: Record<AlarmPointAction, string> = {
  shelve: "Pôr na prateleira",
  outOfService: "Tirar de serviço",
  rationalize: "Racionalizar alarme",
};

function durationLabel(min: number): string {
  return min < 60 ? `${min} minutos` : `${min / 60} hora${min === 60 ? "" : "s"}`;
}

type Change = Parameters<typeof applyLocalChange>[3];

/** Executa a mudança (servidor ou local na demonstração). Usado também por "devolver". */
export function useAlarmPointChange() {
  const projectId = useScadaStore((s) => s.currentProjectId);
  const isDemo = useScadaStore((s) => s.isDemoProject);
  const update = useServerFn(updateAlarmPoint);
  return async (pointKey: string, tagName: string, change: Change): Promise<boolean> => {
    const mgmt = useAlarmMgmtStore.getState();
    if (!projectId) return false;
    try {
      if (isDemo) {
        mgmt.upsert(
          applyLocalChange(mgmt.settings.get(pointKey), pointKey, tagName, change, Date.now()),
        );
      } else {
        const { setting } = await update({ data: { projectId, pointKey, tagName, change } });
        mgmt.upsert(setting);
      }
      return true;
    } catch (err) {
      let msg = "Não foi possível concluir a ação.";
      if (err instanceof Response) {
        const text = await err.text().catch(() => "");
        if (text && text.length < 200) msg = text;
      }
      toast.error(msg);
      return false;
    }
  };
}

export function AlarmPointDialog({
  alarm,
  action,
  onClose,
}: {
  alarm: ScadaAlarmItem | null;
  action: AlarmPointAction | null;
  onClose: () => void;
}) {
  const settings = useAlarmMgmtStore((s) => s.settings);
  const available = useAlarmMgmtStore((s) => s.available);
  const run = useAlarmPointChange();
  const pointKey = alarm ? alarmPointKey(alarm) : "";
  const current = pointKey ? settings.get(pointKey) : undefined;

  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number>(60);
  const [cause, setCause] = useState("");
  const [consequence, setConsequence] = useState("");
  const [corrective, setCorrective] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason("");
    setMinutes(60);
    setCause(current?.cause ?? "");
    setConsequence(current?.consequence ?? "");
    setCorrective(current?.correctiveAction ?? "");
    setResponse(current?.responseTimeMin ? String(current.responseTimeMin) : "");
    // Recarrega só ao abrir para outro ponto/ação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey, action]);

  if (!alarm || !action) return null;
  const isSafety = alarm.category === "SAFETY";
  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;
  const responseNum = response.trim() === "" ? null : Number(response);
  const responseOk =
    responseNum === null ||
    (Number.isInteger(responseNum) && responseNum >= 1 && responseNum <= 1440);
  const rationaleOk =
    [cause, consequence, corrective].every((t) => t.trim().length >= 3) && responseOk;
  const blocked = !available || (isSafety && action !== "rationalize");
  const canSubmit = !busy && !blocked && (action === "rationalize" ? rationaleOk : reasonOk);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const change: Change =
      action === "shelve"
        ? { kind: "shelve", minutes, reason: reason.trim() }
        : action === "outOfService"
          ? { kind: "outOfService", reason: reason.trim() }
          : {
              kind: "rationalize",
              cause: cause.trim(),
              consequence: consequence.trim(),
              correctiveAction: corrective.trim(),
              responseTimeMin: responseNum,
            };
    const ok = await run(pointKey, alarm.tag, change);
    setBusy(false);
    if (ok) {
      toast.success(
        action === "shelve"
          ? `${alarm.tag} na prateleira por ${durationLabel(minutes)}.`
          : action === "outOfService"
            ? `${alarm.tag} fora de serviço.`
            : `Racionalização de ${alarm.tag} gravada.`,
      );
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE[action]}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{alarm.tag}</span> — {alarm.description}
          </DialogDescription>
        </DialogHeader>

        {!available && (
          <p className="text-sm text-amber-600 dark:text-amber-300">
            A gestão de alarmes ainda não foi ativada no banco deste ambiente.
          </p>
        )}
        {isSafety && action !== "rationalize" && (
          <p className="text-sm text-destructive" data-testid="alarm-safety-block">
            Alarme de segurança não pode ir para a prateleira nem sair de serviço pelo supervisório.
          </p>
        )}

        {action === "shelve" && !blocked && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="shelve-duration">Por quanto tempo</Label>
              <select
                id="shelve-duration"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {SHELVE_DURATIONS_MIN.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Volta sozinho ao vencer o prazo. Continua sendo registrado no histórico.
              </p>
            </div>
            <ReasonField value={reason} onChange={setReason} />
          </div>
        )}

        {action === "outOfService" && !blocked && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              Para manutenção ou instrumento com defeito. Fica fora até alguém da engenharia
              devolvê-lo ao serviço.
            </p>
            <ReasonField value={reason} onChange={setReason} />
          </div>
        )}

        {action === "rationalize" && (
          <div className="space-y-3">
            <TextBlock id="rat-cause" label="Causa provável" value={cause} onChange={setCause} />
            <TextBlock
              id="rat-consequence"
              label="Consequência se ninguém agir"
              value={consequence}
              onChange={setConsequence}
            />
            <TextBlock
              id="rat-action"
              label="Ação do operador"
              value={corrective}
              onChange={setCorrective}
            />
            <div>
              <Label htmlFor="rat-response">Tempo para agir (minutos, opcional)</Label>
              <Input
                id="rat-response"
                inputMode="numeric"
                value={response}
                onChange={(e) => setResponse(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                aria-invalid={!responseOk}
                className="mt-1.5"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!canSubmit}
            data-testid="alarm-point-submit"
          >
            {busy ? "Gravando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor="alarm-reason">Motivo</Label>
      <Textarea
        id="alarm-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={REASON_MAX}
        rows={3}
        placeholder="Ex.: sensor em calibração, OS 1234"
        className="mt-1.5"
      />
    </div>
  );
}

function TextBlock({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={RATIONALE_MAX}
        rows={2}
        className="mt-1.5"
      />
    </div>
  );
}
