import { VOLTAI_COLORS, type VoltaiComponentType } from "./component-definitions";

const base = (content: string) =>
  `<svg viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${content}</svg>`;

const line = (stroke: string = VOLTAI_COLORS.power) =>
  `stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const text = (label: string, color: string = VOLTAI_COLORS.neutral) =>
  `<text x="48" y="58" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="${color}">${label}</text>`;

export function getComponentSymbol(type: VoltaiComponentType): string {
  const p = VOLTAI_COLORS.power;
  const c = VOLTAI_COLORS.control;
  const s = VOLTAI_COLORS.signal;
  const n = VOLTAI_COLORS.neutral;

  switch (type) {
    case "QF":
    case "MPCB":
    case "MCB_AUX":
      return base(
        `<path ${line(p)} d="M16 32h20M60 32h20M36 42l24-20"/><path ${line(c)} d="M38 18h20"/><path ${line(n)} d="M62 18l6-6"/><circle cx="48" cy="32" r="18" ${line(p)}/>${text(type, p)}`,
      );
    case "QS":
      return base(
        `<path ${line(p)} d="M14 32h24M58 32h24M38 32l22-14"/><circle cx="38" cy="32" r="3" fill="${p}"/><circle cx="58" cy="32" r="3" fill="${p}"/>${text("QS", p)}`,
      );
    case "DR":
      return base(
        `<rect x="22" y="12" width="52" height="36" rx="4" ${line(p)}/><path ${line(s)} d="M32 30c8-14 24-14 32 0M32 30c8 14 24 14 32 0"/><path ${line(n)} d="M48 18v24"/>${text("DR", s)}`,
      );
    case "FU":
      return base(
        `<path ${line(p)} d="M14 32h18M64 32h18"/><rect x="32" y="20" width="32" height="24" ${line(p)}/><path ${line(p)} d="M38 40l20-16"/>${text("FU", p)}`,
      );
    case "SPD":
    case "TVSS":
      return base(
        `<path ${line(p)} d="M18 20h42l-18 18h36"/><path ${line(n)} d="M48 38v12m-10 0h20"/><path ${line(s)} d="M68 18l8-8M74 24l8-8"/>${text(type, s)}`,
      );
    case "KM":
    case "KA":
    case "CR":
      return base(
        `<path ${line(c)} d="M22 32h18M56 32h18"/><rect x="38" y="18" width="20" height="28" rx="10" ${line(c)}/><path ${line(p)} d="M16 14h22M58 14h22M38 14l20 12"/>${text(type, c)}`,
      );
    case "FR":
      return base(
        `<path ${line(p)} d="M16 18h64M16 32h64M16 46h64"/><path ${line(c)} d="M34 12c16 10 16 30 0 40M62 12c-16 10-16 30 0 40"/>${text("FR", p)}`,
      );
    case "M":
      return base(
        `<circle cx="48" cy="30" r="22" ${line(p)}/><text x="48" y="37" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="${p}">M</text><path ${line(n)} d="M48 52v6"/>`,
      );
    case "SS":
    case "VFD":
      return base(
        `<rect x="20" y="14" width="56" height="36" rx="4" ${line(p)}/><path ${line(s)} d="M30 40c8-18 28-18 36 0"/><path ${line(c)} d="M30 24h16M50 24h16"/>${text(type, s)}`,
      );
    case "TR":
    case "TC":
    case "TP":
    case "TCTERRA":
      return base(
        `<circle cx="38" cy="32" r="14" ${line(p)}/><circle cx="58" cy="32" r="14" ${line(p)}/><path ${line(p)} d="M12 32h12M72 32h12"/><path ${line(n)} d="M48 48v8h10"/>${text(type, p)}`,
      );
    case "PS":
    case "UPS":
    case "SR":
      return base(
        `<rect x="20" y="16" width="56" height="32" rx="4" ${line(c)}/><path ${line(p)} d="M28 32h18"/><path ${line(c)} d="M50 26v12M58 32h10"/>${text(type, c)}`,
      );
    case "PLC":
    case "IED":
    case "PFC":
    case "CT":
    case "KT":
      return base(
        `<rect x="18" y="12" width="60" height="40" rx="5" ${line(s)}/><path ${line(s)} d="M28 20h8M28 28h8M28 36h8M60 20h8M60 28h8M60 36h8"/><path ${line(c)} d="M42 22h12v16H42z"/>${text(type, s)}`,
      );
    case "BC":
      return base(
        `<path ${line(p)} d="M26 16v32M40 16v32M56 16v32M70 16v32M14 32h12M70 32h12"/>${text("BC", p)}`,
      );
    case "G":
      return base(
        `<circle cx="48" cy="30" r="22" ${line(p)}/><text x="48" y="37" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="${p}">G</text>${text("GER", p)}`,
      );
    case "KWH":
      return base(
        `<rect x="20" y="12" width="56" height="40" rx="5" ${line(s)}/><path ${line(s)} d="M30 36h36M34 28h28"/><text x="48" y="25" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="${s}">kWh</text>${text("MED", s)}`,
      );
    case "SA":
      return base(
        `<path ${line(p)} d="M18 18h24M18 46h24M58 32h24M42 18l18 14M42 46l18-14"/><circle cx="42" cy="18" r="3" fill="${p}"/><circle cx="42" cy="46" r="3" fill="${p}"/>${text("ATS", p)}`,
      );
    case "ES":
    case "ESTOP_RELAY":
      return base(
        `<circle cx="48" cy="30" r="20" ${line(c)}/><path ${line(p)} d="M34 16l28 28M62 16L34 44"/>${text(type === "ES" ? "ES" : "SR", p)}`,
      );
    case "HL":
      return base(
        `<circle cx="48" cy="28" r="16" ${line(s)}/><path ${line(s)} d="M30 10l8 8M66 10l-8 8M48 4v12"/>${text("HL", s)}`,
      );
    case "HZ":
    case "SIN":
      return base(
        `<path ${line(c)} d="M24 40h12l18 10V14L36 24H24z"/><path ${line(s)} d="M62 24c6 5 6 11 0 16M70 18c10 9 10 19 0 28"/>${text(type, s)}`,
      );
    case "R":
      return base(`<path ${line(p)} d="M14 32h12l6-12 10 24 10-24 10 24 6-12h14"/>${text("R", p)}`);
    case "L":
      return base(
        `<path ${line(p)} d="M14 32h12c0-14 12-14 12 0s12 14 12 0 12-14 12 0h20"/>${text("L", p)}`,
      );
    case "B":
      return base(
        `<path ${line(c)} d="M22 24h14M29 17v14M42 20v24M54 24h14M54 40h14M74 20v24"/>${text("BAT", c)}`,
      );
    case "V":
      return base(
        `<path ${line(p)} d="M20 22l28 10-28 10zM76 22L48 32l28 10z"/><rect x="38" y="14" width="20" height="10" ${line(c)}/>${text("V", p)}`,
      );
    default:
      return base(
        `<circle cx="48" cy="30" r="18" ${line(s)}/><path ${line(s)} d="M36 30h24M48 18v24"/>${text(type, s)}`,
      );
  }
}
