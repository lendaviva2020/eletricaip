// SCADA SUPERVISÓRIO — Sinótico de Processo gerado a partir do PROJETO (ISA-101 / ISA-5.1)
//
// Substitui o P&ID fixo de demonstração (ETE) em projetos de clientes: cada
// equipamento canônico do Unifilar (mesma identidade — AGENTS.md §11.1) é
// classificado em equipamento de processo (rosca, elevador de canecas, exaustor,
// condensador, bomba, tanque, silo…) e desenhado com símbolo vetorial animado.
//
// Regras de verdade visual (ISA-101 / AGENTS.md §11.1.4):
// - Animação só quando o status do equipamento no runtime SCADA é RUNNING.
// - Nível de tanque/silo só é desenhado se houver TAG de nível vinculada; sem
//   TAG, o símbolo mostra "sem TAG de nível" — nenhum valor é inventado.
// - Comandos Partir/Parar atuam apenas no modelo virtual (commandEquipment),
//   auditados e bloqueados por E-STOP; nunca em equipamento físico.

import { useMemo, useState } from "react";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  ArrowsOut,
  Play,
  Stop,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import {
  buildProcessPlantLayout,
  isaInstrumentLetters,
  PROCESS_AREA_LABEL,
  PROCESS_KIND_LABEL,
  ROTATING_KINDS,
  type ProcessArea,
  type ProcessEquipmentKind,
} from "@/lib/scada/process-classifier";
import type { EquipmentTelemetry, ScadaTagDefinition } from "@/lib/scada/types";
import { cn } from "@/lib/utils";

const CELL_W = 156;
const CELL_H = 178;
const LANE_LABEL_W = 128;
const MAX_PER_ROW = 8;
const ROW_GAP = 26;

const C = {
  body: "#1e293b",
  bodyStroke: "#94a3b8",
  part: "#cbd5e1",
  dim: "#475569",
  run: "#22c55e",
  trip: "#ef4444",
  liquid: "#0ea5e9",
  solid: "#d97706",
  air: "#a5b4fc",
  text: "#e2e8f0",
  muted: "#94a3b8",
};

const SYNOPTIC_CSS = `
.ps-spin{animation:ps-spin 1.1s linear infinite;transform-box:fill-box;transform-origin:center}
.ps-spin-slow{animation:ps-spin 2.6s linear infinite;transform-box:fill-box;transform-origin:center}
.ps-slide-x{animation:ps-slide-x .55s linear infinite}
.ps-slide-y{animation:ps-slide-y .7s linear infinite}
.ps-slide-y-down{animation:ps-slide-y-down .7s linear infinite}
.ps-dash{stroke-dasharray:7 6;animation:ps-dash .7s linear infinite}
.ps-dash-slow{stroke-dasharray:4 8;animation:ps-dash 1.4s linear infinite}
.ps-blink{animation:ps-blink 1s steps(2,start) infinite}
.ps-flicker{animation:ps-flicker .35s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}
@keyframes ps-spin{to{transform:rotate(360deg)}}
@keyframes ps-slide-x{from{transform:translateX(0)}to{transform:translateX(-12px)}}
@keyframes ps-slide-y{from{transform:translateY(0)}to{transform:translateY(-16px)}}
@keyframes ps-slide-y-down{from{transform:translateY(-16px)}to{transform:translateY(0)}}
@keyframes ps-dash{to{stroke-dashoffset:-13}}
@keyframes ps-blink{to{visibility:hidden}}
@keyframes ps-flicker{from{transform:scaleY(.8)}to{transform:scaleY(1.1)}}
@media (prefers-reduced-motion: reduce){
  .ps-spin,.ps-spin-slow,.ps-slide-x,.ps-slide-y,.ps-slide-y-down,.ps-dash,.ps-dash-slow,.ps-flicker{animation:none}
}`;

interface SymbolProps {
  kind: ProcessEquipmentKind;
  running: boolean;
  tripped: boolean;
  /** 0–100 quando há TAG de nível; null = sem medição. */
  levelPct: number | null;
  uid: string;
}

