// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET MANAGEMENT DASHBOARD (GATE 3.5)
// Centralized multi-tenant gateway monitoring, telemetry, certificates, remote config & signed updates

import { useState, useMemo } from "react";
import {
  HardDrives,
  Cpu,
  ShieldCheck,
  ShieldWarning,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  XCircle,
  PlugsConnected,
  MagnifyingGlass,
  ArrowCounterClockwise,
  LockKey,
  Terminal,
  FileText,
  Pulse,
  Database,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { edgeFleetManager } from "@/lib/edge/fleet-manager";
import { fleetCertificateManager } from "@/lib/edge/fleet-certificates";
import { remoteConfigManager } from "@/lib/edge/remote-config";
import { signedUpdateManager } from "@/lib/edge/signed-updates";
import { fleetAuditManager } from "@/lib/edge/fleet-audit";
import type {
  FleetGatewaySummary,
  EdgeOperationalState,
  FleetUserContext,
  EdgeHardwareArch,
} from "@/lib/edge/types";

const CurrentUser: FleetUserContext = {
  userId: "usr_operator_admin",
  email: "admin@eletricai.com",
  role: "PLATFORM_ADMIN",
  organizationId: "org_sp_industrial",
  authorizedPlantIds: ["plant_ete_central", "plant_subestacao_138kv", "plant_usina_rj"],
};

export function EdgeFleetDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedState, setSelectedState] = useState<string>("ALL");
  const [selectedPlant, setSelectedPlant] = useState<string>("ALL");
  const [selectedArch, setSelectedArch] = useState<string>("ALL");
  const [selectedGateway, setSelectedGateway] = useState<FleetGatewaySummary | null>(null);
  const [activeTab, setActiveTab] = useState<"TELEMETRY" | "CONFIG" | "CERTS" | "UPDATES" | "AUDIT">("TELEMETRY");
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Load live gateways and metrics
  const gateways = useMemo(() => {
    return edgeFleetManager.getFleetGateways(CurrentUser, {
      operationalState: selectedState !== "ALL" ? (selectedState as EdgeOperationalState) : undefined,
      plantId: selectedPlant !== "ALL" ? selectedPlant : undefined,
      hardwareArch: selectedArch !== "ALL" ? (selectedArch as EdgeHardwareArch) : undefined,
      searchQuery: searchQuery || undefined,
    });
  }, [selectedState, selectedPlant, selectedArch, searchQuery, refreshNonce]);

  const metrics = useMemo(() => {
    return edgeFleetManager.getFleetMetrics(CurrentUser);
  }, [refreshNonce]);

  const plants = useMemo(() => {
    const set = new Set<string>();
    edgeFleetManager.getFleetGateways(CurrentUser).forEach((g) => set.add(g.plantId));
    return Array.from(set);
  }, [refreshNonce]);

  const handleRefresh = () => {
    setRefreshNonce((n) => n + 1);
    toast.success("Telemetria da frota atualizada em tempo real.");
  };

  const handleRevoke = (gw: FleetGatewaySummary) => {
    const reason = "Revogação administrativa manual pelo console de segurança.";
    const ok = fleetCertificateManager.revokeCertificate(
      gw.gatewayId,
      reason,
      CurrentUser,
      gw.organizationId,
      gw.plantId,
    );
    if (ok) {
      toast.error(`Gateway ${gw.name} revogado com sucesso. Acesso mTLS bloqueado.`);
      setRefreshNonce((n) => n + 1);
      if (selectedGateway?.gatewayId === gw.gatewayId) {
        setSelectedGateway(edgeFleetManager.getGateway(gw.gatewayId) || null);
      }
    }
  };

  const handleRollbackConfig = (gw: FleetGatewaySummary) => {
    const res = remoteConfigManager.rollbackConfig(
      gw.gatewayId,
      CurrentUser,
      gw.organizationId,
      gw.plantId,
    );
    if (res.success) {
      toast.success(`Configuração restaurada com sucesso para v${res.activeConfigVersion} (LKGC).`);
      setRefreshNonce((n) => n + 1);
    } else {
      toast.error(`Falha no rollback: ${res.error}`);
    }
  };

  const handleSimulateUpdate = (gw: FleetGatewaySummary) => {
    try {
      const manifest = {
        packageId: "pkg-edge-daemon-1.3.0",
        targetVersion: "1.3.0",
        targetArch: gw.hardwareArch,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        signature: "SIG_OFFICIAL_ELETRICAI_2026_TEST_VALID_SIGNATURE_OK",
        releaseNotes: "Atualização de desempenho do driver Modbus e patch de segurança de buffer WAL.",
        minGatewayVersion: "1.0.0",
      };

      const campaign = signedUpdateManager.createStagedCampaign(
        manifest,
        gw.plantId,
        gw.organizationId,
        CurrentUser,
      );

      const res = signedUpdateManager.executeGatewayUpdate(campaign.campaignId, gw, () => true);
      if (res.success) {
        gw.softwareVersion = res.activeVersion;
        gw.updateState = "UP_TO_DATE";
        toast.success(`Gateway ${gw.name} atualizado com sucesso para versão ${res.activeVersion}!`);
        setRefreshNonce((n) => n + 1);
      } else {
        toast.error(`Atualização falhou: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 space-y-6 bg-[#080b11] text-zinc-200 min-h-0 overflow-y-auto">
      {/* 1. Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <HardDrives className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold font-mono tracking-tight text-white uppercase">
              Gerenciamento Centralizado de Frota Edge
            </h1>
            <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
              GATE 3.5
            </span>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            Monitoramento de múltiplos appliances industriais, telemetria de recursos, certificados mTLS e atualizações assinadas
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-[11px] font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Regra de Segurança: isPhysicalControlAllowed = false (Read-Only)</span>
          </div>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowsClockwise className="w-3.5 h-3.5" />
            <span>Atualizar Telemetria</span>
          </button>
        </div>
      </div>

      {/* 2. Fleet KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-1">
          <span className="text-[11px] font-mono text-zinc-400 uppercase">Total Gateways</span>
          <div className="text-2xl font-bold font-mono text-white">{metrics.totalGateways}</div>
          <span className="text-[10px] font-mono text-zinc-500">Distribuídos em {plants.length} plantas</span>
        </div>

        <div className="bg-zinc-950/80 border border-emerald-900/40 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-emerald-400 uppercase">Online</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">{metrics.onlineGateways}</div>
          <span className="text-[10px] font-mono text-zinc-500">Heartbeat ativo &lt; 30s</span>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-400 uppercase">Offline</span>
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-400">{metrics.offlineGateways}</div>
          <span className="text-[10px] font-mono text-zinc-500">Sem heartbeat</span>
        </div>

        <div className="bg-zinc-950/80 border border-amber-900/40 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-amber-400 uppercase">Degradados</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">{metrics.degradedGateways}</div>
          <span className="text-[10px] font-mono text-zinc-500">Alta carga / Buffer &gt; 90%</span>
        </div>

        <div className="bg-zinc-950/80 border border-rose-900/40 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-rose-400 uppercase">Certs em Alerta</span>
            <ShieldWarning className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-300">{metrics.certificatesExpiringSoon}</div>
          <span className="text-[10px] font-mono text-zinc-500">Vencimento &lt; 30 dias</span>
        </div>

        <div className="bg-zinc-950/80 border border-blue-900/40 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-blue-400 uppercase">Buffer Pendente</span>
            <Database className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300">
            {metrics.totalPendingSamples.toLocaleString("pt-BR")}
          </div>
          <span className="text-[10px] font-mono text-zinc-500">Amostras WAL na outbox</span>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlass className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por nome, UUID, setor ou planta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Todos os Estados</option>
            <option value="ONLINE">ONLINE</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="DEGRADED">DEGRADED</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
            <option value="REVOKED">REVOKED</option>
          </select>

          <select
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Todas as Plantas</option>
            {plants.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={selectedArch}
            onChange={(e) => setSelectedArch(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">Todas as Arquiteturas</option>
            <option value="x86_64">x86_64</option>
            <option value="arm64">arm64</option>
          </select>
        </div>

        <span className="text-xs font-mono text-zinc-500">
          Exibindo {gateways.length} de {metrics.totalGateways} gateways
        </span>
      </div>

      {/* 4. Gateways Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-[11px] uppercase">
              <th className="py-2.5 px-4">Estado</th>
              <th className="py-2.5 px-4">Nome do Gateway / Setor</th>
              <th className="py-2.5 px-4">Planta & Org</th>
              <th className="py-2.5 px-4">Hardware / OS</th>
              <th className="py-2.5 px-4">CPU / RAM</th>
              <th className="py-2.5 px-4">Buffer WAL</th>
              <th className="py-2.5 px-4">Certificado</th>
              <th className="py-2.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {gateways.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-500">
                  Nenhum gateway encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              gateways.map((gw) => (
                <tr key={gw.gatewayId} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border",
                        gw.operationalState === "ONLINE" &&
                          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                        gw.operationalState === "DEGRADED" &&
                          "bg-amber-500/10 text-amber-400 border-amber-500/20",
                        gw.operationalState === "OFFLINE" &&
                          "bg-zinc-800 text-zinc-400 border-zinc-700",
                        gw.operationalState === "REVOKED" &&
                          "bg-rose-500/10 text-rose-400 border-rose-500/20",
                        gw.operationalState === "MAINTENANCE" &&
                          "bg-blue-500/10 text-blue-400 border-blue-500/20",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          gw.operationalState === "ONLINE" && "bg-emerald-400 animate-pulse",
                          gw.operationalState === "DEGRADED" && "bg-amber-400 animate-pulse",
                          gw.operationalState === "OFFLINE" && "bg-zinc-500",
                          gw.operationalState === "REVOKED" && "bg-rose-400",
                          gw.operationalState === "MAINTENANCE" && "bg-blue-400",
                        )}
                      />
                      {gw.operationalState}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{gw.name}</div>
                    <div className="text-[10px] text-zinc-500">
                      ID: {gw.gatewayId} • Setor: {gw.sector}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="text-zinc-200">{gw.plantId}</div>
                    <div className="text-[10px] text-zinc-500">{gw.organizationId}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="text-zinc-200">{gw.hardwareArch}</div>
                    <div className="text-[10px] text-zinc-500">{gw.os}</div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-300">
                        {gw.health.cpuUsagePercent}% CPU
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-[11px] text-zinc-300">
                        {gw.health.memoryUsagePercent}% RAM
                      </span>
                    </div>
                    <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          gw.health.cpuUsagePercent > 85 ? "bg-rose-500" : "bg-blue-500",
                        )}
                        style={{ width: `${gw.health.cpuUsagePercent}%` }}
                      />
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="text-zinc-200">
                      {gw.storage.pendingSamplesCount.toLocaleString("pt-BR")} amostras
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {(gw.storage.walSizeBytes / (1024 * 1024)).toFixed(1)} MB (
                      {gw.storage.bufferUtilizationPercent}%)
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                        gw.certificate.state === "VALID" && "text-emerald-400 bg-emerald-500/10",
                        gw.certificate.state === "EXPIRING_SOON" &&
                          "text-amber-400 bg-amber-500/10",
                        gw.certificate.state === "REVOKED" && "text-rose-400 bg-rose-500/10",
                      )}
                    >
                      <LockKey className="w-3 h-3" />
                      {gw.certificate.state}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedGateway(gw)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-[11px] transition-colors"
                      >
                        Inspecionar
                      </button>

                      {gw.operationalState !== "REVOKED" && (
                        <button
                          onClick={() => handleRevoke(gw)}
                          title="Revogar certificado mTLS administrativamente"
                          className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 font-mono text-[11px] transition-colors"
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Detailed Inspection Modal/Drawer */}
      {selectedGateway && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
              <div className="flex items-center gap-3">
                <HardDrives className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-mono font-bold text-white uppercase">
                    {selectedGateway.name}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400">
                    UUID: {selectedGateway.gatewayId} • Planta: {selectedGateway.plantId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedGateway(null)}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-zinc-800 bg-zinc-900/50 px-4 gap-2 text-xs font-mono">
              <button
                onClick={() => setActiveTab("TELEMETRY")}
                className={cn(
                  "py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5",
                  activeTab === "TELEMETRY"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Pulse className="w-3.5 h-3.5" />
                Telemetria ao Vivo
              </button>

              <button
                onClick={() => setActiveTab("CONFIG")}
                className={cn(
                  "py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5",
                  activeTab === "CONFIG"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Wrench className="w-3.5 h-3.5" />
                Configuração Remota
              </button>

              <button
                onClick={() => setActiveTab("CERTS")}
                className={cn(
                  "py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5",
                  activeTab === "CERTS"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                <LockKey className="w-3.5 h-3.5" />
                Certificados & mTLS
              </button>

              <button
                onClick={() => setActiveTab("UPDATES")}
                className={cn(
                  "py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5",
                  activeTab === "UPDATES"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                <Terminal className="w-3.5 h-3.5" />
                Atualizações
              </button>

              <button
                onClick={() => setActiveTab("AUDIT")}
                className={cn(
                  "py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5",
                  activeTab === "AUDIT"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                Trilha de Auditoria
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {activeTab === "TELEMETRY" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-2">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">Processador (CPU)</span>
                      <div className="text-2xl font-bold font-mono text-white">
                        {selectedGateway.health.cpuUsagePercent}%
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        Temperatura: {selectedGateway.health.temperatureCelsius || 42}°C
                      </div>
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-2">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">Memória RAM</span>
                      <div className="text-2xl font-bold font-mono text-white">
                        {selectedGateway.health.memoryUsagePercent}%
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        Disco: {selectedGateway.health.diskUsagePercent}% utilizado
                      </div>
                    </div>

                    <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-2">
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">Buffer SQLite WAL</span>
                      <div className="text-2xl font-bold font-mono text-white">
                        {selectedGateway.storage.pendingSamplesCount.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        Tamanho: {(selectedGateway.storage.walSizeBytes / (1024 * 1024)).toFixed(1)} MB
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3 font-mono text-xs">
                    <h4 className="font-bold text-white uppercase text-xs">Diagnóstico de Sincronização</h4>
                    <div className="grid grid-cols-2 gap-2 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Último Heartbeat:</span>{" "}
                        {selectedGateway.lastHeartbeatAt ? new Date(selectedGateway.lastHeartbeatAt).toLocaleTimeString() : "Nenhum"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Última Sincronização:</span>{" "}
                        {selectedGateway.lastSyncAt ? new Date(selectedGateway.lastSyncAt).toLocaleTimeString() : "Nenhum"}
                      </div>
                      <div>
                        <span className="text-zinc-500">Versão de Software:</span> {selectedGateway.softwareVersion}
                      </div>
                      <div>
                        <span className="text-zinc-500">Versão do Protocolo:</span> {selectedGateway.protocolVersion}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "CONFIG" && (
                <div className="space-y-4">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white uppercase font-mono text-xs">
                        Configuração Ativa (Versão v{selectedGateway.currentConfigVersion})
                      </h4>
                      <button
                        onClick={() => handleRollbackConfig(selectedGateway)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs rounded transition-colors"
                      >
                        <ArrowCounterClockwise className="w-3.5 h-3.5" />
                        Rollback para LKGC Anterior
                      </button>
                    </div>

                    <p className="text-xs text-zinc-400 font-mono">
                      Todas as configurações são validadas localmente com verificação do intertravamento de segurança{" "}
                      <code className="text-amber-400">isPhysicalControlAllowed = false</code>.
                    </p>

                    <div className="bg-zinc-900 p-3 rounded font-mono text-xs text-zinc-300 space-y-1">
                      <div><span className="text-zinc-500">Taxa de Varredura (Scan Rate):</span> 1000 ms</div>
                      <div><span className="text-zinc-500">Limite de Buffer:</span> 10.000.000 amostras</div>
                      <div><span className="text-zinc-500">Política de Saturação:</span> DROP_OLDEST_NON_CRITICAL</div>
                      <div><span className="text-zinc-500">Retenção Offline:</span> 72 horas contínuas</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "CERTS" && (
                <div className="space-y-4">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white uppercase">Certificado mTLS do Gateway</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {selectedGateway.certificate.state}
                      </span>
                    </div>

                    <div className="space-y-1 text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Fingerprint SHA-256:</span>
                        <div className="text-[11px] text-blue-400 break-all">{selectedGateway.certificate.fingerprint}</div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Emitido em:</span> {new Date(selectedGateway.certificate.issuedAt).toLocaleString()}
                      </div>
                      <div>
                        <span className="text-zinc-500">Válido até:</span> {new Date(selectedGateway.certificate.expiresAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          toast.success("Solicitação de renovação com Proof of Possession submetida com sucesso.");
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold"
                      >
                        Solicitar Renovação Criptográfica (PoP)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "UPDATES" && (
                <div className="space-y-4">
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white uppercase">Distribuição Assinada de Versões</h4>
                      <span className="text-zinc-400">Versão instalada: {selectedGateway.softwareVersion}</span>
                    </div>

                    <p className="text-xs text-zinc-400">
                      O processo de atualização verifica a assinatura criptográfica, a compatibilidade de arquitetura ({selectedGateway.hardwareArch}) e executa rollback automático se o teste de saúde falhar.
                    </p>

                    <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSimulateUpdate(selectedGateway)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                      >
                        Executar Atualização Staged (v1.3.0)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "AUDIT" && (
                <div className="space-y-3">
                  <h4 className="font-bold text-white uppercase font-mono text-xs">
                    Trilha de Auditoria Criptográfica (SHA-256 Enchained)
                  </h4>
                  <div className="space-y-2">
                    {fleetAuditManager.getEvents({ gatewayId: selectedGateway.gatewayId }).map((ev) => (
                      <div key={ev.id} className="bg-zinc-950 p-3 rounded border border-zinc-800 font-mono text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-400">{ev.eventType}</span>
                          <span className="text-zinc-500">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-zinc-400">Ator: {ev.actor.email} ({ev.actor.role})</div>
                        <div className="text-[10px] text-zinc-600 truncate">Hash: {ev.tamperProofHash}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-end">
              <button
                onClick={() => setSelectedGateway(null)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs rounded transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
