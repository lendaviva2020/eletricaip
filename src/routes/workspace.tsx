import { createFileRoute } from "@tanstack/react-router";
import { IndustrialWorkspace } from "@/components/industrial-workspace";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Industrial Workspace · EletricAI Industrial OS" },
      { name: "description", content: "Ambiente unificado: unifilar, ladder, FBD, SCADA, Digital Twin, PLC, simulação e alarmes." },
    ],
  }),
  component: IndustrialWorkspace,
});
