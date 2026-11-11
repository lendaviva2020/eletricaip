import { createFileRoute } from "@tanstack/react-router";
import { IndustrialOperationsCenter } from "@/components/observability/industrial-operations-center";

export const Route = createFileRoute("/settings/observability")({
  head: () => ({
    meta: [
      { title: "Centro de Operações Industriais · EletricAI" },
      {
        name: "description",
        content: "Observabilidade industrial, confiabilidade operacional e SLI/SLO.",
      },
    ],
  }),
  component: ObservabilityPage,
});

function ObservabilityPage() {
  return <IndustrialOperationsCenter />;
}
