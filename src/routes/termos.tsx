import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso · EletricAI" },
      {
        name: "description",
        content:
          "Termos de Uso do EletricAI Industrial OS: licença, planos, pagamentos, IA assistiva e segurança operacional.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      subtitle="Licença SaaS B2B, planos e pagamentos, IA assistiva e avisos de segurança operacional."
      docPath="/legal/terms-of-service.md"
    />
  );
}
