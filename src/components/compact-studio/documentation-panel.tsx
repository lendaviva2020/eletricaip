/**
 * Documentation, Symbolic I/O Table, Cross-Reference, Sanitized CSV, PDF & PLCopen XML Panel.
 */
import React, { useMemo, useState } from "react";
import { FilePdf, FileCsv, FileCode, MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CompactProgramModel } from "@/lib/compact-studio/domain/types";
import { evaluateRackEngineering } from "@/lib/compact-studio/hardware";
import {
  buildCompactProgramPdf,
  buildCrossReferenceIndex,
  exportCompactToPlcOpenXml,
  exportIoSymbolsToCsv,
  importIoSymbolsFromCsv,
} from "@/lib/compact-studio/docs";

export interface DocumentationPanelProps {
  readonly model: CompactProgramModel;
  readonly onChangeModel: (next: CompactProgramModel, label: string) => void;
  readonly onNavigateToNode?: (pageId: string, nodeId: string) => void;
}

export function DocumentationPanel({
  model,
  onChangeModel,
  onNavigateToNode,
}: DocumentationPanelProps) {
  const [search, setSearch] = useState("");
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  const crossRefs = useMemo(() => buildCrossReferenceIndex(model), [model]);
  const rackReport = useMemo(() => evaluateRackEngineering(model), [model]);

  const filteredRefs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return crossRefs;
    return crossRefs.filter((r) => r.key.toLowerCase().includes(q));
  }, [crossRefs, search]);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const pdf = buildCompactProgramPdf(model, rackReport, crossRefs);
    triggerDownload(pdf.output("blob"), `${model.name.replace(/\s+/g, "_")}_documentacao.pdf`);
  };

  const handleExportCsv = () => {
    const csv = exportIoSymbolsToCsv(model.ioSymbols);
    triggerDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${model.name.replace(/\s+/g, "_")}_io.csv`,
    );
  };

  const handleExportPlcOpen = () => {
    const xml = exportCompactToPlcOpenXml(model);
    triggerDownload(
      new Blob([xml], { type: "application/xml;charset=utf-8" }),
      `${model.name.replace(/\s+/g, "_")}.plcopen.xml`,
    );
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = importIoSymbolsFromCsv(text);
    if (!res.ok) {
      setCsvFeedback(`Falha na importação CSV: ${res.errors.slice(0, 3).join(" | ")}`);
      return;
    }
    setCsvFeedback(`Importados ${res.symbols.length} símbolo(s) com sanitização segura.`);
    onChangeModel({ ...model, ioSymbols: [...res.symbols] }, "Importar Tabela Simbólica CSV");
  };

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground p-4 gap-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold">
            Documentação Técnica, Tabela de E/S &amp; Referências Cruzadas
          </h2>
          <p className="text-xs text-muted-foreground">
            Exportação segura com neutralização de fórmulas CSV, relatório PDF multipágina e PLCopen
            XML.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="h-7 text-xs gap-1"
          >
            <FileCsv className="h-3.5 w-3.5" />
            Exportar E/S (CSV)
          </Button>
          <label className="inline-flex items-center h-7 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs cursor-pointer gap-1">
            <FileCsv className="h-3.5 w-3.5" />
            Importar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvFileUpload}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPlcOpen}
            className="h-7 text-xs gap-1"
          >
            <FileCode className="h-3.5 w-3.5" />
            PLCopen XML
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={handleExportPdf}
            className="h-7 text-xs gap-1"
          >
            <FilePdf className="h-3.5 w-3.5" />
            Gerar PDF Técnico
          </Button>
        </div>
      </div>

      {csvFeedback && (
        <div className="text-xs rounded border border-border bg-card px-3 py-2 text-muted-foreground">
          {csvFeedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Symbolic I/O Table */}
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tabela Simbólica de E/S ({model.ioSymbols.length})
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1">Endereço</th>
                <th className="py-1">Símbolo</th>
                <th className="py-1">Tipo</th>
                <th className="py-1">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {model.ioSymbols.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    Nenhum símbolo cadastrado.
                  </td>
                </tr>
              ) : (
                model.ioSymbols.map((sym) => (
                  <tr key={sym.id} className="border-b border-border/40">
                    <td className="py-1 font-mono font-semibold">{sym.address}</td>
                    <td className="py-1 font-mono">{sym.symbolicName}</td>
                    <td className="py-1">{sym.signalType}</td>
                    <td className="py-1 text-muted-foreground">{sym.comment}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Cross Reference Index */}
        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Referências Cruzadas ({filteredRefs.length})
            </h3>
            <div className="relative">
              <MagnifyingGlass className="h-3.5 w-3.5 absolute left-2 top-2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar tag/bloco..."
                className="h-7 pl-7 pr-2 rounded border border-border bg-background text-xs"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-auto space-y-1.5">
            {filteredRefs.map((ref) => (
              <div
                key={`${ref.kind}_${ref.key}`}
                className="rounded border border-border/60 bg-background p-2 text-xs"
              >
                <div className="flex items-center justify-between font-mono font-semibold">
                  <span>{ref.key}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {ref.kind} · {ref.totalHits}x
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ref.hits.map((h, i) => (
                    <button
                      key={`${h.nodeId}_${i}`}
                      type="button"
                      onClick={() => onNavigateToNode?.(h.pageId, h.nodeId)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-mono"
                    >
                      {h.pageName}: {h.instanceName} ({h.role})
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
