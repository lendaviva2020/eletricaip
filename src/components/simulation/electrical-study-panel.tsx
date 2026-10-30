// Painel de estudos elétricos de potência — curto-circuito (IEC 60909),
// seletividade (IEC 60947), arco elétrico (IEEE 1584), esforço térmico de
// partida e queda de tensão (NBR 5410).
//
// Resultados são apoio de engenharia, não projeto executivo — Termos §10.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  deleteElectricalStudy,
  listElectricalStudies,
  runElectricalStudy,
  type ElectricalStudyResults,
} from "@/lib/electrical-sim.functions";
import { useProjectStore } from "@/lib/project-store";
import { useUnifiedProjectStore, type UnifiedProjectDoc } from "@/lib/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Warning,
  Calculator,
  CircleNotch,
  Play,
  ArrowsClockwise,
  Trash,
  Lightning,
} from "@phosphor-icons/react";

export type StudyKind = "short_circuit" | "selectivity" | "arc_flash" | "thermal" | "voltage_drop";

const KIND_LABEL: Record<StudyKind, string> = {
  short_circuit: "Curto-circuito (IEC 60909)",
  selectivity: "Seletividade (IEC 60947)",
  arc_flash: "Arco elétrico (IEEE 1584)",
  thermal: "Partida de motor (térmico)",
  voltage_drop: "Queda de tensão (NBR 5410)",
};

const DEFAULT_VALUES: Record<StudyKind, Record<string, string>> = {
  short_circuit: { power_kVA: "750", secondary_V: "380", impedance_pct: "4.5", voltage_V: "380" },
  selectivity: {
    upRating: "250",
    upType: "MCCB",
    downRating: "40",
    downType: "MCB",
    fault: "15000",
  },
  arc_flash: { ik_kA: "12.5", clearing: "0.1", working: "455", gap: "32" },
  thermal: { In: "11.6", Istart: "81", duration: "6" },
  voltage_drop: {
    current: "11.6",
    length: "45",
    cable: "4",
    voltage: "380",
    method: "C",
    temp: "30",
    grouped: "1",
  },
};

/**
 * Contrato 7 — Extrai parâmetros padrão e IDs de equipamentos dependentes a
 * partir do modelo canônico (`UnifiedProjectDoc`).
 */
