import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  importCatalogBatch,
  canImportCatalog,
  type CatalogRow,
} from "@/lib/catalog-import.functions";

export const Route = createFileRoute("/settings/catalog-import")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Importar catálogo · EletricAI" },
      {
        name: "description",
        content: "Importação de catálogo real de componentes elétricos via CSV ou XLSX.",
      },
    ],
  }),
  component: CatalogImportPage,
});

const HEADER_MAP: Record<string, keyof CatalogRow> = {
  manufacturer: "manufacturer",
  fabricante: "manufacturer",
  partnumber: "partNumber",
  part_number: "partNumber",
  codigo: "partNumber",
  commercialname: "commercialName",
  commercial_name: "commercialName",
  nome: "commercialName",
  description: "description",
  descricao: "description",
  category: "category",
  categoria: "category",
  ratedcurrenta: "ratedCurrentA",
  rated_current_a: "ratedCurrentA",
  corrente: "ratedCurrentA",
  ratedvoltagev: "ratedVoltageV",
  rated_voltage_v: "ratedVoltageV",
  tensao: "ratedVoltageV",
  listpricebrl: "listPriceBRL",
  list_price_brl: "listPriceBRL",
  preco: "listPriceBRL",
  etimclass: "etimClass",
  etim_class: "etimClass",
  datasheeturl: "datasheetUrl",
  datasheet_url: "datasheetUrl",
  certifications: "certifications",
  certificacoes: "certifications",
};

function normalizeKey(k: string) {
  return k
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function mapRecord(raw: Record<string, unknown>): CatalogRow {
  const out: Record<string, unknown> = {};
  const specs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = HEADER_MAP[normalizeKey(key)];
    if (mapped) out[mapped] = value as never;
    else if (String(value ?? "").trim()) specs[key.trim()] = value;
  }
  if (Object.keys(specs).length) out["specs"] = specs;
  return out as CatalogRow;
}

function CatalogImportPage() {
  const canFn = useServerFn(canImportCatalog);
  const importFn = useServerFn(importCatalogBatch);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const { data: perm, isLoading: permLoading } = useQuery({
    queryKey: ["catalog-import", "permission"],
    queryFn: () => canFn({}),
    retry: false,
  });

  const importMutation = useMutation({
    mutationFn: () => importFn({ data: { rows } }),
  });

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    importMutation.reset();
    try {
      const isCsv = /\.csv$/i.test(file.name);
      let records: Record<string, unknown>[] = [];
      if (isCsv) {
        const text = await file.text();
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        records = result.data ?? [];
      } else {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const first = wb.SheetNames[0];
        if (!first) throw new Error("Planilha vazia");
        records = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, {
          defval: "",
        });
      }
      const mapped = records.map(mapRecord);
      if (!mapped.length) throw new Error("Nenhuma linha encontrada no arquivo");
      setRows(mapped);
    } catch (err) {
      setRows([]);
      setParseError(err instanceof Error ? err.message : "Falha ao ler o arquivo");
    }
  }

  if (permLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando permissões…</div>;
  }

  if (!perm?.allowed) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acesso restrito</CardTitle>
            <CardDescription>
              Apenas owner ou admin do workspace pode importar catálogo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const report = importMutation.data;
  const preview = rows.slice(0, 10);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <BackLink />
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar catálogo (CSV/XLSX)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O arquivo é lido no navegador e enviado já estruturado. Nenhum dado é gerado ou
            completado automaticamente — somente o conteúdo do arquivo é persistido.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">1 · Arquivo</CardTitle>
            <CardDescription className="text-xs">
              Colunas reconhecidas: manufacturer, partNumber, commercialName, description, category,
              ratedCurrentA, ratedVoltageV, listPriceBRL, etimClass, datasheetUrl, certifications.
              Colunas extras vão para specs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              aria-label="Selecionar arquivo de catálogo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} linha(s) lida(s)
              </p>
            )}
            {parseError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {parseError}
              </p>
            )}
          </CardContent>
        </Card>

        {preview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">2 · Preview (primeiras {preview.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Fabricante</th>
                    <th className="py-1 pr-3">Part number</th>
                    <th className="py-1 pr-3">Nome</th>
                    <th className="py-1 pr-3">Categoria</th>
                    <th className="py-1 pr-3">A</th>
                    <th className="py-1 pr-3">V</th>
                    <th className="py-1 pr-3">R$</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 pr-3">{String(r.manufacturer ?? "—")}</td>
                      <td className="py-1 pr-3 font-mono">{String(r.partNumber ?? "—")}</td>
                      <td className="py-1 pr-3">{String(r.commercialName ?? "—")}</td>
                      <td className="py-1 pr-3">{String(r.category ?? "—")}</td>
                      <td className="py-1 pr-3">{String(r.ratedCurrentA ?? "—")}</td>
                      <td className="py-1 pr-3">{String(r.ratedVoltageV ?? "—")}</td>
                      <td className="py-1 pr-3">{String(r.listPriceBRL ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  <Upload className="h-4 w-4 mr-2" />
                  {importMutation.isPending ? "Importando…" : `Importar ${rows.length} linha(s)`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Dedup por fabricante + part number: reimportar o mesmo arquivo atualiza, não
                  duplica.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {importMutation.isError && (
          <Card className="border-destructive/50">
            <CardContent className="p-4 text-sm text-destructive">
              Falha na importação: {(importMutation.error as Error).message}
            </CardContent>
          </Card>
        )}

        {report && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> 3 · Relatório
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">Inseridos: {report.inserted}</Badge>
                <Badge variant="secondary">Atualizados: {report.updated}</Badge>
                <Badge variant="secondary">Ignorados: {report.skipped}</Badge>
                <Badge variant={report.errors.length ? "destructive" : "secondary"}>
                  Erros: {report.errors.length}
                </Badge>
              </div>
              {report.errors.length > 0 && (
                <ul className="text-xs space-y-1 max-h-64 overflow-auto">
                  {report.errors.map((e) => (
                    <li key={e.row} className="text-muted-foreground">
                      <span className="font-mono">linha {e.row}</span> — {e.reason}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/catalog" className="text-xs text-primary hover:underline">
                Ver catálogo
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/settings"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft className="w-4 h-4" /> Configurações
    </Link>
  );
}
