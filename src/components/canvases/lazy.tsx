// Lazy wrappers para bibliotecas pesadas (Monaco / Konva / Three.js).
// Cada uma é code-split em chunk próprio e só baixa quando o canvas/aba
// correspondente é montado — corta ~1.5MB do bundle inicial.
import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";

const CanvasFallback = ({ label }: { label: string }) => (
  <div className="w-full h-full grid place-items-center bg-background/40">
    <div className="text-xs text-muted-foreground animate-pulse">{label}</div>
  </div>
);

// Monaco (~600KB gzip)
const MonacoEditorLazy = lazy(() => import("@monaco-editor/react"));
export function LazyMonacoEditor(props: ComponentProps<typeof MonacoEditorLazy>) {
  return (
    <Suspense fallback={<CanvasFallback label="Carregando editor de código…" />}>
      <MonacoEditorLazy {...props} />
    </Suspense>
  );
}

// Konva (~300KB gzip) — KonvaCanvas é named export
const KonvaCanvasLazy = lazy(() =>
  import("./konva-canvas").then((m) => ({ default: m.KonvaCanvas })),
) as unknown as ComponentType<{ variant: "scada" | "twin" | "sim" }>;
export function LazyKonvaCanvas(props: { variant: "scada" | "twin" | "sim" }) {
  return (
    <Suspense fallback={<CanvasFallback label="Carregando canvas SCADA…" />}>
      <KonvaCanvasLazy {...props} />
    </Suspense>
  );
}

// Three.js + R3F + drei (~500KB gzip)
const Twin3DViewerLazy = lazy(() =>
  import("./twin-3d-viewer").then((m) => ({ default: m.Twin3DViewer })),
);
export function LazyTwin3DViewer(props: ComponentProps<typeof Twin3DViewerLazy>) {
  return (
    <Suspense fallback={<CanvasFallback label="Inicializando visualização 3D…" />}>
      <Twin3DViewerLazy {...props} />
    </Suspense>
  );
}
