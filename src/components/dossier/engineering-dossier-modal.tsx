// Industrial Engineering Dossier Interactive Modal & Review Cockpit
// Provides real-time technical review, missing inputs resolution,
// normative compliance verification, formal engineering approval, and multi-format exports.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Download,
  FileSpreadsheet,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  Lock,
  Unlock,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getEngineeringDossier, approveAndEmitDossier } from "@/lib/dossier/dossier.functions";
import { generateEngineeringDossierPdf } from "@/lib/dossier/pdf-builder";
import { buildDossierExcelWorkbook, buildBomCsv } from "@/lib/dossier/export-spreadsheets";
import { generatePlcopenXml, generateStructuredText } from "@/lib/dossier/plcopen";
import { extractCanvasData } from "@/lib/dossier/extractor";
import { BOM_GROUP_NAMES, type BomGroupCategory, type CompleteEngineeringDossier } from "@/lib/dossier/types";

export interface EngineeringDossierModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EngineeringDossierModal({
  projectId,
  open,
  onOpenChange,
}: EngineeringDossierModalProps) {
  const getDossierFn = useServerFn(getEngineeringDossier);
  const approveFn = useServerFn(approveAndEmitDossier);
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [bomFilter, setBomFilter] = useState<string>("all");
  const [bomSearch, setBomSearch] = useState<string>("");
  const [engineerName, setEngineerName] = useState<string>("");
  const [registration, setRegistration] = useState<string>("");
  const [approvalNotes, setApprovalNotes] = useState<string>("");
  const [busyExport, setBusyExport] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["engineering-dossier", projectId],
    queryFn: () => getDossierFn({ data: { projectId } }),
    enabled: open && !!projectId,
  });

  const dossier = data?.dossier as CompleteEngineeringDossier | undefined;

  const approveMut = useMutation({
    mutationFn: () =>
      approveFn({
        data: {
          projectId,
          engineerName: engineerName || "Engenheiro Responsável Técnico",
          professionalRegistration: registration || "CREA / CFT",
          approvalNotes,
          syncBomToDatabase: true,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Dossiê aprovado com sucesso! Nova revisão: Rev. ${res.revision}`);
      qc.invalidateQueries({ queryKey: ["engineering-dossier", projectId] });
      qc.invalidateQueries({ queryKey: ["bom", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha na aprovação técnica.");
    },
  });

  // Helpers de download no navegador
  function downloadBlob(content: any, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf() {
    if (!dossier) return;
    setBusyExport("pdf");
    try {
      const pdf = generateEngineeringDossierPdf(dossier);
      pdf.save(`${dossier.projectName.replace(/[^a-z0-9]/gi, "_")}_Dossie_Tecnico_Rev${dossier.revision}.pdf`);
      toast.success("PDF do Dossiê Técnico baixado com sucesso!");
    } catch (e: any) {
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadExcel() {
    if (!dossier) return;
    setBusyExport("xlsx");
    try {
      const wb = buildDossierExcelWorkbook(dossier);
      downloadBlob(
        wb,
        `${dossier.projectName.replace(/[^a-z0-9]/gi, "_")}_Engenharia_Rev${dossier.revision}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      toast.success("Pasta de trabalho Excel com 5 abas exportada!");
    } catch (e: any) {
      toast.error(`Erro ao gerar Excel: ${e.message}`);
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadBomCsv() {
    if (!dossier) return;
    setBusyExport("csv");
    try {
      const csv = buildBomCsv(dossier);
      downloadBlob(csv, `${dossier.projectName.replace(/[^a-z0-9]/gi, "_")}_BOM_Rev${dossier.revision}.csv`, "text/csv;charset=utf-8;");
      toast.success("CSV da Lista de Materiais exportado!");
    } catch (e: any) {
      toast.error(`Erro ao gerar CSV: ${e.message}`);
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadPlcopenXml() {
    if (!dossier) return;
    setBusyExport("xml");
    try {
      const dummyExtracted = extractCanvasData({
        projectId: dossier.projectId,
        projectName: dossier.projectName,
        clientName: dossier.clientName,
      });
      const xml = generatePlcopenXml(dummyExtracted, dossier.plcProgram);
      downloadBlob(xml, `${dossier.projectName.replace(/[^a-z0-9]/gi, "_")}_PLCopen_TC6.xml`, "application/xml;charset=utf-8;");
      toast.success("Arquivo PLCopen XML exportado com sucesso!");
    } catch (e: any) {
      toast.error(`Erro ao gerar XML: ${e.message}`);
    } finally {
      setBusyExport(null);
    }
  }

  function handleDownloadStructuredText() {
    if (!dossier) return;
    setBusyExport("st");
    try {
      const st = generateStructuredText(dossier.plcProgram);
      downloadBlob(st, `${dossier.projectName.replace(/[^a-z0-9]/gi, "_")}_Programa_CLP.st`, "text/plain;charset=utf-8;");
      toast.success("Código Structured Text (.st) exportado!");
    } catch (e: any) {
      toast.error(`Erro ao gerar código ST: ${e.message}`);
    } finally {
      setBusyExport(null);
    }
  }

  const criticalIssues = dossier?.normativeReport.findings.filter(
    (f) => f.status === "REPROVADO" && f.severity === "critical",
  ) ?? [];

  const filteredBom = (dossier?.bom ?? []).filter((b) => {
    if (bomFilter !== "all" && b.category !== bomFilter) return false;
    if (bomSearch.trim()) {
      const q = bomSearch.toLowerCase();
      return (
        b.tag.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        (b.circuitRef && b.circuitRef.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Header do Dossiê */}
        <div className="px-6 py-4 border-b border-border bg-card/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Dossiê Técnico de Engenharia Elétrica
                </DialogTitle>
                {dossier && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted border border-border text-foreground font-medium">
                    Rev. {dossier.revision}
                  </span>
                )}
                {dossier?.approval.isApproved ? (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-success/15 text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Aprovado
                  </span>
                ) : (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-warning/15 text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Minuta Técnica
                  </span>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {dossier ? `${dossier.projectName} · ${dossier.clientName}` : "Carregando topologia do Canvas..."}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Recalcular
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={!dossier || !!busyExport}
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              {busyExport === "pdf" ? "Gerando..." : "Baixar Dossiê (PDF)"}
            </Button>
          </div>
        </div>

        {/* Corpo do Modal com Abas Técnicas */}
        <div className="flex-1 min-h-0 flex flex-col bg-background">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Extraindo nós e processando cálculos determinísticos...</p>
              </div>
            </div>
          ) : isError || !dossier ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-destructive">
              <AlertOctagon className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold">Erro ao processar projeto</p>
              <p className="text-xs text-muted-foreground mt-1">{error?.message || "Projeto não encontrado"}</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 border-b border-border bg-muted/20 shrink-0">
                <TabsList className="h-10 bg-transparent p-0 gap-4">
                  <TabsTrigger
                    value="overview"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    1. Visão Geral
                  </TabsTrigger>
                  <TabsTrigger
                    value="calculations"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    2. Memória de Cálculo ({dossier.calculationMemory.circuits.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="bom"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    3. Lista de Materiais ({dossier.bom.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="wiring"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    4. Fiação e CLP
                  </TabsTrigger>
                  <TabsTrigger
                    value="normative"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs flex items-center gap-1.5"
                  >
                    5. Normas e Riscos
                    {criticalIssues.length > 0 && (
                      <span className="h-4 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                        {criticalIssues.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="approval"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    6. Homologação & ART
                  </TabsTrigger>
                  <TabsTrigger
                    value="exports"
                    className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
                  >
                    7. Exportações
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ABA 1: VISÃO GERAL */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-6 m-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <p className="text-xs text-muted-foreground">Potência Instalada</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {dossier.calculationMemory.summary.totalInstalledPowerKw} <span className="text-sm font-normal text-muted-foreground">kW</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Demanda: {dossier.calculationMemory.summary.totalDemandPowerKw} kW</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <p className="text-xs text-muted-foreground">Potência Aparente</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {dossier.calculationMemory.summary.totalApparentPowerKva} <span className="text-sm font-normal text-muted-foreground">kVA</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Trafo sugerido: {dossier.calculationMemory.summary.recommendedTransformerKva} kVA</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <p className="text-xs text-muted-foreground">Alimentador Geral</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {dossier.calculationMemory.summary.mainFeederCurrentIbA} <span className="text-sm font-normal text-muted-foreground">A</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Cabo: {dossier.calculationMemory.summary.mainFeederCableMm2} mm² Cu</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <p className="text-xs text-muted-foreground">Disjuntor Geral</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {dossier.calculationMemory.summary.mainBreakerRatingInA} <span className="text-sm font-normal text-muted-foreground">A</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Icu: {dossier.calculationMemory.summary.mainBreakerIcuKa} kA (380V)</p>
                  </div>
                </div>

                {criticalIssues.length > 0 && (
                  <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 flex items-start gap-3">
                    <AlertOctagon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-destructive">
                        {criticalIssues.length} Não-Conformidade(s) Crítica(s) Encontrada(s)
                      </h4>
                      <p className="text-xs text-destructive/90 mt-1">
                        A emissão técnica oficial do dossiê está temporariamente bloqueada. Revise a aba &ldquo;Normas e Riscos&rdquo; para solucionar os apontamentos no Canvas.
                      </p>
                    </div>
                  </div>
                )}

                <div className="border border-border rounded-lg p-5 bg-card space-y-4">
                  <h4 className="text-sm font-semibold">Parâmetros Nominais da Instalação</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Tensão Secundária:</span>
                      <span className="font-semibold">{dossier.calculationMemory.summary.systemVoltageV} V (F-F)</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Frequência:</span>
                      <span className="font-semibold">{dossier.calculationMemory.summary.nominalFrequencyHz} Hz</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Aterramento:</span>
                      <span className="font-semibold">{dossier.calculationMemory.summary.earthingScheme} (Separado)</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Escopo Identificado:</span>
                      <span className="font-semibold uppercase">{dossier.scope}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ABA 2: MEMÓRIA DE CÁLCULO */}
              <TabsContent value="calculations" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 font-semibold border-b border-border">
                      <tr>
                        <th className="px-3 py-2.5">Circuito</th>
                        <th className="px-3 py-2.5">Descrição</th>
                        <th className="px-3 py-2.5 text-right">Potência</th>
                        <th className="px-3 py-2.5 text-right">Ib (A)</th>
                        <th className="px-3 py-2.5">Cabo Fase</th>
                        <th className="px-3 py-2.5 text-right">I'z (A)</th>
                        <th className="px-3 py-2.5">Disjuntor</th>
                        <th className="px-3 py-2.5 text-right">ΔV (%)</th>
                        <th className="px-3 py-2.5">Condutor PE</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {dossier.calculationMemory.circuits.map((c) => (
                        <tr key={c.circuitCode} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono font-medium text-foreground">{c.circuitCode}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.description}</td>
                          <td className="px-3 py-2 text-right">{c.powerKw} kW</td>
                          <td className="px-3 py-2 text-right font-medium">{c.designCurrentIbA} A</td>
                          <td className="px-3 py-2 font-mono">{c.selectedCableMm2} mm²</td>
                          <td className="px-3 py-2 text-right">{c.correctedAmpacityIzA} A</td>
                          <td className="px-3 py-2">{c.breakerRatingInA}A ({c.breakerCurve})</td>
                          <td className="px-3 py-2 text-right font-mono">{c.voltageDropPct}%</td>
                          <td className="px-3 py-2 font-mono">{c.peCableMm2} mm²</td>
                          <td className="px-3 py-2 text-center">
                            {c.ampacityCheckPass && c.voltageDropPass ? (
                              <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-semibold text-[10px]">
                                OK
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-semibold text-[10px]">
                                FALHA
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* ABA 3: LISTA COMPLETA DE MATERIAIS (BOM) */}
              <TabsContent value="bom" className="flex-1 overflow-y-auto p-6 space-y-4 m-0 flex flex-col">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar por tag, descrição ou circuito..."
                      value={bomSearch}
                      onChange={(e) => setBomSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <select
                    value={bomFilter}
                    onChange={(e) => setBomFilter(e.target.value)}
                    className="h-8 px-2.5 text-xs rounded-md border border-border bg-background text-foreground"
                  >
                    <option value="all">Todos os 10 Grupos Industriais</option>
                    {Object.entries(BOM_GROUP_NAMES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.pt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border border-border rounded-lg overflow-y-auto flex-1">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 font-semibold border-b border-border sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5">Tag</th>
                        <th className="px-3 py-2.5">Grupo</th>
                        <th className="px-3 py-2.5">Descrição Técnica</th>
                        <th className="px-3 py-2.5 text-right">Qtd</th>
                        <th className="px-3 py-2.5">Circuito</th>
                        <th className="px-3 py-2.5">Origem</th>
                        <th className="px-3 py-2.5">Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredBom.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono font-bold text-foreground">{item.tag}</td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground">
                            {BOM_GROUP_NAMES[item.category]?.pt.split(".")[1]?.trim() || item.category}
                          </td>
                          <td className="px-3 py-2 font-medium">{item.description}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                            {item.circuitRef ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[10px] uppercase text-muted-foreground">{item.sourceKind}</td>
                          <td className="px-3 py-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border font-medium">
                              {item.validationStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* ABA 4: FIAÇÃO E CLP */}
              <TabsContent value="wiring" className="flex-1 overflow-y-auto p-6 space-y-6 m-0">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Régua de Bornes de Saída (Borneira X1)</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 font-semibold border-b border-border">
                        <tr>
                          <th className="px-3 py-2">Borne</th>
                          <th className="px-3 py-2">Fio</th>
                          <th className="px-3 py-2">Conexão Interna (Painel)</th>
                          <th className="px-3 py-2">Conexão Externa (Campo)</th>
                          <th className="px-3 py-2">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {dossier.terminalsSchedule.map((t) => (
                          <tr key={`${t.blockId}-${t.terminalNumber}`}>
                            <td className="px-3 py-1.5 font-mono font-bold">{t.blockId}:{t.terminalNumber}</td>
                            <td className="px-3 py-1.5 font-mono">{t.wireTag}</td>
                            <td className="px-3 py-1.5">{t.internalEquipment} [{t.internalTerminal}]</td>
                            <td className="px-3 py-1.5">{t.externalEquipment} [{t.externalTerminal}]</td>
                            <td className="px-3 py-1.5 text-[10px] uppercase">{t.signalType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Mapa de Canais de I/O do CLP ({dossier.plcProgram.cpuModel})</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 font-semibold border-b border-border">
                        <tr>
                          <th className="px-3 py-2">Endereço IEC</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Tag Simbólica</th>
                          <th className="px-3 py-2">Descrição Funcional</th>
                          <th className="px-3 py-2">Sinal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {dossier.plcProgram.ioMappings.map((io) => (
                          <tr key={io.address}>
                            <td className="px-3 py-1.5 font-mono font-bold">{io.address}</td>
                            <td className="px-3 py-1.5 font-mono">{io.direction}</td>
                            <td className="px-3 py-1.5 font-medium">{io.symbolicTag}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{io.description}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{io.signalType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* ABA 5: NORMAS E RISCOS */}
              <TabsContent value="normative" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-card border border-border">
                    <span className="text-muted-foreground block text-[10px]">Total Verificado</span>
                    <span className="font-bold text-base">{dossier.normativeReport.summary.totalChecked}</span>
                  </div>
                  <div className="p-2 rounded bg-success/10 border border-success/30 text-success">
                    <span className="block text-[10px]">Validados</span>
                    <span className="font-bold text-base">{dossier.normativeReport.summary.validatedCount}</span>
                  </div>
                  <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive">
                    <span className="block text-[10px]">Reprovados</span>
                    <span className="font-bold text-base">{dossier.normativeReport.summary.reprovedCount}</span>
                  </div>
                  <div className="p-2 rounded bg-warning/10 border border-warning/30 text-warning">
                    <span className="block text-[10px]">Pendentes</span>
                    <span className="font-bold text-base">{dossier.normativeReport.summary.pendingCount}</span>
                  </div>
                  <div className="p-2 rounded bg-muted border border-border text-foreground">
                    <span className="block text-[10px]">Revisão Técnica</span>
                    <span className="font-bold text-base">{dossier.normativeReport.summary.requiresProfessionalReviewCount}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {dossier.normativeReport.findings.map((f) => {
                    const isOk = f.status === "VALIDADO";
                    const isWarn = f.status === "REVISAO_PROFISSIONAL_NECESSARIA" || f.severity === "warning";
                    return (
                      <div
                        key={f.id}
                        className={`p-3.5 rounded-lg border text-xs ${
                          isOk
                            ? "bg-card border-border"
                            : isWarn
                              ? "bg-warning/10 border-warning/30"
                              : "bg-destructive/10 border-destructive/40"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className={isOk ? "text-success" : isWarn ? "text-warning" : "text-destructive"}>
                            [{f.status}] {f.standard} {f.clause}: {f.title}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {f.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground leading-relaxed">{f.description}</p>
                        <div className="mt-2 text-[11px] font-mono text-foreground/80">
                          <strong>Ação corretiva:</strong> {f.correctiveAction}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              {/* ABA 6: HOMOLOGAÇÃO & ART */}
              <TabsContent value="approval" className="flex-1 overflow-y-auto p-6 space-y-6 m-0 max-w-2xl">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold">Homologação Técnica do Dossiê</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Conforme exigências do Sistema CONFEA/CREA e NR-10, todo projeto elétrico industrial deve possuir responsável técnico legalmente habilitado.
                    </p>
                  </div>

                  {criticalIssues.length > 0 ? (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-destructive">Aprovação Bloqueada por Segurança</h4>
                        <p className="text-xs text-destructive/90 mt-1">
                          Existem {criticalIssues.length} pendências críticas de segurança no Canvas. Corrija o circuito elétrico para habilitar a aprovação formal.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-success/10 border border-success/30 flex items-start gap-3">
                      <Unlock className="h-5 w-5 text-success shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-success">Projeto Habilitado para Homologação</h4>
                        <p className="text-xs text-success/90 mt-1">
                          Zero não-conformidades críticas. Preencha os campos abaixo para registrar a revisão e carimbar a aprovação técnica.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="eng-name" className="text-xs">Nome do Responsável Técnico</Label>
                      <Input
                        id="eng-name"
                        placeholder="Ex: Eng. Roberto Silveira"
                        value={engineerName}
                        onChange={(e) => setEngineerName(e.target.value)}
                        className="mt-1 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="eng-crea" className="text-xs">Registro Profissional (CREA / CFT)</Label>
                      <Input
                        id="eng-crea"
                        placeholder="Ex: CREA-SP 5069874123 / ART nº 28022026118"
                        value={registration}
                        onChange={(e) => setRegistration(e.target.value)}
                        className="mt-1 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="eng-notes" className="text-xs">Observações da Emissão / Revisão</Label>
                      <Textarea
                        id="eng-notes"
                        placeholder="Notas técnicas de aprovação, alterações de campo ou restrições..."
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        className="mt-1 text-xs"
                        rows={3}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => approveMut.mutate()}
                    disabled={criticalIssues.length > 0 || approveMut.isPending}
                    className="w-full bg-primary text-primary-foreground font-semibold"
                  >
                    {approveMut.isPending ? "Gravando Revisão..." : "Carimbar e Aprovar Emissão Técnica"}
                  </Button>
                </div>
              </TabsContent>

              {/* ABA 7: EXPORTAÇÕES */}
              <TabsContent value="exports" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <FileText className="h-6 w-6 text-primary mb-2" />
                      <h4 className="font-semibold text-sm">Dossiê Completo em PDF</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Capa executiva, memória de cálculo, 10 grupos de BOM, fiação e relatório normativo de múltiplas páginas.
                      </p>
                    </div>
                    <Button onClick={handleDownloadPdf} disabled={!!busyExport} className="mt-4 w-full text-xs">
                      Baixar PDF
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <FileSpreadsheet className="h-6 w-6 text-success mb-2" />
                      <h4 className="font-semibold text-sm">Pasta de Trabalho Excel (.xlsx)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        5 abas automatizadas: Lista de Materiais, Cabos, Régua de Bornes, Mapa I/O e Memória de Cálculo.
                      </p>
                    </div>
                    <Button onClick={handleDownloadExcel} disabled={!!busyExport} variant="outline" className="mt-4 w-full text-xs">
                      Exportar Excel (.xlsx)
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <Layers className="h-6 w-6 text-primary mb-2" />
                      <h4 className="font-semibold text-sm">BOM Industrial (.csv)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Arquivo CSV normalizado com as 10 categorias industriais para integração com ERP ou Compras.
                      </p>
                    </div>
                    <Button onClick={handleDownloadBomCsv} disabled={!!busyExport} variant="outline" className="mt-4 w-full text-xs">
                      Exportar BOM (CSV)
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <Cpu className="h-6 w-6 text-accent-foreground mb-2" />
                      <h4 className="font-semibold text-sm">PLCopen XML (TC6-0201)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Formato padrão IEC 61131-3 para importação no Siemens TIA Portal, CODESYS, Beckhoff TwinCAT e Rockwell.
                      </p>
                    </div>
                    <Button onClick={handleDownloadPlcopenXml} disabled={!!busyExport} variant="outline" className="mt-4 w-full text-xs">
                      Exportar PLCopen XML
                    </Button>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-card flex flex-col justify-between">
                    <div>
                      <Zap className="h-6 w-6 text-warning mb-2" />
                      <h4 className="font-semibold text-sm">Structured Text (.st)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Código fonte completo das redes de comando e parada de emergência em texto estruturado.
                      </p>
                    </div>
                    <Button onClick={handleDownloadStructuredText} disabled={!!busyExport} variant="outline" className="mt-4 w-full text-xs">
                      Exportar Código (.st)
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
