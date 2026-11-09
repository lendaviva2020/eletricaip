/**
 * ElétricAi Industrial OS — Industrial Library Manager & Dependency Engine
 * Paridade funcional ao CODESYS Library Manager e Placeholder Resolution System.
 * 
 * Regras estritas:
 * - Clean Room Mode: Modelagem original e contratos formais de engenharia
 * - Preservação de isolamento físico: IS_PHYSICAL_CONTROL_ALLOWED = false
 * - Resolução determinística de dependências e placeholders
 */

import {
  LibraryCategory,
  LibraryReference,
  ControllerVendor,
  IndustrialProject,
  POU,
  DataTypeDefinition,
  GlobalVariableList,
} from "../canonical/types";

// ============================================================================
// Tipos e Contratos do Gerenciador de Bibliotecas
// ============================================================================

export interface LibraryDependency {
  name: string;
  versionRange: string; // Ex: ">=1.0.0", "^3.5.0", "3.5.20.0"
}

export interface LibraryExportedSymbol {
  name: string;
  kind: "FUNCTION_BLOCK" | "FUNCTION" | "PROGRAM" | "DUT" | "GVL";
  description: string;
  signature: string;
}

export interface LibraryPackage {
  id: string;
  name: string;
  vendor: string;
  version: string;
  category: LibraryCategory;
  description: string;
  dependencies: LibraryDependency[];
  isPlaceholder: boolean;
  defaultResolution?: string; // Nome da biblioteca concreta padrão
  exportedSymbols: LibraryExportedSymbol[];
  pous?: POU[];
  dataTypes?: DataTypeDefinition[];
  gvls?: GlobalVariableList[];
}

export interface PlaceholderResolutionConfig {
  vendor: ControllerVendor;
  runtimeVersion: string;
  mappings: Record<string, string>; // Ex: "#Standard" -> "EletricAi_Standard, 3.5.20.0"
}

export interface LibraryDiagnostic {
  code: string;
  severity: "INFO" | "WARNING" | "ERROR";
  libraryName: string;
  message: string;
}

export interface ResolvedLibrary {
  name: string;
  effectiveVersion: string;
  category: LibraryCategory;
  isPlaceholder: boolean;
  resolvedTo?: string;
  dependencies: string[];
  exportedSymbolsCount: number;
}

// ============================================================================
// Utilitários de Semantic Versioning
// ============================================================================

export class SemVer {
  public static parse(versionStr: string): { major: number; minor: number; patch: number } | null {
    const cleaned = versionStr.trim().replace(/^[v^~>=<]+/, "");
    const parts = cleaned.split(".").map((p) => parseInt(p, 10));
    if (parts.length < 3 || parts.some((p) => isNaN(p))) {
      return null;
    }
    return { major: parts[0], minor: parts[1], patch: parts[2] };
  }

  public static compare(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }

  public static satisfies(version: string, range: string): boolean {
    const v = this.parse(version);
    if (!v) return false;

    const trimmedRange = range.trim();
    if (trimmedRange === "*" || trimmedRange === "" || trimmedRange === "latest") return true;

    // Suporte a faixas com hífen: "1.0.0 - 2.0.0"
    if (trimmedRange.includes(" - ")) {
      const [minStr, maxStr] = trimmedRange.split(" - ").map((s) => s.trim());
      const min = this.parse(minStr);
      const max = this.parse(maxStr);
      if (!min || !max) return false;
      return this.compare(v, min) >= 0 && this.compare(v, max) <= 0;
    }

    // Suporte a cláusulas múltiplas: ">=1.0.0 <2.0.0"
    if (trimmedRange.includes(" ") && !trimmedRange.includes(" - ")) {
      const parts = trimmedRange.split(/\s+/).filter(Boolean);
      return parts.every((p) => this.satisfiesSingle(v, p));
    }

    return this.satisfiesSingle(v, trimmedRange);
  }

  private static satisfiesSingle(
    v: { major: number; minor: number; patch: number },
    clause: string
  ): boolean {
    const trimmed = clause.trim();
    if (trimmed === "*" || trimmed === "") return true;

    if (trimmed.startsWith("^")) {
      const target = this.parse(trimmed.slice(1));
      if (!target) return false;
      // Regra SemVer para versões 0.x (0.1.0 e 0.2.0 são incompatíveis sob ^)
      if (target.major === 0) {
        if (target.minor === 0) {
          return v.major === 0 && v.minor === 0 && v.patch === target.patch;
        }
        return v.major === 0 && v.minor === target.minor && v.patch >= target.patch;
      }
      return v.major === target.major && (v.minor > target.minor || (v.minor === target.minor && v.patch >= target.patch));
    }

    if (trimmed.startsWith("~")) {
      const target = this.parse(trimmed.slice(1));
      if (!target) return false;
      return v.major === target.major && v.minor === target.minor && v.patch >= target.patch;
    }

    if (trimmed.startsWith(">=")) {
      const target = this.parse(trimmed.slice(2));
      return target ? this.compare(v, target) >= 0 : false;
    }

    if (trimmed.startsWith(">")) {
      const target = this.parse(trimmed.slice(1));
      return target ? this.compare(v, target) > 0 : false;
    }

    if (trimmed.startsWith("<=")) {
      const target = this.parse(trimmed.slice(2));
      return target ? this.compare(v, target) <= 0 : false;
    }

    if (trimmed.startsWith("<")) {
      const target = this.parse(trimmed.slice(1));
      return target ? this.compare(v, target) < 0 : false;
    }

    if (trimmed.startsWith("=")) {
      const target = this.parse(trimmed.slice(1));
      return target ? this.compare(v, target) === 0 : false;
    }

    const target = this.parse(trimmed);
    return target ? this.compare(v, target) === 0 : false;
  }
}