/** Símbolo de processo desenhado numa caixa local de 120 × 96. */
function ProcessSymbol({ kind, running, tripped, levelPct, uid }: SymbolProps) {
  const stroke = tripped ? C.trip : C.bodyStroke;
  const spin = running ? "ps-spin" : undefined;
  const flow = running ? "ps-dash" : undefined;
  const clipId = `clip-${uid}`;

  const motorBox = (x: number, y: number) => (
    <g>
      <rect
        x={x}
        y={y}
        width={18}
        height={14}
        rx={2}
        fill={C.body}
        stroke={stroke}
        strokeWidth={1.2}
      />
      <text
        x={x + 9}
        y={y + 10}
        textAnchor="middle"
        fontSize={7}
        fill={C.muted}
        fontFamily="monospace"
      >
        M
      </text>
    </g>
  );

  const levelFill = (x: number, y: number, w: number, h: number, color: string) =>
    levelPct === null ? (
      <text
        x={x + w / 2}
        y={y + h / 2 + 3}
        textAnchor="middle"
        fontSize={7}
        fill={C.dim}
        fontFamily="monospace"
      >
        sem TAG de nível
      </text>
    ) : (
      <rect
        x={x}
        y={y + h * (1 - Math.min(100, Math.max(0, levelPct)) / 100)}
        width={w}
        height={(h * Math.min(100, Math.max(0, levelPct))) / 100}
        fill={color}
        opacity={0.75}
        style={{ transition: "y .6s ease, height .6s ease" }}
      />
    );

  switch (kind) {
    case "screw_conveyor":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={22} y={38} width={84} height={20} rx={9} />
            </clipPath>
          </defs>
          {/* entrada (tremonha) e descarga */}
          <path d="M28 22 L44 22 L40 38 L32 38 Z" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <rect
            x={94}
            y={58}
            width={10}
            height={12}
            fill={C.body}
            stroke={stroke}
            strokeWidth={1.2}
          />
          <rect
            x={22}
            y={38}
            width={84}
            height={20}
            rx={9}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <g clipPath={`url(#${clipId})`}>
            <g className={running ? "ps-slide-x" : undefined}>
              {Array.from({ length: 10 }).map((_, i) => (
                <path
                  key={i}
                  d={`M${24 + i * 12} 56 L${30 + i * 12} 40`}
                  stroke={running ? C.solid : C.part}
                  strokeWidth={2}
                />
              ))}
            </g>
            <line x1={22} y1={48} x2={106} y2={48} stroke={C.dim} strokeWidth={1.5} />
          </g>
          {motorBox(2, 41)}
          <line x1={20} y1={48} x2={22} y2={48} stroke={stroke} strokeWidth={2} />
        </g>
      );

    case "bucket_elevator":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={46} y={14} width={30} height={70} />
            </clipPath>
          </defs>
          <rect
            x={44}
            y={6}
            width={34}
            height={86}
            rx={3}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <circle cx={61} cy={14} r={7} fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <circle cx={61} cy={84} r={7} fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <g clipPath={`url(#${clipId})`}>
            <g className={running ? "ps-slide-y" : undefined}>
              {Array.from({ length: 6 }).map((_, i) => (
                <path
                  key={`u${i}`}
                  d={`M48 ${20 + i * 16} h8 l-2 5 h-6 z`}
                  fill={running ? C.solid : C.part}
                />
              ))}
            </g>
            <g className={running ? "ps-slide-y-down" : undefined}>
              {Array.from({ length: 6 }).map((_, i) => (
                <rect key={`d${i}`} x={67} y={18 + i * 16} width={7} height={4} fill={C.dim} />
              ))}
            </g>
          </g>
          {/* pé (alimentação) e cabeça (descarga) */}
          <path d="M28 76 L44 80 L44 88 L28 88 Z" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <path d="M78 10 L96 22 L96 30 L78 20 Z" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          {motorBox(80, 0)}
        </g>
      );

    case "belt_conveyor":
    case "chain_conveyor":
      return (
        <g>
          <circle cx={22} cy={48} r={9} fill={C.body} stroke={stroke} strokeWidth={1.3} />
          <circle cx={100} cy={48} r={9} fill={C.body} stroke={stroke} strokeWidth={1.3} />
          <g className={spin}>
            <line x1={22} y1={40} x2={22} y2={56} stroke={C.part} strokeWidth={1.4} />
          </g>
          <g className={spin}>
            <line x1={100} y1={40} x2={100} y2={56} stroke={C.part} strokeWidth={1.4} />
          </g>
          <line
            x1={22}
            y1={39}
            x2={100}
            y2={39}
            stroke={running ? C.solid : C.part}
            strokeWidth={kind === "chain_conveyor" ? 3 : 2.4}
            className={flow}
            style={{ strokeDasharray: kind === "chain_conveyor" ? "4 3" : undefined }}
          />
          <line x1={22} y1={57} x2={100} y2={57} stroke={C.dim} strokeWidth={2} />
          {running &&
            [34, 58, 82].map((x) => (
              <rect
                key={x}
                x={x}
                y={33}
                width={9}
                height={5}
                rx={1}
                fill={C.solid}
                className="ps-slide-x"
              />
            ))}
          {motorBox(91, 62)}
        </g>
      );

    case "exhaust_fan":
      return (
        <g>
          <path
            d="M60 18 a30 30 0 1 1 -29.5 35 L30 30 L60 18 Z"
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <rect
            x={86}
            y={14}
            width={22}
            height={14}
            fill={C.body}
            stroke={stroke}
            strokeWidth={1.2}
          />
          <g className={spin}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <path
                key={a}
                d="M60 48 Q66 34 60 26"
                stroke={running ? C.air : C.part}
                strokeWidth={3}
                fill="none"
                transform={`rotate(${a} 60 48)`}
              />
            ))}
            <circle cx={60} cy={48} r={4} fill={C.part} />
          </g>
          {running && <path d="M108 21 h12" stroke={C.air} strokeWidth={2} className="ps-dash" />}
          {motorBox(4, 70)}
        </g>
      );

    case "condenser":
    case "heat_exchanger":
      return (
        <g>
          <rect
            x={14}
            y={30}
            width={92}
            height={36}
            rx={18}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          {[38, 46, 54, 62].map((y) => (
            <line
              key={y}
              x1={26}
              y1={y - 2}
              x2={94}
              y2={y - 2}
              stroke={running ? C.liquid : C.dim}
              strokeWidth={1.6}
              className={running ? "ps-dash-slow" : undefined}
            />
          ))}
          {/* bocais vapor (entrada) / condensado (saída) / água */}
          <rect x={30} y={18} width={8} height={12} fill={C.body} stroke={stroke} strokeWidth={1} />
          <rect x={82} y={66} width={8} height={12} fill={C.body} stroke={stroke} strokeWidth={1} />
          <line x1={2} y1={48} x2={14} y2={48} stroke={C.liquid} strokeWidth={2} className={flow} />
          <line
            x1={106}
            y1={48}
            x2={118}
            y2={48}
            stroke={C.liquid}
            strokeWidth={2}
            className={flow}
          />
          <text
            x={34}
            y={14}
            textAnchor="middle"
            fontSize={6.5}
            fill={C.muted}
            fontFamily="monospace"
          >
            {kind === "condenser" ? "vapor" : "quente"}
          </text>
        </g>
      );

    case "cooling_tower":
      return (
        <g>
          <path
            d="M34 90 Q46 52 38 22 L82 22 Q74 52 86 90 Z"
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <ellipse cx={60} cy={20} rx={22} ry={4} fill={C.body} stroke={stroke} strokeWidth={1} />
          <g className={spin}>
            <line
              x1={44}
              y1={16}
              x2={76}
              y2={16}
              stroke={running ? C.air : C.part}
              strokeWidth={2.5}
            />
          </g>
          {running &&
            [48, 60, 72].map((x) => (
              <line
                key={x}
                x1={x}
                y1={34}
                x2={x}
                y2={80}
                stroke={C.liquid}
                strokeWidth={1.2}
                className="ps-dash-slow"
              />
            ))}
        </g>
      );

    case "pump":
      return (
        <g>
          <line
            x1={2}
            y1={56}
            x2={36}
            y2={56}
            stroke={running ? C.liquid : C.dim}
            strokeWidth={4}
            className={flow}
          />
          <circle cx={56} cy={56} r={20} fill="#0f172a" stroke={stroke} strokeWidth={1.5} />
          <path d="M56 36 L100 36 L100 44 L70 44" fill={C.body} stroke={stroke} strokeWidth={1.3} />
          <line
            x1={100}
            y1={40}
            x2={118}
            y2={40}
            stroke={running ? C.liquid : C.dim}
            strokeWidth={4}
            className={flow}
          />
          <g className={spin}>
            {[0, 90, 180, 270].map((a) => (
              <path
                key={a}
                d="M56 56 Q62 48 56 40"
                stroke={running ? C.liquid : C.part}
                strokeWidth={2.4}
                fill="none"
                transform={`rotate(${a} 56 56)`}
              />
            ))}
          </g>
          {motorBox(47, 80)}
        </g>
      );

    case "compressor":
      return (
        <g>
          <rect
            x={22}
            y={30}
            width={60}
            height={40}
            rx={4}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <path d="M34 34 L70 42 L70 58 L34 66 Z" fill={C.body} stroke={C.part} strokeWidth={1} />
          <g className={spin}>
            <circle
              cx={96}
              cy={50}
              r={10}
              fill="none"
              stroke={C.part}
              strokeWidth={1.4}
              strokeDasharray="4 3"
            />
          </g>
          <line x1={82} y1={50} x2={86} y2={50} stroke={stroke} strokeWidth={2} />
          <line
            x1={2}
            y1={50}
            x2={22}
            y2={50}
            stroke={running ? C.air : C.dim}
            strokeWidth={3}
            className={flow}
          />
        </g>
      );

    case "boiler":
      return (
        <g>
          <rect
            x={26}
            y={16}
            width={68}
            height={70}
            rx={8}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <rect x={38} y={58} width={44} height={20} rx={3} fill={C.body} stroke={C.dim} />
          {running && (
            <path
              className="ps-flicker"
              d="M52 76 Q48 66 56 60 Q56 68 60 64 Q66 70 62 76 Z"
              fill="#f97316"
            />
          )}
          <path
            d="M60 16 L60 4 L80 4"
            stroke={running ? "#e2e8f0" : C.dim}
            strokeWidth={3}
            fill="none"
            className={running ? "ps-dash" : undefined}
          />
          <text
            x={60}
            y={42}
            textAnchor="middle"
            fontSize={8}
            fill={C.muted}
            fontFamily="monospace"
          >
            VAPOR
          </text>
        </g>
      );

    case "tank":
    case "mixer":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={32} y={18} width={56} height={70} rx={8} />
            </clipPath>
          </defs>
          <rect
            x={32}
            y={18}
            width={56}
            height={70}
            rx={8}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <g clipPath={`url(#${clipId})`}>{levelFill(32, 18, 56, 70, C.liquid)}</g>
          {kind === "mixer" && (
            <g>
              <line x1={60} y1={8} x2={60} y2={72} stroke={C.part} strokeWidth={2} />
              <g className={spin}>
                <path
                  d="M46 72 L74 72 M60 66 L60 78"
                  stroke={running ? C.solid : C.part}
                  strokeWidth={3}
                />
              </g>
              {motorBox(51, 0)}
            </g>
          )}
          <line x1={12} y1={30} x2={32} y2={30} stroke={C.dim} strokeWidth={3} />
          <line x1={88} y1={80} x2={108} y2={80} stroke={C.dim} strokeWidth={3} />
        </g>
      );

    case "silo":
    case "hopper":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <path
                d={
                  kind === "silo"
                    ? "M36 12 h48 v52 L64 86 h-8 L36 64 Z"
                    : "M24 24 h72 L66 76 h-12 Z"
                }
              />
            </clipPath>
          </defs>
          <path
            d={kind === "silo" ? "M36 12 h48 v52 L64 86 h-8 L36 64 Z" : "M24 24 h72 L66 76 h-12 Z"}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          {kind === "silo" && (
            <path d="M36 12 Q60 0 84 12" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          )}
          <g clipPath={`url(#${clipId})`}>
            {levelFill(24, kind === "silo" ? 12 : 24, 72, kind === "silo" ? 74 : 52, C.solid)}
          </g>
          <line x1={60} y1={86} x2={60} y2={94} stroke={C.dim} strokeWidth={4} />
        </g>
      );

    case "mill":
      return (
        <g>
          <rect
            x={26}
            y={20}
            width={68}
            height={60}
            rx={6}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <path d="M44 20 L50 6 L70 6 L76 20" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <g className={spin}>
            <circle cx={60} cy={50} r={18} fill="none" stroke={C.part} strokeWidth={1.2} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <rect
                key={a}
                x={58}
                y={30}
                width={4}
                height={10}
                fill={running ? C.solid : C.part}
                transform={`rotate(${a} 60 50)`}
              />
            ))}
          </g>
          {motorBox(96, 43)}
        </g>
      );

    case "dryer":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={14} y={34} width={92} height={28} rx={4} />
            </clipPath>
          </defs>
          <rect
            x={14}
            y={34}
            width={92}
            height={28}
            rx={4}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <g clipPath={`url(#${clipId})`}>
            <g className={running ? "ps-slide-x" : undefined}>
              {Array.from({ length: 10 }).map((_, i) => (
                <line
                  key={i}
                  x1={16 + i * 12}
                  y1={34}
                  x2={16 + i * 12}
                  y2={62}
                  stroke={C.dim}
                  strokeWidth={4}
                />
              ))}
            </g>
          </g>
          <rect x={30} y={62} width={8} height={18} fill={C.body} stroke={stroke} />
          <rect x={82} y={62} width={8} height={18} fill={C.body} stroke={stroke} />
          {running && (
            <path
              d="M14 26 Q30 18 46 26 T78 26 T106 26"
              stroke="#f97316"
              strokeWidth={1.3}
              fill="none"
              className="ps-dash-slow"
            />
          )}
        </g>
      );

    case "press":
    case "extractor":
      return (
        <g>
          <defs>
            <clipPath id={clipId}>
              <rect x={24} y={40} width={74} height={16} />
            </clipPath>
          </defs>
          <rect
            x={18}
            y={28}
            width={86}
            height={40}
            rx={4}
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          <path d="M30 14 L48 14 L44 28 L34 28 Z" fill={C.body} stroke={stroke} strokeWidth={1.2} />
          <g clipPath={`url(#${clipId})`}>
            <g className={running ? "ps-slide-x" : undefined}>
              {Array.from({ length: 9 }).map((_, i) => (
                <path
                  key={i}
                  d={`M${26 + i * 12} 56 L${32 + i * 12} 40`}
                  stroke={running ? C.solid : C.part}
                  strokeWidth={2.4}
                />
              ))}
            </g>
          </g>
          {/* saída de óleo (líquido) e torta (sólido) */}
          <line
            x1={60}
            y1={68}
            x2={60}
            y2={84}
            stroke={running ? "#facc15" : C.dim}
            strokeWidth={3}
            className={flow}
          />
          <line
            x1={104}
            y1={48}
            x2={118}
            y2={48}
            stroke={running ? C.solid : C.dim}
            strokeWidth={4}
            className={flow}
          />
          {motorBox(0, 41)}
        </g>
      );

    case "cyclone":
    case "filter":
      return (
        <g>
          <path
            d="M40 14 h40 v30 L66 86 h-12 L40 44 Z"
            fill="#0f172a"
            stroke={stroke}
            strokeWidth={1.4}
          />
          {kind === "cyclone" ? (
            <path
              d="M48 22 Q72 26 48 32 Q72 38 52 46 Q68 54 56 64"
              stroke={running ? C.air : C.dim}
              strokeWidth={1.4}
              fill="none"
              className={running ? "ps-dash-slow" : undefined}
            />
          ) : (
            [24, 32, 40].map((y) => (
              <line key={y} x1={44} y1={y} x2={76} y2={y} stroke={C.dim} strokeDasharray="2 2" />
            ))
          )}
          <line x1={20} y1={22} x2={40} y2={22} stroke={C.dim} strokeWidth={3} />
          <line x1={60} y1={14} x2={60} y2={2} stroke={C.dim} strokeWidth={3} />
        </g>
      );

    case "valve":
      return (
        <g>
          <line
            x1={10}
            y1={50}
            x2={110}
            y2={50}
            stroke={running ? C.liquid : C.dim}
            strokeWidth={4}
            className={flow}
          />
          <path d="M44 38 L76 62 L76 38 L44 62 Z" fill={C.body} stroke={stroke} strokeWidth={1.4} />
          <line x1={60} y1={50} x2={60} y2={28} stroke={stroke} strokeWidth={1.4} />
          <rect x={50} y={20} width={20} height={8} fill={C.body} stroke={stroke} />
        </g>
      );

    case "transformer":
      return (
        <g>
          <circle cx={50} cy={50} r={20} fill="none" stroke={stroke} strokeWidth={1.6} />
          <circle cx={70} cy={50} r={20} fill="none" stroke={stroke} strokeWidth={1.6} />
          <line
            x1={4}
            y1={50}
            x2={30}
            y2={50}
            stroke={running ? "#facc15" : C.dim}
            strokeWidth={2}
            className={flow}
          />
          <line
            x1={90}
            y1={50}
            x2={116}
            y2={50}
            stroke={running ? "#facc15" : C.dim}
            strokeWidth={2}
            className={flow}
          />
        </g>
      );

    case "generator":
    case "motor":
    default:
      return (
        <g>
          <circle cx={60} cy={48} r={24} fill="#0f172a" stroke={stroke} strokeWidth={1.6} />
          <text
            x={60}
            y={46}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill={C.text}
            fontFamily="monospace"
          >
            {kind === "generator" ? "G" : "M"}
          </text>
          <text
            x={60}
            y={58}
            textAnchor="middle"
            fontSize={8}
            fill={C.muted}
            fontFamily="monospace"
          >
            3~
          </text>
          <line x1={84} y1={48} x2={104} y2={48} stroke={C.part} strokeWidth={3} />
          <g className={spin}>
            <circle
              cx={108}
              cy={48}
              r={6}
              fill="none"
              stroke={running ? C.run : C.part}
              strokeWidth={1.6}
            />
            <line
              x1={108}
              y1={42}
              x2={108}
              y2={54}
              stroke={running ? C.run : C.part}
              strokeWidth={1.6}
            />
          </g>
        </g>
      );
  }
}

