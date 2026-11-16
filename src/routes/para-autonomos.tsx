import { createFileRoute } from "@tanstack/react-router";
import {
  AudienceLanding,
  softwareJsonLd,
  type AudienceContent,
} from "@/components/marketing/audience-landing";

const DESCRIPTION =
  "Software de projeto elétrico para engenheiros e técnicos autônomos: diagrama unifilar, dimensionamento NBR 5410, documentação de painel, Ladder e PDF/DXF/Excel — a partir de R$ 119 por mês.";

const CONTENT: AudienceContent = {
  perfil: "autonomo",
  eyebrow: "Para engenheiros e técnicos autônomos",
  headline: "Projete, documente e entregue painéis elétricos mais rápido — sozinho.",
  lead: "Um ambiente completo para quem atende vários clientes: diagrama, cálculos, documentação e lógica de comando sem licenças caras por ferramenta.",
  pains: [
    "Licenças de software caras para atender poucos projetos por mês",
    "Horas refazendo lista de materiais, bornes e cabos a cada mudança",
    "Cálculos de queda de tensão e curto-circuito em planilhas soltas",
    "Pouco tempo para documentar o que foi entregue ao cliente",
  ],
  benefits: [
    {
      title: "Documentação EletricAI",
      text: "Designação de dispositivos, fios numerados, régua de bornes, lista de cabos e verificação ao vivo enquanto você desenha.",
    },
    {
      title: "Cálculos elétricos",
      text: "Corrente de motor, queda de tensão, curto-circuito IEC 60909, demanda, harmônicas e aterramento — resultados que você confere.",
    },
    {
      title: "Catálogo próprio e IA",
      text: "Monte seu catálogo (manual, planilha ou distribuidor) e use a IA para propor o projeto inicial e corrigir o diagrama.",
    },
  ],
  plans: ["basic", "pro"],
  faq: [
    {
      q: "Preciso de CNPJ?",
      a: "Não. O plano Autônomo é para pessoa física; você pode migrar para Pro Empresa quando montar equipe.",
    },
    {
      q: "Os cálculos substituem a responsabilidade técnica?",
      a: "Não. Eles apoiam o projeto; a verificação e a ART continuam com o profissional habilitado.",
    },
    {
      q: "Posso cancelar?",
      a: "Sim. Pessoa física que contrata como consumidora tem 7 dias para desistir com devolução integral (art. 49 do CDC).",
    },
  ],
};

export const Route = createFileRoute("/para-autonomos")({
  head: () => ({
    meta: [
      { title: "EletricAI para autônomos — software de projeto elétrico" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "EletricAI para engenheiros e técnicos autônomos" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://eletricai.vercel.app/para-autonomos" }],
    scripts: [{ type: "application/ld+json", children: softwareJsonLd(DESCRIPTION) }],
  }),
  component: () => <AudienceLanding content={CONTENT} />,
});
