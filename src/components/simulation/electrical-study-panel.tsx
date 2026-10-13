// Painel de estudos elétricos de potência — curto-circuito (IEC 60909),
// seletividade (IEC 60947), arco elétrico (IEEE 1584), esforço térmico de
// partida e queda de tensão (NBR 5410).
//
// Resultados são apoio de engenharia, não projeto executivo — Termos §10.
import { useState } from "react";
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
import { Calculator, Loader2, Play, Trash2, Zap } from "lucide-react";

type StudyKind = "short_circuit" | "selectivity" | "arc_flash" | "thermal" | "voltage_drop";

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
  voltage_drop: { current: "11.6", length: "45", cable: "4", voltage: "380" },
};

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
      `Circuito ${c.circuitId}`,
      `${c.voltage_drop_pct} % (limite ${c.limit_pct} %) — ${c.within_limit ? "OK" : "EXCEDE"}`,
    ]);
  }
  return entries;
}

export function ElectricalStudyPanel() {
  const projectId = useProjectStore((s) => s.projectId);
  const [kind, setKind] = useState<StudyKind>("short_circuit");
  const [values, setValues] = useState<Record<string, string>>(DEFAULT_VALUES.short_circuit);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    results: ElectricalStudyResults;
    warnings: string[];
    standard: string;
  } | null>(null);

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
    setValues(DEFAULT_VALUES[k]);
    setResult(null);
  };

  const setField = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleRun = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = (await runStudy({
        data: { projectId, study: buildStudy(kind, values), persist: true },
      })) as { results: ElectricalStudyResults; warnings: string[]; standard: string };
      setResult(res);
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
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          <CardTitle>Estudos Elétricos de Potência</CardTitle>
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
            <div className="space-y-2">
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
                </>
              )}
            </div>

            <Button onClick={handleRun} disabled={busy} className="w-full">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calculando…
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
                    <Zap className="h-4 w-4 text-primary" />
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
                            <Trash2 className="h-3.5 w-3.5" />
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
