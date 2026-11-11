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

    // Diagnóstico estrito de ciclos inválidos:
    if (sorted.length < nodes.length) {
      const unreached = nodes.filter((n) => !sorted.includes(n));
      const hasCyclicEdge = connections.some(
        (c) =>
          unreached.some((u) => u.id === c.fromNodeId) &&
          unreached.some((u) => u.id === c.toNodeId),
      );
      if (hasCyclicEdge) {
        throw new Error(
          `FBD_CIRCULAR_DEPENDENCY: Ciclo inválido detectado entre os blocos: ${unreached.map((n) => n.name).join(", ")}`,
        );
      }
      // Apenas nós puramente isolados (sem conexões) são anexados
      for (const n of unreached) {
        sorted.push(n);
      }
    }

    return sorted;
  }

  /**
   * Executa a avaliação da rede de nós FBD com propagação em cascata topo-abaixo determinística
   */
  public static evaluateNetwork(
    nodes: FBDNode[],
    connections: FBDConnection[],
    ctx: FBDEvaluationContext,
  ): void {
    const sorted = this.sortNodesTopologically(nodes, connections);
    const pinValues = new Map<string, any>();

    // Inicializa valores padrão
    for (const n of sorted) {
      for (const pin of n.inputs) {
        if (pin.defaultValue !== undefined) {
          pinValues.set(pin.id, pin.defaultValue);
        }
      }
    }

    // Executa blocos em ordem topológica e propaga os resultados calculados para nós a jusante
    for (const node of sorted) {
      const inVals = node.inputs.map((pin) => {
        if (pinValues.has(pin.id)) return pinValues.get(pin.id);
        const ctxVal = ctx.getVariable(pin.name);
        if (ctxVal !== undefined) return ctxVal;
        return pin.defaultValue !== undefined ? pin.defaultValue : false;
      });

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
          outVal = !inVals[0];
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
          outVal =
            (Number(inVals[1]) || 1) !== 0 ? (Number(inVals[0]) || 0) / Number(inVals[1]) : 0;
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
        for (const outPin of node.outputs) {
          pinValues.set(outPin.id, outVal);
          // Propaga imediatamente o valor calculado para os pinos de entrada conectados
          for (const conn of connections) {
            if (conn.fromPinId === outPin.id) {
              pinValues.set(conn.toPinId, outVal);
            }
          }
        }
        ctx.setVariable(node.name, outVal);
      }
    }
  }

  /**
   * Converte a rede de nós FBD em Bloco IR Executável com encadeamento real de conexões
   */
  public static fbdToIR(pouName: string, nodes: FBDNode[], connections: FBDConnection[]): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};
    const sorted = this.sortNodesTopologically(nodes, connections);

    const incomingMap = new Map<string, { fromNodeName: string; fromPinId: string }>();
    for (const c of connections) {
      const fromNode = nodes.find((n) => n.id === c.fromNodeId);
      if (fromNode) {
        incomingMap.set(c.toPinId, { fromNodeName: fromNode.name, fromPinId: c.fromPinId });
      }
    }

    for (const node of sorted) {
      const outReg = `_fbd_${node.name}`;
      localVariables[node.name] = 0;

      const inRegs: string[] = [];
      node.inputs.forEach((pin, idx) => {
        const inReg = `_in_${node.name}_${idx}`;
        const incoming = incomingMap.get(pin.id);
        if (incoming) {
          instructions.push({
            op: "LOAD_VAR",
            arg1: `_fbd_${incoming.fromNodeName}`,
            dest: inReg,
            sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
          });
        } else if (pin.defaultValue !== undefined) {
          instructions.push({
            op: "LOAD_CONST",
            arg1: pin.defaultValue,
            dest: inReg,
            sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
          });
        } else {
          instructions.push({
            op: "LOAD_VAR",
            arg1: pin.name,
            dest: inReg,
            sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
          });
        }
        inRegs.push(inReg);
      });

      const bType = node.blockType.toUpperCase();
      if (bType === "NOT") {
        instructions.push({
          op: "NOT",
          arg1: inRegs[0] ?? true,
          dest: outReg,
          sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
        });
      } else if (
        ["AND", "OR", "XOR", "ADD", "SUB", "MUL", "DIV", "GT", "GE", "LT", "LE", "EQ"].includes(
          bType,
        )
      ) {
        instructions.push({
          op: bType as any,
          arg1: inRegs[0] ?? 0,
          arg2: inRegs[1] ?? 0,
          dest: outReg,
          sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
        });
      } else if (bType === "TON" || bType === "TOF") {
        instructions.push({
          op: "CALL_FB",
          arg1: bType,
          arg2: { IN: inRegs[0], PT: node.inputs[1]?.defaultValue ?? "T#5s" },
          dest: outReg,
          sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
        });
      } else {
        instructions.push({
          op: "LOAD_VAR",
          arg1: inRegs[0],
          dest: outReg,
          sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
        });
      }

      instructions.push({
        op: "STORE_VAR",
        arg1: node.name,
        arg2: outReg,
        sourceMapping: { pouName, language: "FBD", nodeId: node.id, blockType: node.blockType },
      });
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