export function deriveStudyDefaultsFromModel(
  doc: UnifiedProjectDoc,
  kind: StudyKind,
): {
  values: Record<string, string>;
  inputEquipmentIds: string[];
} {
  const base = { ...DEFAULT_VALUES[kind] };
  const equipments = Object.values(doc.engineering.equipments);
  const connections = Object.values(doc.engineering.connections);

  if (kind === "short_circuit") {
    const trafo = equipments.find((e) => e.catalogType === "transformer");
    if (!trafo) return { values: base, inputEquipmentIds: [] };
    const secV = trafo.specs.secondaryV ?? trafo.specs.voltageV ?? 380;
    return {
      values: {
        power_kVA: String(trafo.specs.apparentPowerKva ?? 750),
        secondary_V: String(secV),
        impedance_pct: String(trafo.specs.impedancePct ?? 4.5),
        voltage_V: String(secV),
      },
      inputEquipmentIds: [trafo.id],
    };
  }

  if (kind === "selectivity") {
    const protections = equipments
      .filter((e) => e.catalogType === "breaker" || e.catalogType === "fuse")
      .sort((a, b) => (b.specs.nominalCurrentA ?? 0) - (a.specs.nominalCurrentA ?? 0));
    if (protections.length >= 2) {
      const up = protections[0];
      const down = protections[1];
      const downIn = down.specs.nominalCurrentA ?? 40;
      return {
        values: {
          ...base,
          upRating: String(up.specs.nominalCurrentA ?? 250),
          downRating: String(downIn),
          downType: down.catalogType === "fuse" ? "fuse" : downIn >= 100 ? "MCCB" : "MCB",
        },
        inputEquipmentIds: [up.id, down.id],
      };
    }
    if (protections.length === 1) {
      const p = protections[0];
      return {
        values: {
          ...base,
          downRating: String(p.specs.nominalCurrentA ?? 40),
        },
        inputEquipmentIds: [p.id],
      };
    }
    return { values: base, inputEquipmentIds: [] };
  }

  if (kind === "arc_flash") {
    const trafoAndBreakers = equipments
      .filter((e) => e.catalogType === "transformer" || e.catalogType === "breaker")
      .map((e) => e.id);
    const scStudy = doc.studies["study_short_circuit"];
    const scIk = (scStudy?.results as { shortCircuit?: { Ik3ph_kA?: number } } | undefined)
      ?.shortCircuit?.Ik3ph_kA;
    if (typeof scIk === "number" && scIk > 0) {
      base.ik_kA = String(scIk);
    }
    return { values: base, inputEquipmentIds: trafoAndBreakers };
  }

  if (kind === "thermal") {
    const motor = equipments.find((e) => e.catalogType === "motor");
    if (!motor) return { values: base, inputEquipmentIds: [] };
    const v = motor.specs.voltageV ?? 380;
    const pf = motor.specs.powerFactor ?? 0.85;
    const eff = motor.specs.efficiency ?? 0.9;
    const derivedIn =
      motor.specs.nominalCurrentA ??
      (motor.specs.powerKw
        ? Number(((motor.specs.powerKw * 1000) / (Math.sqrt(3) * v * pf * eff)).toFixed(1))
        : 11.6);
    return {
      values: {
        In: String(derivedIn),
        Istart: String(Number((derivedIn * 7).toFixed(1))),
        duration: base.duration,
      },
      inputEquipmentIds: [motor.id],
    };
  }

  if (kind === "voltage_drop") {
    const load =
      equipments.find((e) => e.catalogType === "motor") ??
      equipments.find((e) => e.category === "load");
    if (!load) return { values: base, inputEquipmentIds: [] };
    const v = load.specs.voltageV ?? 380;
    const pf = load.specs.powerFactor ?? 0.85;
    const eff = load.specs.efficiency ?? 0.9;
    const derivedIn =
      load.specs.nominalCurrentA ??
      (load.specs.powerKw
        ? Number(((load.specs.powerKw * 1000) / (Math.sqrt(3) * v * pf * eff)).toFixed(1))
        : 11.6);
    const conn = connections.find(
      (c) => c.kind === "power" && (c.toEquipmentId === load.id || c.fromEquipmentId === load.id),
    );
    return {
      values: {
        current: String(derivedIn),
        length: String(conn?.conductor?.lengthM ?? 45),
        cable: String(conn?.conductor?.crossSectionMm2 ?? 4),
        voltage: String(v),
        method: conn?.conductor?.installationMethod || "C",
        temp: "30",
        grouped: "1",
      },
      inputEquipmentIds: [load.id],
    };
  }

  return { values: base, inputEquipmentIds: [] };
}

function Field({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {unit ? <span className="ml-1 normal-case">({unit})</span> : null}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 font-mono text-sm"
        inputMode="decimal"
      />
    </div>
  );
}

function buildStudy(kind: StudyKind, v: Record<string, string>): Record<string, unknown> {
  const num = (key: string) => Number(v[key]);
  switch (kind) {
    case "short_circuit":
      return {
        kind,
        transformer: {
          power_kVA: num("power_kVA"),
          secondary_V: num("secondary_V"),
          impedance_pct: num("impedance_pct"),
          vector_group: "Dyn11",
        },
        voltage_V: num("voltage_V"),
        earthing: "TN-S",
      };
    case "selectivity":
      return {
        kind,
        upstream: {
          id: "Q1",
          type: String(v.upType),
          rating_A: num("upRating"),
          breaking_kA: 35,
        },
        downstream: {
          id: "Q2",
          type: String(v.downType),
          rating_A: num("downRating"),
          curve: "C",
        },
        faultCurrent_A: num("fault"),
      };
    case "arc_flash":
      return {
        kind,
        ik_kA: num("ik_kA"),
        clearingTime_s: num("clearing"),
        workingDistance_mm: num("working"),
        electrodeGap_mm: num("gap"),
        configuration: "VB",
      };
    case "thermal":
      return {
        kind,
        motors: [
          { motorId: "M01", In_A: num("In"), Istart_A: num("Istart"), duration_s: num("duration") },
        ],
      };
    case "voltage_drop":
      return {
        kind,
        circuits: [
          {
            circuitId: "C1",
            current_A: num("current"),
            length_m: num("length"),
            cable_mm2: num("cable"),
            voltage_V: num("voltage"),
            installationMethod: v.method || "C",
            ambientTemp_C: num("temp") || 30,
            groupedCircuits: Math.max(1, Math.round(num("grouped") || 1)),
          },
        ],
      };
    default:
      return { kind };
  }
}

