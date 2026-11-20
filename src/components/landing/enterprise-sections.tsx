/**
 * Seções da landing voltadas a quem compra em empresa: vitrine das
 * funcionalidades, públicos, comparação, segurança, plano Corporativo,
 * programa piloto, FAQ, aviso de responsabilidade e pedido de demonstração.
 *
 * Regra do produto: nada aqui é inventado. Sem logos/depoimentos fictícios, sem
 * números de ganho não medidos; tudo o que é afirmado existe no código.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ShieldCheck,
  Lock,
  Fingerprint,
  ClipboardText,
  SealCheck,
  Trash,
  Handshake,
  Buildings,
  UserCircle,
  Wrench,
  Factory,
  WarningCircle,
  WhatsappLogo,
  EnvelopeSimple,
  Check,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LAUNCH_OFFER } from "@/lib/plans";
import {
  DemoRequestSchema,
  INTERESTS,
  INTEREST_LABELS,
  TEAM_SIZES,
  buildDemoRequestText,
  demoRequestSubject,
  mailtoUrl,
  salesChannelsFromBuild,
  whatsappUrl,
  type Interest,
  type TeamSize,
} from "@/lib/marketing/sales-contact";
import { FAQ_ITEMS } from "@/lib/marketing/landing-faq";

function SectionHeader(props: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mb-8 max-w-3xl">
      <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
        {props.eyebrow}
      </span>
      <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-foreground">
        {props.title}
      </h2>
      {props.lead && (
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{props.lead}</p>
      )}
    </div>
  );
}

const sectionCls = "py-14 md:py-16 px-4 sm:px-6 border-b border-border bg-background";

/* ─── Vitrine: o que já existe no produto ─────────────────────────────── */

const CAPABILITIES: ReadonlyArray<{ title: string; desc: string; tag: string }> = [
  {
    tag: "IA",
    title: "Assistente de engenharia em cada editor",
    desc: "Uma conversa por editor (unifilar, multifilar, Ladder, FB Studio, SCADA). Lê o diagnóstico real, corrige o que pode, pergunta o que falta e tudo que altera pode ser desfeito.",
  },
  {
    tag: "IEC 61131-3",
    title: "Ladder e FBD gerados do unifilar",
    desc: "Cada motor desenhado vira lógica de partida com selo, térmico, disjuntor e emergência em contatos NF. A lógica acompanha o desenho; o que você edita passa a ser seu.",
  },
  {
    tag: "Kits",
    title: "Partida direta, estrela-triângulo e reversão",
    desc: "Ramais completos e ligados num gesto, com tags IEC 81346, intertravamento e inversão de fases L1↔L3 desenhada no multifilar.",
  },
  {
    tag: "IEC 60909",
    title: "Curto-circuito por ponto da instalação",
    desc: "Curto trifásico máximo e fase-terra mínimo em cada barramento e carga, seccionamento automático TN/TT/IT e capacidade de interrupção no ponto.",
  },
  {
    tag: "Seletividade",
    title: "Curvas tempo × corrente e coordenação",
    desc: "Faixas normativas de disjuntores e relés térmicos, dano do cabo, verificação de partida do motor e pares seletivos, parciais ou sem seletividade.",
  },
  {
    tag: "IEEE 1584",
    title: "Energia incidente e etiquetas de arco",
    desc: "Energia por quadro no pior caso, categoria de EPI e etiquetas para impressão, com as premissas declaradas.",
  },
  {
    tag: "NBR 5410",
    title: "Cabos, queda de tensão e DPS",
    desc: "Dimensionamento com agrupamento e temperatura, queda total desde a fonte e regras de proteção contra surtos. Dado ausente vira pendência, nunca valor presumido.",
  },
  {
    tag: "ISA-101 / 18.2",
    title: "SCADA, CCM e alarmes",
    desc: "Hierarquia de áreas, faceplate único com tendência, prateleira e fora de serviço com prazo e motivo, indicadores de alarmes e editor de telas de processo.",
  },
  {
    tag: "Rastreável",
    title: "Revisão aprovada e selada",
    desc: "A emissão grava o projeto e o memorial de cálculo com selo SHA-256 na trilha de auditoria. Qualquer alteração posterior é detectada.",
  },
];

