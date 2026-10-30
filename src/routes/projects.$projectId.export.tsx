import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  FileArchive,
  ShieldCheck,
  Sparkle,
  DownloadSimple,
} from "@phosphor-icons/react";
import { getProjectExportData } from "@/lib/export.functions";
import { buildDxf, downloadDxf, type DxfNode, type DxfEdge } from "@/lib/dxf-export";
import { Button } from "@/components/ui/button";
import { useI18n, getLocale } from "@/lib/i18n";
import { EngineeringDossierModal } from "@/components/dossier/engineering-dossier-modal";
import { UniversalImportModal } from "@/components/importer/universal-import-modal";

export const Route = createFileRoute("/projects/$projectId/export")({
  head: () => ({ meta: [{ title: "Exportar projeto · EletricAI" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { projectId } = Route.useParams();
  const dataFn = useServerFn(getProjectExportData);
  const [busy, setBusy] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const { t, formatCurrency } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["project-export", projectId],
    queryFn: () => dataFn({ data: { projectId } }),
  });

  function safeName(s: string) {
    return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "projeto";
  }

  async function handlePdf() {
    if (!data) return;
    setBusy("pdf");
    try {
      const { buildProjectPdf } = await import("@/lib/pdf-export");
      const pdf = buildProjectPdf({
        project: data.project,
        bom: data.bom as any,
        totalBRL: data.totalBRL,
        locale: getLocale(),
      });
      pdf.save(`${safeName(data.project.name)}_memorial.pdf`);
      toast.success(t("common.download") + " PDF");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDxf() {
    if (!data) return;
    setBusy("dxf");
    try {
      const nodes: DxfNode[] = [];
      const edges: DxfEdge[] = [];
      const nodeIndex = new Map<string, DxfNode>();
      for (const d of data.diagrams as any[]) {
        const cv = d.canvas_data ?? {};
        for (const n of cv.nodes ?? []) {
          const node: DxfNode = {
            id: n.id,
            position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
            label: n.data?.label ?? n.data?.partNumber ?? n.type,
            width: n.width ?? 80,
            height: n.height ?? 40,
            type: n.data?.type || n.type || "default",
          };
          nodes.push(node);
          nodeIndex.set(n.id, node);
        }
        for (const e of cv.edges ?? []) {
          const a = nodeIndex.get(e.source);
          const b = nodeIndex.get(e.target);
          if (!a || !b) continue;
          edges.push({
            id: e.id,
            from: { x: a.position.x + (a.width ?? 0) / 2, y: a.position.y + (a.height ?? 0) / 2 },
            to: { x: b.position.x + (b.width ?? 0) / 2, y: b.position.y + (b.height ?? 0) / 2 },
          });
        }
      }
      if (nodes.length === 0) {
        toast.warning("Sem nós no canvas para exportar.");
        return;
      }
      const dxf = buildDxf(nodes, edges, { locale: getLocale(), title: data.project.name });
      downloadDxf(`${safeName(data.project.name)}_unifilar.dxf`, dxf);
      toast.success(`DXF gerado (${nodes.length} componentes, ${edges.length} ligações).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-4xl mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {t("nav.projects")}
      </Link>
      <h1 className="text-2xl font-bold mb-1">
        {t("common.export")} {data?.project.name ?? ""}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Gere documentação profissional para apresentação, fabricação ou submissão.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="border border-border rounded-lg p-4 mb-6 bg-card">
            <h2 className="font-semibold mb-2">{data.project.name}</h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Diagramas</p>
                <p className="font-semibold">{data.diagrams.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("reports.bomTitle")}</p>
                <p className="font-semibold">{data.bom.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total estimado</p>
                <p className="font-semibold">{formatCurrency(data.totalBRL)}</p>
              </div>
            </div>
          </div>

          <div className="border-2 border-primary/40 rounded-lg p-5 mb-6 bg-primary/5 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-base">
                    Dossiê Técnico de Engenharia (Completo)
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground">
                    NOVO · INDUSTRIAL
                  </span>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Geração completa a partir da topologia do Canvas: Capa executiva, memória de
                  cálculo determinística NBR 5410, BOM em 10 grupos industriais, régua de bornes X1,
                  mapa de I/O do CLP, exportação Excel com 5 abas, PLCopen XML e validação de
                  conformidade normativa com carimbo formal.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => setDossierOpen(true)}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9"
              >
                <Sparkle className="w-3.5 h-3.5" />
                Abrir Dossiê Técnico de Engenharia
              </Button>
              <Button
                variant="outline"
                onClick={() => setImporterOpen(true)}
                className="gap-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs h-9"
              >
                <DownloadSimple className="w-3.5 h-3.5" />
                Intercâmbio / Importar IA Externa (0 Créditos)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg p-5 bg-card">
              <FileText className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-semibold mb-1">{t("reports.memorialTitle")}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Capa, identificação do projeto, lista de materiais com subtotal e total geral.
                Conforme NBR 5410 / NBR 5444 / IEC 60364.
              </p>
              <Button className="w-full" onClick={handlePdf} disabled={!!busy}>
                {busy === "pdf" ? t("common.loading") : `${t("common.download")} PDF`}
              </Button>
            </div>
            <div className="border border-border rounded-lg p-5 bg-card">
              <FileArchive className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-semibold mb-1">Diagrama DXF (AutoCAD)</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Exporta os nós e conexões do canvas como entidades LINE/TEXT em camadas
                COMPONENTS/WIRES/LABELS. Compatível com AutoCAD, QCAD e LibreCAD.
              </p>
              <Button className="w-full" onClick={handleDxf} disabled={!!busy}>
                {busy === "dxf" ? t("common.loading") : `${t("common.download")} DXF`}
              </Button>
            </div>
          </div>

          <EngineeringDossierModal
            projectId={projectId}
            open={dossierOpen}
            onOpenChange={setDossierOpen}
          />

          <UniversalImportModal
            open={importerOpen}
            onOpenChange={setImporterOpen}
            projectId={projectId}
          />
        </>
      )}
    </div>
  );
}
