import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, FileBox } from "lucide-react";
import { getProjectExportData } from "@/lib/export.functions";
import { buildProjectPdf } from "@/lib/pdf-export";
import { buildDxf, downloadDxf, type DxfNode, type DxfEdge } from "@/lib/dxf-export";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/projects/$projectId/export")({
  head: () => ({ meta: [{ title: "Exportar projeto · EletricAI" }] }),
  component: ExportPage,
});

function ExportPage() {
  const { projectId } = Route.useParams();
  const dataFn = useServerFn(getProjectExportData);
  const [busy, setBusy] = useState<string | null>(null);

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
      const pdf = buildProjectPdf({
        project: data.project,
        bom: data.bom as any,
        totalBRL: data.totalBRL,
      });
      pdf.save(`${safeName(data.project.name)}_memorial.pdf`);
      toast.success("PDF gerado.");
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
      const dxf = buildDxf(nodes, edges);
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
        <ArrowLeft className="w-4 h-4" /> Projetos
      </Link>
      <h1 className="text-2xl font-bold mb-1">Exportar projeto</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Gere documentação profissional para apresentação, fabricação ou submissão.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

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
                <p className="text-xs text-muted-foreground">Itens BOM</p>
                <p className="font-semibold">{data.bom.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total estimado</p>
                <p className="font-semibold">R$ {data.totalBRL.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg p-5 bg-card">
              <FileText className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-semibold mb-1">Memorial PDF</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Capa, identificação do projeto, lista de materiais com subtotal e total geral.
                Conforme NBR 5410 / NBR 5444.
              </p>
              <Button className="w-full" onClick={handlePdf} disabled={!!busy}>
                {busy === "pdf" ? "Gerando…" : "Baixar PDF"}
              </Button>
            </div>
            <div className="border border-border rounded-lg p-5 bg-card">
              <FileBox className="w-6 h-6 text-primary mb-3" />
              <h3 className="font-semibold mb-1">Diagrama DXF (AutoCAD)</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Exporta os nós e conexões do canvas como entidades LINE/TEXT em camadas
                COMPONENTS/WIRES/LABELS. Compatível com AutoCAD, QCAD e LibreCAD.
              </p>
              <Button className="w-full" onClick={handleDxf} disabled={!!busy}>
                {busy === "dxf" ? "Gerando…" : "Baixar DXF"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
