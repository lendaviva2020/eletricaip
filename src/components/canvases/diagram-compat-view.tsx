/**
 * Modo de compatibilidade do canvas unifilar/multifilar.
 *
 * Quando o navegador não consegue iniciar o WebGL ou derruba o contexto
 * (celulares com pouca memória de vídeo), o diagrama continua visível como
 * SVG vetorial — o mesmo da exportação. É exibido como <img> (blob URL):
 * nesse contexto o SVG não executa script, então texto do projeto não vira
 * injeção. Arrastar/rolar navega; botões ajustam o zoom.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { DiagramDoc, SheetKind } from "@/lib/diagram/schema";
import { diagramToSvg } from "@/lib/diagram/export-svg";

interface Props {
  readonly doc: DiagramDoc;
  readonly sheet: SheetKind;
  readonly reason: "init" | "contextlost";
  readonly onRetry: () => void;
}

const ZOOM_STEPS = [0.35, 0.5, 0.75, 1, 1.5, 2] as const;

export function DiagramCompatView({ doc, sheet, reason, onRetry }: Props) {
  const [zoomIdx, setZoomIdx] = useState(1);
  const svg = useMemo(() => diagramToSvg(doc, sheet), [doc, sheet]);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(blobUrl);
    const m = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    setSize(m ? { w: Number(m[1]), h: Number(m[2]) } : null);
    return () => URL.revokeObjectURL(blobUrl);
  }, [svg]);

  const zoom = ZOOM_STEPS[zoomIdx];

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0b1220]" data-testid="diagram-compat-view">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs bg-amber-500/10 border-b border-amber-500/30 text-amber-200">
        <Warning className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-0">
          {reason === "contextlost"
            ? "O navegador interrompeu o canvas gráfico (memória de vídeo). Mostrando o diagrama em modo de compatibilidade — somente visualização."
            : "Este navegador não iniciou o canvas gráfico (WebGL). Mostrando o diagrama em modo de compatibilidade — somente visualização."}
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>
          <ArrowClockwise className="h-3.5 w-3.5 mr-1" /> Tentar novamente
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto touch-pan-x touch-pan-y">
        {url && (
          <img
            src={url}
            alt={`Diagrama ${sheet}`}
            draggable={false}
            style={
              size ? { width: size.w * zoom, height: size.h * zoom, maxWidth: "none" } : undefined
            }
            className="block select-none"
          />
        )}
      </div>
      <div className="absolute bottom-3 left-3 flex gap-1">
        <Button
          size="icon"
          variant="secondary"
          className="h-9 w-9"
          aria-label="Diminuir zoom"
          disabled={zoomIdx === 0}
          onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
        >
          <MagnifyingGlassMinus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="h-9 w-9"
          aria-label="Aumentar zoom"
          disabled={zoomIdx === ZOOM_STEPS.length - 1}
          onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
        >
          <MagnifyingGlassPlus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
