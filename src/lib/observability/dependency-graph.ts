// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8: INDUSTRIAL DEPENDENCY GRAPH
// Canonical Topological Model, Impact Propagation, Shared Dependencies & Tenant Isolation
// Standards: ISA-95, IEC 62443, Gate 3.6 Canonical Identity Model
// =============================================================================

import type {
  ComponentType,
  DependencyEdge,
  DependencyImpactAnalysis,
  DependencyNode,
  DependencyRelationType,
  DependencyValidationState,
  HealthState,
} from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export class IndustrialDependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map(); // key: `${tenantId}:${plantId}:${componentId}`
  private edges: Map<string, DependencyEdge> = new Map(); // key: edgeId
  private outgoing: Map<string, Set<string>> = new Map(); // nodeKey -> Set<edgeId>
  private incoming: Map<string, Set<string>> = new Map(); // nodeKey -> Set<edgeId>

  private nodeKey(tenantId: string, plantId: string, componentId: string): string {
    return `${tenantId}:${plantId}:${componentId}`;
  }

  /**
   * Registra ou atualiza um nó no grafo de dependências preservando seu UUID canônico.
   */
  public upsertNode(node: DependencyNode): DependencyNode {
    if (!node.tenantId || !node.plantId || !node.componentId) {
      throw new Error("INVALID_DEPENDENCY_NODE: tenantId, plantId e componentId são obrigatórios.");
    }
    const key = this.nodeKey(node.tenantId, node.plantId, node.componentId);
    const frozenNode: DependencyNode = { ...node };
    this.nodes.set(key, frozenNode);
    if (!this.outgoing.has(key)) this.outgoing.set(key, new Set());
    if (!this.incoming.has(key)) this.incoming.set(key, new Set());
    return frozenNode;
  }

  /**
   * Atualiza o estado de saúde de um nó existente no grafo.
   */
  public updateNodeState(tenantId: string, plantId: string, componentId: string, state: HealthState): boolean {
    const key = this.nodeKey(tenantId, plantId, componentId);
    const node = this.nodes.get(key);
    if (!node) return false;
    node.state = state;
    return true;
  }

  /**
   * Registra uma relação direcionada de dependência:
   * `fromComponentId` (Provedor / Upstream) -> `toComponentId` (Dependente / Downstream).
   * Exemplo: Edge Gateway -> Protocolo Modbus -> Equipamento Motor -> Tag Corrente -> Historian -> SCADA.
   */
  public addDependency(params: {
    tenantId: string;
    plantId: string;
    fromComponentId: string;
    toComponentId: string;
    relationType: DependencyRelationType;
    validationState: DependencyValidationState;
    evidenceSource: string;
  }): DependencyEdge {
    const fromKey = this.nodeKey(params.tenantId, params.plantId, params.fromComponentId);
    const toKey = this.nodeKey(params.tenantId, params.plantId, params.toComponentId);

    const fromNode = this.nodes.get(fromKey);
    const toNode = this.nodes.get(toKey);

    if (!fromNode || !toNode) {
      throw new Error(
        `DEPENDENCY_NODE_MISSING: Ambos os componentes (${params.fromComponentId} -> ${params.toComponentId}) devem estar registrados no mesmo tenant (${params.tenantId}) e planta (${params.plantId}).`,
      );
    }

    if (fromNode.tenantId !== toNode.tenantId || fromNode.plantId !== toNode.plantId) {
      throw new Error("CROSS_BOUNDARY_DEPENDENCY_FORBIDDEN: Proibido conectar nós de diferentes organizações ou plantas.");
    }

    const edgeId = `dep_${params.tenantId}_${params.plantId}_${params.fromComponentId}__to__${params.toComponentId}`;
    const edge: DependencyEdge = {
      edgeId,
      tenantId: params.tenantId,
      plantId: params.plantId,
      fromComponentId: params.fromComponentId,
      toComponentId: params.toComponentId,
      relationType: params.relationType,
      validationState: params.validationState,
      evidenceSource: params.evidenceSource,
    };

    this.edges.set(edgeId, edge);
    this.outgoing.get(fromKey)!.add(edgeId);
    this.incoming.get(toKey)!.add(edgeId);
    return edge;
  }

  public getNode(tenantId: string, plantId: string, componentId: string): DependencyNode | undefined {
    return this.nodes.get(this.nodeKey(tenantId, plantId, componentId));
  }

  public getPlantNodes(tenantId: string, plantId: string): DependencyNode[] {
    const prefix = `${tenantId}:${plantId}:`;
    const list: DependencyNode[] = [];
    for (const [k, v] of this.nodes.entries()) {
      if (k.startsWith(prefix)) {
        list.push(v);
      }
    }
    return list;
  }

  public getPlantEdges(tenantId: string, plantId: string): DependencyEdge[] {
    const list: DependencyEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.tenantId === tenantId && edge.plantId === plantId) {
        list.push(edge);
      }
    }
    return list;
  }

  /**
   * Retorna o caminho validado entre `upstreamComponentId` e `downstreamComponentId`, se existir.
   * Considera apenas arestas com validationState !== "UNKNOWN".
   */
  public getDependencyPath(
    tenantId: string,
    plantId: string,
    upstreamComponentId: string,
    downstreamComponentId: string,
  ): string[] | null {
    const detailed = this.getDependencyPathWithValidation(
      tenantId,
      plantId,
      upstreamComponentId,
      downstreamComponentId,
    );
    return detailed ? detailed.path : null;
  }

  /**
   * Gate 3.8.1: Retorna o caminho de dependência junto com a indicação se TODAS as arestas
   * do caminho possuem estado `VALIDATED_CANONICAL` (excluindo `UNKNOWN` e distinguindo `CONFIGURED_UNVERIFIED`).
   */
  public getDependencyPathWithValidation(
    tenantId: string,
    plantId: string,
    upstreamComponentId: string,
    downstreamComponentId: string,
  ): { path: string[]; allEdgesCanonicalValidated: boolean } | null {
    if (upstreamComponentId === downstreamComponentId) {
      return { path: [upstreamComponentId], allEdgesCanonicalValidated: true };
    }

    const startKey = this.nodeKey(tenantId, plantId, upstreamComponentId);
    if (!this.nodes.has(startKey)) return null;

    const queue: Array<{ currentId: string; path: string[]; allCanonical: boolean }> = [
      { currentId: upstreamComponentId, path: [upstreamComponentId], allCanonical: true },
    ];
    const visited = new Set<string>([upstreamComponentId]);

    while (queue.length > 0) {
      const { currentId, path, allCanonical } = queue.shift()!;
      const curKey = this.nodeKey(tenantId, plantId, currentId);
      const outEdges = this.outgoing.get(curKey);
      if (!outEdges) continue;

      for (const edgeId of outEdges) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.validationState === "UNKNOWN") continue;

        const nextCanonical = allCanonical && edge.validationState === "VALIDATED_CANONICAL";
        const nextId = edge.toComponentId;
        if (nextId === downstreamComponentId) {
          return { path: [...path, nextId], allEdgesCanonicalValidated: nextCanonical };
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ currentId: nextId, path: [...path, nextId], allCanonical: nextCanonical });
        }
      }
    }

    return null;
  }

  /**
   * Retorna todos os provedores upstream dos quais `componentId` depende direta ou indiretamente.
   */
  public getUpstreamAncestors(tenantId: string, plantId: string, componentId: string): DependencyNode[] {
    const startKey = this.nodeKey(tenantId, plantId, componentId);
    if (!this.nodes.has(startKey)) return [];

    const ancestors: DependencyNode[] = [];
    const visited = new Set<string>([componentId]);
    const queue: string[] = [componentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const curKey = this.nodeKey(tenantId, plantId, currentId);
      const inEdges = this.incoming.get(curKey);
      if (!inEdges) continue;

      for (const edgeId of inEdges) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.validationState === "UNKNOWN") continue;
        const prevId = edge.fromComponentId;
        if (!visited.has(prevId)) {
          visited.add(prevId);
          const prevNode = this.getNode(tenantId, plantId, prevId);
          if (prevNode) {
            ancestors.push(prevNode);
            queue.push(prevId);
          }
        }
      }
    }

    return ancestors;
  }

  /**
   * Executa a análise completa de impacto e propagação a partir de um componente de origem.
   */
  public analyzeImpact(
    tenantId: string,
    plantId: string,
    originComponentId: string,
  ): DependencyImpactAnalysis {
    const originKey = this.nodeKey(tenantId, plantId, originComponentId);
    const originNode = this.nodes.get(originKey);
    if (!originNode) {
      throw new Error(
        `ORIGIN_COMPONENT_NOT_FOUND: Componente ${originComponentId} não encontrado para tenant ${tenantId} / planta ${plantId}.`,
      );
    }

    // 1. Descobrir componentes dependentes downstream e caminhos de propagação
    const dependentComponents: string[] = [];
    const propagationPaths: string[][] = [];
    const visitedDownstream = new Set<string>([originComponentId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: originComponentId, path: [originComponentId] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      const key = this.nodeKey(tenantId, plantId, id);
      const outEdges = this.outgoing.get(key);
      if (!outEdges) continue;

      for (const edgeId of outEdges) {
        const edge = this.edges.get(edgeId);
        if (!edge || edge.validationState === "UNKNOWN") continue;
        const nextId = edge.toComponentId;
        const nextPath = [...path, nextId];
        propagationPaths.push(nextPath);

        if (!visitedDownstream.has(nextId)) {
          visitedDownstream.add(nextId);
          dependentComponents.push(nextId);
          queue.push({ id: nextId, path: nextPath });
        }
      }
    }

    // 2. Descobrir dependências upstream indisponíveis ou degradadas
    const upstreamNodes = this.getUpstreamAncestors(tenantId, plantId, originComponentId);
    const unavailableDependencies = upstreamNodes
      .filter((n) => n.state === "UNAVAILABLE" || n.state === "DEGRADED")
      .map((n) => n.componentId);

    // 3. Classificar escopo de impacto por camada canônica
    const affectedGateways: string[] = [];
    const affectedProtocols: string[] = [];
    const affectedEquipments: string[] = [];
    const affectedTags: string[] = [];
    const affectedHistorianStreams: string[] = [];
    const affectedScadaViews: string[] = [];

    const allImpactedIds = [originComponentId, ...dependentComponents];
    for (const compId of allImpactedIds) {
      const node = this.getNode(tenantId, plantId, compId);
      if (!node) continue;
      if (node.componentType === "EDGE_GATEWAY") affectedGateways.push(compId);
      else if (
        node.componentType === "PROTOCOL_MODBUS_TCP" ||
        node.componentType === "PROTOCOL_OPC_UA" ||
        node.componentType === "PROTOCOL_MQTT_SPARKPLUG"
      ) {
        affectedProtocols.push(compId);
      } else if (node.componentType === "INDUSTRIAL_EQUIPMENT") {
        // Verifica se é equipamento ou tag pelo metadado ou prefixo canônico
        if (node.metadata?.entityKind === "TAG" || compId.startsWith("tag_")) {
          affectedTags.push(compId);
        } else {
          affectedEquipments.push(compId);
        }
      } else if (node.componentType === "HISTORIAN_STORAGE") {
        affectedHistorianStreams.push(compId);
      } else if (node.componentType === "SCADA_CORE") {
        affectedScadaViews.push(compId);
      }
    }

    // 4. Identificar dependências compartilhadas na planta (nós com >= 2 consumidores diretos)
    const plantNodes = this.getPlantNodes(tenantId, plantId);
    const sharedDependencies: Array<{ componentId: string; sharedByConsumers: string[] }> = [];

    for (const pNode of plantNodes) {
      const pKey = this.nodeKey(tenantId, plantId, pNode.componentId);
      const outSet = this.outgoing.get(pKey);
      if (outSet && outSet.size >= 2) {
        const consumers = Array.from(outSet)
          .map((eId) => this.edges.get(eId)?.toComponentId)
          .filter((c): c is string => Boolean(c));
        sharedDependencies.push({
          componentId: pNode.componentId,
          sharedByConsumers: consumers,
        });
      }
    }

    // 5. Identificar componentes independentes na mesma planta (não afetados pela origem nem ancestrais dela)
    const upstreamSet = new Set(upstreamNodes.map((u) => u.componentId));
    const independentComponents = plantNodes
      .map((n) => n.componentId)
      .filter((id) => !visitedDownstream.has(id) && !upstreamSet.has(id));

    return {
      tenantId,
      plantId,
      originComponentId,
      originComponentType: originNode.componentType,
      originState: originNode.state,
      dependentComponents,
      unavailableDependencies,
      impactScope: {
        affectedGateways,
        affectedProtocols,
        affectedEquipments,
        affectedTags,
        affectedHistorianStreams,
        affectedScadaViews,
      },
      propagationPaths,
      sharedDependencies,
      independentComponents,
    };
  }

  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }
}

export const industrialDependencyGraph = new IndustrialDependencyGraph();