function findLinkedTagValue(
  eq: EquipmentTelemetry,
  tags: Record<string, ScadaTagDefinition>,
  matcher: RegExp,
): number | null {
  for (const tagName of eq.linkedTags ?? []) {
    const t = tags[tagName];
    if (t && matcher.test(tagName.toUpperCase()) && typeof t.value === "number") {
      const span = (t.scaleMax ?? 100) - (t.scaleMin ?? 0) || 100;
      return ((t.value - (t.scaleMin ?? 0)) / span) * 100;
    }
  }
  return null;
}

export interface ProcessPlantSynopticProps {
  /** Restringe o sinótico a uma área de processo. */
  areaFilter?: ProcessArea | "all";
  className?: string;
}

export function ProcessPlantSynoptic({ areaFilter = "all", className }: ProcessPlantSynopticProps) {
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const selectedEquipmentId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const commandEquipment = useScadaStore((s) => s.commandEquipment);
  const estopActive = useScadaStore((s) => s.estopActive);
  const isSimulationMode = useScadaStore((s) => s.isSimulationMode);
  const canonicalEquipments = useUnifiedProjectStore((s) => s.doc.engineering?.equipments);
  const [zoom, setZoom] = useState(1);

  const layout = useMemo(() => {
    const list = Object.values(equipments)
      .filter((e): e is EquipmentTelemetry => Boolean(e && e.id))
      .map((e) => {
        const canon = canonicalEquipments?.[e.id];
        const notes =
          canon?.diagramParams && "notes" in canon.diagramParams
            ? (canon.diagramParams.notes ?? "")
            : "";
        return {
          id: e.id,
          tag: e.tag,
          name: `${e.name} ${notes}`.trim(),
          catalogType: canon?.catalogType,
          telemetry: e,
        };
      });
    return buildProcessPlantLayout(list);
  }, [equipments, canonicalEquipments]);

  const areas = layout.areas.filter((a) => areaFilter === "all" || a.area === areaFilter);

  // Geometria: cada área é uma faixa; quebra em sub-linhas de até MAX_PER_ROW.
  const rows: Array<{ area: ProcessArea; items: (typeof areas)[number]["items"]; first: boolean }> =
    [];
  for (const a of areas) {
    for (let i = 0; i < a.items.length; i += MAX_PER_ROW) {
      rows.push({ area: a.area, items: a.items.slice(i, i + MAX_PER_ROW), first: i === 0 });
    }
  }
  const maxCols = Math.max(1, ...rows.map((r) => r.items.length));
  const width = LANE_LABEL_W + maxCols * CELL_W + 24;
  const height = Math.max(1, rows.length) * (CELL_H + ROW_GAP) + 16;

  const processItems = areas.flatMap((a) => a.items);
  const drivenIds = processItems
    .filter((i) => ROTATING_KINDS.has(i.classification.kind))
    .map((i) => i.equipment.id);

  if (processItems.length === 0) {
    return (
      <div
        className={cn(
          "w-full min-h-[320px] bg-[#070A0E] border border-[#1E293B] rounded-lg flex flex-col items-center justify-center p-8 text-center",
          className,
        )}
        data-testid="scada-process-synoptic-empty"
      >
        <p className="text-sm font-mono font-bold uppercase text-white">
          Nenhum equipamento de processo {areaFilter !== "all" ? "nesta área" : "no projeto"}
        </p>
        <p className="text-xs text-zinc-400 font-mono max-w-md mt-2 leading-relaxed">
          Insira motores e cargas no Unifilar com o nome da aplicação (ex.: "Rosca transportadora
          RT-01", "Elevador de canecas EL-01", "Exaustor EX-01", "Condensador CD-01", "Tanque de
          óleo TQ-01") para gerar o sinótico automaticamente.
          {layout.switchgearCount > 0 &&
            ` ${layout.switchgearCount} dispositivos de manobra/proteção estão no Unifilar.`}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full bg-[#070A0E] border border-[#1E293B] rounded-lg overflow-hidden flex flex-col",
        className,
      )}
      data-testid="scada-process-synoptic"
    >
      <style>{SYNOPTIC_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[#1E293B] bg-[#0B1017]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-white font-bold truncate">
            Sinótico de processo do projeto · {processItems.length} equipamentos
          </span>
          {layout.instruments.length > 0 && (
            <span className="text-[10px] font-mono text-cyan-400 shrink-0">
              {layout.instruments.length} instrumentos
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isSimulationMode && drivenIds.length > 0 && (
            <>
              <button
                type="button"
                disabled={estopActive}
                onClick={() => drivenIds.forEach((id) => commandEquipment(id, "START"))}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/30 disabled:opacity-40"
                title="Partir todos no modelo virtual (sem atuação física)"
              >
                <Play className="w-3 h-3" weight="fill" /> Partir todos (sim.)
              </button>
              <button
                type="button"
                onClick={() => drivenIds.forEach((id) => commandEquipment(id, "STOP"))}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
                title="Parar todos no modelo virtual"
              >
                <Stop className="w-3 h-3" weight="fill" /> Parar todos
              </button>
            </>
          )}
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded p-0.5">
            <button
              type="button"
              aria-label="Aumentar zoom"
              onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(2)))}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            >
              <MagnifyingGlassPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Diminuir zoom"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            >
              <MagnifyingGlassMinus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Ajustar à tela"
              onClick={() => setZoom(1)}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            >
              <ArrowsOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={zoom === 1 ? "100%" : width * zoom}
          style={zoom === 1 ? { minWidth: Math.min(width, 640) } : undefined}
          role="img"
          aria-label="Sinótico de processo gerado a partir dos equipamentos do projeto"
          className="block"
        >
          <defs>
            <pattern id="ps-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0 L0 0 0 24" fill="none" stroke="#0f1722" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#ps-grid)" />

          {rows.map((row, r) => {
            const y0 = 8 + r * (CELL_H + ROW_GAP);
            const anyRunning = row.items.some((i) => i.equipment.telemetry.status === "RUNNING");
            const lineY = y0 + CELL_H - 30;
            const lastX = LANE_LABEL_W + (row.items.length - 1) * CELL_W + CELL_W / 2;
            return (
              <g key={`${row.area}-${r}`}>
                <rect
                  x={4}
                  y={y0}
                  width={width - 8}
                  height={CELL_H}
                  rx={6}
                  fill="#0a0f16"
                  stroke="#1e293b"
                />
                {row.first && (
                  <text
                    x={14}
                    y={y0 + 20}
                    fontSize={10}
                    fontWeight={700}
                    fill="#60a5fa"
                    fontFamily="monospace"
                  >
                    {PROCESS_AREA_LABEL[row.area].toUpperCase()}
                  </text>
                )}
                {/* Linha de processo da área (representativa, sentido do fluxo →) */}
                {row.items.length > 1 && (
                  <line
                    x1={LANE_LABEL_W + CELL_W / 2}
                    y1={lineY}
                    x2={lastX}
                    y2={lineY}
                    stroke={
                      anyRunning ? (row.area === "utilities" ? C.liquid : C.solid) : "#334155"
                    }
                    strokeWidth={3}
                    className={anyRunning ? "ps-dash" : undefined}
                  />
                )}
                {/* Interligação com a próxima faixa */}
                {r < rows.length - 1 && (
                  <path
                    d={`M${LANE_LABEL_W / 2} ${y0 + CELL_H} v${ROW_GAP}`}
                    stroke="#334155"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                  />
                )}

                {row.items.map((item, c) => {
                  const eq = item.equipment.telemetry;
                  const kind = item.classification.kind;
                  const running = eq.status === "RUNNING" || eq.status === "OPEN";
                  const tripped = eq.status === "TRIPPED";
                  const selected = selectedEquipmentId === eq.id;
                  const x = LANE_LABEL_W + c * CELL_W;
                  const levelPct =
                    kind === "tank" || kind === "silo" || kind === "hopper" || kind === "mixer"
                      ? (eq.levelPct ?? findLinkedTagValue(eq, tags, /NIVEL|NÍVEL|LEVEL|LT/))
                      : null;
                  const current = running ? eq.currentA : 0;
                  return (
                    <g
                      key={eq.id}
                      transform={`translate(${x} ${y0 + 6})`}
                      onClick={() => selectEquipment(eq.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") selectEquipment(eq.id);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${eq.tag} — ${PROCESS_KIND_LABEL[kind]} — ${eq.status}`}
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={2}
                        y={0}
                        width={CELL_W - 8}
                        height={CELL_H - 12}
                        rx={6}
                        fill={selected ? "#13233a" : "transparent"}
                        stroke={selected ? "#60a5fa" : tripped ? C.trip : "transparent"}
                        strokeWidth={selected ? 1.6 : 1.2}
                        className={tripped ? "ps-blink" : undefined}
                      />
                      {/* status LED */}
                      <circle
                        cx={CELL_W - 18}
                        cy={12}
                        r={4}
                        fill={tripped ? C.trip : running ? C.run : "#334155"}
                        className={tripped ? "ps-blink" : undefined}
                      />
                      <g transform="translate(14 14)">
                        <ProcessSymbol
                          kind={kind}
                          running={running}
                          tripped={tripped}
                          levelPct={levelPct}
                          uid={eq.id.replace(/[^a-zA-Z0-9_-]/g, "_")}
                        />
                      </g>
                      <text
                        x={CELL_W / 2 - 4}
                        y={124}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={700}
                        fill="#93c5fd"
                        fontFamily="monospace"
                      >
                        {eq.tag.length > 18 ? `${eq.tag.slice(0, 17)}…` : eq.tag}
                      </text>
                      <text
                        x={CELL_W / 2 - 4}
                        y={136}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill={C.muted}
                        fontFamily="monospace"
                      >
                        {PROCESS_KIND_LABEL[kind]}
                      </text>
                      <text
                        x={CELL_W / 2 - 4}
                        y={150}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill={running ? C.run : tripped ? C.trip : "#64748b"}
                        fontFamily="monospace"
                      >
                        {tripped
                          ? "TRIP"
                          : `${eq.status}${eq.powerKw > 0 ? ` · ${eq.powerKw.toFixed(1)} kW` : ""}${running && current > 0 ? ` · ${current.toFixed(1)} A` : ""}`}
                      </text>
                      {levelPct !== null && (
                        <text
                          x={CELL_W / 2 - 4}
                          y={162}
                          textAnchor="middle"
                          fontSize={8.5}
                          fill={C.liquid}
                          fontFamily="monospace"
                        >
                          Nível {levelPct.toFixed(0)} %
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {layout.instruments.length > 0 && (
        <div className="border-t border-[#1E293B] px-3 py-2 flex flex-wrap gap-2 bg-[#0B1017]">
          {layout.instruments.map((inst) => {
            const eq = inst.equipment.telemetry;
            const letters = isaInstrumentLetters(inst.equipment.catalogType);
            return (
              <button
                key={eq.id}
                type="button"
                onClick={() => selectEquipment(eq.id)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 hover:text-white"
                title={eq.name}
              >
                <span className="w-7 h-7 rounded-full border border-cyan-500/60 grid place-items-center text-[8.5px] font-bold text-cyan-300">
                  {letters}
                </span>
                {eq.tag}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-[#1E293B] text-[9.5px] font-mono text-zinc-500 flex flex-wrap justify-between gap-2">
        <span>
          Equipamentos do Unifilar classificados por tipo/nome. Linhas de área são representativas —
          o sequenciamento real é definido na engenharia de processo.
        </span>
        {layout.switchgearCount > 0 && (
          <span>{layout.switchgearCount} dispositivos de manobra/proteção no Unifilar</span>
        )}
      </div>
    </div>
  );
}
