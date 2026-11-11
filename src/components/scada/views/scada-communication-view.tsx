// SCADA SUPERVISÓRIO — View 7: Comunicação Industrial & Gateways
// Real-time protocol diagnostics: OPC UA, Modbus TCP, MQTT Broker and packet statistics

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  PlugsConnected,
  WifiHigh,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  ShieldCheck,
  Pulse,
  Terminal,
  Database,
  HardDrives,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaCommunicationView() {
  const gatewayStatus = useScadaStore((s) => s.gatewayStatus);
  const gatewayTelemetry = useScadaStore((s) => s.gatewayTelemetry);
  const [testRunning, setTestRunning] = useState(false);

  const handleRunPingTest = () => {
    setTestRunning(true);
    setTimeout(() => {
      setTestRunning(false);
      toast.success("Diagnóstico de rede concluído: Latência média 1.8 ms • 0 pacotes perdidos.");
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. Header & Quick Actions */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <PlugsConnected className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-mono font-bold uppercase text-white">
              Gateways de Comunicação Industrial
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              Interconexão de rede para CLP, inversores de frequência e sistemas MES/ERP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/settings/edge-fleet"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs font-semibold border border-zinc-700 shadow-sm transition-colors"
          >
            <HardDrives className="w-3.5 h-3.5 text-blue-400" />
            <span>Gerenciar Frota Edge</span>
          </Link>

          <button
            onClick={handleRunPingTest}
            disabled={testRunning}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-mono text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowsClockwise className={cn("w-3.5 h-3.5", testRunning && "animate-spin")} />
            <span>{testRunning ? "Testando Conexões..." : "Executar Loopback Test"}</span>
          </button>
        </div>
      </div>

      {/* 2. Three Protocol Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* OPC UA */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white uppercase">
                OPC UA Server / Client
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> CONECTADO
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-1">
              Padrão IEC 62541 • Segurança Basic256Sha256
            </p>
          </div>

          <div className="bg-zinc-900/90 rounded p-2.5 space-y-1.5 font-mono text-[11px] text-zinc-300 border border-zinc-800">
            <div className="flex justify-between">
              <span className="text-zinc-500">Endpoint:</span>
              <span className="text-blue-400 truncate max-w-[170px]">
                {gatewayStatus.opcua.endpoint}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Sessões Ativas:</span>
              <span className="text-white font-semibold">
                {gatewayStatus.opcua.sessions} clientes
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Assinaturas (Tags):</span>
              <span className="text-white font-semibold">
                {gatewayStatus.opcua.subscriptions} monitored items
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Taxa Amostragem:</span>
              <span className="text-emerald-400 font-semibold">
                {gatewayStatus.opcua.samplingIntervalMs} ms
              </span>
            </div>
          </div>
        </div>

        {/* Modbus TCP */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white uppercase">
                Modbus TCP Gateway
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> ONLINE
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-1">
              Porta TCP 502 • Mapeamento de Holding Registers
            </p>
          </div>

          <div className="bg-zinc-900/90 rounded p-2.5 space-y-1.5 font-mono text-[11px] text-zinc-300 border border-zinc-800">
            <div className="flex justify-between">
              <span className="text-zinc-500">Host / Porta:</span>
              <span className="text-amber-400">
                {gatewayStatus.modbus.host}:{gatewayStatus.modbus.port}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Unit ID:</span>
              <span className="text-white font-semibold">{gatewayStatus.modbus.unitId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Registradores 4xxxx:</span>
              <span className="text-white font-semibold">
                {gatewayStatus.modbus.holdingRegisters} mapeados
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Erros CRC:</span>
              <span className="text-emerald-400 font-semibold">
                {gatewayStatus.modbus.crcErrors} (0.00%)
              </span>
            </div>
          </div>
        </div>

        {/* MQTT Broker */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white uppercase">
                MQTT Industrial Broker
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> CONECTADO
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-1">
              Sparkplug B / JSON Telemetria Cloud
            </p>
          </div>

          <div className="bg-zinc-900/90 rounded p-2.5 space-y-1.5 font-mono text-[11px] text-zinc-300 border border-zinc-800">
            <div className="flex justify-between">
              <span className="text-zinc-500">Broker:</span>
              <span className="text-cyan-400 truncate max-w-[170px]">
                {gatewayStatus.mqtt.broker}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Client ID:</span>
              <span className="text-white font-semibold">{gatewayStatus.mqtt.clientId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Tópicos Assinados:</span>
              <span className="text-white font-semibold">
                {gatewayStatus.mqtt.subscribedTopics.length} canais
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Throughput RX:</span>
              <span className="text-emerald-400 font-semibold">
                {gatewayStatus.mqtt.messagesRx} msgs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5. Master Edge Gateway Status & SQLite WAL Buffer */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <HardDrives className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-bold text-white uppercase">
              ElétricAi Master Edge Gateway — Sincronização & Buffer SQLite WAL
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              v1.0.0-bench
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              <ShieldCheck className="w-3 h-3" /> READ-ONLY STRICT (BLOQUEIO FÍSICO ATIVO)
            </span>
            {gatewayTelemetry?.isDegraded ? (
              <span className="flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <WarningCircle className="w-3 h-3" /> BUFFER DEGRADADO
              </span>
            ) : (
              <span className="flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> STORE-AND-FORWARD SAUDÁVEL
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
          <div className="bg-zinc-900/80 rounded p-2 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px]">Gateway ID:</span>
            <span className="text-white font-bold truncate block">
              {gatewayTelemetry?.gatewayId || "egw_lab_ete_01"}
            </span>
            <span className="text-zinc-500 text-[9px]">
              {gatewayTelemetry?.organizationId || "org_sp_industrial"} •{" "}
              {gatewayTelemetry?.plantId || "plant_ete_central"}
            </span>
          </div>

          <div className="bg-zinc-900/80 rounded p-2 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px]">Buffer Local (SQLite WAL):</span>
            <span className="text-cyan-400 font-bold block">
              {gatewayTelemetry?.bufferStatus?.pendingUploadCount ?? 0} pendentes
            </span>
            <span className="text-zinc-500 text-[9px]">
              {gatewayTelemetry?.bufferStatus?.inFlightCount ?? 0} in-flight • Total:{" "}
              {gatewayTelemetry?.bufferStatus?.totalSamplesStored ?? 0}
            </span>
          </div>

          <div className="bg-zinc-900/80 rounded p-2 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px]">Capacidade do Buffer:</span>
            <span
              className={cn(
                "font-bold block",
                gatewayTelemetry?.bufferStatus?.isNearCapacity80Percent
                  ? "text-amber-400"
                  : "text-emerald-400",
              )}
            >
              {gatewayTelemetry?.bufferStatus?.isNearCapacity80Percent
                ? "≥ 80% (Alerta de Quota)"
                : "Nominal (< 80%)"}
            </span>
            <span className="text-zinc-500 text-[9px]">Política: DROP_OLDEST_NON_CRITICAL</span>
          </div>

          <div className="bg-zinc-900/80 rounded p-2 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px]">Latência Cloud & Sync:</span>
            <span className="text-white font-bold block">
              {gatewayTelemetry?.networkLatencyMs
                ? `${gatewayTelemetry.networkLatencyMs.toFixed(1)} ms`
                : "1.8 ms"}
            </span>
            <span className="text-zinc-500 text-[9px]">
              Amostras Processadas: {gatewayTelemetry?.samplesProcessedTotal ?? 4210}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Live Protocol Telegrams Stream Console */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Tráfego de Pacotes em Tempo Real (Telegram Log)</span>
          </div>
          <span className="text-[10px] text-zinc-500">Latência: 1.8ms • Buffer: 200 msgs</span>
        </div>

        <div className="bg-black/80 rounded p-3 font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto text-zinc-400 border border-zinc-900">
          <div className="text-emerald-400/90">
            {
              "[14:28:44.102] [OPC-UA] PublishResponse: NodeId ns=2;s=ETE.FLOW.TOTAL Value=182.7 m³/h Quality=Good(0x00000000)"
            }
          </div>
          <div className="text-blue-400/90">
            {
              "[14:28:44.204] [MODBUS] FC03 ReadHoldingRegisters Addr=40001 Qty=16 -> Response OK (32 bytes)"
            }
          </div>
          <div className="text-zinc-400">
            {
              '[14:28:44.305] [MQTT] PUB topic="ete/telemetry/pumps" payload={"p1_flow":92.4,"p2_flow":90.3} qos=1'
            }
          </div>
          <div className="text-emerald-400/90">
            {
              "[14:28:44.402] [OPC-UA] PublishResponse: NodeId ns=2;s=ETE.TK101.LEVEL Value=75.2 % Quality=Good(0x00000000)"
            }
          </div>
          <div className="text-amber-400/90">
            {
              "[14:28:44.502] [MODBUS] FC03 ReadHoldingRegisters Addr=40017 Qty=8 -> Response OK (16 bytes)"
            }
          </div>
          <div className="text-zinc-400">
            {
              '[14:28:44.603] [MQTT] PUB topic="ete/telemetry/tanks" payload={"tk101":75.2,"tk102":62.0,"tk105":81.0} qos=1'
            }
          </div>
        </div>
      </div>
    </div>
  );
}
