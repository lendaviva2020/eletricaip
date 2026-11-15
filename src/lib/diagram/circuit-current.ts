// Corrente de projeto de um circuito a partir do nó de carga (auditoria F2.7).
//
// Antes havia três cópias divergentes desta estimativa (multifilar.ts,
// diagnostics/rules-catalog.ts e electrical-calc.ts): cosφ/η fixos 0,85/0,88
// ignorando o motor de cálculo e P/(V·fp) — fórmula monofásica — aplicada também
// a cargas trifásicas. Esta é a fonte única; toda premissa adotada é devolvida
// em `assumptions` para ser exibida ao usuário.
import { motorNominalCurrent } from "@/lib/electrical-calc";
import type { DiagramNode } from "./schema";

/** Valores padrão do motor de cálculos (electrical-calc.motorNominalCurrent). */
export const DEFAULT_MOTOR_COSPHI = 0.86;
export const DEFAULT_MOTOR_EFFICIENCY = 0.92;

export interface CircuitCurrentEstimate {
  /** Corrente de projeto (A), ou undefined quando nenhum nó de carga define a corrente. */
  current_A: number | undefined;
  /** Fator de potência do circuito usado no cálculo de queda de tensão. */
  cosphi: number;
  /** Tensão nominal declarada no nó de carga, quando houver (V). */
  voltage_V: number | undefined;
  /** Premissas sobre dados de entrada do circuito (exibidas ao usuário). */
  assumptions: string[];
  /**
   * Valores típicos adotados para parâmetros que o modelo não permite declarar
   * (ex.: cosφ do motor quando a corrente é declarada). Exibidos no canvas, mas
   * não contam como dado de entrada ausente.
   */
  informativeAssumptions?: string[];
  /** Nó que definiu a corrente. */
  sourceNodeId?: string;
  /** A corrente é a nominal do dispositivo de proteção, não a da carga (premissa crítica). */
  currentFromProtectionRating?: boolean;
}

type AnyParams = Record<string, unknown> & { kind: string };

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Estima a corrente de projeto do circuito a partir do primeiro nó de carga
 * encontrado entre `candidates` (normalmente [destino, origem] da aresta).
 */
export function estimateCircuitCurrent(
  candidates: Array<DiagramNode | undefined>,
  isThreePhase: boolean,
): CircuitCurrentEstimate {
  const assumptions: string[] = [];
  for (const node of candidates) {
    if (!node) continue;
    const p = node.params as unknown as AnyParams;
    const voltage_V = num(p.voltage_V);
    switch (p.kind) {
      case "motor": {
        const declared = num(p.current_A) ?? num(p.fla_A);
        if (declared !== undefined) {
          return {
            current_A: declared,
            cosphi: DEFAULT_MOTOR_COSPHI,
            voltage_V,
            assumptions: [],
            informativeAssumptions: [
              `cosφ do motor ${node.label || node.id} não declarado; adotado ${DEFAULT_MOTOR_COSPHI}`,
            ],
            sourceNodeId: node.id,
          };
        }
        const power_kW = num(p.power_kW);
        if (power_kW === undefined) break;
        const U = voltage_V ?? 380;
        assumptions.push(
          `Corrente do motor ${node.label || node.id} calculada de ${power_kW} kW com cosφ ${DEFAULT_MOTOR_COSPHI} e η ${DEFAULT_MOTOR_EFFICIENCY} (não declarados)`,
        );
        return {
          current_A: motorNominalCurrent({
            id: node.id,
            power_kW,
            voltage_V: U,
            cosphi: DEFAULT_MOTOR_COSPHI,
            efficiency: DEFAULT_MOTOR_EFFICIENCY,
          }),
          cosphi: DEFAULT_MOTOR_COSPHI,
          voltage_V: U,
          assumptions,
          sourceNodeId: node.id,
        };
      }
      case "load": {
        const power_W = num(p.power_W);
        if (power_W === undefined) break;
        const fp = num(p.fp) ?? 0.92;
        if (num(p.fp) === undefined)
          assumptions.push(`Fator de potência da carga ${node.label || node.id} adotado ${fp}`);
        const U = voltage_V ?? (isThreePhase ? 380 : 220);
        // Trifásico: I = P / (√3·U·fp); monofásico: I = P / (U·fp).
        const current_A = isThreePhase ? power_W / (Math.sqrt(3) * U * fp) : power_W / (U * fp);
        return { current_A, cosphi: fp, voltage_V: U, assumptions, sourceNodeId: node.id };
      }
      case "lamp": {
        const power_W = num(p.power_W);
        if (power_W === undefined) break;
        const U = voltage_V ?? 220;
        assumptions.push(`Luminária ${node.label || node.id}: fator de potência adotado 1,0`);
        return {
          current_A: power_W / U,
          cosphi: 1,
          voltage_V: U,
          assumptions,
          sourceNodeId: node.id,
        };
      }
      case "socket": {
        const current_A = num(p.current_A);
        if (current_A === undefined) break;
        assumptions.push(
          `Tomada ${node.label || node.id}: corrente nominal do ponto usada como corrente de projeto; fp adotado 1,0`,
        );
        return { current_A, cosphi: 1, voltage_V, assumptions, sourceNodeId: node.id };
      }
      case "breaker": {
        const in_A = num(p.in_A);
        if (in_A === undefined) break;
        assumptions.push(
          `Corrente de projeto adotada igual à corrente nominal do disjuntor ${node.label || node.id} (${in_A} A); fp adotado ${DEFAULT_MOTOR_COSPHI}`,
        );
        return {
          current_A: in_A,
          cosphi: DEFAULT_MOTOR_COSPHI,
          voltage_V,
          assumptions,
          sourceNodeId: node.id,
          currentFromProtectionRating: true,
        };
      }
      default:
        break;
    }
  }
  return { current_A: undefined, cosphi: DEFAULT_MOTOR_COSPHI, voltage_V: undefined, assumptions };
}
