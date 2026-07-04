// Chrome compartilhado entre canvases (unifilar, twin, plc, fbd, sim, alarmes,
// konva). Extraído de `unifilar-canvas.tsx` como parte do descomissionamento
// do shim Voltai (#WGL-07 · etapa 1) — sem dependência do `useVoltaiStore`.

export function FloatingLegend({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="absolute top-4 left-4 z-10 glass rounded-md px-3 py-2 text-[11px] pointer-events-none">
      <div className="text-muted-foreground uppercase tracking-[0.18em] text-[9px] mb-1">
        {title}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-foreground/90">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export function BottomStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 glass rounded-md px-3 py-2 flex flex-wrap gap-4 text-[11px] pointer-events-none">
      {items.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{key}</span>
          <span className="font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
