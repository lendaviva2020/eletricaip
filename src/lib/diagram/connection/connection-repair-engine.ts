// Deterministic Electrical Connection Repair Engine
// Standards: IEC 60947, IEC 60204-1, NBR 5410
// Automatically detects missing mandatory links in engineering topologies and synthesizes valid connections

import type { DiagramDoc, DiagramNode, DiagramEdge } from "../schema";
import { validateElectricalTopology } from "./graph-validator";
import { createDeterministicConnection, connectBusbarToBranches } from "./connection-engine";

export interface RepairResult {
  repairedDoc: DiagramDoc;
  addedEdges: DiagramEdge[];
  repairedCount: number;
  remainingIssues: string[];
}

/**
 * Deterministically analyzes the diagram, finds broken or missing links in standard
 * industrial branch topologies, and generates the necessary connections.
 */
export function repairDiagramConnections(doc: DiagramDoc): RepairResult {
  const nextDoc: DiagramDoc = {
    ...doc,
    nodes: { ...doc.nodes },
    edges: { ...doc.edges },
  };

  const addedEdges: DiagramEdge[] = [];
  const nodes = Object.values(nextDoc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );

  function hasEdgeBetween(srcId: string, tgtId: string): boolean {
    return Object.values(nextDoc.edges).some(
      (e) =>
        (e.source === srcId && e.target === tgtId) || (e.source === tgtId && e.target === srcId),
    );
  }

  function getIncomingEdges(nodeId: string): DiagramEdge[] {
    return Object.values(nextDoc.edges).filter((e) => e.target === nodeId);
  }

  function getOutgoingEdges(nodeId: string): DiagramEdge[] {
    return Object.values(nextDoc.edges).filter((e) => e.source === nodeId);
  }

  // 1. Identify Main Breaker and Busbar
  const busbar = nodes.find((n) => n.params.kind === "busbar");
  const breakers = nodes.filter((n) => n.params.kind === "breaker");
  const contactors = nodes.filter((n) => n.params.kind === "contactor");
  const thermalRelays = nodes.filter((n) => n.params.kind === "thermal_relay");
  const motors = nodes.filter((n) => n.params.kind === "motor");
  const vfds = nodes.filter((n) => n.params.kind === "vfd");
  const softstarters = nodes.filter((n) => n.params.kind === "softstarter");
  const psus = nodes.filter((n) => n.params.kind === "psu");
  const transformers = nodes.filter((n) => n.params.kind === "transformer");

  // 1.1 Infeed to Busbar: Transformer -> Main Breaker -> Busbar
  if (busbar) {
    const busInEdges = getIncomingEdges(busbar.id);
    if (busInEdges.length === 0) {
      // Find a main breaker (one with highest nominal current or labeled 'GERAL' / 'MAIN')
      const mainBreaker =
        breakers.find((b) => /geral|main|qgbt|qf0|dj0/i.test(b.label || b.id)) ??
        breakers.sort((a, b) => ((b.params as any).in_A ?? 0) - ((a.params as any).in_A ?? 0))[0];

      if (mainBreaker && !hasEdgeBetween(mainBreaker.id, busbar.id)) {
        const edge = createDeterministicConnection(mainBreaker, busbar, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);

        // If transformer exists and main breaker has no incoming, link Transformer -> Main Breaker
        if (transformers.length > 0) {
          const trafo = transformers[0];
          if (
            getIncomingEdges(mainBreaker.id).length === 0 &&
            !hasEdgeBetween(trafo.id, mainBreaker.id)
          ) {
            const trEdge = createDeterministicConnection(trafo, mainBreaker, {
              sourcePort: "B",
              targetPort: "T",
            });
            nextDoc.edges[trEdge.id] = trEdge;
            addedEdges.push(trEdge);
          }
        }
      }
    }

    // 1.2 Busbar to Branch Breakers
    // Branch breakers are breakers other than the main breaker that have NO incoming connection
    const busInBreakerId = getIncomingEdges(busbar.id)[0]?.source;
    const branchBreakers = breakers.filter(
      (b) => b.id !== busInBreakerId && getIncomingEdges(b.id).length === 0,
    );

    if (branchBreakers.length > 0) {
      const busEdges = connectBusbarToBranches(busbar, branchBreakers);
      for (const e of busEdges) {
        if (!hasEdgeBetween(e.source, e.target)) {
          nextDoc.edges[e.id] = e;
          addedEdges.push(e);
        }
      }
    }
  }

  // 2. Pair Branches (Breaker -> Contactor / VFD / Softstarter / PSU -> Motor / Load)
  // Match by spatial proximity (similar X coordinate) or index ordering
  const sortedBranchBreakers = breakers
    .filter((b) => (busbar ? b.id !== getIncomingEdges(busbar.id)[0]?.source : true))
    .sort((a, b) => a.position.x - b.position.x);

  // 2.1 Direct Online Starter Branches (Breaker -> Contactor -> Thermal Relay -> Motor)
  for (const km of contactors) {
    // If contactor has no feeder, find the nearest upstream branch breaker
    if (getIncomingEdges(km.id).length === 0) {
      const candidateBreaker =
        sortedBranchBreakers.find(
          (b) =>
            getOutgoingEdges(b.id).length === 0 && Math.abs(b.position.x - km.position.x) < 200,
        ) ?? sortedBranchBreakers.find((b) => getOutgoingEdges(b.id).length === 0);

      if (candidateBreaker) {
        const edge = createDeterministicConnection(candidateBreaker, km, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }

    // Connect downstream: Contactor -> Thermal Relay -> Motor OR Contactor -> Motor
    if (getOutgoingEdges(km.id).length === 0) {
      // Check if there is an unattached thermal relay below the contactor
      const nearbyRT = thermalRelays.find(
        (rt) =>
          getIncomingEdges(rt.id).length === 0 &&
          Math.abs(rt.position.x - km.position.x) < 150 &&
          rt.position.y >= km.position.y,
      );

      if (nearbyRT) {
        const edgeKmRt = createDeterministicConnection(km, nearbyRT, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edgeKmRt.id] = edgeKmRt;
        addedEdges.push(edgeKmRt);

        // Then link Thermal Relay -> Motor
        const nearbyMotor =
          motors.find(
            (m) =>
              getIncomingEdges(m.id).length === 0 &&
              Math.abs(m.position.x - nearbyRT.position.x) < 200 &&
              m.position.y >= nearbyRT.position.y,
          ) ?? motors.find((m) => getIncomingEdges(m.id).length === 0);

        if (nearbyMotor) {
          const edgeRtMot = createDeterministicConnection(nearbyRT, nearbyMotor, {
            sourcePort: "B",
            targetPort: "T",
          });
          nextDoc.edges[edgeRtMot.id] = edgeRtMot;
          addedEdges.push(edgeRtMot);
        }
      } else {
        // Direct Contactor -> Motor
        const nearbyMotor =
          motors.find(
            (m) =>
              getIncomingEdges(m.id).length === 0 &&
              Math.abs(m.position.x - km.position.x) < 200 &&
              m.position.y >= km.position.y,
          ) ?? motors.find((m) => getIncomingEdges(m.id).length === 0);

        if (nearbyMotor) {
          const edgeKmMot = createDeterministicConnection(km, nearbyMotor, {
            sourcePort: "B",
            targetPort: "T",
          });
          nextDoc.edges[edgeKmMot.id] = edgeKmMot;
          addedEdges.push(edgeKmMot);
        }
      }
    }
  }

  // 2.2 VFD / Inverter Branches (Breaker -> VFD -> Motor)
  for (const vfd of vfds) {
    if (getIncomingEdges(vfd.id).length === 0) {
      const candidateBreaker =
        sortedBranchBreakers.find(
          (b) =>
            getOutgoingEdges(b.id).length === 0 && Math.abs(b.position.x - vfd.position.x) < 200,
        ) ?? sortedBranchBreakers.find((b) => getOutgoingEdges(b.id).length === 0);

      if (candidateBreaker) {
        const edge = createDeterministicConnection(candidateBreaker, vfd, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }

    if (getOutgoingEdges(vfd.id).length === 0) {
      const candidateMotor =
        motors.find(
          (m) =>
            getIncomingEdges(m.id).length === 0 &&
            Math.abs(m.position.x - vfd.position.x) < 200 &&
            m.position.y >= vfd.position.y,
        ) ?? motors.find((m) => getIncomingEdges(m.id).length === 0);

      if (candidateMotor) {
        const edge = createDeterministicConnection(vfd, candidateMotor, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }
  }

  // 2.3 Soft-Starter Branches (Breaker -> Softstarter -> Motor)
  for (const ss of softstarters) {
    if (getIncomingEdges(ss.id).length === 0) {
      const candidateBreaker =
        sortedBranchBreakers.find(
          (b) =>
            getOutgoingEdges(b.id).length === 0 && Math.abs(b.position.x - ss.position.x) < 200,
        ) ?? sortedBranchBreakers.find((b) => getOutgoingEdges(b.id).length === 0);

      if (candidateBreaker) {
        const edge = createDeterministicConnection(candidateBreaker, ss, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }

    if (getOutgoingEdges(ss.id).length === 0) {
      const candidateMotor =
        motors.find(
          (m) =>
            getIncomingEdges(m.id).length === 0 &&
            Math.abs(m.position.x - ss.position.x) < 200 &&
            m.position.y >= ss.position.y,
        ) ?? motors.find((m) => getIncomingEdges(m.id).length === 0);

      if (candidateMotor) {
        const edge = createDeterministicConnection(ss, candidateMotor, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }
  }

  // 2.4 Control Power Supply Branches (Command Breaker -> PSU)
  for (const psu of psus) {
    if (getIncomingEdges(psu.id).length === 0) {
      const candidateBreaker = sortedBranchBreakers.find(
        (b) => getOutgoingEdges(b.id).length === 0,
      );
      if (candidateBreaker) {
        const edge = createDeterministicConnection(candidateBreaker, psu, {
          sourcePort: "B",
          targetPort: "T",
        });
        nextDoc.edges[edge.id] = edge;
        addedEdges.push(edge);
      }
    }
  }

  // 3. Post-Repair Validation
  const validation = validateElectricalTopology(nextDoc);
  const remainingIssues = validation.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.message);

  return {
    repairedDoc: nextDoc,
    addedEdges,
    repairedCount: addedEdges.length,
    remainingIssues,
  };
}
