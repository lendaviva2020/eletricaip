import type { WorkspaceMode } from "@/lib/workspace-data";
import { EditorUnifilarSidebar } from "./sidebars/editor-unifilar-sidebar";
import { EditorLadderSidebar } from "./sidebars/editor-ladder-sidebar";
import { EditorScadaSidebar } from "./sidebars/editor-scada-sidebar";
import { EditorPlcSidebar } from "./sidebars/editor-plc-sidebar";
import { EditorSimSidebar } from "./sidebars/editor-sim-sidebar";
import { EditorStudioSidebar } from "./sidebars/editor-studio-sidebar";

/** Modos com barra lateral própria (os demais não mostram painel nem alça vazios). */
export function hasLeftSidebar(mode: WorkspaceMode): boolean {
  return [
    "unifilar",
    "multifilar",
    "ladder",
    "scada",
    "plc",
    "sim",
    "compactStudio",
    "fbd",
  ].includes(mode);
}

interface Props {
  mode: WorkspaceMode;
}

export function LeftSidebarHost({ mode }: Props) {
  switch (mode) {
    case "unifilar":
    case "multifilar":
      return <EditorUnifilarSidebar />;
    case "ladder":
      return <EditorLadderSidebar />;
    case "scada":
      return <EditorScadaSidebar />;
    case "plc":
      return <EditorPlcSidebar />;
    case "sim":
      return <EditorSimSidebar />;
    case "compactStudio":
    case "fbd":
      return <EditorStudioSidebar />;
    case "alarms":
      return null;
    default:
      return null;
  }
}
