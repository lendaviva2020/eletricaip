/**
 * ElétricAi Industrial OS — Function Block Diagram (FBD) Engine & IR Translation
 * Paridade com o editor e executor gráfico de blocos de função do CODESYS.
 */

import { FBDNode, FBDConnection } from "../../canonical/types";
import { IRBlock, IRInstruction } from "../compiler/intermediate-representation";

export interface FBDEvaluationContext {
  getVariable: (name: string) => any;
  setVariable: (name: string, value: any) => void;
  nodeStates?: Map<string, any>;
}

export class FBDEngine {
  /**
   * Ordena os nós de FBD em ordem topológica de dependência de conexões
   */
  public static sortNodesTopologically(nodes: FBDNode[], connections: FBDConnection[]): FBDNode[] {
    const nodeMap = new Map<string, FBDNode>(nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n.id, 0);
      adj.set(n.id, []);
    }

    for (const c of connections) {
      adj.get(c.fromNodeId)?.push(c.toNodeId);
      inDegree.set(c.toNodeId, (inDegree.get(c.toNodeId) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sorted: FBDNode[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const node = nodeMap.get(u);
      if (node) sorted.push(node);

      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      }
    }

    // Se houver nós isolados ou não alcançados, adiciona-os ao final
    for (const n of nodes) {
      if (!sorted.includes(n)) sorted.push(n);
    }

    return sorted;
  }

  /**
   * Executa a avaliação da rede de nós FBD
   */
  public static evaluateNetwork(nodes: FBDNode[], connections: FBDConnection[], ctx: FBDEvaluationContext): void {
    const sorted = this.sortNodesTopologically(nodes, connections);
    const pinValues = new Map<string, any>();

    // Inicializa valores com base nas variáveis do contexto
    for (const n of sorted) {
      for (const pin of n.inputs) {
        if (pin.defaultValue !== undefined) {
          pinValues.set(pin.id, pin.defaultValue);
        }
      }
    }

    // Propaga conexões
    for (const conn of connections) {
      if (pinValues.has(conn.fromPinId)) {
        pinValues.set(conn.toPinId, pinValues.get(conn.fromPinId));
      }
    }

    // Executa blocos
    for (const node of sorted) {
      const inVals = node.inputs.map((p) => pinValues.get(p.id));
      let outVal: any = false;

      switch (node.blockType.toUpperCase()) {
        case "AND":
          outVal = inVals.every(Boolean);
          break;
        case "OR":
          outVal = inVals.some(Boolean);
          break;
        case "XOR":
          outVal = Boolean(inVals[0]) !== Boolean(inVals[1]);
          break;
        case "NOT":
          outVal = !Boolean(inVals[0]);
          break;
        case "ADD":
          outVal = (Number(inVals[0]) || 0) + (Number(inVals[1]) || 0);
          break;
        case "SUB":
          outVal = (Number(inVals[0]) || 0) - (Number(inVals[1]) || 0);
          break;
        case "MUL":
          outVal = (Number(inVals[0]) || 0) * (Number(inVals[1]) || 0);
          break;
        case "DIV":
          outVal = (Number(inVals[1]) || 1) !== 0 ? (Number(inVals[0]) || 0) / Number(inVals[1]) : 0;
          break;
        case "GT":
          outVal = (Number(inVals[0]) || 0) > (Number(inVals[1]) || 0);
          break;
        case "GE":
          outVal = (Number(inVals[0]) || 0) >= (Number(inVals[1]) || 0);
          break;
        case "EQ":
          outVal = inVals[0] === inVals[1];
          break;
        case "LE":
          outVal = (Number(inVals[0]) || 0) <= (Number(inVals[1]) || 0);
          break;
        case "LT":
          outVal = (Number(inVals[0]) || 0) < (Number(inVals[1]) || 0);
          break;
        default:
          outVal = inVals[0];
          break;
      }

      if (node.outputs.length > 0) {
        pinValues.set(node.outputs[0].id, outVal);
        ctx.setVariable(node.name, outVal);
      }
    }
  }

  /**
   * Converte a rede de nós FBD em Bloco IR Executável
   */
  public static fbdToIR(pouName: string, nodes: FBDNode[], connections: FBDConnection[]): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};
    const sorted = this.sortNodesTopologically(nodes, connections);

    for (const node of sorted) {
      const outReg = `_fbd_${node.name}`;
      localVariables[node.name] = 0;

      if (node.blockType === "AND" || node.blockType === "OR" || node.blockType === "ADD" || node.blockType === "SUB") {
        const inReg1 = `_in1_${node.name}`;
        const inReg2 = `_in2_${node.name}`;
        instructions.push({ op: "LOAD_CONST", arg1: node.inputs[0]?.defaultValue ?? 0, dest: inReg1 });
        instructions.push({ op: "LOAD_CONST", arg1: node.inputs[1]?.defaultValue ?? 0, dest: inReg2 });
        instructions.push({ op: node.blockType as any, arg1: inReg1, arg2: inReg2, dest: outReg });
        instructions.push({ op: "STORE_VAR", arg1: node.name, arg2: outReg });
      } else if (node.blockType === "TON") {
        instructions.push({
          op: "CALL_FB",
          arg1: "TON",
          arg2: { IN: node.inputs[0]?.currentValue ?? false, PT: node.inputs[1]?.defaultValue ?? "T#5s" },
          dest: node.name,
        });
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName, instructions, localVariables };
  }

  /**
   * Converte a rede de nós FBD em código equivalente em Structured Text (ST)
   */
  public static fbdToST(nodes: FBDNode[], connections: FBDConnection[]): string {
    const lines: string[] = [];
    const sorted = this.sortNodesTopologically(nodes, connections);

    for (const node of sorted) {
      if (node.blockType === "AND" || node.blockType === "OR") {
        const op = node.blockType;
        const in1 = node.inputs[0]?.name || "TRUE";
        const in2 = node.inputs[1]?.name || "TRUE";
        lines.push(`${node.name} := ${in1} ${op} ${in2};`);
      } else if (node.blockType === "TON") {
        lines.push(`${node.name}(IN := ${node.inputs[0]?.name || "FALSE"}, PT := T#5s);`);
      } else {
        lines.push(`(* Bloco ${node.name} [${node.blockType}] *)`);
      }
    }

    return lines.join("\n");
  }
}
