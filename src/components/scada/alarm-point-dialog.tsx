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
import { useI18n } from "@/lib/i18n";
import type { ScadaAlarmItem } from "@/lib/scada/types";

export type AlarmPointAction = "shelve" | "outOfService" | "rationalize";

type Tr = (key: string, params?: Record<string, string | number>) => string;

const TITLE_KEY: Record<AlarmPointAction, string> = {
  shelve: "scada2.pointDlg.titleShelve",
  outOfService: "scada2.pointDlg.titleOos",
  rationalize: "scada2.pointDlg.titleRationalize",
};

function durationLabel(min: number, t: Tr): string {
  if (min < 60) return t("scada2.pointDlg.durMin", { n: min });
  const h = min / 60;
  return h === 1 ? t("scada2.pointDlg.durHour", { n: h }) : t("scada2.pointDlg.durHours", { n: h });
}

type Change = Parameters<typeof applyLocalChange>[3];

/** Executa a mudança (servidor ou local na demonstração). Usado também por "devolver". */
export function useAlarmPointChange() {
  const projectId = useScadaStore((s) => s.currentProjectId);
  const isDemo = useScadaStore((s) => s.isDemoProject);
  const update = useServerFn(updateAlarmPoint);
  const { t } = useI18n();
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
      let msg = t("scada2.pointDlg.errGeneric");
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
  const { t } = useI18n();
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
    [cause, consequence, corrective].every((v) => v.trim().length >= 3) && responseOk;
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
          ? t("scada2.pointDlg.toastShelved", {
              tag: alarm.tag,
              dur: durationLabel(minutes, t),
            })
          : action === "outOfService"
            ? t("scada2.pointDlg.toastOos", { tag: alarm.tag })
            : t("scada2.pointDlg.toastRationalized", { tag: alarm.tag }),
      );
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[action])}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{alarm.tag}</span> — {alarm.description}
          </DialogDescription>
        </DialogHeader>

        {!available && (
          <p className="text-sm text-amber-600 dark:text-amber-300">
            {t("scada2.pointDlg.notActivated")}
          </p>
        )}
        {isSafety && action !== "rationalize" && (
          <p className="text-sm text-destructive" data-testid="alarm-safety-block">
            {t("scada2.pointDlg.safetyBlock")}
          </p>
        )}

        {action === "shelve" && !blocked && (
          <div className="space-y-3">
            <div>
              <Label htmlFor="shelve-duration">{t("scada2.pointDlg.howLong")}</Label>
              <select
                id="shelve-duration"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {SHELVE_DURATIONS_MIN.map((m) => (
                  <option key={m} value={m}>
                    {durationLabel(m, t)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t("scada2.pointDlg.shelveHint")}
              </p>
            </div>
            <ReasonField value={reason} onChange={setReason} />
          </div>
        )}

        {action === "outOfService" && !blocked && (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">{t("scada2.pointDlg.oosHint")}</p>
            <ReasonField value={reason} onChange={setReason} />
          </div>
        )}

        {action === "rationalize" && (
          <div className="space-y-3">
            <TextBlock
              id="rat-cause"
              label={t("scada2.pointDlg.causeLabel")}
              value={cause}
              onChange={setCause}
            />
            <TextBlock
              id="rat-consequence"
              label={t("scada2.pointDlg.consequenceLabel")}
              value={consequence}
              onChange={setConsequence}
            />
            <TextBlock
              id="rat-action"
              label={t("scada2.pointDlg.actionLabel")}
              value={corrective}
              onChange={setCorrective}
            />
            <div>
              <Label htmlFor="rat-response">{t("scada2.pointDlg.responseLabel")}</Label>
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
            {t("scada2.pointDlg.cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!canSubmit}
            data-testid="alarm-point-submit"
          >
            {busy ? t("scada2.pointDlg.saving") : t("scada2.pointDlg.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div>
      <Label htmlFor="alarm-reason">{t("scada2.pointDlg.reason")}</Label>
      <Textarea
        id="alarm-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={REASON_MAX}
        rows={3}
        placeholder={t("scada2.pointDlg.reasonPlaceholder")}
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
