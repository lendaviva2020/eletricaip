// SCADA SUPERVISÓRIO — Industrial Supervisory Route
// Provides dedicated top-level route accessible via /scada

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ScadaLayout } from "@/components/scada/scada-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const SearchSchema = z.object({
  projectId: z.guid().optional(),
});

export const Route = createFileRoute("/scada")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "SCADA Supervisório Industrial · ElétricAi Industrial OS" },
      {
        name: "description",
        content:
          "Sistema de supervisão industrial profissional: sinóticos, alarmes ISA-18.2, tendências, equipamentos e controle de processos.",
      },
    ],
  }),
  component: ScadaRoute,
});

function ScadaRoute() {
  const { projectId } = Route.useSearch();
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full w-full overflow-hidden">
      <ErrorBoundary key={projectId || "scada-root"}>
        <ScadaLayout projectId={projectId ?? null} />
      </ErrorBoundary>
    </div>
  );
}
