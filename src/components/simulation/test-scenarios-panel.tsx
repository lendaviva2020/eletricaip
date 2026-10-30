// Painel de cenários de teste — lista, cria, executa e mostra o histórico.
// Tudo atrás de server functions autenticadas; nada de dados mockados.
import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createTestScenario,
  deleteTestScenario,
  listScenarioRuns,
  listTestScenarios,
  runTestScenario,
  type RunSummary,
  type ScenarioSummary,
} from "@/lib/simulation/test-scenarios.functions";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Flask,
  CircleNotch,
  Play,
  Plus,
  Trash,
  CaretDown,
  CaretRight,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";

// ---------------------------------------------------------------------------
// Tipos (espelham o retorno das server functions)
// ---------------------------------------------------------------------------

type ScenarioType =
  "normal" | "fault_injection" | "protection_test" | "interlock_test" | "performance" | "custom";

interface RunResult {
  runId: string;
  passed: boolean;
  failures: string[];
  metrics: {
    maxCurrent_A: number;
    maxTemp_C: number;
    motorsRunning: number;
    exhaustorsRunning: number;
    exhaustCycles: number;
    estopLatched: boolean;
    generalAlarm: boolean;
    trips: Array<{ motorId: string; code: string; t: number }>;
  };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Roteiros determinísticos por tipo de cenário
// ---------------------------------------------------------------------------

interface Preset {
  label: string;
  description: string;
  config: Record<string, unknown>;
  expected: Record<string, unknown>;
}

const START_ALL_MOTORS = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => [`M${String(i + 1).padStart(2, "0")}`, true]),
);

const PRESETS: Record<ScenarioType, Preset> = {
  normal: {
    label: "Partida e operação nominal",
    description:
      "Sobe a planta aos 2 s, mantém 58 s em regime e confere que todos os motores partem.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [{ at_s: 2, start: true, motorCmd: START_ALL_MOTORS }],
    },
    expected: { allMotorsRunning: true },
  },
  fault_injection: {
    label: "Falha injetada (sobrecarga em M01)",
    description:
      "Parte a planta e injeta sobrecarga em M01 aos 15 s; espera-se o disparo da proteção.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [
        { at_s: 2, start: true, motorCmd: START_ALL_MOTORS },
        { at_s: 15, faultInject: { M01: "overload" } },
      ],
    },
    expected: { anyMotorTripped: true },
  },
  protection_test: {
    label: "Teste de proteção (curto em M02)",
    description:
      "Parte a planta e injeta curto-circuito em M02 aos 10 s; a proteção instantânea deve agir.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [
        { at_s: 2, start: true, motorCmd: START_ALL_MOTORS },
        { at_s: 10, faultInject: { M02: "short" } },
      ],
    },
    expected: { anyMotorTripped: true },
  },
  interlock_test: {
    label: "Intertrava de E-STOP",
    description:
      "Parte a planta e aciona o E-STOP aos 10 s; o sistema deve travar e só liberar no RESET.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [
        { at_s: 2, start: true, motorCmd: START_ALL_MOTORS },
        { at_s: 10, estop: true },
        { at_s: 25, estop: false, reset: true },
      ],
    },
    expected: { noMotorTripped: true },
  },
  performance: {
    label: "Desempenho de partida",
    description: "Mede corrente e temperatura de pico na partida de todos os motores simultâneos.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [{ at_s: 1, start: true, motorCmd: START_ALL_MOTORS }],
    },
    expected: { allMotorsRunning: true, maxTemp_C: 105 },
  },
  custom: {
    label: "Roteiro livre",
    description: "Parte a planta aos 2 s e observa o comportamento sem asserções automáticas.",
    config: {
      duration_s: 60,
      dt_s: 0.1,
      steps: [{ at_s: 2, start: true, motorCmd: START_ALL_MOTORS }],
    },
    expected: {},
  },
};

