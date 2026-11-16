// Calculadoras elétricas dedicadas — usa apenas funções PURAS e testadas
// (`electrical-calc.ts`, `electrical-sim.ts`). Roda 100 % no navegador: nenhum
// dado sai da máquina, funciona sem rede. Resultados são de apoio ao projeto e
// não substituem a responsabilidade técnica (ART/TRT) do engenheiro.
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Calculator } from "@phosphor-icons/react";
import {
  calcDemand,
  calcMotor,
  calcVoltageDrop,
  type InstallationMethod,
  type InsulationType,
  type MotorSpec,
} from "@/lib/electrical-calc";
import { shortCircuitIEC60909 } from "@/lib/electrical-sim";
import { analyzeHarmonics, type HarmonicComponent } from "@/lib/power-quality";
import { checkTTProtection, rodGroundingResistance } from "@/lib/grounding";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calculations")({
  head: () => ({ meta: [{ title: "Cálculos elétricos · EletricAI" }] }),
  component: CalculationsPage,
});

type TabId = "motor" | "drop" | "short" | "demand" | "harmonics" | "grounding";
const TABS: readonly TabId[] = ["motor", "drop", "short", "demand", "harmonics", "grounding"];
const METHODS: readonly InstallationMethod[] = ["A1", "A2", "B1", "B2", "C", "D", "E", "F"];
const INSULATIONS: readonly InsulationType[] = ["PVC", "EPR", "XLPE"];

/** Converte texto do campo em número finito dentro da faixa; `null` se inválido. */
function parseNum(raw: string, min: number, max: number): number | null {
  const v = Number(raw.replace(",", "."));
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
}

function fmt(v: number, digits = 1, locale = "pt-BR"): string {
  return Number.isFinite(v)
    ? v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";
}

