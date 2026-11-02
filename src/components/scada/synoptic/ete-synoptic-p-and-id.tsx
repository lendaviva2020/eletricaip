// SCADA SUPERVISÓRIO — Industrial P&ID Vector Synoptic Graphic
// High-Density Synoptic: TR-01, QM-01, CCM-01, PLC-01 (I/O Racks), T-101, T-102, T-105,
// Pumps & Motors (P-01..P-08 / M-01..M-08), Valves (V-01..V-08), Filter F-01, Sensors (LT-01, LT-02, LT-05, PT-01, FT-01, AIT-01)
// Standards: ISA-5.1 (P&ID), ISA-101 (HMI High-Performance), IEC 60617 (Electrical)

import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";

export function EteSynopticPAndId() {
  const equipments = useScadaStore((s) => s.equipments);
  const selectedEquipmentId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const estopActive = useScadaStore((s) => s.estopActive);

  // Equipments
  const t101 = equipments["T-101"] || {};
  const t102 = equipments["T-102"] || {};
  const t105 = equipments["T-105"] || {};
  const p01 = equipments["P-01"] || {};
  const p02 = equipments["P-02"] || {};
  const p03 = equipments["P-03"] || {};
  const p04 = equipments["P-04"] || {};
  const p05 = equipments["P-05"] || {};
  const p06 = equipments["P-06"] || {};
  const p07 = equipments["P-07"] || {};
  const p08 = equipments["P-08"] || {};
  const f01 = equipments["F-01"] || {};
  const tr01 = equipments["TR-01"] || {};
  const qm01 = equipments["QM-01"] || {};
  const ccm01 = equipments["CCM-01"] || {};
  const plc01 = equipments["PLC-01"] || {};

  const isP1Running = p01.status === "RUNNING" && !estopActive;
  const isP2Running = p02.status === "RUNNING" && !estopActive;
  const isP3Running = p03.status === "RUNNING" && !estopActive;
  const isP5Running = p05.status === "RUNNING" && !estopActive;
  const isP7Running = p07.status === "RUNNING" && !estopActive;

  return (
    <div
      className="relative w-full h-full min-h-[380px] bg-[#070A0E] border border-[#1E293B] rounded-lg overflow-hidden select-none flex flex-col justify-center shadow-2xl"
      data-testid="scada-p-and-id-synoptic"
    >
      {/* Background Industrial Millimeter Grid */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #38BDF8 1px, transparent 1px),
            linear-gradient(to bottom, #38BDF8 1px, transparent 1px)
          `,
          backgroundSize: "36px 36px",
        }}
      />

      {/* Watermark / Process Area Legend */}
      <div className="absolute top-2 left-3 pointer-events-none z-10 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
          P&ID DIAGRAMA DE PROCESSO — SINÓTICO VETORIAL ISA-5.1
        </span>
      </div>

      {/* SVG Canvas with Dynamic Flow Vector Pipes */}
      <svg
        viewBox="10 10 1390 500"
        className="w-full h-full max-h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ shapeRendering: "geometricPrecision" }}
      >
        <defs>
          {/* Fluid Gradients */}
          <linearGradient id="tankFluidGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="tankAerationGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="tankEffluentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34D399" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="tankBodyGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#151C24" />
            <stop offset="50%" stopColor="#253240" />
            <stop offset="100%" stopColor="#151C24" />
          </linearGradient>

          {/* Pipe Gradients */}
          <linearGradient id="pipeSludgeGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>

          <linearGradient id="pipeAirGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>

          {/* Glow effect for selection */}
          <filter id="equipmentGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38BDF8" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* ================================================================= */}
        {/* 1. TOP INFRASTRUCTURE: SUBESTAÇÃO, QGBT, CCM, CLP (RACKS I/O)    */}
        {/* ================================================================= */}
        <g transform="translate(30, 20)">
          {/* Electrical Enclosure Frame */}
          <rect
            x="0"
            y="0"
            width="640"
            height="58"
            rx="6"
            fill="#0F141C"
            stroke="#1E293B"
            strokeWidth="1.5"
          />
          <text
            x="12"
            y="14"
            fill="#94A3B8"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            DISTRIBUIÇÃO DE FORÇA & RACKS DE I/O (IEC 61131-3)
          </text>

          {/* TR-01: Transformador 750 kVA */}
          <g
            className="cursor-pointer group"
            onClick={() => selectEquipment("TR-01")}
            transform="translate(18, 22)"
          >
            <rect
              x="-6"
              y="-4"
              width="104"
              height="36"
              rx="4"
              fill={selectedEquipmentId === "TR-01" ? "#1E293B" : "transparent"}
              stroke={selectedEquipmentId === "TR-01" ? "#38BDF8" : "transparent"}
              strokeWidth="1.5"
            />
            {/* Transformer double circle symbol (IEC 60617) */}
            <circle cx="12" cy="14" r="10" fill="none" stroke="#EAB308" strokeWidth="2" />
            <circle cx="24" cy="14" r="10" fill="none" stroke="#EAB308" strokeWidth="2" />
            <text
              x="42"
              y="12"
              fill="#F8FAFC"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              TR-01
            </text>
            <text x="42" y="23" fill="#EAB308" fontSize="8" fontFamily="monospace">
              750kVA • 13.8kV
            </text>
          </g>

          {/* Power Busway Line TR-01 -> QM-01 */}
          <line x1="126" y1="36" x2="148" y2="36" stroke="#EAB308" strokeWidth="3" />

          {/* QM-01: QGBT Principal 380V */}
          <g
            className="cursor-pointer group"
            onClick={() => selectEquipment("QM-01")}
            transform="translate(150, 18)"
          >
            <rect
              x="0"
              y="0"
              width="110"
              height="34"
              rx="4"
              fill="#151C24"
              stroke={selectedEquipmentId === "QM-01" ? "#38BDF8" : "#F59E0B"}
              strokeWidth="1.5"
            />
            <text
              x="55"
              y="14"
              textAnchor="middle"
              fill="#FDE68A"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              QM-01 (QGBT)
            </text>
            <text
              x="55"
              y="26"
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="7.5"
              fontFamily="monospace"
            >
              380V • 1200A • {(qm01.powerKw || 248.5).toFixed(1)}kW
            </text>
          </g>

          {/* Power Busway Line QM-01 -> CCM-01 */}
          <line x1="260" y1="36" x2="280" y2="36" stroke="#EAB308" strokeWidth="3" />

          {/* CCM-01: Centro de Controle de Motores */}
          <g
            className="cursor-pointer group"
            onClick={() => selectEquipment("CCM-01")}
            transform="translate(282, 18)"
          >
            <rect
              x="0"
              y="0"
              width="120"
              height="34"
              rx="4"
              fill="#151C24"
              stroke={selectedEquipmentId === "CCM-01" ? "#38BDF8" : "#3B82F6"}
              strokeWidth="1.5"
            />
            <text
              x="60"
              y="14"
              textAnchor="middle"
              fill="#93C5FD"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              CCM-01 (Gavetas)
            </text>
            <text
              x="60"
              y="26"
              textAnchor="middle"
              fill="#34D399"
              fontSize="7.5"
              fontFamily="monospace"
            >
              8 Gavetas • Inteligente
            </text>
          </g>

          {/* Profinet Communication Bus -> PLC-01 */}
          <line
            x1="402"
            y1="36"
            x2="426"
            y2="36"
            stroke="#10B981"
            strokeWidth="2"
            strokeDasharray="3 2"
          />

          {/* PLC-01: CLP S7-1500 com Racks I/O */}
          <g
            className="cursor-pointer group"
            onClick={() => selectEquipment("PLC-01")}
            transform="translate(428, 16)"
          >
            <rect
              x="0"
              y="0"
              width="196"
              height="36"
              rx="4"
              fill="#111827"
              stroke={selectedEquipmentId === "PLC-01" ? "#38BDF8" : "#10B981"}
              strokeWidth="1.5"
            />
            {/* CPU Module */}
            <rect
              x="6"
              y="6"
              width="44"
              height="24"
              rx="2"
              fill="#1F2937"
              stroke="#4B5563"
              strokeWidth="1"
            />
            <circle
              cx="14"
              cy="14"
              r="2.5"
              fill={!estopActive ? "#10B981" : "#EF4444"}
              className="animate-pulse"
            />
            <text
              x="22"
              y="16"
              fill="#F8FAFC"
              fontSize="7"
              fontWeight="bold"
              fontFamily="monospace"
            >
              CPU
            </text>
            <text x="10" y="25" fill="#10B981" fontSize="6.5" fontFamily="monospace">
              RUN
            </text>

            {/* 4 I/O Rack Slices */}
            <g transform="translate(56, 6)">
              <rect x="0" y="0" width="30" height="24" rx="2" fill="#1E293B" stroke="#334155" />
              <text
                x="15"
                y="11"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="6.5"
                fontFamily="monospace"
              >
                DI 32
              </text>
              <circle cx="8" cy="18" r="1.5" fill="#38BDF8" />
              <circle cx="15" cy="18" r="1.5" fill="#38BDF8" />
              <circle cx="22" cy="18" r="1.5" fill="#38BDF8" />
            </g>
            <g transform="translate(90, 6)">
              <rect x="0" y="0" width="30" height="24" rx="2" fill="#1E293B" stroke="#334155" />
              <text
                x="15"
                y="11"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="6.5"
                fontFamily="monospace"
              >
                DO 32
              </text>
              <circle cx="8" cy="18" r="1.5" fill="#34D399" />
              <circle cx="15" cy="18" r="1.5" fill="#34D399" />
              <circle cx="22" cy="18" r="1.5" fill="#34D399" />
            </g>
            <g transform="translate(124, 6)">
              <rect x="0" y="0" width="30" height="24" rx="2" fill="#1E293B" stroke="#334155" />
              <text
                x="15"
                y="11"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="6.5"
                fontFamily="monospace"
              >
                AI 16
              </text>
              <circle cx="8" cy="18" r="1.5" fill="#F59E0B" />
              <circle cx="15" cy="18" r="1.5" fill="#F59E0B" />
              <circle cx="22" cy="18" r="1.5" fill="#F59E0B" />
            </g>
            <g transform="translate(158, 6)">
              <rect x="0" y="0" width="30" height="24" rx="2" fill="#1E293B" stroke="#334155" />
              <text
                x="15"
                y="11"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="6.5"
                fontFamily="monospace"
              >
                AO 8
              </text>
              <circle cx="8" cy="18" r="1.5" fill="#A855F7" />
              <circle cx="15" cy="18" r="1.5" fill="#A855F7" />
              <circle cx="22" cy="18" r="1.5" fill="#A855F7" />
            </g>
          </g>
        </g>

        {/* Chemical Dosing & Aeration Air Supply Zone (Top-Right) */}
        <g transform="translate(710, 20)">
          <rect
            x="0"
            y="0"
            width="680"
            height="58"
            rx="6"
            fill="#0F141C"
            stroke="#1E293B"
            strokeWidth="1.5"
          />
          <text
            x="12"
            y="14"
            fill="#94A3B8"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            SOPRADORES DE AERAÇÃO (M-07 / M-08) & DOSAGEM QUÍMICA (M-03 / M-04)
          </text>

          {/* P-07 / M-07 (Soprador Principal) */}
          <g
            className="cursor-pointer"
            onClick={() => selectEquipment("P-07")}
            transform="translate(15, 20)"
          >
            <rect
              x="0"
              y="0"
              width="135"
              height="32"
              rx="4"
              fill="#151C24"
              stroke={
                selectedEquipmentId === "P-07" ? "#38BDF8" : isP7Running ? "#10B981" : "#EF4444"
              }
              strokeWidth="1.5"
            />
            <circle cx="16" cy="16" r="9" fill="#1E293B" stroke="#94A3B8" />
            <text x="16" y="19" textAnchor="middle" fill="#F8FAFC" fontSize="7.5" fontWeight="bold">
              M7
            </text>
            <text
              x="32"
              y="15"
              fill="#F8FAFC"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              SOPRADOR P-07
            </text>
            <text
              x="32"
              y="25"
              fill={isP7Running ? "#34D399" : "#EF4444"}
              fontSize="7"
              fontFamily="monospace"
            >
              {isP7Running ? "240 m³/h • 45kW" : "PARADO"}
            </text>
          </g>

          {/* P-08 / M-08 (Soprador Reserva) */}
          <g
            className="cursor-pointer"
            onClick={() => selectEquipment("P-08")}
            transform="translate(160, 20)"
          >
            <rect
              x="0"
              y="0"
              width="135"
              height="32"
              rx="4"
              fill="#151C24"
              stroke={selectedEquipmentId === "P-08" ? "#38BDF8" : "#475569"}
              strokeWidth="1.5"
            />
            <circle cx="16" cy="16" r="9" fill="#1E293B" stroke="#64748B" />
            <text x="16" y="19" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="bold">
              M8
            </text>
            <text
              x="32"
              y="15"
              fill="#94A3B8"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              SOPRADOR P-08
            </text>
            <text x="32" y="25" fill="#94A3B8" fontSize="7" fontFamily="monospace">
              STANDBY
            </text>
          </g>

          {/* P-03 / M-03 (Bomba Dosadora Coagulante) */}
          <g
            className="cursor-pointer"
            onClick={() => selectEquipment("P-03")}
            transform="translate(315, 20)"
          >
            <rect
              x="0"
              y="0"
              width="160"
              height="32"
              rx="4"
              fill="#151C24"
              stroke={
                selectedEquipmentId === "P-03" ? "#38BDF8" : isP3Running ? "#10B981" : "#EF4444"
              }
              strokeWidth="1.5"
            />
            <circle cx="16" cy="16" r="9" fill="#1E293B" stroke="#94A3B8" />
            <text x="16" y="19" textAnchor="middle" fill="#F8FAFC" fontSize="7.5" fontWeight="bold">
              M3
            </text>
            <text
              x="32"
              y="15"
              fill="#F8FAFC"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              DOSADORA P-03 (COAG)
            </text>
            <text
              x="32"
              y="25"
              fill={isP3Running ? "#34D399" : "#EF4444"}
              fontSize="7"
              fontFamily="monospace"
            >
              {isP3Running ? "15.2 L/h • ATIVA" : "PARADA"}
            </text>
          </g>

          {/* P-04 / M-04 (Bomba Dosadora Polímero) */}
          <g
            className="cursor-pointer"
            onClick={() => selectEquipment("P-04")}
            transform="translate(490, 20)"
          >
            <rect
              x="0"
              y="0"
              width="170"
              height="32"
              rx="4"
              fill="#151C24"
              stroke={selectedEquipmentId === "P-04" ? "#38BDF8" : "#475569"}
              strokeWidth="1.5"
            />
            <circle cx="16" cy="16" r="9" fill="#1E293B" stroke="#64748B" />
            <text x="16" y="19" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="bold">
              M4
            </text>
            <text
              x="32"
              y="15"
              fill="#94A3B8"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              DOSADORA P-04 (POLI)
            </text>
            <text x="32" y="25" fill="#94A3B8" fontSize="7" fontFamily="monospace">
              STANDBY
            </text>
          </g>
        </g>

        {/* ================================================================= */}
        {/* 2. MAIN PROCESS PIPELINES (ISA-5.1 FLOW NETWORKS)                 */}
        {/* ================================================================= */}

        {/* --- Raw Inflow Line: Inlet -> V-01 -> T-101 --- */}
        <path d="M 20 270 L 100 270" stroke="#334155" strokeWidth="8" fill="none" />
        <path
          d="M 20 270 L 100 270"
          stroke="#06B6D4"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={!estopActive ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- Sludge Recirculation Return: T-101 -> P-05 -> P-06 -> Return --- */}
        <path d="M 175 420 L 175 480 L 390 480" stroke="#78350F" strokeWidth="6" fill="none" />
        <path
          d="M 175 420 L 175 480 L 390 480"
          stroke="#D97706"
          strokeWidth="3"
          strokeDasharray="6 3"
          className={isP5Running ? "animate-[dash_1.5s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- T-101 Bottom Outlet to P-01 --- */}
        <path d="M 210 390 L 210 410 L 300 410" stroke="#334155" strokeWidth="8" fill="none" />
        <path
          d="M 210 390 L 210 410 L 300 410"
          stroke="#06B6D4"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={isP1Running ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- P-01 Discharge to T-102 (via V-02 and optional Bypass V-03) --- */}
        <path
          d="M 370 410 L 460 410 L 460 270 L 520 270"
          stroke="#334155"
          strokeWidth="8"
          fill="none"
        />
        <path
          d="M 370 410 L 460 410 L 460 270 L 520 270"
          stroke="#06B6D4"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={isP1Running ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- Aeration Air Line from Blowers P-07/08 down to T-102 Diffusers --- */}
        <path
          d="M 760 78 L 760 180 L 610 180 L 610 380"
          stroke="#64748B"
          strokeWidth="5"
          fill="none"
        />
        <path
          d="M 760 78 L 760 180 L 610 180 L 610 380"
          stroke="#CBD5E1"
          strokeWidth="2.5"
          strokeDasharray="4 4"
          className={isP7Running ? "animate-[dash_0.8s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- T-102 Outlet to P-02 --- */}
        <path d="M 640 390 L 640 410 L 730 410" stroke="#334155" strokeWidth="8" fill="none" />
        <path
          d="M 640 390 L 640 410 L 730 410"
          stroke="#38BDF8"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={isP2Running ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- P-02 Discharge to Multimedia Filter F-01 (via V-04) --- */}
        <path
          d="M 800 410 L 890 410 L 890 320 L 930 320"
          stroke="#334155"
          strokeWidth="8"
          fill="none"
        />
        <path
          d="M 800 410 L 890 410 L 890 320 L 930 320"
          stroke="#38BDF8"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={isP2Running ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- Filter F-01 Outlet to Final Effluent Tank T-105 --- */}
        <path d="M 1040 320 L 1110 320" stroke="#334155" strokeWidth="8" fill="none" />
        <path
          d="M 1040 320 L 1110 320"
          stroke="#059669"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={isP2Running ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* --- T-105 Final Discharge Outflow: T-105 -> V-08 -> FT-01 Outflow --- */}
        <path d="M 1210 390 L 1210 410 L 1390 410" stroke="#334155" strokeWidth="8" fill="none" />
        <path
          d="M 1210 390 L 1210 410 L 1390 410"
          stroke="#10B981"
          strokeWidth="4"
          strokeDasharray="8 4"
          className={!estopActive ? "animate-[dash_1s_linear_infinite]" : ""}
          fill="none"
        />

        {/* ================================================================= */}
        {/* 3. PROCESS TANKS: T-101, T-102, T-105                             */}
        {/* ================================================================= */}

        {/* --- T-101: Tanque de Sedimentação --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("T-101")}
        >
          {/* Shell */}
          <rect
            x="100"
            y="170"
            width="150"
            height="230"
            rx="10"
            fill="url(#tankBodyGradient)"
            stroke={selectedEquipmentId === "T-101" ? "#38BDF8" : "#475569"}
            strokeWidth={selectedEquipmentId === "T-101" ? "3" : "2"}
          />
          {/* Conical Hopper at bottom */}
          <polygon
            points="110,400 190,400 175,420 125,420"
            fill="#151C24"
            stroke="#475569"
            strokeWidth="1.5"
          />

          {/* Fluid fill */}
          <rect
            x="106"
            y={394 - 2.14 * (t101.levelPct || 75.2)}
            width="138"
            height={2.14 * (t101.levelPct || 75.2)}
            rx="4"
            fill="url(#tankFluidGradient)"
            opacity="0.88"
          />

          {/* Graduation Rulers */}
          <line x1="230" y1="210" x2="242" y2="210" stroke="#94A3B8" strokeWidth="1.5" />
          <line x1="225" y1="260" x2="242" y2="260" stroke="#94A3B8" strokeWidth="2" />
          <line x1="230" y1="310" x2="242" y2="310" stroke="#94A3B8" strokeWidth="1.5" />
          <line x1="225" y1="360" x2="242" y2="360" stroke="#94A3B8" strokeWidth="2" />

          {/* Equipment Header Tag Badge */}
          <rect
            x="105"
            y="132"
            width="140"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="175"
            y="146"
            textAnchor="middle"
            fill="#93C5FD"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            T-101 SEDIMENTAÇÃO
          </text>
          <text
            x="175"
            y="158"
            textAnchor="middle"
            fill="#38BDF8"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            NÍVEL: {(t101.levelPct || 75.2).toFixed(1)}%
          </text>

          {/* LT-01 Instrument Tag Balloon */}
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              selectEquipment("LT-01");
            }}
          >
            <circle cx="175" cy="104" r="14" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.5" />
            <text
              x="175"
              y="107"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              LT-01
            </text>
            <line
              x1="175"
              y1="118"
              x2="175"
              y2="132"
              stroke="#38BDF8"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
          </g>
        </g>

        {/* --- T-102: Tanque de Aeração Biológica --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("T-102")}
        >
          <rect
            x="510"
            y="170"
            width="160"
            height="230"
            rx="10"
            fill="url(#tankBodyGradient)"
            stroke={selectedEquipmentId === "T-102" ? "#38BDF8" : "#475569"}
            strokeWidth={selectedEquipmentId === "T-102" ? "3" : "2"}
          />
          {/* Fluid fill */}
          <rect
            x="516"
            y={394 - 2.14 * (t102.levelPct || 62.0)}
            width="148"
            height={2.14 * (t102.levelPct || 62.0)}
            rx="4"
            fill="url(#tankAerationGradient)"
            opacity="0.88"
          />

          {/* Bottom Diffusers Line */}
          <line x1="530" y1="380" x2="650" y2="380" stroke="#CBD5E1" strokeWidth="3" />
          <circle cx="550" cy="380" r="3" fill="#FFFFFF" />
          <circle cx="575" cy="380" r="3" fill="#FFFFFF" />
          <circle cx="600" cy="380" r="3" fill="#FFFFFF" />
          <circle cx="625" cy="380" r="3" fill="#FFFFFF" />

          {/* Dynamic Aeration Bubbles */}
          {isP7Running && (
            <g opacity="0.6">
              <circle cx="550" cy="330" r="3" fill="#FFFFFF" className="animate-ping" />
              <circle cx="575" cy="300" r="4" fill="#FFFFFF" className="animate-ping" />
              <circle cx="610" cy="340" r="3.5" fill="#FFFFFF" className="animate-ping" />
              <circle cx="630" cy="280" r="4" fill="#FFFFFF" className="animate-ping" />
            </g>
          )}

          {/* Header Tag Badge */}
          <rect
            x="520"
            y="132"
            width="140"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="590"
            y="146"
            textAnchor="middle"
            fill="#93C5FD"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            T-102 AERAÇÃO BIOL.
          </text>
          <text
            x="590"
            y="158"
            textAnchor="middle"
            fill="#38BDF8"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            NÍVEL: {(t102.levelPct || 62.0).toFixed(1)}%
          </text>

          {/* LT-02 */}
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              selectEquipment("LT-02");
            }}
          >
            <circle cx="590" cy="104" r="14" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.5" />
            <text
              x="590"
              y="107"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              LT-02
            </text>
            <line
              x1="590"
              y1="118"
              x2="590"
              y2="132"
              stroke="#38BDF8"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
          </g>
        </g>

        {/* --- T-105: Tanque de Despejo Efluente Tratado --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("T-105")}
        >
          <rect
            x="1100"
            y="170"
            width="150"
            height="230"
            rx="10"
            fill="url(#tankBodyGradient)"
            stroke={selectedEquipmentId === "T-105" ? "#38BDF8" : "#475569"}
            strokeWidth={selectedEquipmentId === "T-105" ? "3" : "2"}
          />
          {/* Fluid fill */}
          <rect
            x="1106"
            y={394 - 2.14 * (t105.levelPct || 81.0)}
            width="138"
            height={2.14 * (t105.levelPct || 81.0)}
            rx="4"
            fill="url(#tankEffluentGradient)"
            opacity="0.88"
          />

          {/* Quality Indicator: pH & Turbidity Badge */}
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              selectEquipment("AIT-01");
            }}
          >
            <rect
              x="1110"
              y="340"
              width="130"
              height="22"
              rx="3"
              fill="#0F172A"
              stroke="#10B981"
              strokeWidth="1"
            />
            <text
              x="1175"
              y="354"
              textAnchor="middle"
              fill="#34D399"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              AIT-01: pH 7.2 • 1.8 NTU
            </text>
          </g>

          {/* Header Tag Badge */}
          <rect
            x="1105"
            y="132"
            width="140"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="1175"
            y="146"
            textAnchor="middle"
            fill="#93C5FD"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            T-105 DESPEJO FINAL
          </text>
          <text
            x="1175"
            y="158"
            textAnchor="middle"
            fill="#34D399"
            fontSize="9"
            fontWeight="bold"
            fontFamily="monospace"
          >
            NÍVEL: {(t105.levelPct || 81.0).toFixed(1)}%
          </text>

          {/* LT-05 */}
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              selectEquipment("LT-05");
            }}
          >
            <circle cx="1175" cy="104" r="14" fill="#1E293B" stroke="#38BDF8" strokeWidth="1.5" />
            <text
              x="1175"
              y="107"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              LT-05
            </text>
            <line
              x1="1175"
              y1="118"
              x2="1175"
              y2="132"
              stroke="#38BDF8"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
          </g>
        </g>

        {/* ================================================================= */}
        {/* 4. MULTIMEDIA FILTER F-01                                         */}
        {/* ================================================================= */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("F-01")}
        >
          {/* Pressure Vessel */}
          <rect
            x="930"
            y="230"
            width="110"
            height="150"
            rx="18"
            fill="#151C24"
            stroke={selectedEquipmentId === "F-01" ? "#38BDF8" : "#475569"}
            strokeWidth={selectedEquipmentId === "F-01" ? "3" : "2"}
          />
          {/* Filter Granular Beds */}
          <rect x="936" y="270" width="98" height="26" fill="#78350F" opacity="0.8" />
          <rect x="936" y="296" width="98" height="26" fill="#D97706" opacity="0.7" />
          <rect x="936" y="322" width="98" height="26" fill="#64748B" opacity="0.6" />

          {/* Filter Header Badge */}
          <rect
            x="925"
            y="190"
            width="120"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="985"
            y="204"
            textAnchor="middle"
            fill="#93C5FD"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            FILTRO F-01
          </text>
          <text
            x="985"
            y="216"
            textAnchor="middle"
            fill="#FBBF24"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            DP: {(f01.pressureBar || 2.4).toFixed(1)} bar
          </text>

          {/* PT-01 Pressure Transmitter */}
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              selectEquipment("PT-01");
            }}
          >
            <circle cx="985" cy="158" r="14" fill="#1E293B" stroke="#FBBF24" strokeWidth="1.5" />
            <text
              x="985"
              y="161"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              PT-01
            </text>
            <line
              x1="985"
              y1="172"
              x2="985"
              y2="190"
              stroke="#FBBF24"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
          </g>
        </g>

        {/* ================================================================= */}
        {/* 5. PUMPS & MOTORS (P-01/M-01, P-02/M-02, P-05/M-05, P-06/M-06)    */}
        {/* ================================================================= */}

        {/* --- BOMBA P-01 / MOTOR M-01 --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("P-01")}
        >
          <circle
            cx="335"
            cy="410"
            r="28"
            fill="#151C24"
            stroke={
              selectedEquipmentId === "P-01" ? "#38BDF8" : isP1Running ? "#10B981" : "#EF4444"
            }
            strokeWidth="3"
          />
          {/* Motor Body Attached */}
          <rect
            x="315"
            y="364"
            width="40"
            height="22"
            rx="3"
            fill="#1E293B"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <text x="335" y="379" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">
            M-01
          </text>
          {/* Rotating Impeller */}
          <g transform={`translate(335, 410) ${isP1Running ? "rotate(45)" : ""}`}>
            <circle cx="0" cy="0" r="5" fill="#FFFFFF" />
            <line x1="-15" y1="0" x2="15" y2="0" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="0" y1="-15" x2="0" y2="15" stroke="#FFFFFF" strokeWidth="2.5" />
          </g>
          {/* Telemetry Badge */}
          <rect
            x="280"
            y="446"
            width="110"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="335"
            y="460"
            textAnchor="middle"
            fill="#F8FAFC"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            BOMBA P-01
          </text>
          <text
            x="335"
            y="472"
            textAnchor="middle"
            fill={isP1Running ? "#34D399" : "#F87171"}
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {isP1Running ? `${(p01.flowRateM3h || 92.4).toFixed(1)} m³/h • ON` : "DESLIGADA"}
          </text>
        </g>

        {/* --- BOMBA P-02 / MOTOR M-02 --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("P-02")}
        >
          <circle
            cx="765"
            cy="410"
            r="28"
            fill="#151C24"
            stroke={
              selectedEquipmentId === "P-02" ? "#38BDF8" : isP2Running ? "#10B981" : "#EF4444"
            }
            strokeWidth="3"
          />
          <rect
            x="745"
            y="364"
            width="40"
            height="22"
            rx="3"
            fill="#1E293B"
            stroke="#475569"
            strokeWidth="1.5"
          />
          <text x="765" y="379" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">
            M-02
          </text>
          <g transform={`translate(765, 410) ${isP2Running ? "rotate(45)" : ""}`}>
            <circle cx="0" cy="0" r="5" fill="#FFFFFF" />
            <line x1="-15" y1="0" x2="15" y2="0" stroke="#FFFFFF" strokeWidth="2.5" />
            <line x1="0" y1="-15" x2="0" y2="15" stroke="#FFFFFF" strokeWidth="2.5" />
          </g>
          <rect
            x="710"
            y="446"
            width="110"
            height="32"
            rx="4"
            fill="#0F172A"
            stroke="#334155"
            strokeWidth="1.5"
          />
          <text
            x="765"
            y="460"
            textAnchor="middle"
            fill="#F8FAFC"
            fontSize="9.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            BOMBA P-02
          </text>
          <text
            x="765"
            y="472"
            textAnchor="middle"
            fill={isP2Running ? "#34D399" : "#F87171"}
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {isP2Running ? `${(p02.flowRateM3h || 90.3).toFixed(1)} m³/h • ON` : "DESLIGADA"}
          </text>
        </g>

        {/* --- BOMBA DE LODO P-05 / M-05 --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("P-05")}
        >
          <circle
            cx="420"
            cy="480"
            r="20"
            fill="#151C24"
            stroke={
              selectedEquipmentId === "P-05" ? "#38BDF8" : isP5Running ? "#D97706" : "#EF4444"
            }
            strokeWidth="2.5"
          />
          <text x="420" y="483" textAnchor="middle" fill="#FFFFFF" fontSize="7.5" fontWeight="bold">
            M5
          </text>
          <rect x="446" y="468" width="90" height="24" rx="3" fill="#0F172A" stroke="#334155" />
          <text
            x="491"
            y="479"
            textAnchor="middle"
            fill="#FDE68A"
            fontSize="7.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            BOMBA LODO P-05
          </text>
          <text
            x="491"
            y="488"
            textAnchor="middle"
            fill="#D97706"
            fontSize="7"
            fontFamily="monospace"
          >
            45.0 m³/h • ATIVA
          </text>
        </g>

        {/* --- BOMBA RESERVA P-06 / M-06 --- */}
        <g
          className="cursor-pointer transition-transform hover:opacity-95"
          onClick={() => selectEquipment("P-06")}
        >
          <circle
            cx="570"
            cy="480"
            r="20"
            fill="#151C24"
            stroke={selectedEquipmentId === "P-06" ? "#38BDF8" : "#475569"}
            strokeWidth="2.5"
          />
          <text x="570" y="483" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="bold">
            M6
          </text>
          <rect x="596" y="468" width="80" height="24" rx="3" fill="#0F172A" stroke="#334155" />
          <text
            x="636"
            y="483"
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="7.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            P-06 RESERVA
          </text>
        </g>

        {/* ================================================================= */}
        {/* 6. VALVES (V-01, V-02, V-03, V-04, V-05, V-06, V-07, V-08)        */}
        {/* ================================================================= */}

        {/* V-01 (Inlet Valve) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-01")}
          transform="translate(60, 270)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text
            x="0"
            y="-12"
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            V-01
          </text>
        </g>

        {/* V-02 (P-01 Discharge Valve) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-02")}
          transform="translate(415, 410)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text
            x="0"
            y="-12"
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            V-02
          </text>
        </g>

        {/* V-03 (Bypass Valve) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-03")}
          transform="translate(460, 340)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#EF4444" />
          <polygon points="9,-9 0,0 9,9" fill="#EF4444" />
          <text x="14" y="3" fill="#94A3B8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            V-03 (BYP)
          </text>
        </g>

        {/* V-04 (P-02 Discharge Valve) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-04")}
          transform="translate(845, 410)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text
            x="0"
            y="-12"
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            V-04
          </text>
        </g>

        {/* V-05 (Retrolavagem Filtro F-01) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-05")}
          transform="translate(890, 270)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#EF4444" />
          <polygon points="9,-9 0,0 9,9" fill="#EF4444" />
          <text x="14" y="3" fill="#94A3B8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            V-05 (RET)
          </text>
        </g>

        {/* V-06 (Injeção de Ar Aeração) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-06")}
          transform="translate(610, 220)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text x="14" y="3" fill="#94A3B8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            V-06 (AR)
          </text>
        </g>

        {/* V-07 (Dosagem Coagulante) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-07")}
          transform="translate(100, 230)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text x="14" y="3" fill="#94A3B8" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            V-07 (DOS)
          </text>
        </g>

        {/* V-08 (Final Outflow Valve) */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("V-08")}
          transform="translate(1280, 410)"
        >
          <polygon points="-9,-9 0,0 -9,9" fill="#10B981" />
          <polygon points="9,-9 0,0 9,9" fill="#10B981" />
          <text
            x="0"
            y="-12"
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            V-08
          </text>
        </g>

        {/* FT-01 Total Flow Transmitter */}
        <g
          className="cursor-pointer"
          onClick={() => selectEquipment("FT-01")}
          transform="translate(1335, 360)"
        >
          <circle cx="0" cy="0" r="14" fill="#1E293B" stroke="#10B981" strokeWidth="1.5" />
          <text
            x="0"
            y="3"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="monospace"
          >
            FT-01
          </text>
          <line
            x1="0"
            y1="14"
            x2="0"
            y2="50"
            stroke="#10B981"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        </g>
      </svg>
    </div>
  );
}
