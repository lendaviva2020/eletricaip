// SCADA SUPERVISÓRIO — View 11: Configurações do Sistema Supervisório
// Standards: ISA-101 (HMI parameters), ISA-18.2 (Alarms), IEC 62443 (Cybersecurity)

import { useState } from "react";
import {
  Gear,
  ShieldCheck,
  SpeakerHigh,
  Clock,
  Database,
  Sliders,
  FloppyDisk,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaSettingsView() {
  const settings = useScadaStore((s) => s.settings);
  const updateSettings = useScadaStore((s) => s.updateSettings);

  const [scanCycle, setScanCycle] = useState(settings.scanCycleMs);
  const [audioEnabled, setAudioEnabled] = useState(settings.audioAlarmsEnabled);
  const [audioVol, setAudioVol] = useState(settings.audioVolume);
  const [retentionDays, setRetentionDays] = useState(settings.historianRetentionDays);
  const [rbacRole, setRbacRole] = useState(settings.rbacRole);
  const [twoPersonRule, setTwoPersonRule] = useState(settings.twoPersonRuleEnabled);
  const [inflowMult, setInflowMult] = useState(settings.simulationInflowMultiplier);

  const handleSave = () => {
    updateSettings({
      scanCycleMs: scanCycle,
      audioAlarmsEnabled: audioEnabled,
      audioVolume: audioVol,
      historianRetentionDays: retentionDays,
      rbacRole,
      twoPersonRuleEnabled: twoPersonRule,
      simulationInflowMultiplier: inflowMult,
    });
    toast.success("Configurações do SCADA atualizadas com sucesso.");
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4 max-w-4xl mx-auto w-full">
      {/* 1. Header */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Gear className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-mono font-bold uppercase text-white">
              Configurações do Núcleo SCADA Supervisório
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              Parâmetros de execução do motor de supervisão, alarmes sonoros e segurança cibernética
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold shadow-sm transition-colors"
        >
          <FloppyDisk className="w-3.5 h-3.5" />
          <span>Salvar Alterações</span>
        </button>
      </div>

      {/* 2. Supervisory Engine Parameters */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-4 shadow-md font-mono text-xs">
        <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2 border-b border-zinc-800 pb-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Ciclo de Varredura & Telemetria</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">
              Período de Scan do Motor (ms)
            </label>
            <select
              value={scanCycle}
              onChange={(e) => setScanCycle(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-white"
            >
              <option value={50}>50 ms (Alta velocidade - Eletrotécnica)</option>
              <option value={100}>100 ms (Padrão Industrial Recomendado)</option>
              <option value={250}>250 ms (Processos térmicos / lentos)</option>
              <option value={500}>500 ms (Baixa largura de banda)</option>
              <option value={1000}>1000 ms (1 segundo - Economia)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">
              Retenção do Historiador Local
            </label>
            <select
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-white"
            >
              <option value={7}>7 dias de histórico local</option>
              <option value={30}>30 dias de histórico (Padrão)</option>
              <option value={90}>90 dias de histórico</option>
              <option value={365}>1 ano (Requer storage estendido)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Audio & Alarm Parameters */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-4 shadow-md font-mono text-xs">
        <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2 border-b border-zinc-800 pb-2">
          <SpeakerHigh className="w-4 h-4 text-amber-400" />
          <span>Sinalização Sonora de Alarmes (ISA-18.2)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-zinc-900/60 rounded border border-zinc-800">
            <div>
              <span className="font-semibold text-white block">Sons de Alarme Ativos</span>
              <span className="text-[10px] text-zinc-500">Toca sirene em eventos críticos</span>
            </div>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(e) => setAudioEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded"
            />
          </div>

          <div className="p-3 bg-zinc-900/60 rounded border border-zinc-800 space-y-2">
            <div className="flex justify-between">
              <span className="font-semibold text-white">Volume da Sirene</span>
              <span className="text-blue-400">{audioVol}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={audioVol}
              onChange={(e) => setAudioVol(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </div>
      </div>

      {/* 4. Cybersecurity & Access Control (IEC 62443) */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-4 shadow-md font-mono text-xs">
        <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2 border-b border-zinc-800 pb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Segurança Cibernética Industrial (IEC 62443)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-zinc-400 block mb-1">
              Perfil Ativo de Operação (RBAC)
            </label>
            <select
              value={rbacRole}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setRbacRole(
                  e.target.value as "OPERATOR" | "ENGINEER" | "SUPERVISOR" | "ADMIN",
                )
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-white"
            >
              <option value="OPERATOR">Operador (Comandos operacionais básicos)</option>
              <option value="ENGINEER">
                Engenheiro de Automação (Parametrização & Calibração)
              </option>
              <option value="SUPERVISOR">Supervisor de Planta (Autorização & Relatórios)</option>
              <option value="ADMIN">Administrador de Sistema (Controle Total)</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-zinc-900/60 rounded border border-zinc-800">
            <div>
              <span className="font-semibold text-white block">Regra de Dois Operadores</span>
              <span className="text-[10px] text-zinc-500">
                Exige confirmação dupla para comandos de alta criticidade
              </span>
            </div>
            <input
              type="checkbox"
              checked={twoPersonRule}
              onChange={(e) => setTwoPersonRule(e.target.checked)}
              className="w-4 h-4 accent-blue-600 rounded"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
