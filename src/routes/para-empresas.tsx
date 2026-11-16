import { createFileRoute } from "@tanstack/react-router";
import {
  AudienceLanding,
  softwareJsonLd,
  type AudienceContent,
} from "@/components/marketing/audience-landing";

const DESCRIPTION =
  "Software de engenharia elétrica e automação para integradoras e indústrias: diagrama unifilar e multifilar, Ladder e FBD (IEC 61131-3), supervisório SCADA, IoT em tempo real e documentação de painel em um só lugar.";

const CONTENT: AudienceContent = {
  perfil: "empresa",
  eyebrow: "Para integradoras, indústrias e escritórios de engenharia",
  headline: "Projeto elétrico, CLP e supervisório da sua equipe em um só ambiente.",
  lead: "Do unifilar à lista de cabos e à lógica do CLP, com a mesma fonte de dados para toda a equipe — sem retrabalho entre ferramentas e planilhas.",
  pains: [
    "Diagramas, lógica de CLP e documentação espalhados em ferramentas diferentes",
    "Lista de materiais e bornes refeitas à mão a cada revisão",
    "Telemetria de bancada e de campo sem um painel único",
    "Equipe sem papéis definidos sobre quem edita o quê",
  ],
  benefits: [
    {
      title: "Unifilar → multifilar → documentação",
      text: "Designação IEC 81346, numeração de fios por potencial, régua de bornes, lista de cabos e referência cruzada geradas do mesmo diagrama.",
    },
    {
      title: "FB Electric Studio + Ladder (IEC 61131-3)",
      text: "Lógica em blocos (FBD/LAD) e Ladder com simulação, geração de Structured Text e exportação PLCopen XML.",
    },
    {
      title: "Equipe e IoT",
      text: "Usuários com papéis (owner, admin, engenheiro, operador, leitor) e leituras reais de dispositivos (ESP32, Arduino, gateways) no plano Pro Empresa.",
    },
  ],
  plans: ["pro", "premium"],
  faq: [
    {
      q: "O EletricAI programa o CLP físico?",
      a: "Não. Por segurança, nada é enviado a equipamento real: o app gera a lógica, o Structured Text e o PLCopen XML para você carregar com a ferramenta do fabricante.",
    },
    {
      q: "Posso trocar de plano depois?",
      a: "Sim. Os limites de usuários e dispositivos mudam junto com o plano; nada já criado é apagado.",
    },
    {
      q: "Como funciona o anual?",
      a: "Pagamento antecipado de 12 meses com desconto equivalente a cerca de 2 mensalidades.",
    },
  ],
};

export const Route = createFileRoute("/para-empresas")({
  head: () => ({
    meta: [
      { title: "EletricAI para empresas — projeto elétrico, CLP e supervisório" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "EletricAI para empresas de engenharia e automação" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://eletricai.vercel.app/para-empresas" }],
    scripts: [{ type: "application/ld+json", children: softwareJsonLd(DESCRIPTION) }],
  }),
  component: () => <AudienceLanding content={CONTENT} />,
});
