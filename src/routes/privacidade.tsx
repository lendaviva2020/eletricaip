import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade · EletricAI" },
      {
        name: "description",
        content:
          "Como a EletricAI coleta, usa, compartilha e protege dados pessoais em conformidade com a LGPD e o GDPR.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      subtitle="LGPD (Lei 13.709/2018) e GDPR — como tratamos seus dados."
      docPath="/legal/privacy-policy.md"
    />
  );
}
