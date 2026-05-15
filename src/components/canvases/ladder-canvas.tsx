import { RungGrid } from "./ladder/rung-grid";

export function LadderCanvas() {
  // Ladder is its own system: it does NOT read unifilar/SCADA components.
  // Rungs use a true matrix model (rows × cols). Outputs land on the right column.
  // Tags are shared via useEditorStore so Simulação cross-module integration works.
  return (
    <div className="h-full w-full">
      <RungGrid />
    </div>
  );
}
