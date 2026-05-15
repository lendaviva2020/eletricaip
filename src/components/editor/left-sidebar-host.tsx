import type { WorkspaceMode } from "@/lib/workspace-data";
import type { VoltaiComponentDefinition } from "@/lib/voltai/component-definitions";
import { EditorUnifilarSidebar } from "./sidebars/editor-unifilar-sidebar";
import { EditorLadderSidebar } from "./sidebars/editor-ladder-sidebar";
import { EditorScadaSidebar } from "./sidebars/editor-scada-sidebar";
import { EditorFbdSidebar } from "./sidebars/editor-fbd-sidebar";
import { EditorTwinSidebar } from "./sidebars/editor-twin-sidebar";
import { EditorPlcSidebar } from "./sidebars/editor-plc-sidebar";
import { EditorSimSidebar } from "./sidebars/editor-sim-sidebar";

interface Props {
  mode: WorkspaceMode;
  unifilar: {
    dragValidation: string;
    onValidate: (component: VoltaiComponentDefinition) => boolean;
  };
}

export function LeftSidebarHost({ mode, unifilar }: Props) {
  switch (mode) {
    case "unifilar":
      return (
        <EditorUnifilarSidebar
          dragValidation={unifilar.dragValidation}
          onValidate={unifilar.onValidate}
        />
      );
    case "ladder":
      return <EditorLadderSidebar />;
    case "fbd":
      return <EditorFbdSidebar />;
    case "scada":
      return <EditorScadaSidebar />;
    case "twin":
      return <EditorTwinSidebar />;
    case "plc":
      return <EditorPlcSidebar />;
    case "sim":
      return <EditorSimSidebar />;
    case "alarms":
      return null;
    default:
      return null;
  }
}