const TYPE_LABEL: Record<ScenarioType, string> = {
  normal: "Normal",
  fault_injection: "Falha injetada",
  protection_test: "Proteção",
  interlock_test: "Intertrava",
  performance: "Desempenho",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------

function StatusBadge({ result }: { result: Record<string, unknown> | null }) {
  if (!result) return <Badge variant="secondary">Nunca executado</Badge>;
  return result.passed === true ? (
    <Badge className="bg-emerald-600/15 text-emerald-600">Aprovado</Badge>
  ) : (
    <Badge variant="destructive">Reprovado</Badge>
  );
}

function RunHistory({ scenarioId }: { scenarioId: string }) {
  const listRuns = useServerFn(listScenarioRuns);
  const { data, isLoading } = useQuery({
    queryKey: ["scenario-runs", scenarioId],
    queryFn: () => listRuns({ data: { scenarioId } }) as Promise<RunSummary[]>,
    enabled: Boolean(scenarioId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <CircleNotch className="h-3.5 w-3.5 animate-spin" /> Carregando execuções…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Nenhuma execução registrada ainda.</p>;
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-[10px] uppercase tracking-wider">Início</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Duração</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Resultado</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Pico I (A)</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Pico T (°C)</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider">Mot.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((run) => {
            const metrics = run.metrics;
            return (
              <TableRow key={run.id} className="hover:bg-accent/30">
                <TableCell className="font-mono text-xs">
                  {new Date(run.startedAt).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {run.durationMs != null ? `${run.durationMs} ms` : "—"}
                </TableCell>
                <TableCell>
                  {run.passed === null ? (
                    <Badge variant="secondary">—</Badge>
                  ) : run.passed ? (
                    <Badge className="bg-emerald-600/15 text-emerald-600">Aprovado</Badge>
                  ) : (
                    <Badge variant="destructive">Reprovado</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {metrics ? metrics.maxCurrent_A : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {metrics ? metrics.maxTemp_C : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {metrics ? metrics.motorsRunning : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CreateDialog({
  open,
  projectId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ScenarioType>("normal");
  const createScenario = useServerFn(createTestScenario);
  const [busy, setBusy] = useState(false);

  const preset = PRESETS[type];

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para o cenário.");
      return;
    }
    setBusy(true);
    try {
      await createScenario({
        data: {
          projectId,
          name: name.trim(),
          description: preset.description,
          scenarioType: type,
          config: preset.config,
          expected: preset.expected,
          tags: [TYPE_LABEL[type]],
        },
      });
      toast.success("Cenário criado.");
      setName("");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(`Falha ao criar cenário: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cenário de teste</DialogTitle>
          <DialogDescription>
            O roteiro é determinístico: a mesma configuração produz sempre o mesmo resultado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Nome</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Partida nominal da linha 1"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de cenário</Label>
            <Select value={type} onValueChange={(v) => setType(v as ScenarioType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
            <p className="font-medium">{preset.label}</p>
            <p className="mt-1 text-muted-foreground">{preset.description}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              duração {String(preset.config.duration_s)}s · passo {String(preset.config.dt_s)}s
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunResultCard({ result, onClose }: { result: RunResult; onClose: () => void }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        result.passed
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-destructive/40 bg-destructive/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">{result.passed ? "Cenário aprovado" : "Cenário reprovado"}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-border/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Pico corrente
          </p>
          <p className="font-mono text-lg font-bold">{result.metrics.maxCurrent_A} A</p>
        </div>
        <div className="rounded border border-border/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Pico temperatura
          </p>
          <p className="font-mono text-lg font-bold">{result.metrics.maxTemp_C} °C</p>
        </div>
        <div className="rounded border border-border/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Motores ativos
          </p>
          <p className="font-mono text-lg font-bold">{result.metrics.motorsRunning}</p>
        </div>
        <div className="rounded border border-border/50 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ciclos exaustor
          </p>
          <p className="font-mono text-lg font-bold">{result.metrics.exhaustCycles}</p>
        </div>
      </div>

      {result.metrics.trips.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Proteções acionadas:{" "}
          {result.metrics.trips.map((t) => `${t.motorId} (${t.code})`).join(", ")}
        </p>
      )}

      {result.failures.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-destructive">
          {result.failures.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              {f}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        Execução {result.durationMs} ms · registro {result.runId}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel principal
// ---------------------------------------------------------------------------

export function TestScenariosPanel() {
  const projectId = useProjectStore((s) => s.projectId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const listScenarios = useServerFn(listTestScenarios);
  const runScenario = useServerFn(runTestScenario);
  const removeScenario = useServerFn(deleteTestScenario);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["test-scenarios", projectId],
    queryFn: () => listScenarios({ data: { projectId } }) as Promise<ScenarioSummary[]>,
    enabled: Boolean(projectId),
  });

  const scenarios = useMemo(() => data ?? [], [data]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["test-scenarios", projectId] });
    queryClient.invalidateQueries({ queryKey: ["scenario-runs"] });
  }, [queryClient, projectId]);

  const handleRun = async (scenarioId: string) => {
    setRunningId(scenarioId);
    setLastResult(null);
    try {
      const result = (await runScenario({ data: { scenarioId } })) as RunResult;
      setLastResult(result);
      invalidate();
    } catch (err) {
      toast.error(`Falha ao executar cenário: ${(err as Error).message}`);
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (scenarioId: string) => {
    try {
      await removeScenario({ data: { id: scenarioId } });
      toast.success("Cenário excluído.");
      invalidate();
    } catch (err) {
      toast.error(`Falha ao excluir: ${(err as Error).message}`);
    }
  };

  if (!projectId) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flask className="h-4 w-4" />
            Cenários de Teste
          </CardTitle>
          <CardDescription>
            Selecione um projeto para gerenciar cenários de simulação.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flask className="h-4 w-4" />
            <CardTitle>Cenários de Teste</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <ArrowCounterClockwise className="mr-1 h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Novo
            </Button>
          </div>
        </div>
        <CardDescription>
          Execução headless determinística do motor de planta (8 motores + 2 exaustores). Nenhum
          equipamento real é acionado.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <CircleNotch className="h-4 w-4 animate-spin" /> Carregando cenários…
          </div>
        ) : scenarios.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum cenário cadastrado neste projeto.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Criar primeiro cenário
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8" />
                  <TableHead className="text-[10px] uppercase tracking-wider">Nome</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Tipo</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Último resultado
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Última execução
                  </TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((s) => (
                  <Fragment key={s.id}>
                    <TableRow className="hover:bg-accent/30">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                          aria-label="Histórico de execuções"
                        >
                          {expanded === s.id ? (
                            <CaretDown className="h-3.5 w-3.5" />
                          ) : (
                            <CaretRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        {s.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {s.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABEL[s.scenarioType as ScenarioType] ?? s.scenarioType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge result={s.lastRunResult} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={runningId !== null}
                            onClick={() => handleRun(s.id)}
                          >
                            {runningId === s.id ? (
                              <CircleNotch className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="mr-1 h-3.5 w-3.5" />
                            )}
                            Executar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(s.id)}
                            aria-label="Excluir cenário"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded === s.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/10 px-4 py-3">
                          <RunHistory scenarioId={s.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {lastResult && <RunResultCard result={lastResult} onClose={() => setLastResult(null)} />}
      </CardContent>

      <CreateDialog
        open={createOpen}
        projectId={projectId}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />
    </Card>
  );
}

export default TestScenariosPanel;
