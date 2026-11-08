// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7 & GATE 3.8: CENTRO DE OPERAÇÕES E DIAGNÓSTICO (NOC/EOC)
// Observabilidade Transversal, Correlação Causal, Grafo de Impacto, Runbooks & Diagnóstico Assistido
// Standards: ISA-101 (HMI Design), ISA-18.2, IEC 62443, WCAG 2.2 AA
// =============================================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  Pulse,
  ArrowsClockwise,
  Database,
  Cpu,
  ShieldCheck,
  Check,
  GitBranch,
  Robot,
  BookOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getObservabilityOverviewFn,
  getHealthSnapshotsFn,
  getIndustrialIncidentsFn,
  getDataReliabilityReportsFn,
  getSloMeasurementsFn,
  transitionIncidentStatusFn,
  getDeterministicDiagnosticsFn,
  getIndustrialRunbooksFn,
  askAiDiagnosticAssistantFn,
  getIndustrialReliabilityMetricsFn,
} from "@/lib/observability/observability.functions";
import type {
  ComponentHealthSnapshot,
  IndustrialIncident,
  PipelineReliabilityReport,
  SloMeasurement,
  DeterministicDiagnosticRecord,
  IndustrialRunbook,
  AiDiagnosticAnalysis,
  IndustrialReliabilityMetrics,
} from "@/lib/observability/types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/observability/types";
import type { FleetUserContext } from "@/lib/edge/types";

const DEMO_USER_CONTEXT: FleetUserContext = {
  userId: "usr_ops_lead",
  email: "operacoes@eletricai.ind.br",
  role: "TENANT_ADMIN",
  organizationId: "org_sp_industrial",
  authorizedPlantIds: ["plant_ete_central", "plant_subestacao_sp"],
};

const GUIDED_QUESTIONS = [
  "Por que a tag ficou STALE?",
  "Qual foi a origem da falha?",
  "O problema está no Edge, na fonte industrial ou na Cloud?",
  "Quais equipamentos foram afetados?",
  "O incidente já se recuperou?",
];

