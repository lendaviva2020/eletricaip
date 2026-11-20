/**
 * Perguntas frequentes da landing — fonte única do texto exibido e do JSON-LD
 * (FAQPage). Cada resposta descreve o que EXISTE no produto; mudou o produto,
 * mude aqui.
 */
import { safeJsonLd } from "./sales-contact";

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: "Substitui o software de CAD que já usamos?",
    a: "Cobre o projeto elétrico e de automação: unifilar, multifilar, Ladder/FBD, cálculos, SCADA e dossiê, no mesmo modelo. Para quem continua no CAD, os diagramas exportam em DXF e PDF.",
  },
  {
    q: "A IA inventa valores no projeto?",
    a: 'Não. Todo valor sugerido pela IA ou vindo da biblioteca fica marcado como "a conferir" até o engenheiro confirmar, e a emissão da revisão é bloqueada enquanto houver valor não confirmado. Dado ausente vira pendência, nunca número presumido.',
  },
  {
    q: "Quem assina o projeto e a ART?",
    a: "O engenheiro responsável. A plataforma calcula, verifica e documenta com as premissas declaradas, mas não substitui o profissional habilitado nem atesta equipamentos para operação.",
  },
  {
    q: "Os projetos da minha empresa ficam isolados dos de outras empresas?",
    a: "Sim. O acesso é filtrado por empresa e por papel diretamente no banco de dados, e as ações sensíveis ficam registradas numa trilha de auditoria encadeada.",
  },
  {
    q: "A plataforma comanda CLPs ou equipamentos reais?",
    a: "Não. A simulação é sempre rotulada e nenhum recurso, inclusive a IA, escreve em equipamento de campo. A leitura de dados reais (IoT) existe nos planos Pro Empresa e Premium.",
  },
  {
    q: "Consigo importar o que já tenho?",
    a: "Listas de tags, tabelas de E/S e projetos em JSON, CSV e PLCopen XML, sem consumir créditos de IA. Catálogos de componentes entram por planilha CSV/XLSX.",
  },
  {
    q: "Precisa instalar alguma coisa?",
    a: "Não. É uma aplicação web que roda no navegador do computador, tablet e celular, com conexão à internet.",
  },
  {
    q: "Como funciona a cobrança e o cancelamento?",
    a: "Planos mensais ou anuais pelo painel de faturamento. O cancelamento é feito no próprio painel e vale o direito de arrependimento de 7 dias (CDC, art. 49). O plano Corporativo tem condições definidas em contrato.",
  },
];

export function faqJsonLd(items: readonly FaqItem[] = FAQ_ITEMS): string {
  return safeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  });
}
