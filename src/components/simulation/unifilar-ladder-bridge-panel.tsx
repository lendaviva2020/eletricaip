// Painel da ponte Unifilar → Ladder
// Analisa o diagrama unifilar, mostra o mapeamento gerado e permite aplicar o
// programa Ladder resultante e persistir o mapeamento no banco.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useProjectStore } from "@/lib/project-store";
import {
  analyzeUnifilarForLadder,
  applyProgramToEditor,
  loadMappings,
  saveMappings,
  type BridgeResult,
} from "@/lib/simulation/unifilar-ladder-bridge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Zap, CheckCircle2, AlertCircle, Save } from "lucide-react";

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold font-mono ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function AnalyzePrompt({ onAnalyze, busy }: { onAnalyze: () => void; busy: boolean }) {
  return (
    <div className="text-center py-8">
      <p className="text-muted-foreground mb-4">
        Analise o diagrama unifilar atual para gerar mapeamentos automáticos para o editor Ladder.
      </p>
      <Button onClick={onAnalyze} disabled={busy} className="w-full">
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Analisando...
          </>
        ) : (
          <>
            <Zap className="mr-2 h-4 w-4" />
            Analisar Unifilar
          </>
        )}
      </Button>
    </div>
  );
}

function ResultView({
  result,
  onAnalyze,
  busy,
  onApply,
  onSave,
  saving,
}: {
  result: BridgeResult;
  onAnalyze: () => void;
  busy: boolean;
  onApply: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Mapeamentos" value={result.mappings?.length || 0} />
        <SummaryCard
          label="Motores"
          value={result.mappings?.filter((m) => m.equipmentType === "motor").length || 0}
          className="text-success"
        />
        <SummaryCard
          label="Exaustores"
          value={result.mappings?.filter((m) => m.equipmentType === "exhaustor").length || 0}
          className="text-primary"
        />
        <SummaryCard
          label="Rungs Ladder"
          value={result.ladderProgram?.rungsCount || 0}
          className="text-primary"
        />
      </div>

      {result.warnings?.length ? (
        <div className="rounded border border-warning/30 bg-warning/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-warning font-semibold mb-2">
            Avisos
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.errors?.length ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-destructive font-semibold mb-2">
            Erros
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {result.errors.map((e, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-[10px] uppercase tracking-wider">Componente</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Tipo</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Tag Ladder</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Mapeamento</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">Principal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.mappings?.map((m, i) => (
              <TableRow key={i} className="hover:bg-accent/30">
                <TableCell className="font-mono text-sm font-medium">{m.equipmentId}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {m.equipmentType}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs truncate max-w-[180px]">
                  {m.ladderTagName}
                </TableCell>
                <TableCell className="text-[10px] uppercase tracking-wider">
                  {m.mappingType}
                </TableCell>
                <TableCell className="text-center">
                  {m.isPrimary ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success mx-auto" />
                  ) : (
                    <span className="text-muted-foreground text-[10px]">Secundário</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
        <Button onClick={onApply} className="flex-1 min-w-[180px]">
          <Zap className="mr-2 h-4 w-4" />
          Aplicar no Editor Ladder
        </Button>
        <Button variant="outline" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          Salvar mapeamento
        </Button>
        <Button variant="outline" onClick={onAnalyze} disabled={busy}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reanalisar
        </Button>
      </div>
    </div>
  );
}

export function UnifilarLadderBridgePanel() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<BridgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectId = useProjectStore((s) => s.projectId);

  useEffect(() => {
    if (!projectId) {
      setResult(null);
      setError(null);
      return;
    }
    // Carrega o mapeamento persistido do projeto, se houver.
    let cancelled = false;
    loadMappings(projectId)
      .then((mappings) => {
        if (cancelled || mappings.length === 0) return;
        setResult({
          success: true,
          mappings,
          warnings: ["Mapeamento carregado do banco. Reanalise para atualizar."],
          errors: [],
        });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Falha ao carregar mapeamento");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleAnalyze = useCallback(() => {
    if (!projectId) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = analyzeUnifilarForLadder(
        useProjectStore.getState().nodes,
        useProjectStore.getState().edges,
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsAnalyzing(false);
    }
  }, [projectId]);

  const handleApply = useCallback(() => {
    if (!result?.ladderProgram?.stCode) {
      toast.error("Analise o unifilar antes de aplicar no editor Ladder.");
      return;
    }
    try {
      const rungs = applyProgramToEditor(result.ladderProgram.stCode);
      toast.success(`Programa aplicado: ${rungs} rungs carregados no editor Ladder.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aplicar programa");
    }
  }, [result]);

  const handleSave = useCallback(async () => {
    if (!projectId || !result || result.mappings.length === 0) return;
    setIsSaving(true);
    try {
      await saveMappings(projectId, result.mappings);
      toast.success(`Mapeamento salvo (${result.mappings.length} registros).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar mapeamento");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, result]);

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <CardTitle>Ponte Unifilar → Ladder</CardTitle>
          </div>
          <Badge variant={result ? "default" : "secondary"}>
            {result ? "Mapeado" : "Pendente"}
          </Badge>
        </div>
        {!projectId ? (
          <CardDescription>Selecione um projeto para visualizar a ponte</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!projectId ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nenhum projeto carregado.
          </div>
        ) : result ? (
          <ResultView
            result={result}
            onAnalyze={handleAnalyze}
            busy={isAnalyzing}
            onApply={handleApply}
            onSave={handleSave}
            saving={isSaving}
          />
        ) : (
          <AnalyzePrompt onAnalyze={handleAnalyze} busy={isAnalyzing} />
        )}
      </CardContent>
    </Card>
  );
}

export default UnifilarLadderBridgePanel;