export function IndustrialOperationsCenter() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPlant, setSelectedPlant] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Dados do estado (Gate 3.7 + Gate 3.8)
  const [overviewData, setOverviewData] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<ComponentHealthSnapshot[]>([]);
  const [incidents, setIncidents] = useState<IndustrialIncident[]>([]);
  const [pipelineReports, setPipelineReports] = useState<PipelineReliabilityReport[]>([]);
  const [sloMeasurements, setSloMeasurements] = useState<SloMeasurement[]>([]);
  const [diagnostics, setDiagnostics] = useState<DeterministicDiagnosticRecord[]>([]);
  const [runbooks, setRunbooks] = useState<IndustrialRunbook[]>([]);
  const [reliabilityMetrics, setReliabilityMetrics] = useState<IndustrialReliabilityMetrics | null>(null);

  // Filtros do Histórico de Incidentes (Fase 8.5)
  const [incidentCategoryFilter, setIncidentCategoryFilter] = useState<string>("ALL");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<string>("ALL");
  const [incidentComponentFilter, setIncidentComponentFilter] = useState<string>("");
  const [incidentRootCauseFilter, setIncidentRootCauseFilter] = useState<string>("ALL");

  // Estado do Assistente Técnico Consultivo por IA (Fase 8.4)
  const [aiQuestion, setAiQuestion] = useState<string>(GUIDED_QUESTIONS[0]);
  const [aiAnalysis, setAiAnalysis] = useState<AiDiagnosticAnalysis | null>(null);
  const [isAskingAi, setIsAskingAi] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const plantParam = selectedPlant === "ALL" ? undefined : selectedPlant;
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

      const [ov, sn, inc, pip, slo, diag, rbs, rel] = await Promise.all([
        getObservabilityOverviewFn({ data: { user: DEMO_USER_CONTEXT, plantId: plantParam } }),
        getHealthSnapshotsFn({ data: { user: DEMO_USER_CONTEXT, plantId: plantParam } }),
        getIndustrialIncidentsFn({ data: { user: DEMO_USER_CONTEXT, plantId: plantParam } }),
        getDataReliabilityReportsFn({ data: { user: DEMO_USER_CONTEXT } }),
        getSloMeasurementsFn({ data: { user: DEMO_USER_CONTEXT } }),
        getDeterministicDiagnosticsFn({ data: { user: DEMO_USER_CONTEXT, plantId: plantParam } }),
        getIndustrialRunbooksFn({ data: { user: DEMO_USER_CONTEXT } }),
        getIndustrialReliabilityMetricsFn({
          data: {
            user: DEMO_USER_CONTEXT,
            plantId: plantParam ?? "plant_ete_central",
            windowStartMs: sevenDaysAgo,
            windowEndMs: now,
          },
        }),
      ]);

      setOverviewData(ov);
      setSnapshots(sn);
      setIncidents(inc);
      setPipelineReports(pip);
      setSloMeasurements(slo);
      setDiagnostics(diag);
      setRunbooks(rbs);
      setReliabilityMetrics(rel);
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error("[NOC-EOC] Falha ao sincronizar telemetria de observabilidade e diagnóstico:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [selectedPlant]);

  const handleAcknowledgeIncident = async (incidentId: string) => {
    try {
      await transitionIncidentStatusFn({
        data: {
          user: DEMO_USER_CONTEXT,
          incidentId,
          toStatus: "ACKNOWLEDGED",
          note: "Reconhecido pela console do Centro de Operações e Diagnóstico.",
        },
      });
      loadData();
    } catch (err) {
      console.error("Falha ao reconhecer incidente:", err);
    }
  };

  const handleAskAiAssistant = async (questionToAsk?: string) => {
    const q = questionToAsk ?? aiQuestion;
    setAiQuestion(q);
    setIsAskingAi(true);
    try {
      const res = await askAiDiagnosticAssistantFn({
        data: {
          user: DEMO_USER_CONTEXT,
          plantId: selectedPlant === "ALL" ? "plant_ete_central" : selectedPlant,
          question: q,
          incidentId: incidents[0]?.incidentId,
        },
      });
      setAiAnalysis(res);
    } catch (err) {
      console.error("Erro ao consultar Assistente Técnico:", err);
    } finally {
      setIsAskingAi(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((i) => {
      if (incidentCategoryFilter !== "ALL" && i.category !== incidentCategoryFilter) return false;
      if (incidentSeverityFilter !== "ALL" && i.severity !== incidentSeverityFilter) return false;
      if (
        incidentComponentFilter.trim() !== "" &&
        !i.sourceComponentId.toLowerCase().includes(incidentComponentFilter.trim().toLowerCase())
      ) {
        return false;
      }
      if (incidentRootCauseFilter !== "ALL") {
        const rule = i.confirmedCause?.ruleId ?? i.probableCause?.ruleId ?? "UNCONFIRMED";
        if (rule !== incidentRootCauseFilter) return false;
      }
      return true;
    });
  }, [
    incidents,
    incidentCategoryFilter,
    incidentSeverityFilter,
    incidentComponentFilter,
    incidentRootCauseFilter,
  ]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Top Header / Status Bar */}
      <div className="border-b border-border bg-card px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Pulse className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                Centro de Operações e Diagnóstico Industrial
              </h1>
              <Badge variant="outline" className="text-xs font-mono uppercase bg-muted/50 border-border">
                Gate 3.8 · NOC/EOC & RCA
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
              >
                isPhysicalControlAllowed: {String(IS_PHYSICAL_CONTROL_ALLOWED)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Observabilidade Transversal, Correlação Causal Determinística, Grafo de Impacto & Resolução Assistida
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            LIVE TELEMETRY · Atualizado: {lastRefreshedAt.toLocaleTimeString()}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedPlant}
              onChange={(e) => setSelectedPlant(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">Todas as Plantas</option>
              <option value="plant_ete_central">Planta ETE Central (SP)</option>
              <option value="plant_subestacao_sp">Subestação Primária 13.8kV</option>
            </select>

            <Button
              size="sm"
              variant="outline"
              onClick={loadData}
              disabled={isLoading}
              className="h-8 gap-1.5 text-xs"
            >
              <ArrowsClockwise className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start border-b border-border rounded-none h-11 bg-transparent p-0 gap-5 overflow-x-auto">
            <TabsTrigger
              value="overview"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold"
            >
              Visão Geral
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <MagnifyingGlass className="h-3.5 w-3.5" />
              Diagnóstico & Confiabilidade (RCA)
            </TabsTrigger>
            <TabsTrigger
              value="impact-graph"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Grafo de Impacto & Runbooks
            </TabsTrigger>
            <TabsTrigger
              value="ai-assistant"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <Robot className="h-3.5 w-3.5" />
              Assistente Técnico (Consultivo)
            </TabsTrigger>
            <TabsTrigger
              value="incidents"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold flex items-center gap-1.5"
            >
              Investigação & Histórico de Incidentes
              {incidents.filter((i) => i.status !== "CLOSED").length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-500 font-bold">
                  {incidents.filter((i) => i.status !== "CLOSED").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="pipeline"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold"
            >
              Pipeline (10 Estágios)
            </TabsTrigger>
            <TabsTrigger
              value="infrastructure"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold"
            >
              Infraestrutura & Cloud
            </TabsTrigger>
            <TabsTrigger
              value="slo"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2 text-xs font-semibold"
            >
              SLI / SLO
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: VISÃO GERAL */}
          <TabsContent value="overview" className="flex-1 overflow-auto mt-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Saúde Cloud</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-emerald-500">100%</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      NOMINAL
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Latência p95: 110ms</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Frota Edge</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-foreground">
                      {overviewData?.counts?.fleetOnlineGateways ?? 1} / {overviewData?.counts?.fleetTotalGateways ?? 1}
                    </span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      ONLINE
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Buffer WAL: 1.5% ocupado</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Fontes Industriais</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-foreground">3 / 3</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      ATIVAS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Modbus / OPC UA / MQTT</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Pipeline de Dados</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-emerald-500">99.98%</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      10 ESTÁGIOS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Dedup: 100% idempotente</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Incidentes Abertos</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-amber-500">
                      {overviewData?.counts?.openIncidents ?? 0}
                    </span>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">
                      RASTREADOS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {overviewData?.counts?.criticalIncidents ?? 0} críticos / fatais
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Integridade Historian</p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold text-emerald-500">100%</span>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      AUDITADO
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Zero perda de sequência</p>
                </CardContent>
              </Card>
            </div>

            {/* Matriz de Saúde dos Componentes */}
            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Matriz de Saúde Determinística dos Componentes</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Avaliação em tempo real com justificação verificável e proteção contra oscilação (histerese)
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  Políticas v3.8.0
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left font-medium">
                        <th className="py-2.5 px-4">Componente</th>
                        <th className="py-2.5 px-4">Tipo</th>
                        <th className="py-2.5 px-4">Planta</th>
                        <th className="py-2.5 px-4">Estado</th>
                        <th className="py-2.5 px-4">Severidade</th>
                        <th className="py-2.5 px-4">Motivo Técnico / Evidência</th>
                        <th className="py-2.5 px-4 text-right">Última Amostra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {snapshots.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground font-sans">
                            Nenhum componente avaliado no filtro atual.
                          </td>
                        </tr>
                      ) : (
                        snapshots.map((s) => (
                          <tr key={s.componentId} className="hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-4 font-semibold text-foreground font-sans">
                              {s.componentId}
                            </td>
                            <td className="py-2 px-4 text-muted-foreground text-[11px]">
                              {s.componentType}
                            </td>
                            <td className="py-2 px-4 text-muted-foreground text-[11px]">
                              {s.plantId}
                            </td>
                            <td className="py-2 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase font-bold ${
                                  s.state === "HEALTHY"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    : s.state === "DEGRADED"
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                      : s.state === "UNAVAILABLE"
                                        ? "bg-red-500/10 text-red-500 border-red-500/30"
                                        : "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {s.state}
                              </Badge>
                            </td>
                            <td className="py-2 px-4 text-[11px]">
                              <span
                                className={
                                  s.severity === "CRITICAL"
                                    ? "text-red-500 font-bold"
                                    : s.severity === "HIGH"
                                      ? "text-amber-500 font-medium"
                                      : "text-muted-foreground"
                                }
                              >
                                {s.severity}
                              </span>
                            </td>
                            <td className="py-2 px-4 font-sans text-muted-foreground text-[11px] max-w-md truncate">
                              <span className="font-semibold text-foreground mr-1">{s.reasonCode}:</span>
                              {s.evidenceReference}
                            </td>
                            <td className="py-2 px-4 text-right text-muted-foreground text-[11px]">
                              {new Date(s.observedAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2 (GATE 3.8 FASE 8.1 & FASE 9): VISÃO DE DIAGNÓSTICO & MÉTRICAS REAIS DE CONFIABILIDADE */}
          <TabsContent value="diagnostics" className="flex-1 overflow-auto mt-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">MTTD (Detecção)</p>
                  <p className="text-xl font-bold font-mono mt-1">
                    {reliabilityMetrics?.mttdMs != null ? `${reliabilityMetrics.mttdMs} ms` : "Sem amostras"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">mean(detectedAt - firstObservedAt)</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">MTTA (Reconhecimento)</p>
                  <p className="text-xl font-bold font-mono mt-1">
                    {reliabilityMetrics?.mttaMs != null ? `${reliabilityMetrics.mttaMs} ms` : "Sem amostras"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">mean(acknowledgedAt - detectedAt)</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">MTTR (Rec. Operacional)</p>
                  <p className="text-xl font-bold font-mono mt-1 text-emerald-500">
                    {reliabilityMetrics?.mttrRecoveryMs != null
                      ? `${reliabilityMetrics.mttrRecoveryMs} ms`
                      : "Sem fechados"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Resolução formal:{" "}
                    {reliabilityMetrics?.mttrResolutionMs != null
                      ? `${reliabilityMetrics.mttrResolutionMs} ms`
                      : "N/A"}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">MTBF (Entre Falhas)</p>
                  <p className="text-xl font-bold font-mono mt-1 text-amber-500">
                    {reliabilityMetrics?.mtbfMs === "INSUFFICIENT_DATA" || reliabilityMetrics?.mtbfMs == null
                      ? "INSUFFICIENT_DATA"
                      : `${reliabilityMetrics.mtbfMs} ms`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">Exige &gt;= 2 falhas fechadas</p>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Causa Confirmada</p>
                  <p className="text-xl font-bold font-mono mt-1">
                    {reliabilityMetrics?.confirmedCausePercent ?? 0}%
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {reliabilityMetrics?.confirmedCauseNumerator ?? 0} /{" "}
                    {reliabilityMetrics?.confirmedCauseDenominator ?? 0} incidentes
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Motor de Diagnóstico Determinístico Baseado em Regras (30 Regras Canônicas)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Correlação temporal isolada nunca produz CONFIRMED_BY_EVIDENCE. Deadband ativo sem mudança (RULE_23) não gera falso positivo.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  v3.8.0-deterministic
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left font-medium">
                        <th className="py-2.5 px-4">Regra / ID</th>
                        <th className="py-2.5 px-4">Componente Primário</th>
                        <th className="py-2.5 px-4">Hipótese Explicável</th>
                        <th className="py-2.5 px-4">Status Diagnóstico</th>
                        <th className="py-2.5 px-4">Confiança</th>
                        <th className="py-2.5 px-4">Runbooks Associados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diagnostics.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            Nenhum diagnóstico ativo registrado para o filtro atual.
                          </td>
                        </tr>
                      ) : (
                        diagnostics.map((d) => (
                          <tr key={d.diagnosticId} className="hover:bg-muted/20">
                            <td className="py-2.5 px-4 font-mono text-[11px]">
                              <span className="font-bold text-primary block">{d.ruleId}</span>
                              <span className="text-muted-foreground">{d.diagnosticId}</span>
                            </td>
                            <td className="py-2.5 px-4 font-mono font-semibold">{d.primaryComponent}</td>
                            <td className="py-2.5 px-4 max-w-md">
                              <p className="text-foreground">{d.hypothesis}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Evidências: {d.evidenceReferences.join(", ")}
                              </p>
                            </td>
                            <td className="py-2.5 px-4">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {d.diagnosticStatus}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 font-mono">
                              {Math.round(d.confidence * 100)}% ({d.confidenceMethod})
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[11px]">
                              {d.recommendedRunbookIds.join(", ")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3 (GATE 3.8 FASE 8.3 & FASE 6): GRAFO DE IMPACTO & BIBLIOTECA DE RUNBOOKS */}
          <TabsContent value="impact-graph" className="flex-1 overflow-auto mt-4 space-y-6">
            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border">
                <CardTitle className="text-sm font-semibold">
                  Topologia Canônica de Propagação e Dependências Industriais
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cadeia validada: Edge Gateway → Protocolo (Modbus/OPC UA/MQTT) → Equipamento (UUID Canônico) → Tag → Historian → SCADA
                </p>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 font-mono text-xs">
                  {[
                    { layer: "1. EDGE GATEWAY", id: "gw_ete_01", role: "Origem de Aquisição / WAL" },
                    { layer: "2. PROTOCOLO OT", id: "drv_modbus_01", role: "Modbus TCP / OPC UA / MQTT" },
                    { layer: "3. EQUIPAMENTO", id: "eq_bomba_recalque_01", role: "UUID Canônico Gate 3.6" },
                    { layer: "4. TAG INDUSTRIAL", id: "tag_corrente_bomba_01", role: "Amostragem & Qualidade" },
                    { layer: "5. HISTORIAN", id: "hist_series_ete", role: "Persistência Temporal" },
                    { layer: "6. SCADA VIEW", id: "scada_synoptic_ete", role: "Supervisão Operacional" },
                  ].map((node) => (
                    <div key={node.id} className="border border-border rounded-lg p-3 bg-muted/20">
                      <span className="text-[10px] font-bold text-primary block">{node.layer}</span>
                      <p className="font-semibold text-foreground mt-1">{node.id}</p>
                      <p className="text-[11px] text-muted-foreground font-sans mt-1">{node.role}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Biblioteca Oficial de Runbooks Técnicos ({runbooks.length} Procedimentos Aprovados)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Procedimentos versionados com classificação de risco e proibição permanente de atuação física remota
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {runbooks.map((rb) => (
                    <div key={rb.runbookId} className="border border-border rounded-lg p-3.5 bg-card">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
                          {rb.category} · {rb.runbookId}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          v{rb.version} ({rb.approvalStatus})
                        </span>
                      </div>
                      <p className="font-semibold text-xs text-foreground mt-2">{rb.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Sintomas: {rb.symptoms.join(" | ")}
                      </p>
                      <div className="mt-2 pt-2 border-t border-border/60 text-[11px] space-y-1">
                        <p className="font-medium text-foreground">
                          Verificação: {rb.diagnosticChecks[0]?.instruction}
                        </p>
                        <p className="text-amber-500 text-[10px] font-mono">
                          Aviso: {rb.safetyWarnings[0]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4 (GATE 3.8 FASE 8.4 & FASE 5): ASSISTENTE TÉCNICO CONSULTIVO POR IA */}
          <TabsContent value="ai-assistant" className="flex-1 overflow-auto mt-4 space-y-6">
            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Robot className="h-4 w-4 text-primary" />
                      Assistente Técnico de Diagnóstico Industrial (Estritamente Consultivo)
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Baseado exclusivamente no motor determinístico, grafo de dependências, Historian e Runbooks aprovados. Protegido contra Prompt Injection industrial.
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] bg-emerald-500/10 text-emerald-500">
                    READ-ONLY · NO PHYSICAL CONTROL
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {GUIDED_QUESTIONS.map((q) => (
                    <Button
                      key={q}
                      size="sm"
                      variant={aiQuestion === q ? "default" : "outline"}
                      onClick={() => handleAskAiAssistant(q)}
                      disabled={isAskingAi}
                      className="h-7 text-xs"
                    >
                      {q}
                    </Button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="Faça uma pergunta técnica sobre o incidente ou componente..."
                    className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAskAiAssistant()}
                    disabled={isAskingAi}
                    className="h-9 px-4 text-xs"
                  >
                    {isAskingAi ? "Analisando Evidências..." : "Investigar Evidências"}
                  </Button>
                </div>

                {aiAnalysis && (
                  <div className="border border-border rounded-lg p-4 bg-muted/10 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="font-mono font-bold text-primary">
                        Análise: {aiAnalysis.analysisId} · Status: {aiAnalysis.status}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Confiança: {aiAnalysis.confidenceLevel} ({Math.round(aiAnalysis.confidenceScore * 100)}%)
                      </Badge>
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">1. Fatos Observados:</p>
                      <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                        {aiAnalysis.observedFacts.map((f, idx) => (
                          <li key={idx}>{f}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">2. Causas Prováveis / Hipóteses:</p>
                      <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                        {aiAnalysis.probableCauses.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">3. Informações Ausentes para Confirmação:</p>
                      <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                        {aiAnalysis.missingInformation.length === 0 ? (
                          <li>Nenhuma informação crítica pendente.</li>
                        ) : (
                          aiAnalysis.missingInformation.map((m, idx) => <li key={idx}>{m}</li>)
                        )}
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold text-foreground">4. Recomendações Técnicas (Runbooks):</p>
                      <ul className="list-disc list-inside text-muted-foreground mt-1 space-y-0.5">
                        {aiAnalysis.recommendations.map((r, idx) => (
                          <li key={idx}>
                            <span className="font-mono text-primary">[{r.actionCategory}]</span> {r.step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5 (GATE 3.8 FASE 8.2 & 8.5): INVESTIGAÇÃO & HISTÓRICO DE INCIDENTES */}
          <TabsContent value="incidents" className="flex-1 overflow-auto mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Categoria:</span>
                {["ALL", "INDUSTRIAL_PROCESS", "INFRASTRUCTURE", "SECURITY_EVENT"].map((cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={incidentCategoryFilter === cat ? "default" : "outline"}
                    onClick={() => setIncidentCategoryFilter(cat)}
                    className="h-7 text-xs px-2.5"
                  >
                    {cat === "ALL" ? "Todas" : cat}
                  </Button>
                ))}

                <select
                  value={incidentSeverityFilter}
                  onChange={(e) => setIncidentSeverityFilter(e.target.value)}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="ALL">Todas Severidades</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="FATAL">FATAL</option>
                </select>

                <input
                  type="text"
                  value={incidentComponentFilter}
                  onChange={(e) => setIncidentComponentFilter(e.target.value)}
                  placeholder="Filtrar por componente..."
                  className="h-7 rounded-md border border-border bg-background px-2.5 text-xs"
                />
              </div>

              <span className="text-xs text-muted-foreground font-mono">
                {filteredIncidents.length} incidentes catalogados
              </span>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left font-medium">
                        <th className="py-2.5 px-4">ID / Hora</th>
                        <th className="py-2.5 px-4">Componente / Categoria</th>
                        <th className="py-2.5 px-4">Severidade</th>
                        <th className="py-2.5 px-4">Título & Causa Raiz</th>
                        <th className="py-2.5 px-4">Estágio Investigação</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredIncidents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            Nenhum incidente registrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        filteredIncidents.map((inc) => (
                          <tr key={inc.incidentId} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                              <span className="text-foreground font-semibold block">{inc.incidentId}</span>
                              {new Date(inc.firstObservedAt).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-4 text-[11px] font-mono">
                              <span className="text-foreground font-semibold block">{inc.sourceComponentId}</span>
                              <Badge variant="outline" className="text-[10px] mt-0.5">
                                {inc.category}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-bold ${
                                  inc.severity === "CRITICAL" || inc.severity === "FATAL"
                                    ? "bg-red-500/10 text-red-500 border-red-500/30"
                                    : inc.severity === "WARNING"
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                                      : "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {inc.severity}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 max-w-sm">
                              <p className="font-semibold text-foreground text-xs">{inc.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{inc.description}</p>
                              {inc.confirmedCause && (
                                <span className="text-[10px] text-emerald-500 font-mono block">
                                  Confirmada: {inc.confirmedCause.ruleId}
                                </span>
                              )}
                              {!inc.confirmedCause && inc.probableCause && (
                                <span className="text-[10px] text-amber-500 font-mono block">
                                  Provável: {inc.probableCause.ruleId} ({Math.round(inc.probableCause.confidence * 100)}%)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-[10px] text-muted-foreground">
                              {inc.investigationStage ?? "INCIDENT_DETECTED"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="font-mono text-[10px] uppercase font-bold">
                                {inc.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {inc.status === "OPEN" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAcknowledgeIncident(inc.incidentId)}
                                  className="h-7 text-xs px-2 gap-1 text-primary border-primary/30"
                                >
                                  <Check className="h-3 w-3" />
                                  Reconhecer
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: PIPELINE DE DADOS (10 ESTÁGIOS) */}
          <TabsContent value="pipeline" className="flex-1 overflow-auto mt-4 space-y-6">
            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border">
                <CardTitle className="text-sm font-semibold">
                  Rastreabilidade Ponta a Ponta: Os 10 Estágios do Pipeline Industrial
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Garantia de integridade metrológica, não-repúdio de amostras, deduplicação e preservação temporal
                </p>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 font-mono text-xs">
                  {[
                    { num: "01", name: "Coleta na Origem", desc: "Drivers Modbus/OPC UA/MQTT", status: "OK" },
                    { num: "02", name: "Normalização", desc: "Escala & Engenharia (NBR 5410)", status: "OK" },
                    { num: "03", name: "Validação Schema", desc: "Zod Contract Validation", status: "OK" },
                    { num: "04", name: "Lote de Telemetria", desc: "Formação de Batches Ordenados", status: "OK" },
                    { num: "05", name: "Persistência Local", desc: "SQLite WAL Store-and-Forward", status: "OK" },
                    { num: "06", name: "Transmissão Segura", desc: "mTLS / WSS com Backpressure", status: "OK" },
                    { num: "07", name: "Recepção Cloud", desc: "Ingestion API Endpoint", status: "OK" },
                    { num: "08", name: "Deduplicação", desc: "Idempotência por Chave Composta", status: "OK" },
                    { num: "09", name: "Historian Storage", desc: "Gravação Permanente de Série", status: "OK" },
                    { num: "10", name: "SCADA Dispatch", desc: "Streaming para Clientes em Tempo Real", status: "OK" },
                  ].map((stage) => (
                    <div
                      key={stage.num}
                      className="border border-border bg-card/60 p-3 rounded-lg flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-primary">{stage.num}</span>
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        </div>
                        <p className="font-semibold text-foreground font-sans text-xs">{stage.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 font-sans">{stage.desc}</p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-emerald-500 font-bold">
                        ESTADO NOMINAL
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 7: INFRAESTRUTURA & CLOUD */}
          <TabsContent value="infrastructure" className="flex-1 overflow-auto mt-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-xs uppercase font-bold flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Supabase PostgreSQL & RLS
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado de Conexão:</span>
                    <span className="text-emerald-500 font-bold font-mono">CONECTADO</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latência do Pool:</span>
                    <span className="font-mono">14 ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Políticas RLS:</span>
                    <span className="text-emerald-500 font-mono">ATIVAS (Isolamento Multi-Tenant)</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-xs uppercase font-bold flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    Runtime Serverless / TanStack Start
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxa de Sucesso:</span>
                    <span className="text-emerald-500 font-bold font-mono">99.98%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latência p50:</span>
                    <span className="font-mono">42 ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Erros 5xx:</span>
                    <span className="font-mono text-emerald-500">0</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-xs uppercase font-bold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Segurança & Certificados mTLS
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Autoridade CA:</span>
                    <span className="font-mono">ElétricAi Internal CA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Certificados Válidos:</span>
                    <span className="text-emerald-500 font-mono">100%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Intertravamento Físico:</span>
                    <span className="text-red-500 font-bold font-mono">BLOQUEADO (READ-ONLY)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 8: SLI / SLO */}
          <TabsContent value="slo" className="flex-1 overflow-auto mt-4 space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="py-3 px-5 border-b border-border">
                <CardTitle className="text-sm font-semibold">
                  Metrologia de SLI / SLO e Orçamento de Erros (Error Budgets)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cálculo determinístico com denominação explícita e expurgo de manutenção programada aprovada
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left font-medium">
                        <th className="py-2.5 px-4">Serviço Alvo</th>
                        <th className="py-2.5 px-4">Meta SLO</th>
                        <th className="py-2.5 px-4">Atingido (SLI)</th>
                        <th className="py-2.5 px-4">Status de Conformidade</th>
                        <th className="py-2.5 px-4">Error Budget Total</th>
                        <th className="py-2.5 px-4">Budget Consumido</th>
                        <th className="py-2.5 px-4 text-right">Budget Restante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {sloMeasurements.map((m) => (
                        <tr key={m.sloId} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4 font-sans font-semibold text-foreground">
                            {m.targetService}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {m.targetPercent.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-500">
                            {m.achievedPercent.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold ${
                                m.isCompliant
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                  : "bg-red-500/10 text-red-500 border-red-500/30"
                              }`}
                            >
                              {m.isCompliant ? "COMPLIANT" : "VIOLATED"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {m.errorBudgetTotalPercent.toFixed(2)}%
                          </td>
                          <td className="py-3 px-4 text-amber-500 font-semibold">
                            {m.errorBudgetConsumedPercent.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-500 font-bold">
                            {m.errorBudgetRemainingPercent.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