function NumField({
  id,
  label,
  unit,
  value,
  onChange,
  invalid,
  hint,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  hint: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-err` : undefined}
          className={cn(
            "h-8 w-full min-w-0 rounded-md border bg-background px-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid ? "border-destructive" : "border-input",
          )}
        />
        {unit && <span className="w-10 shrink-0 font-mono text-muted-foreground">{unit}</span>}
      </span>
      {invalid && (
        <span id={`${id}-err`} className="text-[11px] text-destructive">
          {hint}
        </span>
      )}
    </label>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Result({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-mono font-semibold",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Panel({ inputs, results }: { inputs: ReactNode; results: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        {inputs}
      </section>
      <section className="rounded-lg border border-border bg-card p-4" aria-live="polite">
        <dl>{results}</dl>
      </section>
    </div>
  );
}

function MotorCalc() {
  const { t, locale } = useI18n();
  const [kw, setKw] = useState("7.5");
  const [v, setV] = useState("380");
  const [len, setLen] = useState("50");
  const [amb, setAmb] = useState("30");
  const [group, setGroup] = useState("1");
  const [method, setMethod] = useState<InstallationMethod>("B1");
  const [ins, setIns] = useState<InsulationType>("PVC");
  const [start, setStart] = useState<"DOL" | "SOFT" | "VFD">("DOL");

  const p = {
    kw: parseNum(kw, 0.1, 5000),
    v: parseNum(v, 100, 15000),
    len: parseNum(len, 1, 5000),
    amb: parseNum(amb, 10, 60),
    group: parseNum(group, 1, 20),
  };
  const res = (() => {
    if (Object.values(p).some((x) => x === null)) return null;
    try {
      const spec: MotorSpec = {
        id: "calc",
        power_kW: p.kw!,
        voltage_V: p.v!,
        startMethod: start,
        installationMethod: method,
        insulation: ins,
        ambientTemp_C: p.amb!,
        groupedCircuits: Math.round(p.group!),
        cableLength_m: p.len!,
      };
      const m = calcMotor(spec);
      const drop = calcVoltageDrop(m.In_A, p.len!, m.cable_mm2, p.v!);
      return { m, drop };
    } catch {
      return null;
    }
  })();
  const bad = t("calc.invalid");

  return (
    <Panel
      inputs={
        <>
          <NumField
            id="m-kw"
            label={t("calc.power")}
            unit="kW"
            value={kw}
            onChange={setKw}
            invalid={p.kw === null}
            hint={bad}
          />
          <NumField
            id="m-v"
            label={t("calc.voltage")}
            unit="V"
            value={v}
            onChange={setV}
            invalid={p.v === null}
            hint={bad}
          />
          <NumField
            id="m-len"
            label={t("calc.length")}
            unit="m"
            value={len}
            onChange={setLen}
            invalid={p.len === null}
            hint={bad}
          />
          <NumField
            id="m-amb"
            label={t("calc.ambient")}
            unit="°C"
            value={amb}
            onChange={setAmb}
            invalid={p.amb === null}
            hint={bad}
          />
          <NumField
            id="m-grp"
            label={t("calc.grouping")}
            value={group}
            onChange={setGroup}
            invalid={p.group === null}
            hint={bad}
          />
          <SelectField
            id="m-method"
            label={t("calc.method")}
            value={method}
            options={METHODS}
            onChange={setMethod}
          />
          <SelectField
            id="m-ins"
            label={t("calc.insulation")}
            value={ins}
            options={INSULATIONS}
            onChange={setIns}
          />
          <SelectField
            id="m-start"
            label={t("calc.startMethod")}
            value={start}
            options={["DOL", "SOFT", "VFD"] as const}
            onChange={setStart}
          />
        </>
      }
      results={
        res ? (
          <>
            <Result label={t("calc.In")} value={`${fmt(res.m.In_A, 1, locale)} A`} />
            <Result label={t("calc.Istart")} value={`${fmt(res.m.Istart_A, 1, locale)} A`} />
            <Result label={t("calc.breaker")} value={`${res.m.breaker_A} A`} />
            <Result label={t("calc.cable")} value={`${res.m.cable_mm2} mm²`} />
            {res.m.Iz_corrected_A !== undefined && (
              <Result
                label={t("calc.izCorrected")}
                value={`${fmt(res.m.Iz_corrected_A, 1, locale)} A`}
              />
            )}
            {res.m.overloadCoordinated !== undefined && (
              <Result
                label={t("calc.coordination")}
                value={res.m.overloadCoordinated ? t("calc.ok") : t("calc.notOk")}
                tone={res.m.overloadCoordinated ? "ok" : "bad"}
              />
            )}
            <Result
              label={t("calc.drop")}
              value={`${fmt(res.drop.deltaV_pct, 2, locale)} %`}
              tone={res.drop.deltaV_pct <= 4 ? "ok" : "bad"}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.dropNote")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

function DropCalc() {
  const { t, locale } = useI18n();
  const [i, setI] = useState("32");
  const [len, setLen] = useState("80");
  const [s, setS] = useState("6");
  const [v, setV] = useState("380");
  const [pf, setPf] = useState("0.86");
  const [phases, setPhases] = useState<"3" | "1">("3");
  const [limit, setLimit] = useState("4");
  const p = {
    i: parseNum(i, 0.1, 10000),
    len: parseNum(len, 1, 10000),
    s: parseNum(s, 0.5, 1000),
    v: parseNum(v, 12, 15000),
    pf: parseNum(pf, 0.1, 1),
    limit: parseNum(limit, 0.5, 10),
  };
  const res = (() => {
    if (Object.values(p).some((x) => x === null)) return null;
    return calcVoltageDrop(p.i!, p.len!, p.s!, p.v!, p.pf!, { phases: phases === "3" ? 3 : 1 });
  })();
  const bad = t("calc.invalid");
  return (
    <Panel
      inputs={
        <>
          <NumField
            id="d-i"
            label={t("calc.current")}
            unit="A"
            value={i}
            onChange={setI}
            invalid={p.i === null}
            hint={bad}
          />
          <NumField
            id="d-len"
            label={t("calc.length")}
            unit="m"
            value={len}
            onChange={setLen}
            invalid={p.len === null}
            hint={bad}
          />
          <NumField
            id="d-s"
            label={t("calc.section")}
            unit="mm²"
            value={s}
            onChange={setS}
            invalid={p.s === null}
            hint={bad}
          />
          <NumField
            id="d-v"
            label={t("calc.voltage")}
            unit="V"
            value={v}
            onChange={setV}
            invalid={p.v === null}
            hint={bad}
          />
          <NumField
            id="d-pf"
            label={t("calc.pf")}
            value={pf}
            onChange={setPf}
            invalid={p.pf === null}
            hint={bad}
          />
          <NumField
            id="d-lim"
            label={t("calc.limit")}
            unit="%"
            value={limit}
            onChange={setLimit}
            invalid={p.limit === null}
            hint={bad}
          />
          <SelectField
            id="d-ph"
            label={t("calc.phases")}
            value={phases}
            options={["3", "1"] as const}
            onChange={setPhases}
          />
        </>
      }
      results={
        res && p.limit !== null ? (
          <>
            <Result label={t("calc.dropV")} value={`${fmt(res.deltaV_V, 2, locale)} V`} />
            <Result
              label={t("calc.drop")}
              value={`${fmt(res.deltaV_pct, 2, locale)} %`}
              tone={res.deltaV_pct <= p.limit ? "ok" : "bad"}
            />
            <Result
              label={t("calc.resistance")}
              value={`${fmt(res.resistance_ohm, 4, locale)} Ω`}
            />
            <Result label={t("calc.reactance")} value={`${fmt(res.reactance_ohm, 4, locale)} Ω`} />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.dropFormula")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

function ShortCalc() {
  const { t, locale } = useI18n();
  const [kva, setKva] = useState("500");
  const [uk, setUk] = useState("5");
  const [v, setV] = useState("380");
  const [xr, setXr] = useState("");
  const [vg, setVg] = useState<"Dyn11" | "Yyn0" | "YNd11">("Dyn11");
  const p = {
    kva: parseNum(kva, 10, 100000),
    uk: parseNum(uk, 0.5, 30),
    v: parseNum(v, 100, 35000),
    xr: xr.trim() === "" ? undefined : parseNum(xr, 0.5, 100),
  };
  const res = (() => {
    if (p.kva === null || p.uk === null || p.v === null || p.xr === null) return null;
    try {
      return shortCircuitIEC60909({
        power_kVA: p.kva,
        secondary_V: p.v,
        impedance_pct: p.uk,
        vector_group: vg,
        x_r_ratio: p.xr,
      });
    } catch {
      return null;
    }
  })();
  const bad = t("calc.invalid");
  return (
    <Panel
      inputs={
        <>
          <NumField
            id="s-kva"
            label={t("calc.trafoPower")}
            unit="kVA"
            value={kva}
            onChange={setKva}
            invalid={p.kva === null}
            hint={bad}
          />
          <NumField
            id="s-uk"
            label={t("calc.uk")}
            unit="%"
            value={uk}
            onChange={setUk}
            invalid={p.uk === null}
            hint={bad}
          />
          <NumField
            id="s-v"
            label={t("calc.secondary")}
            unit="V"
            value={v}
            onChange={setV}
            invalid={p.v === null}
            hint={bad}
          />
          <NumField
            id="s-xr"
            label={t("calc.xr")}
            value={xr}
            onChange={setXr}
            invalid={p.xr === null}
            hint={bad}
          />
          <SelectField
            id="s-vg"
            label={t("calc.vectorGroup")}
            value={vg}
            options={["Dyn11", "Yyn0", "YNd11"] as const}
            onChange={setVg}
          />
        </>
      }
      results={
        res ? (
          <>
            <Result label="I″k3" value={`${fmt(res.Ik3ph_kA, 2, locale)} kA`} />
            <Result label="I″k1" value={`${fmt(res.Ik1ph_kA, 2, locale)} kA`} />
            <Result label={t("calc.peak")} value={`${fmt(res.ip_kA, 2, locale)} kA`} />
            <Result label="X/R" value={fmt(res.X_R, 2, locale)} />
            <Result label={t("calc.cFactor")} value={fmt(res.c_factor, 2, locale)} />
            <Result label={t("calc.zTrafo")} value={`${fmt(res.Z_transformer_ohm, 4, locale)} Ω`} />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.shortNote")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

function DemandCalc() {
  const { t, locale } = useI18n();
  const [list, setList] = useState("75, 110, 22, 7.5");
  const [v, setV] = useState("380");
  const [div, setDiv] = useState("0.85");
  const [pf, setPf] = useState("0.88");
  const powers = list
    .split(/[;,\s]+/)
    .filter(Boolean)
    .map((x) => parseNum(x, 0.1, 5000));
  const listOk = powers.length > 0 && powers.length <= 200 && powers.every((x) => x !== null);
  const p = { v: parseNum(v, 100, 15000), div: parseNum(div, 0.1, 1), pf: parseNum(pf, 0.5, 1) };
  const res = (() => {
    if (!listOk || p.v === null || p.div === null || p.pf === null) return null;
    return calcDemand(
      powers.map((kw, i) => ({ id: `M${i + 1}`, power_kW: kw! })),
      { voltage_V: p.v, diversity: p.div, cosphi: p.pf },
    );
  })();
  const bad = t("calc.invalid");
  return (
    <Panel
      inputs={
        <>
          <label htmlFor="dm-list" className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-medium text-muted-foreground">{t("calc.motorList")}</span>
            <textarea
              id="dm-list"
              value={list}
              onChange={(e) => setList(e.target.value)}
              aria-invalid={!listOk}
              rows={3}
              className={cn(
                "rounded-md border bg-background p-2 font-mono text-sm",
                listOk ? "border-input" : "border-destructive",
              )}
            />
            {!listOk && <span className="text-[11px] text-destructive">{bad}</span>}
          </label>
          <NumField
            id="dm-v"
            label={t("calc.voltage")}
            unit="V"
            value={v}
            onChange={setV}
            invalid={p.v === null}
            hint={bad}
          />
          <NumField
            id="dm-div"
            label={t("calc.diversity")}
            value={div}
            onChange={setDiv}
            invalid={p.div === null}
            hint={bad}
          />
          <NumField
            id="dm-pf"
            label={t("calc.pf")}
            value={pf}
            onChange={setPf}
            invalid={p.pf === null}
            hint={bad}
          />
        </>
      }
      results={
        res ? (
          <>
            <Result label={t("calc.totalShaft")} value={`${fmt(res.totalLoad_kW, 1, locale)} kW`} />
            <Result
              label={t("calc.electricalDemand")}
              value={`${fmt(res.diversifiedLoad_kW, 1, locale)} kW`}
            />
            <Result label={t("calc.apparent")} value={`${fmt(res.apparent_kVA, 1, locale)} kVA`} />
            <Result label={t("calc.feederCurrent")} value={`${fmt(res.current_A, 1, locale)} A`} />
            <Result label={t("calc.trafo")} value={`${res.transformer_kVA} kVA`} />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.demandNote")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

/** "5:20, 7:14.3" → componentes; `null` se algum item for inválido. */
function parseSpectrum(raw: string): HarmonicComponent[] | null {
  const items = raw
    .split(/[;,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (items.length > 49) return null;
  const out: HarmonicComponent[] = [];
  for (const item of items) {
    const m = /^(\d{1,2})\s*[:=]\s*([\d.]+)$/.exec(item.replace(",", "."));
    if (!m) return null;
    const order = Number(m[1]);
    const current_A = Number(m[2]);
    if (order < 2 || order > 50 || !Number.isFinite(current_A) || current_A < 0) return null;
    out.push({ order, current_A });
  }
  return out;
}

function HarmonicsCalc() {
  const { t, locale } = useI18n();
  const [i1, setI1] = useState("100");
  const [il, setIl] = useState("100");
  const [ratio, setRatio] = useState("20");
  const [spectrum, setSpectrum] = useState("5:20, 7:14.3, 11:9.1, 13:7.7");
  const p = {
    i1: parseNum(i1, 0.01, 100000),
    il: parseNum(il, 0.01, 100000),
    ratio: parseNum(ratio, 1, 100000),
  };
  const comps = parseSpectrum(spectrum);
  const res = (() => {
    if (p.i1 === null || p.il === null || p.ratio === null || comps === null) return null;
    try {
      return analyzeHarmonics(p.i1, comps, p.il, p.ratio);
    } catch {
      return null;
    }
  })();
  const bad = t("calc.invalid");
  return (
    <Panel
      inputs={
        <>
          <NumField
            id="h-i1"
            label={t("calc.fundamental")}
            unit="A"
            value={i1}
            onChange={setI1}
            invalid={p.i1 === null}
            hint={bad}
          />
          <NumField
            id="h-il"
            label={t("calc.demandIL")}
            unit="A"
            value={il}
            onChange={setIl}
            invalid={p.il === null}
            hint={bad}
          />
          <NumField
            id="h-ratio"
            label={t("calc.iscOverIl")}
            value={ratio}
            onChange={setRatio}
            invalid={p.ratio === null}
            hint={bad}
          />
          <label htmlFor="h-spec" className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="font-medium text-muted-foreground">{t("calc.spectrum")}</span>
            <textarea
              id="h-spec"
              value={spectrum}
              onChange={(e) => setSpectrum(e.target.value)}
              aria-invalid={comps === null}
              rows={3}
              className={cn(
                "rounded-md border bg-background p-2 font-mono text-sm",
                comps === null ? "border-destructive" : "border-input",
              )}
            />
            {comps === null && (
              <span className="text-[11px] text-destructive">{t("calc.spectrumInvalid")}</span>
            )}
          </label>
        </>
      }
      results={
        res ? (
          <>
            <Result label="THD-I" value={`${fmt(res.thd_pct, 1, locale)} %`} />
            <Result
              label={t("calc.tdd")}
              value={`${fmt(res.tdd_pct, 1, locale)} % / ${res.tddLimit_pct} %`}
              tone={res.tddCompliant ? "ok" : "bad"}
            />
            <Result label={t("calc.rmsTotal")} value={`${fmt(res.rms_A, 1, locale)} A`} />
            <Result label={t("calc.kFactor")} value={fmt(res.kFactor, 2, locale)} />
            <Result label={t("calc.kTrafo")} value={`K-${res.kRatedTransformer}`} />
            <Result
              label={t("calc.neutral")}
              value={`${fmt(res.neutralTriplen_A, 1, locale)} A`}
              tone={res.thirdHarmonic_pct > 33 ? "bad" : undefined}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.harmonicsNote")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

function GroundingCalc() {
  const { t, locale } = useI18n();
  const [rho, setRho] = useState("100");
  const [len, setLen] = useState("2.4");
  const [diam, setDiam] = useState("15.875");
  const [rods, setRods] = useState("1");
  const [idn, setIdn] = useState("30");
  const [ul, setUl] = useState<"50" | "25">("50");
  const p = {
    rho: parseNum(rho, 1, 100000),
    len: parseNum(len, 0.5, 30),
    diam: parseNum(diam, 5, 50),
    rods: parseNum(rods, 1, 24),
    idn: parseNum(idn, 10, 3000),
  };
  const res = (() => {
    if (Object.values(p).some((x) => x === null)) return null;
    try {
      const g = rodGroundingResistance({
        soilResistivity_ohm_m: p.rho!,
        rodLength_m: p.len!,
        rodDiameter_mm: p.diam!,
        rods: Math.round(p.rods!),
      });
      return { g, tt: checkTTProtection(g.total_ohm, p.idn!, Number(ul)) };
    } catch {
      return null;
    }
  })();
  const bad = t("calc.invalid");
  return (
    <Panel
      inputs={
        <>
          <NumField
            id="g-rho"
            label={t("calc.resistivity")}
            unit="Ω·m"
            value={rho}
            onChange={setRho}
            invalid={p.rho === null}
            hint={bad}
          />
          <NumField
            id="g-len"
            label={t("calc.rodLength")}
            unit="m"
            value={len}
            onChange={setLen}
            invalid={p.len === null}
            hint={bad}
          />
          <NumField
            id="g-d"
            label={t("calc.rodDiameter")}
            unit="mm"
            value={diam}
            onChange={setDiam}
            invalid={p.diam === null}
            hint={bad}
          />
          <NumField
            id="g-n"
            label={t("calc.rods")}
            value={rods}
            onChange={setRods}
            invalid={p.rods === null}
            hint={bad}
          />
          <NumField
            id="g-idn"
            label={t("calc.rcd")}
            unit="mA"
            value={idn}
            onChange={setIdn}
            invalid={p.idn === null}
            hint={bad}
          />
          <SelectField
            id="g-ul"
            label={t("calc.touchLimit")}
            value={ul}
            options={["50", "25"] as const}
            onChange={setUl}
          />
        </>
      }
      results={
        res ? (
          <>
            <Result
              label={t("calc.singleRod")}
              value={`${fmt(res.g.singleRod_ohm, 2, locale)} Ω`}
            />
            <Result label={t("calc.parallelFactor")} value={fmt(res.g.multiplier, 2, locale)} />
            <Result label={t("calc.groundTotal")} value={`${fmt(res.g.total_ohm, 2, locale)} Ω`} />
            <Result label={t("calc.maxRA")} value={`${fmt(res.tt.maxRA_ohm, 1, locale)} Ω`} />
            <Result
              label={t("calc.ttCheck")}
              value={res.tt.compliant ? t("calc.ok") : t("calc.notOk")}
              tone={res.tt.compliant ? "ok" : "bad"}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">{t("calc.groundNote")}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calc.fixInputs")}</p>
        )
      }
    />
  );
}

function CalculationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("motor");
  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6" data-testid="calculations-page">
      <div className="mx-auto max-w-5xl space-y-4">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Calculator className="h-5 w-5 text-primary" /> {t("calc.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calc.subtitle")}</p>
        </header>
        <div role="tablist" aria-label={t("calc.title")} className="flex flex-wrap gap-1">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium transition-colors",
                tab === id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent",
              )}
            >
              {t(`calc.tab_${id}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === "motor" && <MotorCalc />}
          {tab === "drop" && <DropCalc />}
          {tab === "short" && <ShortCalc />}
          {tab === "demand" && <DemandCalc />}
          {tab === "harmonics" && <HarmonicsCalc />}
          {tab === "grounding" && <GroundingCalc />}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("calc.disclaimer")}</p>
      </div>
    </div>
  );
}