export function CapabilitiesSection() {
  return (
    <section id="recursos" className={sectionCls}>
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          eyebrow="O que a plataforma faz hoje"
          title="Uma suíte de engenharia, não só um editor de desenho."
          lead="Tudo abaixo roda no navegador, sobre o mesmo projeto: o que muda no unifilar chega ao multifilar, ao Ladder, ao FB Studio, aos cálculos e ao dossiê."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-md border border-border bg-border overflow-hidden">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="bg-card p-5">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                {c.tag}
              </span>
              <h3 className="mt-1 text-sm font-semibold text-foreground">{c.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Para quem é + antes × depois ──────────────────────────────────────── */

const AUDIENCES = [
  {
    icon: Buildings,
    title: "Integradoras e painelistas",
    desc: "Do unifilar à régua de bornes, lista de cabos e BOM do painel, com a lógica do CLP pronta para revisar.",
    to: "/para-empresas" as const,
  },
  {
    icon: Factory,
    title: "Indústria e manutenção",
    desc: "Documentação viva da planta, CCM supervisório e alarmes para treinar e analisar antes de mexer no campo.",
    to: "/para-empresas" as const,
  },
  {
    icon: Wrench,
    title: "Escritórios de projeto",
    desc: "Memorial de cálculo NBR 5410, curto, seletividade e arco elétrico com premissas declaradas e revisão selada.",
    to: "/para-empresas" as const,
  },
  {
    icon: UserCircle,
    title: "Engenheiro autônomo",
    desc: "O mesmo motor de cálculo e documentação com o plano Autônomo, sem equipe nem infraestrutura.",
    to: "/para-autonomos" as const,
  },
];

const COMPARISON: ReadonlyArray<{ generic: string; here: string }> = [
  {
    generic: "Símbolos são desenhos; a ligação é só uma linha.",
    here: "Cada símbolo tem terminais reais e a ligação é elétrica (grafo).",
  },
  {
    generic: "Cálculos em planilha separada, que desatualiza.",
    here: "Cabos, curto, seletividade e arco recalculados a cada mudança.",
  },
  {
    generic: "Lógica do CLP reescrita à mão a partir do desenho.",
    here: "Ladder e FBD gerados do unifilar e mantidos em sincronia.",
  },
  {
    generic: "Lista de materiais montada manualmente.",
    here: "BOM, lista de cabos e régua de bornes saem do mesmo projeto.",
  },
  {
    generic: "Revisão por nome de arquivo, sem prova de integridade.",
    here: "Revisão aprovada com selo SHA-256 e trilha de auditoria.",
  },
];

export function AudienceSection() {
  return (
    <section id="para-quem" className={sectionCls}>
      <div className="max-w-7xl mx-auto">
        <SectionHeader eyebrow="Para quem é" title="Feito para quem projeta, monta e mantém." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AUDIENCES.map((a) => (
            <Link
              key={a.title}
              to={a.to}
              className="group rounded-md border border-border bg-card p-5 hover:border-primary/50 transition-colors"
            >
              <a.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-foreground">{a.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{a.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                Saiba mais <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-md border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 border-b border-border bg-muted/30 text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="p-3">Ferramenta de desenho genérica</div>
            <div className="p-3 border-l border-border text-primary">ElétricAi</div>
          </div>
          <ul className="divide-y divide-border text-[13px]">
            {COMPARISON.map((c) => (
              <li key={c.here} className="grid grid-cols-2">
                <div className="p-3 flex gap-2 text-muted-foreground">
                  <X className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/60" aria-hidden />
                  {c.generic}
                </div>
                <div className="p-3 flex gap-2 border-l border-border text-foreground">
                  <Check className="h-4 w-4 shrink-0 mt-0.5 text-success" aria-hidden />
                  {c.here}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─── Segurança e conformidade ──────────────────────────────────────────── */

const SECURITY = [
  {
    icon: Lock,
    title: "Isolamento por empresa",
    desc: "Cada consulta ao banco é filtrada por empresa e papel (owner, admin, engenheiro, operador, visualizador) direto no banco de dados, não só na tela.",
  },
  {
    icon: Fingerprint,
    title: "Verificação em duas etapas",
    desc: "Autenticador TOTP opcional; com o fator ativo, a sessão sem a segunda etapa é recusada também no servidor.",
  },
  {
    icon: ClipboardText,
    title: "Trilha de auditoria encadeada",
    desc: "Reconhecimento de alarmes, forçamento de tags e aprovação de revisões gravados no servidor, em cadeia de hash.",
  },
  {
    icon: SealCheck,
    title: "Revisões à prova de adulteração",
    desc: "O projeto aprovado e o memorial recebem selo SHA-256; a verificação aponta íntegra, adulterada ou sem selo.",
  },
  {
    icon: Trash,
    title: "LGPD",
    desc: "Política de privacidade publicada, aceite versionado no cadastro e fluxo de eliminação de dados do titular.",
  },
  {
    icon: ShieldCheck,
    title: "Nenhum comando em equipamento real",
    desc: "Simulação é sempre rotulada; comando de campo exige arquitetura explícita de autorização e confirmação.",
  },
];

export function SecuritySection() {
  return (
    <section id="seguranca" className={sectionCls}>
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          eyebrow="Segurança e conformidade"
          title="Pronto para a avaliação de TI e do jurídico."
          lead="Os projetos de automação da sua empresa são confidenciais. Estes controles estão implementados hoje:"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECURITY.map((s) => (
            <div key={s.title} className="rounded-md border border-border bg-card p-5">
              <s.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Documentos:{" "}
          <Link to="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>{" "}
          ·{" "}
          <Link to="/termos" className="underline hover:text-foreground">
            Termos de Uso (inclui confidencialidade industrial)
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ─── Plano Corporativo + programa piloto ───────────────────────────────── */

const CORPORATE_ITEMS = [
  "Quantidade de usuários e créditos de IA definida em contrato",
  "Proposta comercial e condições de faturamento negociadas",
  "Implantação acompanhada e treinamento da equipe",
  "Prazo de atendimento (SLA) formalizado em contrato",
  "Termo de confidencialidade para os projetos da empresa",
];

export function CorporateSection() {
  return (
    <section className="px-4 sm:px-6 pb-14 md:pb-16 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-md border-2 border-primary/60 bg-card p-6">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">Corporativo</h3>
            <span className="font-mono text-sm font-semibold text-foreground">Sob consulta</span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Para indústrias e grupos com várias equipes ou plantas.
          </p>
          <ul className="mt-4 space-y-2 text-[13px]">
            {CORPORATE_ITEMS.map((i) => (
              <li key={i} className="flex gap-2 text-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-success" aria-hidden />
                {i}
              </li>
            ))}
          </ul>
          <Button asChild className="mt-5">
            <a href="#contato" data-interest="corporativo">
              Falar com especialista <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <Handshake className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="mt-3 text-base font-semibold text-foreground">
            Programa piloto — empresas fundadoras
          </h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            As {LAUNCH_OFFER.slots} primeiras empresas têm {LAUNCH_OFFER.discountPct}% de desconto
            por {LAUNCH_OFFER.months} meses e acompanhamento direto do time do produto. Em troca,
            pedimos retorno sobre o uso real; publicar um estudo de caso é opcional e só com
            autorização por escrito.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <a href="#contato">
              Quero participar <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────────────── */

export function FaqSection() {
  return (
    <section id="faq" className={sectionCls}>
      <div className="max-w-4xl mx-auto">
        <SectionHeader
          eyebrow="Perguntas frequentes"
          title="O que as empresas perguntam antes de adotar."
        />
        <div className="divide-y divide-border rounded-md border border-border bg-card">
          {FAQ_ITEMS.map((f) => (
            <details key={f.q} className="group p-4">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-sm font-medium text-foreground">
                {f.q}
                <span
                  className="font-mono text-muted-foreground transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Responsabilidade técnica ─────────────────────────────────────────── */

export function ResponsibilityNotice() {
  return (
    <section className="px-4 sm:px-6 py-8 border-b border-border bg-background">
      <div className="max-w-7xl mx-auto flex gap-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-[13px] text-foreground">
        <WarningCircle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
        <p className="leading-relaxed">
          <strong>Responsabilidade técnica.</strong> A plataforma calcula, verifica e documenta, mas
          não substitui o profissional habilitado: o projeto, a ART e a liberação para operação são
          do engenheiro responsável. Simulações são rotuladas como tal e não atestam aptidão de
          equipamentos para operação industrial (NR-10 / NR-12).
        </p>
      </div>
    </section>
  );
}

/* ─── Pedido de demonstração ──────────────────────────────────────────── */

type FormState = {
  name: string;
  company: string;
  role: string;
  email: string;
  teamSize: TeamSize;
  interest: Interest;
  message: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  company: "",
  role: "",
  email: "",
  teamSize: "2-5",
  interest: "demonstracao",
  message: "",
};

const inputCls =
  "h-9 w-full rounded-md border border-border bg-input/60 px-3 text-sm outline-none focus:ring-1 focus:ring-ring";

export function DemoRequestSection() {
  const channels = useMemo(() => salesChannelsFromBuild(), []);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [ready, setReady] = useState<{ text: string; subject: string } | null>(null);
  const hasChannel = !!(channels.whatsapp || channels.email);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setReady(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = DemoRequestSchema.safeParse(form);
    if (!r.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of r.error.issues) {
        const k = issue.path[0] as keyof FormState;
        if (!next[k]) next[k] = k === "email" ? "E-mail inválido" : "Preencha este campo";
      }
      setErrors(next);
      setReady(null);
      return;
    }
    setErrors({});
    setReady({ text: buildDemoRequestText(r.data), subject: demoRequestSubject(r.data) });
  };

  const field = (k: keyof FormState, label: string, node: React.ReactNode) => (
    <label className="block text-xs font-medium text-foreground">
      {label}
      <div className="mt-1">{node}</div>
      {errors[k] && <span className="mt-1 block text-[11px] text-destructive">{errors[k]}</span>}
    </label>
  );

  return (
    <section id="contato" className={sectionCls}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5">
          <SectionHeader
            eyebrow="Fale com a equipe"
            title="Agende uma demonstração com um projeto da sua realidade."
            lead="Mostramos o fluxo completo — unifilar, cálculos, Ladder, SCADA e dossiê — sobre um ramal parecido com o da sua planta. Também tiramos dúvidas técnicas e montamos proposta para o plano Corporativo."
          />
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li className="flex gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-success" aria-hidden />
              Sem compromisso e sem cartão de crédito
            </li>
            <li className="flex gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-success" aria-hidden />
              Seus dados são usados só para responder a este pedido
            </li>
          </ul>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="lg:col-span-7 rounded-md border border-border bg-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
          aria-label="Pedido de demonstração"
        >
          {field(
            "name",
            "Nome",
            <input
              className={inputCls}
              autoComplete="name"
              maxLength={80}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />,
          )}
          {field(
            "company",
            "Empresa",
            <input
              className={inputCls}
              autoComplete="organization"
              maxLength={120}
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
            />,
          )}
          {field(
            "role",
            "Cargo",
            <input
              className={inputCls}
              autoComplete="organization-title"
              maxLength={80}
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            />,
          )}
          {field(
            "email",
            "E-mail corporativo",
            <input
              type="email"
              className={inputCls}
              autoComplete="email"
              maxLength={160}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />,
          )}
          {field(
            "teamSize",
            "Tamanho da equipe de engenharia",
            <select
              className={inputCls}
              value={form.teamSize}
              onChange={(e) => set("teamSize", e.target.value as TeamSize)}
            >
              {TEAM_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} {s === "1" ? "pessoa" : "pessoas"}
                </option>
              ))}
            </select>,
          )}
          {field(
            "interest",
            "Interesse",
            <select
              className={inputCls}
              value={form.interest}
              onChange={(e) => set("interest", e.target.value as Interest)}
            >
              {INTERESTS.map((i) => (
                <option key={i} value={i}>
                  {INTEREST_LABELS[i]}
                </option>
              ))}
            </select>,
          )}
          <div className="sm:col-span-2">
            {field(
              "message",
              "Mensagem (opcional)",
              <textarea
                className={`${inputCls} h-20 py-2`}
                maxLength={600}
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
              />,
            )}
          </div>

          <div className="sm:col-span-2">
            {!hasChannel ? (
              <p className="text-[13px] text-muted-foreground" data-testid="demo-no-channel">
                O canal comercial ainda está sendo configurado. Enquanto isso, você pode{" "}
                <Link
                  to="/signup"
                  search={{ perfil: "empresa" }}
                  className="underline text-primary"
                >
                  criar uma conta grátis
                </Link>{" "}
                e explorar o projeto de exemplo.
              </p>
            ) : !ready ? (
              <Button type="submit" data-testid="demo-submit">
                Preparar pedido <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="space-y-2" data-testid="demo-ready">
                <p className="text-[13px] text-muted-foreground">
                  Pedido pronto. Escolha por onde enviar — ele só sai quando você confirmar no seu
                  aplicativo.
                </p>
                <div className="flex flex-wrap gap-2">
                  {channels.whatsapp && (
                    <Button asChild>
                      <a
                        href={whatsappUrl(channels.whatsapp, ready.text)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <WhatsappLogo className="h-4 w-4" /> Enviar pelo WhatsApp
                      </a>
                    </Button>
                  )}
                  {channels.email && (
                    <Button asChild variant="outline">
                      <a href={mailtoUrl(channels.email, ready.subject, ready.text)}>
                        <EnvelopeSimple className="h-4 w-4" /> Enviar por e-mail
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