function renderResults(results: ElectricalStudyResults): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const sc = results.shortCircuit;
  if (sc) {
    entries.push(["I''k trifásico", `${sc.Ik3ph_kA} kA`]);
    entries.push(["I''k monofásico", `${sc.Ik1ph_kA} kA`]);
    entries.push(["Pico ip", `${sc.ip_kA} kA`]);
    entries.push(["X/R", String(sc.X_R)]);
    entries.push(["Impedância trafo", `${sc.Z_transformer_ohm} Ω`]);
  }
  for (const c of results.breakingCapacity ?? []) {
    entries.push([
      `Ruptura ${c.deviceId}`,
      `${c.breaking_kA} kA vs ${c.Ik_kA} kA — ${c.adequate ? "OK" : "INSUFICIENTE"}`,
    ]);
  }
  const sel = results.selectivity;
  if (sel) {
    entries.push(["Modo", sel.mode]);
    entries.push(["Seletiva", String(sel.selective)]);
    entries.push(["I máx. discriminante", `${sel.maxDiscriminatingCurrent_A} A`]);
  }
  const af = results.arcFlash;
  if (af) {
    entries.push(["Energia incidente", `${af.incidentEnergy_cal_cm2} cal/cm²`]);
    entries.push(["Categoria PPE", String(af.ppe_category)]);
    entries.push(["Limite de arco", `${af.arc_boundary_mm} mm`]);
  }
  for (const m of results.motorStarts ?? []) {
    entries.push([`Motor ${m.motorId} — I²t`, `${m.i2t_A2s} A²·s`]);
    entries.push([`Motor ${m.motorId} — ΔT`, `${m.estimatedRise_C} °C (${m.tripRisk})`]);
  }
  for (const c of results.circuits ?? []) {
    entries.push([
      `Circuito ${c.circuitId} (ΔV)`,
      `${c.voltage_drop_pct} % (${c.voltage_drop_V} V, limite ${c.limit_pct} %) — ${c.within_limit ? "OK" : "EXCEDE"}`,
    ]);
    entries.push([
      `Circuito ${c.circuitId} (NBR 5410)`,
      `I'z = ${c.Iz_corrected_A} A · Seção mín. ${c.recommended_cable_mm2} mm² — ${c.thermal_adequate ? "OK" : "SUBDIMENSIONADO"}`,
    ]);
  }
  return entries;
}

