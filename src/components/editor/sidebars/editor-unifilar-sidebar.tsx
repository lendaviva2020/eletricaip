import { Boxes, Cable, Gauge } from "lucide-react";
import {
  isBreakerComponent,
  VOLTAI_COMPONENT_DEFINITIONS,
  type VoltaiComponentDefinition,
} from "@/lib/palette/component-catalog";
import { PaletteGroup, SidebarSearch, SidebarShell } from "./sidebar-primitives";
import { useEditorStore } from "@/lib/editor/store";
import { useI18n } from "@/lib/i18n";

export function EditorUnifilarSidebar() {
  const { t } = useI18n();
  const dragValidation = useEditorStore((s) => s.dragValidation);
  const validateComponent = useEditorStore((s) => s.validateComponent);

  const protectionComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (c) => c.category === "Protecao",
  );
  const powerComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (c) => c.category === "Potencia" || c.category === "Fonte" || c.category === "Carga",
  );
  const controlComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (c) => c.category === "Controle" || c.category === "Seguranca",
  );
  const signalComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (c) => c.category === "Sinal" || c.category === "Medicao",
  );

  return (
    <SidebarShell footer={dragValidation}>
      <SidebarSearch
        title={t("sidebars.unifilarTitle")}
        placeholder={t("sidebars.unifilarPlaceholder")}
      />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        <PaletteGroup icon={Cable} title={t("sidebars.protection")}>
          {protectionComponents.map((c) => (
            <PaletteItem key={c.type} component={c} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Boxes} title={t("sidebars.power")}>
          {powerComponents.map((c) => (
            <PaletteItem key={c.type} component={c} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Gauge} title={t("sidebars.control")}>
          {controlComponents.map((c) => (
            <PaletteItem key={c.type} component={c} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Gauge} title={t("sidebars.measurementAndSignal")}>
          {signalComponents.map((c) => (
            <PaletteItem key={c.type} component={c} />
          ))}
        </PaletteGroup>
      </div>
    </SidebarShell>
  );
}

function PaletteItem({ component }: { component: VoltaiComponentDefinition }) {
  const { t } = useI18n();
  const validateComponent = useEditorStore((s) => s.validateComponent);

  return (
    <button
      draggable
      onDragStart={(event) => {
        validateComponent?.(component.type);
        event.dataTransfer.setData("application/voltai-component", component.type);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={
        isBreakerComponent(component.type)
          ? t("sidebars.breakerValidated", { type: component.type })
          : undefined
      }
      className="group flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] text-foreground/85
                 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary/60 group-hover:bg-primary group-hover:glow-primary" />
      <span className="w-12 shrink-0 font-mono text-[10px] text-primary">{component.type}</span>
      <span className="truncate">{component.name}</span>
    </button>
  );
}
