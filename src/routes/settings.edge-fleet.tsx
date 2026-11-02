import { createFileRoute } from "@tanstack/react-router";
import { EdgeFleetDashboard } from "@/components/edge/fleet-dashboard";

export const Route = createFileRoute("/settings/edge-fleet")({
  head: () => ({
    meta: [
      { title: "Gerenciamento de Frota Edge · EletricAI" },
      { name: "description", content: "Gerenciamento centralizado de gateways industriais." },
    ],
  }),
  component: EdgeFleetPage,
});

function EdgeFleetPage() {
  return <EdgeFleetDashboard />;
}
