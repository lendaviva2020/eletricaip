// Lazy wrappers para bibliotecas pesadas (Monaco / Konva / Three.js).
// Cada uma é code-split em chunk próprio e só baixa quando o canvas/aba
// correspondente é montado — corta ~1.5MB do bundle inicial.
//
// IMPORTANTE: `React.lazy` sozinho NÃO impede o SSR de avaliar o módulo — o
// React resolve o lazy durante a renderização no servidor e Pixi/Three/Konva
// quebram (ou explodem em memória) no runtime Worker. Por isso todo wrapper
// abaixo é envolvido em `<ClientOnly>`, que é o gate de render real.
import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";
import { ClientOnly } from "@tanstack/react-router";

const CanvasFallback = ({ label }: { label: string }) => (
  <div className="w-full h-full grid place-items-center bg-background/40">
    <div className="text-xs text-muted-foreground animate-pulse">{label}</div>
  </div>
);

// Monaco (~600KB gzip)
const MonacoEditorLazy = lazy(() => import("@monaco-editor/react"));
export function LazyMonacoEditor(props: ComponentProps<typeof MonacoEditorLazy>) {
  const fallback = <CanvasFallback label="Carregando editor de código…" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <MonacoEditorLazy {...props} />
      </Suspense>
    </ClientOnly>
  );
}

// Konva (~300KB gzip) — KonvaCanvas é named export
const KonvaCanvasLazy = lazy(() =>
  import("./konva-canvas").then((m) => ({ default: m.KonvaCanvas })),
) as unknown as ComponentType<{ variant: "scada" | "twin" | "sim" }>;
export function LazyKonvaCanvas(props: { variant: "scada" | "twin" | "sim" }) {
  const fallback = <CanvasFallback label="Carregando canvas SCADA…" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <KonvaCanvasLazy {...props} />
      </Suspense>
    </ClientOnly>
  );
}

// Three.js + R3F + drei (~500KB gzip)
const Twin3DViewerLazy = lazy(() =>
  import("./twin-3d-viewer").then((m) => ({ default: m.Twin3DViewer })),
);
export function LazyTwin3DViewer(props: ComponentProps<typeof Twin3DViewerLazy>) {
  const fallback = <CanvasFallback label="Inicializando visualização 3D…" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Twin3DViewerLazy {...props} />
      </Suspense>
    </ClientOnly>
  );
}