// ============================================================================
// Registro Global de Bibliotecas Industriais
// ============================================================================

export class LibraryRegistry {
  private static instance: LibraryRegistry;
  private packages: Map<string, Map<string, LibraryPackage>> = new Map(); // name -> (version -> pkg)
  private placeholders: Map<string, LibraryPackage> = new Map(); // placeholderName -> pkg

  private constructor() {}

  public static getInstance(): LibraryRegistry {
    if (!LibraryRegistry.instance) {
      LibraryRegistry.instance = new LibraryRegistry();
    }
    return LibraryRegistry.instance;
  }

  public register(pkg: LibraryPackage): void {
    if (pkg.isPlaceholder) {
      this.placeholders.set(pkg.name, pkg);
    }
    if (!this.packages.has(pkg.name)) {
      this.packages.set(pkg.name, new Map());
    }
    this.packages.get(pkg.name)!.set(pkg.version, pkg);
  }

  public findPackage(name: string, versionRange: string = "*"): LibraryPackage | null {
    const versions = this.packages.get(name);
    if (!versions || versions.size === 0) return null;

    if (versionRange === "*" || versionRange === "latest") {
      // Retorna a maior versão disponível
      let highest: LibraryPackage | null = null;
      for (const pkg of versions.values()) {
        if (!highest || this.compareVersions(pkg.version, highest.version) > 0) {
          highest = pkg;
        }
      }
      return highest;
    }

    for (const [v, pkg] of versions.entries()) {
      if (SemVer.satisfies(v, versionRange)) {
        return pkg;
      }
    }
    return null;
  }

  public getPlaceholder(placeholderName: string): LibraryPackage | null {
    return this.placeholders.get(placeholderName) || null;
  }

  public getAllPackages(): LibraryPackage[] {
    const result: LibraryPackage[] = [];
    for (const versionMap of this.packages.values()) {
      for (const pkg of versionMap.values()) {
        result.push(pkg);
      }
    }
    return result;
  }

  public clear(): void {
    this.packages.clear();
    this.placeholders.clear();
  }

  private compareVersions(a: string, b: string): number {
    const pa = SemVer.parse(a);
    const pb = SemVer.parse(b);
    if (!pa || !pb) return 0;
    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    return pa.patch - pb.patch;
  }
}

// ============================================================================
// Resolutor de Placeholders e Grafo de Dependências
// ============================================================================

export class IndustrialLibraryManager {
  private registry: LibraryRegistry;

  constructor(registry: LibraryRegistry = LibraryRegistry.getInstance()) {
    this.registry = registry;
  }

  /**
   * Mapeamento canônico de Placeholders de acordo com a arquitetura do controlador
   */
  public getDefaultPlaceholderMappings(vendor: ControllerVendor): Record<string, string> {
    switch (vendor) {
      case "CODESYS_VIRTUAL":
        return {
          "#Standard": "EletricAi_Standard",
          "#IoStandard": "EletricAi_IoStandard",
          "#SysTypes": "EletricAi_SysTypes",
          "#CmpApp": "EletricAi_CmpApp",
        };
      case "SIEMENS":
        return {
          "#Standard": "EletricAi_Standard",
          "#IoStandard": "EletricAi_Siemens_S7_Io",
          "#SysTypes": "EletricAi_SysTypes",
          "#CmpApp": "EletricAi_CmpApp",
        };
      case "ROCKWELL":
        return {
          "#Standard": "EletricAi_Standard",
          "#IoStandard": "EletricAi_Rockwell_CIP_Io",
          "#SysTypes": "EletricAi_SysTypes",
          "#CmpApp": "EletricAi_CmpApp",
        };
      default:
        return {
          "#Standard": "EletricAi_Standard",
          "#IoStandard": "EletricAi_IoStandard",
          "#SysTypes": "EletricAi_SysTypes",
          "#CmpApp": "EletricAi_CmpApp",
        };
    }
  }

