/**
 * UDF Library & Macro Management Panel for eletric Studio.
 */
import React, { useMemo, useState } from "react";
import { Cube, Plus, Warning, DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CompactProgramModel, CompactUdfDefinition } from "@/lib/compact-studio/domain/types";
import { createCompactBlockNode } from "@/lib/compact-studio/editor";
import {
  createUdfDefinitionFromSubgraph,
  detectUdfCycles,
  exportUdfLibraryPackage,
  instantiateUdfNode,
} from "@/lib/compact-studio/udf";

export interface UdfLibraryPanelProps {
  readonly model: CompactProgramModel;
  readonly activePageId: string;
  readonly selectedNodeIds: readonly string[];
  readonly onChangeModel: (next: CompactProgramModel, label: string) => void;
}

export function UdfLibraryPanel({
  model,
  activePageId,
  selectedNodeIds,
  onChangeModel,
}: UdfLibraryPanelProps) {
  const [udfName, setUdfName] = useState("PartidaEstrelaTriangulo");
  const [udfVersion, setUdfVersion] = useState("1.0.0");

  const cycleDiagnostics = useMemo(() => detectUdfCycles(model.udfs), [model.udfs]);

  const handleCreateFromSelection = () => {
    if (selectedNodeIds.length === 0) return;
    const def = createUdfDefinitionFromSubgraph(model, {
      id: `udf_${Date.now()}`,
      name: udfName.trim() || "BlocoUsuario",
      version: udfVersion.trim() || "1.0.0",
      nodeIds: selectedNodeIds,
      nowIso: new Date().toISOString(),
    });
    onChangeModel(
      { ...model, udfs: [...model.udfs, def] },
      `Criar UDF ${def.name} v${def.version}`,
    );
  };

  const handleInsertInstance = (def: CompactUdfDefinition) => {
    const count = model.nodes.filter((n) => n.udfId === def.id).length + 1;
    const nodeId = `udf_inst_${Date.now()}`;
    const node = instantiateUdfNode(def, {
      nodeId,
      pageId: activePageId,
      instanceName: `${def.name}_${count}`,
    });
    const fallbackNode =
      node.inputs.length === 0 && node.outputs.length === 0
        ? createCompactBlockNode({
            id: nodeId,
            pageId: activePageId,
            blockType: "AND",
            instanceName: `${def.name}_${count}`,
          })
        : node;

    onChangeModel(
      {
        ...model,
        nodes: [...model.nodes, fallbackNode],
        layout: {
          ...model.layout,
          fbd: {
            ...model.layout.fbd,
            [nodeId]: { x: 180 + count * 40, y: 120 + count * 30, width: 180, height: 110 },
          },
        },
      },
      `Inserir instância UDF ${def.name}`,
    );
  };

  const handleExportPackage = () => {
    if (model.udfs.length === 0) return;
    const pkg = exportUdfLibraryPackage(
      `${model.name}-udfs`,
      "1.0.0",
      model.udfs,
      new Date().toISOString(),
    );
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${model.name.replace(/\s+/g, "_")}_udfs.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground p-4 gap-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Cube className="h-4 w-4 text-primary" />
            Blocos de Usuário (UDFs) &amp; Bibliotecas SemVer
          </h2>
          <p className="text-xs text-muted-foreground">
            Encapsule subcircuitos selecionados em blocos reutilizáveis e versionados.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={model.udfs.length === 0}
          onClick={handleExportPackage}
          className="h-7 text-xs gap-1"
        >
          <DownloadSimple className="h-3.5 w-3.5" />
          Exportar Biblioteca (.json)
        </Button>
      </div>

      {cycleDiagnostics.length > 0 && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1">
          {cycleDiagnostics.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <Warning className="h-4 w-4 shrink-0" />
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground" htmlFor="udf-name-input">
            Nome da UDF
          </label>
          <input
            id="udf-name-input"
            value={udfName}
            onChange={(e) => setUdfName(e.target.value)}
            className="h-8 rounded border border-border bg-background px-2 text-xs font-mono"
          />
        </div>
        <div className="flex flex-col gap-1 w-28">
          <label className="text-[11px] text-muted-foreground" htmlFor="udf-version-input">
            Versão SemVer
          </label>
          <input
            id="udf-version-input"
            value={udfVersion}
            onChange={(e) => setUdfVersion(e.target.value)}
            className="h-8 rounded border border-border bg-background px-2 text-xs font-mono"
          />
        </div>
        <Button
          size="sm"
          onClick={handleCreateFromSelection}
          disabled={selectedNodeIds.length === 0}
          className="h-8 text-xs gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Criar UDF da Seleção ({selectedNodeIds.length})
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {model.udfs.length === 0 ? (
          <div className="col-span-full border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
            Selecione blocos no editor FBD e clique em &ldquo;Criar UDF da Seleção&rdquo; para
            registrar seu primeiro bloco hierárquico.
          </div>
        ) : (
          model.udfs.map((def) => (
            <div
              key={`${def.id}_${def.version}`}
              className="rounded-lg border border-border bg-card p-3 flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{def.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                    v{def.version}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {def.internalNodes.length} blocos internos · {def.ports.length} pinos externos
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs w-full"
                onClick={() => handleInsertInstance(def)}
              >
                Instanciar na página atual
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
