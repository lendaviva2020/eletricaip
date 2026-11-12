import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { IndustrialWorkspace } from "@/components/industrial-workspace";

const SearchSchema = z.object({
  projectId: z.guid().optional(),
});

export const Route = createFileRoute("/workspace")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Industrial Workspace · EletricAI Industrial OS" },
      {
        name: "description",
        content:
          "Ambiente unificado: unifilar, ladder, FBD, SCADA, Digital Twin, PLC, simulação e alarmes.",
      },
    ],
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { projectId } = Route.useSearch();
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full w-full overflow-hidden">
      <IndustrialWorkspace projectId={projectId ?? null} />
    </div>
  );
}