export function ElectricalStudyPanel() {
  const projectId = useProjectStore((s) => s.projectId);
  const unifiedDoc = useUnifiedProjectStore((s) => s.doc);
  const [kind, setKind] = useState<StudyKind>("short_circuit");
  const derived = useMemo(() => deriveStudyDefaultsFromModel(unifiedDoc, kind), [unifiedDoc, kind]);
  const [values, setValues] = useState<Record<string, string>>(() => derived.values);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    results: ElectricalStudyResults;
    warnings: string[];
    standard: string;
  } | null>(null);

  const canonicalStudy = unifiedDoc.studies[`study_${kind}`];

  useEffect(() => {
    setValues(deriveStudyDefaultsFromModel(useUnifiedProjectStore.getState().doc, kind).values);
  }, [kind]);

  const runStudy = useServerFn(runElectricalStudy);
  const listStudies = useServerFn(listElectricalStudies);
  const removeStudy = useServerFn(deleteElectricalStudy);

  const { data: history, refetch } = useQuery({
    queryKey: ["electrical-studies", projectId],
    queryFn: () => listStudies({ data: { projectId } }) as Promise<Array<Record<string, unknown>>>,
    enabled: Boolean(projectId),
  });

  const pickKind = (k: StudyKind) => {
    setKind(k);
    setValues(deriveStudyDefaultsFromModel(useUnifiedProjectStore.getState().doc, k).values);
    setResult(null);
  };

  const syncFromDiagram = () => {
    const fresh = deriveStudyDefaultsFromModel(useUnifiedProjectStore.getState().doc, kind);
    setValues(fresh.values);
    toast.success("Parâmetros carregados dos equipamentos do diagrama.");
  };

  const setField = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    setBusy(true);
    setResult(null);
    try {
      const studyPayload = buildStudy(kind, values);
      const res = (await runStudy({
        data: { projectId, study: studyPayload, persist: true },
      })) as { results: ElectricalStudyResults; warnings: string[]; standard: string };
      setResult(res);
      useUnifiedProjectStore.getState().upsertStudy({
        id: `study_${kind}`,
        studyType: kind,
        title: KIND_LABEL[kind],
        inputEquipmentIds: derived.inputEquipmentIds,
        status: "valid",
        parameters: studyPayload,
        results: res.results as unknown as Record<string, unknown>,
      });
      refetch();
    } catch (err) {
      toast.error(`Falha no cálculo: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeStudy({ data: { id } });
      toast.success("Registro removido.");
      refetch();
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <CardTitle>Estudos Elétricos de Potência</CardTitle>
          </div>
          {canonicalStudy && (
            <Badge
              variant={canonicalStudy.status === "stale" ? "destructive" : "default"}
              className="text-[10px]"
            >
              {canonicalStudy.status === "stale" ? "Desatualizado (Stale)" : "Válido"}
            </Badge>
          )}
        </div>
        <CardDescription>
          Cálculos normativos de apoio. Não substituem projeto executivo nem laudo por profissional
          habilitado (NR-10).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!projectId ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhum projeto carregado.</p>
        ) : (
          <>
            {canonicalStudy?.status === "stale" && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-400 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Warning className="h-4 w-4 shrink-0" />
                  <span>
                    Parâmetros dos equipamentos vinculados foram alterados no diagrama. Sincronize e
                    recalcule o estudo para atualizar os resultados.
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={syncFromDiagram}>
                  <ArrowsClockwise className="mr-1 h-3 w-3" />
                  Sincronizar
                </Button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="space-y-2 flex-1">
                <Label>Estudo</Label>
                <Select value={kind} onValueChange={(v) => pickKind(v as StudyKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={syncFromDiagram}
                title="Carregar parâmetros dos equipamentos do diagrama"
              >
                <ArrowsClockwise className="mr-1.5 h-3.5 w-3.5" />
                Do Diagrama
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kind === "short_circuit" && (
                <>
                  <Field
                    label="Potência"
                    unit="kVA"
                    value={values.power_kVA}
                    onChange={(v) => setField("power_kVA", v)}
                  />
                  <Field
                    label="Tensão sec."
                    unit="V"
                    value={values.secondary_V}
                    onChange={(v) => setField("secondary_V", v)}
                  />
                  <Field
                    label="Impedância"
                    unit="%"
                    value={values.impedance_pct}
                    onChange={(v) => setField("impedance_pct", v)}
                  />
                  <Field
                    label="Tensão barra"
                    unit="V"
                    value={values.voltage_V}
                    onChange={(v) => setField("voltage_V", v)}
                  />
                </>
              )}
              {kind === "selectivity" && (
                <>
                  <Field
                    label="Montante In"
                    unit="A"
                    value={values.upRating}
                    onChange={(v) => setField("upRating", v)}
                  />
                  <Field
                    label="Jusante In"
                    unit="A"
                    value={values.downRating}
                    onChange={(v) => setField("downRating", v)}
                  />
                  <Field
                    label="Corrente defeito"
                    unit="A"
                    value={values.fault}
                    onChange={(v) => setField("fault", v)}
                  />
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Jusante
                    </Label>
                    <Select value={values.downType} onValueChange={(v) => setField("downType", v)}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MCB">MCB</SelectItem>
                        <SelectItem value="MCCB">MCCB</SelectItem>
                        <SelectItem value="fuse">Fusível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {kind === "arc_flash" && (
                <>
                  <Field
                    label="Corrente BC"
                    unit="kA"
                    value={values.ik_kA}
                    onChange={(v) => setField("ik_kA", v)}
                  />
                  <Field
                    label="Tempo corte"
                    unit="s"
                    value={values.clearing}
                    onChange={(v) => setField("clearing", v)}
                  />
                  <Field
                    label="Dist. trabalho"
                    unit="mm"
                    value={values.working}
                    onChange={(v) => setField("working", v)}
                  />
                  <Field
                    label="Entreferro"
                    unit="mm"
                    value={values.gap}
                    onChange={(v) => setField("gap", v)}
                  />
                </>
              )}
              {kind === "thermal" && (
                <>
                  <Field
                    label="Corrente nominal"
                    unit="A"
                    value={values.In}
                    onChange={(v) => setField("In", v)}
                  />
                  <Field
                    label="Corrente partida"
                    unit="A"
                    value={values.Istart}
                    onChange={(v) => setField("Istart", v)}
                  />
                  <Field
                    label="Duração"
                    unit="s"
                    value={values.duration}
                    onChange={(v) => setField("duration", v)}
                  />
                </>
              )}
              {kind === "voltage_drop" && (
                <>
                  <Field
                    label="Corrente"
                    unit="A"
                    value={values.current}
                    onChange={(v) => setField("current", v)}
                  />
                  <Field
                    label="Comprimento"
                    unit="m"
                    value={values.length}
                    onChange={(v) => setField("length", v)}
                  />
                  <Field
                    label="Seção"
                    unit="mm²"
                    value={values.cable}
                    onChange={(v) => setField("cable", v)}
                  />
                  <Field
                    label="Tensão"
                    unit="V"
                    value={values.voltage}
                    onChange={(v) => setField("voltage", v)}
                  />
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Método (NBR 5410)
                    </Label>
                    <Select
                      value={values.method ?? "C"}
                      onValueChange={(v) => setField("method", v)}
                    >
                      <SelectTrigger className="h-8 font-mono text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["A1", "A2", "B1", "B2", "C", "D", "E", "F"] as const).map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field
                    label="Temp. amb."
                    unit="°C"
                    value={values.temp ?? "30"}
                    onChange={(v) => setField("temp", v)}
                  />
                  <Field
                    label="Agrupamento"
                    unit="circ."
                    value={values.grouped ?? "1"}
                    onChange={(v) => setField("grouped", v)}
                  />
                </>
              )}
            </div>

            <Button onClick={handleRun} disabled={busy} className="w-full">
              {busy ? (
                <>
                  <CircleNotch className="mr-2 h-4 w-4 animate-spin" /> Calculando…
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Executar estudo
                </>
              )}
            </Button>

            {result && (
              <div className="space-y-3 rounded-lg border border-border/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 font-medium">
                    <Lightning className="h-4 w-4 text-primary" />
                    Resultado
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {result.standard}
                  </Badge>
                </div>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {renderResults(result.results).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex justify-between gap-4 border-b border-border/30 py-1"
                    >
                      <dt className="text-sm text-muted-foreground">{k}</dt>
                      <dd className="font-mono text-sm font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>

                {result.warnings.length > 0 && (
                  <ul className="space-y-1 text-sm text-amber-500">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {history && history.length > 0 && (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-[10px] uppercase tracking-wider">Data</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">Tipo</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">Norma</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">ms</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.slice(0, 10).map((row) => (
                      <TableRow key={String(row.id)} className="hover:bg-accent/30">
                        <TableCell className="font-mono text-xs">
                          {new Date(String(row.created_at)).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs">{String(row.simulation_type)}</TableCell>
                        <TableCell className="text-xs">{String(row.standard)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {String(row.computation_time_ms ?? "—")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(String(row.id))}
                            aria-label="Remover registro"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ElectricalStudyPanel;