  /**
   * Resolve todas as bibliotecas de um projeto, detectando ciclos e dependências faltantes
   */
  public resolveProjectLibraries(
    project: IndustrialProject,
    customPlaceholderMappings?: Record<string, string>
  ): {
    resolved: ResolvedLibrary[];
    loadOrder: string[];
    diagnostics: LibraryDiagnostic[];
    isSuccessful: boolean;
  } {
    const diagnostics: LibraryDiagnostic[] = [];
    const resolved: ResolvedLibrary[] = [];
    const primaryController = project.controllers[0];
    const defaultMappings = this.getDefaultPlaceholderMappings(primaryController ? primaryController.vendor : "GENERIC_IEC");
    const activeMappings = { ...defaultMappings, ...customPlaceholderMappings };

    // Grafo de Dependências para Topological Sort: node -> dependencies[]
    const adjList = new Map<string, string[]>();
    const visited = new Set<string>();

    const toResolve: { name: string; version: string; isPlaceholder: boolean }[] = [];

    // Adiciona bibliotecas declaradas no projeto
    for (const ref of project.libraryReferences) {
      toResolve.push({
        name: ref.name,
        version: ref.version,
        isPlaceholder: ref.isPlaceholder || ref.name.startsWith("#"),
      });
    }

    // Processamento com resolução recursiva de dependências
    const processedLibs = new Map<string, LibraryPackage>();

    while (toResolve.length > 0) {
      const item = toResolve.shift()!;
      let targetName = item.name;
      let isPlaceholder = item.isPlaceholder;

      if (isPlaceholder) {
        const mappedConcrete = activeMappings[targetName];
        if (!mappedConcrete) {
          diagnostics.push({
            code: "ERR_UNRESOLVED_PLACEHOLDER",
            severity: "ERROR",
            libraryName: targetName,
            message: `O placeholder '${targetName}' não possui resolução configurada para o controlador ${primaryController?.vendor || "GENERIC_IEC"}.`,
          });
          continue;
        }
        targetName = mappedConcrete;
      }

      if (processedLibs.has(targetName)) {
        const existing = processedLibs.get(targetName)!;
        if (!SemVer.satisfies(existing.version, item.version)) {
          diagnostics.push({
            code: "ERR_VERSION_CONFLICT",
            severity: "ERROR",
            libraryName: targetName,
            message: `Conflito de versão na dependência transitiva '${targetName}': versão já resolvida ${existing.version} é incompatível com o requisito '${item.version}'.`,
          });
        }
        continue;
      }

      const pkg = this.registry.findPackage(targetName, item.version);
      if (!pkg) {
        diagnostics.push({
          code: "ERR_LIBRARY_NOT_FOUND",
          severity: "ERROR",
          libraryName: targetName,
          message: `Biblioteca '${targetName}' com versão compatível a '${item.version}' não foi encontrada no registro industrial.`,
        });
        continue;
      }

      processedLibs.set(targetName, pkg);
      adjList.set(targetName, []);

      resolved.push({
        name: item.name,
        effectiveVersion: pkg.version,
        category: pkg.category,
        isPlaceholder,
        resolvedTo: isPlaceholder ? targetName : undefined,
        dependencies: pkg.dependencies.map((d) => d.name),
        exportedSymbolsCount: pkg.exportedSymbols.length,
      });

      // Enfileira dependências transitivas
      for (const dep of pkg.dependencies) {
        adjList.get(targetName)!.push(dep.name);
        if (!processedLibs.has(dep.name)) {
          toResolve.push({
            name: dep.name,
            version: dep.versionRange,
            isPlaceholder: dep.name.startsWith("#"),
          });
        }
      }
    }

    // Detecção de Ciclos e Ordenação Topológica (Kahn / DFS)
    const { order, hasCycle, cyclePath } = this.topologicalSort(adjList);

    if (hasCycle) {
      diagnostics.push({
        code: "ERR_CIRCULAR_DEPENDENCY",
        severity: "ERROR",
        libraryName: cyclePath.join(" -> "),
        message: `Dependência circular detectada entre bibliotecas: ${cyclePath.join(" -> ")}.`,
      });
    }

    const isSuccessful = diagnostics.filter((d) => d.severity === "ERROR").length === 0;

    return {
      resolved,
      loadOrder: order,
      diagnostics,
      isSuccessful,
    };
  }

  /**
   * Algoritmo de Ordenação Topológica com Detecção de Ciclos
   */
  private topologicalSort(adjList: Map<string, string[]>): {
    order: string[];
    hasCycle: boolean;
    cyclePath: string[];
  } {
    const order: string[] = [];
    const state = new Map<string, "UNVISITED" | "VISITING" | "VISITED">();
    const cycleStack: string[] = [];
    let detectedCycle: string[] = [];

    for (const node of adjList.keys()) {
      state.set(node, "UNVISITED");
    }

    const dfs = (node: string): boolean => {
      state.set(node, "VISITING");
      cycleStack.push(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        const neighborState = state.get(neighbor) || "UNVISITED";
        if (neighborState === "VISITING") {
          const startIndex = cycleStack.indexOf(neighbor);
          detectedCycle = cycleStack.slice(startIndex).concat(neighbor);
          return true; // Ciclo encontrado
        }
        if (neighborState === "UNVISITED") {
          if (dfs(neighbor)) return true;
        }
      }

      cycleStack.pop();
      state.set(node, "VISITED");
      order.push(node);
      return false;
    };

    for (const node of adjList.keys()) {
      if (state.get(node) === "UNVISITED") {
        if (dfs(node)) {
          return { order: [], hasCycle: true, cyclePath: detectedCycle };
        }
      }
    }

    return { order: order.reverse(), hasCycle: false, cyclePath: [] };
  }
}
