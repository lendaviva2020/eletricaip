/**
 * Painel "Bancada Arduino" do editor unifilar.
 *
 * Liga o Uno pela Web Serial, mostra leituras e estados REAIS (relés,
 * auxiliares de disjuntor, E-STOP) e espelha contatores/disjuntores no
 * unifilar. Comando de campo só com habilitação explícita na sessão,
 * confirmação antes de energizar e o guarda NBR 5410/intertravamento
 * (regra 21 do AGENTS.md). Desligar é sempre permitido.
 */
import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Plug,
  PlugsConnected,
  Warning,
  DownloadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useDiagramStore } from "@/lib/diagram/store";
import { useI18n } from "@/lib/i18n";
import { useArduinoSerial } from "@/hooks/use-arduino-serial";
import { DEFAULT_BENCH_CONFIG, type BenchConfig } from "@/lib/hardware/bench-config";
import { benchConfigFromDiagram } from "@/lib/hardware/bench-from-diagram";
import { auditBenchConfig } from "@/lib/hardware/command-guard";
import { generateUnoFirmware } from "@/lib/hardware/firmware/uno-firmware";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Source = "diagram" | "example";

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ArduinoBenchPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("diagram");
  const [armed, setArmed] = useState(false);
  const [confirmPin, setConfirmPin] = useState<number | null>(null);
  const doc = useDiagramStore((s) => s.doc);

  const mapping = useMemo(() => (open ? benchConfigFromDiagram(doc) : null), [open, doc]);
  const config: BenchConfig =
    source === "diagram" && mapping && mapping.config.outputs.length > 0
      ? mapping.config
      : DEFAULT_BENCH_CONFIG;
  const usingExample = config === DEFAULT_BENCH_CONFIG;
  const audit = useMemo(() => auditBenchConfig(config), [config]);
  const bench = useArduinoSerial(config);
  const connected = bench.status === "connected";

  // O firmware informa quais pinos são saída: precisa casar com a configuração.
  const firmwareMismatch = useMemo(() => {
    const hello = bench.firmwarePins;
    if (!hello) return false;
    const want = config.outputs
      .map((o) => o.pin)
      .sort((a, b) => a - b)
      .join(",");
    return hello.outputs.join(",") !== want;
  }, [bench.firmwarePins, config.outputs]);

  const run = async (pin: number, on: boolean) => {
    const r = await bench.command(pin, on, armed);
    if (!r.ok) toast.error(r.error);
  };

  const requestOn = (pin: number) => {
    const decision = bench.guard(pin, true, armed);
    if (!decision.allowed) {
      toast.error(decision.blocking.map((b) => b.message).join(" "));
      return;
    }
    setConfirmPin(pin);
  };

  const confirmOutput = config.outputs.find((o) => o.pin === confirmPin);
  const confirmWarnings = confirmPin !== null ? bench.guard(confirmPin, true, armed).warnings : [];

  return (
    <div className="rounded-md border border-border bg-card/40" data-testid="arduino-bench-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-semibold"
      >
        {open ? <CaretDown size={12} /> : <CaretRight size={12} />}
        {connected ? (
          <PlugsConnected size={14} className="text-emerald-500" />
        ) : (
          <Plug size={14} className="text-muted-foreground" />
        )}
        <span className="flex-1">{t("bench.title")}</span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {t(`bench.status_${bench.status}`)}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-2.5 py-2 text-[11px]">
          <p className="text-muted-foreground">{t("bench.desc")}</p>

          <div
            role="note"
            className="rounded border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-700 dark:text-amber-300"
          >
            <Warning size={12} className="mr-1 inline" />
            {t("bench.safetyNote")}
          </div>

          {!bench.support.supported && (
            <p className="rounded border border-border p-1.5 text-muted-foreground">
              {bench.support.reason}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor="bench-source">
              {t("bench.source")}
            </label>
            <select
              id="bench-source"
              value={source}
              onChange={(e) => setSource(e.target.value === "example" ? "example" : "diagram")}
              disabled={connected}
              className="h-7 rounded border border-border bg-background px-1.5"
            >
              <option value="diagram">{t("bench.sourceDiagram")}</option>
              <option value="example">{t("bench.sourceExample")}</option>
            </select>
            <button
              type="button"
              onClick={() => downloadText("eletricai_uno.ino", generateUnoFirmware(config))}
              className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 hover:bg-muted"
            >
              <DownloadSimple size={12} />
              {t("bench.downloadFirmware")}
            </button>
          </div>
          {source === "diagram" && usingExample && (
            <p className="text-muted-foreground">{t("bench.noContactors")}</p>
          )}
          {mapping && mapping.skipped.length > 0 && source === "diagram" && (
            <p className="text-amber-600">
              {t("bench.skipped", { list: mapping.skipped.join(", ") })}
            </p>
          )}
          {audit.map((a) => (
            <p key={a} className="text-amber-600">
              {a}
            </p>
          ))}

          <div className="flex flex-wrap gap-1.5">
            {connected || bench.status === "connecting" ? (
              <button
                type="button"
                onClick={() => void bench.disconnect()}
                className="h-7 rounded border border-border px-2 hover:bg-muted"
              >
                {t("bench.disconnect")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!bench.support.supported}
                onClick={() => void bench.connect()}
                className="h-7 rounded bg-primary px-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("bench.connect")}
              </button>
            )}
            {connected && (
              <>
                <button
                  type="button"
                  onClick={() => void bench.allOff()}
                  className="h-7 rounded border border-red-500/60 px-2 font-semibold text-red-600 hover:bg-red-500/10"
                >
                  {t("bench.allOff")}
                </button>
                <button
                  type="button"
                  disabled={bench.live.estop}
                  title={bench.live.estop ? t("bench.resetBlocked") : undefined}
                  onClick={() => void bench.resetEstop()}
                  className="h-7 rounded border border-border px-2 hover:bg-muted disabled:opacity-50"
                >
                  {t("bench.reset")}
                </button>
              </>
            )}
          </div>

          {bench.lastError && <p className="text-red-600">{bench.lastError}</p>}

          {connected && (
            <>
              <div className="flex items-center justify-between rounded border border-border p-1.5">
                <span>
                  {bench.firmware} · {bench.portLabel}
                </span>
                <span
                  className={
                    bench.live.estop ? "font-bold text-red-600" : "font-semibold text-emerald-600"
                  }
                >
                  {bench.live.estop ? t("bench.estopActive") : t("bench.estopOk")}
                </span>
              </div>
              {firmwareMismatch && <p className="text-red-600">{t("bench.firmwareMismatch")}</p>}
              {bench.badFrames > 0 && (
                <p className="text-muted-foreground">
                  {t("bench.badFrames", { n: bench.badFrames })}
                </p>
              )}

              <label className="flex items-center justify-between gap-2 rounded border border-border p-1.5">
                <span>
                  <span className="font-semibold">{t("bench.arm")}</span>
                  <span className="block text-muted-foreground">{t("bench.armHint")}</span>
                </span>
                <Switch checked={armed} onCheckedChange={setArmed} aria-label={t("bench.arm")} />
              </label>

              <div>
                <div className="mb-1 font-semibold">{t("bench.outputs")}</div>
                <ul className="space-y-1">
                  {config.outputs.map((o) => {
                    const on = bench.outputOn(o.pin);
                    const blocking = bench.guard(o.pin, true, armed).blocking;
                    return (
                      <li key={o.pin} className="rounded border border-border p-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className={`h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-zinc-400"}`}
                          />
                          <span className="flex-1 truncate">
                            D{o.pin} · {o.label}
                          </span>
                          <span className="sr-only">{on ? t("bench.on") : t("bench.off")}</span>
                          {on ? (
                            <button
                              type="button"
                              onClick={() => void run(o.pin, false)}
                              className="h-6 rounded border border-border px-2 hover:bg-muted"
                            >
                              {t("bench.turnOff")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={blocking.length > 0}
                              onClick={() => requestOn(o.pin)}
                              className="h-6 rounded bg-emerald-600 px-2 font-semibold text-white disabled:opacity-40"
                            >
                              {t("bench.turnOn")}
                            </button>
                          )}
                        </div>
                        {!on && blocking.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {blocking[0]?.message}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {config.inputs.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold">{t("bench.inputs")}</div>
                  <ul className="grid grid-cols-2 gap-1">
                    {config.inputs.map((i) => {
                      const active = bench.inputActive(i.pin);
                      return (
                        <li key={i.pin} className="rounded border border-border p-1">
                          D{i.pin} · {i.label}:{" "}
                          <span
                            className={active ? "font-semibold text-emerald-600" : "text-zinc-500"}
                          >
                            {i.role === "breaker_aux"
                              ? active
                                ? t("bench.closed")
                                : t("bench.open")
                              : active
                                ? t("bench.on")
                                : t("bench.off")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {bench.readings.length > 0 && (
                <div>
                  <div className="mb-1 font-semibold">{t("bench.readings")}</div>
                  <ul className="grid grid-cols-2 gap-1 font-mono">
                    {bench.readings.map((r) => (
                      <li key={r.channel} className="rounded border border-border p-1">
                        <span className="block font-sans text-muted-foreground">
                          A{r.channel} · {r.label}
                        </span>
                        {r.value === null
                          ? `${r.raw.toFixed(0)} cont.`
                          : `${r.value.toFixed(2)} ${r.unit}`}
                        {r.saturated && (
                          <span className="ml-1 text-red-600">{t("bench.saturated")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmPin !== null}
        onOpenChange={(v) => {
          if (!v) setConfirmPin(null);
        }}
        title={t("bench.confirmTitle", { label: confirmOutput?.label ?? "" })}
        description={[
          t("bench.confirmDesc", { pin: confirmPin ?? 0 }),
          ...confirmWarnings.map((w) => `⚠ ${w.message}`),
        ].join("\n")}
        confirmLabel={t("bench.turnOn")}
        cancelLabel={t("bench.cancel")}
        variant="destructive"
        onConfirm={() => {
          const pin = confirmPin;
          setConfirmPin(null);
          if (pin !== null) void run(pin, true);
        }}
      />
    </div>
  );
}
