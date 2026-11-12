/**
 * Multi-Device Virtual Network Simulator (up to 8 Compact PLC nodes exchanging NI/NQ/NAI/NAQ).
 * Purely deterministic lock-step simulation with zero OS network sockets.
 */
import type { CompactProgramModel } from "../domain/types";
import {
  CompactExecutionEngine,
  type CompactRuntimeFrame,
} from "../runtime/compact-execution-engine";

export const MAX_VIRTUAL_NETWORK_STATIONS = 8;

export interface VirtualStationSpec {
  readonly stationId: string;
  readonly name: string;
  readonly ipAddress: string;
  readonly model: CompactProgramModel;
}

export interface VirtualNetworkLink {
  readonly id: string;
  readonly fromStationId: string;
  readonly fromOutputOrVar: string;
  readonly toStationId: string;
  readonly toNetworkInput: string; // e.g. NI1, NAI1
}

export interface VirtualNetworkTickResult {
  readonly cycleCount: number;
  readonly framesByStationId: Readonly<Record<string, CompactRuntimeFrame>>;
}

export class VirtualNetworkCoordinator {
  private readonly stations = new Map<
    string,
    { spec: VirtualStationSpec; engine: CompactExecutionEngine }
  >();
  private links: VirtualNetworkLink[] = [];
  private cycles = 0;

  constructor(
    stations: readonly VirtualStationSpec[],
    links: readonly VirtualNetworkLink[] = [],
    baseEpochMs?: number,
  ) {
    if (stations.length > MAX_VIRTUAL_NETWORK_STATIONS) {
      throw new Error(
        `VIRTUAL_NET_LIMIT: Rede virtual suporta no máximo ${MAX_VIRTUAL_NETWORK_STATIONS} estações simultâneas.`,
      );
    }
    for (const s of stations) {
      this.stations.set(s.stationId, {
        spec: s,
        engine: new CompactExecutionEngine(s.model, baseEpochMs),
      });
    }
    this.links = [...links];
  }

  public setStationInput(
    stationId: string,
    nameOrAddress: string,
    value: boolean | number | string,
  ): void {
    this.stations.get(stationId)?.engine.setInput(nameOrAddress, value);
  }

  public stepAll(dtMs = 20): VirtualNetworkTickResult {
    const framesByStationId: Record<string, CompactRuntimeFrame> = {};

    // First run 1 scan on all stations
    for (const [id, entry] of this.stations.entries()) {
      framesByStationId[id] = entry.engine.step(dtMs);
    }

    // Exchange NI/NQ/NAI/NAQ across virtual network links cleanly
    for (const link of this.links) {
      const srcFrame = framesByStationId[link.fromStationId];
      const dst = this.stations.get(link.toStationId);
      if (!srcFrame || !dst) continue;
      const val = srcFrame.variables[link.fromOutputOrVar];
      if (val !== undefined) {
        dst.engine.setInput(link.toNetworkInput, val);
      }
    }

    // Second half-cycle propagation if links transferred state so same-tick observability works
    if (this.links.length > 0) {
      for (const [id, entry] of this.stations.entries()) {
        framesByStationId[id] = entry.engine.step(dtMs);
      }
    }

    this.cycles += 1;
    return {
      cycleCount: this.cycles,
      framesByStationId,
    };
  }
}
