import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Activity,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Gauge,
  Network,
  Bot,
  LineChart as LineChartIcon,
  Layers,
  Check,
  Github,
} from "lucide-react";
import { BrandBolt } from "@/components/brand-bolt";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EletricAI Industrial OS — O Sistema Operacional Industrial com IA" },
      {
        name: "description",
        content:
          "Unifique unifilar, Ladder, FBD, SCADA, PLC, Digital Twin e simulação em tempo real numa única plataforma com IA nativa.",
      },
      { property: "og:title", content: "EletricAI Industrial OS" },
      { property: "og:description", content: "O primeiro Industrial OS com IA nativa." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.navigate({ to: "/dashboard" });
  }, [router, user]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav authed={!!user} />
      <Hero authed={!!user} />
      <LogoStrip />
      <Features />
      <Workflow />
      <Pricing />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav({ authed }: { authed: boolean }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <BrandBolt className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">EletricAI</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hidden sm:inline">
            Industrial OS
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">
            Recursos
          </a>
          <a href="#workflow" className="hover:text-foreground transition">
            Workflow
          </a>
          <a href="#pricing" className="hover:text-foreground transition">
            Planos
          </a>
          <a href="#cta" className="hover:text-foreground transition">
            Empresa
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {authed ? (
            <Link
              to="/dashboard"
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Abrir App <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                search={{ redirect: "/dashboard" }}
                className="h-9 px-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
              >
                Entrar
              </Link>
              <Link
                to="/signup"
                className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                style={{ background: "var(--gradient-primary)" }}
              >
                Começar grátis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ authed }: { authed: boolean }) {
  return (
    <section className="relative pt-20 pb-32 px-6">
      <div className="absolute inset-0 industrial-grid opacity-30 pointer-events-none" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[480px] w-[680px] rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--gradient-primary)" }}
      />

      <div className="relative max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-[11px] uppercase tracking-[0.2em] text-primary mb-6"
        >
          <Sparkles className="h-3 w-3" /> O primeiro Industrial OS com IA nativa
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]"
        >
          O sistema operacional
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            da engenharia industrial
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground"
        >
          Unifique unifilar, Ladder, FBD, SCADA, PLC, Digital Twin e simulação em tempo real numa
          plataforma única — com IA copiloto para projetar, diagnosticar e otimizar.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center"
        >
          <Link
            to={authed ? "/dashboard" : "/signup"}
            className="h-12 px-6 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
            style={{ background: "var(--gradient-primary)" }}
          >
            {authed ? "Abrir Workspace" : "Iniciar gratuitamente"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#features"
            className="h-12 px-6 inline-flex items-center gap-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition"
          >
            Ver recursos
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 relative"
        >
          <div className="rounded-xl border border-border glass-strong p-2 mx-auto max-w-5xl shadow-2xl">
            <div className="rounded-lg bg-card overflow-hidden">
              <div className="h-9 flex items-center gap-2 px-4 border-b border-border bg-panel">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground ml-2">
                  eletricai · workspace · linha-03
                </span>
              </div>
              <div className="grid grid-cols-12 h-[380px]">
                <div className="col-span-2 border-r border-border bg-sidebar p-3 space-y-2">
                  {["Unifilar", "Ladder", "FBD", "SCADA", "Twin", "Sim"].map((t) => (
                    <div
                      key={t}
                      className="text-[11px] px-2 py-1.5 rounded text-muted-foreground hover:bg-accent"
                    >
                      {t}
                    </div>
                  ))}
                </div>
                <div className="col-span-7 industrial-grid relative scan-overlay">
                  <svg className="absolute inset-0 w-full h-full">
                    <line
                      x1="10%"
                      y1="50%"
                      x2="90%"
                      y2="50%"
                      stroke="var(--energized)"
                      strokeWidth="2"
                      className="flow-line"
                    />
                    <line
                      x1="30%"
                      y1="20%"
                      x2="30%"
                      y2="80%"
                      stroke="var(--primary)"
                      strokeWidth="2"
                      className="flow-line"
                    />
                    <circle
                      cx="30%"
                      cy="50%"
                      r="14"
                      fill="var(--card)"
                      stroke="var(--primary)"
                      strokeWidth="2"
                    />
                    <circle
                      cx="60%"
                      cy="50%"
                      r="14"
                      fill="var(--card)"
                      stroke="var(--success)"
                      strokeWidth="2"
                    />
                  </svg>
                  <div className="absolute bottom-3 left-3 text-[10px] font-mono text-muted-foreground">
                    runtime · 24ms · 142 tags
                  </div>
                </div>
                <div className="col-span-3 border-l border-border bg-panel p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    IA copiloto
                  </div>
                  {[
                    "Sugestão: redimensionar cabo CCM-03",
                    "Detectado: rolamento M-03 em desgaste",
                    "Gerar ladder para esteira E-04",
                  ].map((t, i) => (
                    <div
                      key={i}
                      className="text-[11px] p-2 rounded border border-border bg-card/60"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LogoStrip() {
  const logos = ["SIEMENS", "ROCKWELL", "SCHNEIDER", "ABB", "WEG", "ALLEN-BRADLEY"];
  return (
    <section className="border-y border-border py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
          Compatível com os principais ecossistemas industriais
        </p>
        <div className="flex flex-wrap justify-center gap-8 md:gap-14 items-center opacity-60">
          {logos.map((l) => (
            <span key={l} className="font-mono text-sm tracking-widest text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Network,
    title: "Engenharia unificada",
    desc: "Unifilar, Ladder, FBD, SCADA e Digital Twin sincronizados no mesmo projeto.",
  },
  {
    icon: Bot,
    title: "IA Industrial nativa",
    desc: "Copiloto contextual gera lógica, dimensiona cabos e diagnostica falhas em tempo real.",
  },
  {
    icon: Cpu,
    title: "PLC + Runtime real",
    desc: "Simulação cíclica determinística com WebSockets, OPC-UA e Modbus.",
  },
  {
    icon: Gauge,
    title: "Digital Twin 3D",
    desc: "Modele plantas inteiras com física, sensores e telemetria contínua.",
  },
  {
    icon: ShieldCheck,
    title: "Conformidade normativa",
    desc: "Validação automática contra NBR 5410, IEC 61131 e ISA-95.",
  },
  {
    icon: LineChartIcon,
    title: "Manutenção preditiva",
    desc: "Modelos de ML detectam anomalias antes da falha catastrófica.",
  },
];

function Features() {
  return (
    <section id="features" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary mb-3">Plataforma</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Tudo que sua planta precisa.
            <br />
            Em um único OS.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-[var(--shadow-glow)] transition-all"
            >
              <div className="h-10 w-10 rounded-md flex items-center justify-center mb-4 border border-primary/30 bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  const steps = [
    { n: "01", t: "Projete", d: "Diagrame unifilar e lógica com IA contextual." },
    { n: "02", t: "Simule", d: "Rode runtime determinístico antes do campo." },
    { n: "03", t: "Implante", d: "Deploy direto para PLCs reais com OPC-UA." },
    { n: "04", t: "Opere", d: "SCADA + Twin + IA monitoram 24/7." },
  ];
  return (
    <section id="workflow" className="py-32 px-6 border-t border-border bg-panel/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary mb-3">Workflow</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Do diagrama ao chão de fábrica.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-xl border border-border p-6 bg-card">
              <div className="font-mono text-xs text-primary mb-4">{s.n}</div>
              <h3 className="font-semibold mb-1">{s.t}</h3>
              <p className="text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: "Grátis",
      price: "R$ 0",
      period: "/mês",
      desc: "Para experimentar a plataforma.",
      features: [
        "Até 3 projetos",
        "10 créditos de IA/mês",
        "Exportação PDF",
        "Suporte da comunidade",
      ],
      cta: "Começar grátis",
      to: "/signup",
    },
    {
      name: "Básico",
      price: "R$ 100",
      period: "/mês",
      desc: "Para profissionais autônomos.",
      features: [
        "Até 10 projetos",
        "100 créditos de IA/mês",
        "Exportação PDF",
        "Suporte por email",
      ],
      cta: "Assinar Básico",
      to: "/settings/billing",
    },
    {
      name: "Pro",
      price: "R$ 580",
      period: "/mês",
      desc: "Para equipes industriais.",
      features: [
        "Projetos ilimitados",
        "250 créditos de IA/mês",
        "IA avançada + Digital Twin",
        "Realtime OPC-UA / Modbus",
        "Suporte prioritário",
      ],
      cta: "Assinar Pro",
      to: "/settings/billing",
      featured: true,
    },
    {
      name: "Premium",
      price: "R$ 1.000",
      period: "/mês",
      desc: "Para plantas críticas.",
      features: [
        "Tudo do Pro",
        "Créditos de IA ilimitados",
        "Capacidade dedicada",
        "SLA + integrações customizadas",
      ],
      cta: "Assinar Premium",
      to: "/settings/billing",
    },
  ];
  return (
    <section id="pricing" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary mb-3">Planos</p>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
            Preços transparentes.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border p-7 bg-card relative ${p.featured ? "border-primary shadow-[var(--shadow-glow)]" : "border-border"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-7 text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-primary text-primary-foreground font-semibold">
                  Mais popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-5 text-3xl font-semibold tracking-tight">
                {p.price}
                <span className="text-sm font-normal text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="text-sm flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={p.to}
                className={`mt-7 h-10 w-full inline-flex items-center justify-center rounded-md text-sm font-semibold ${p.featured ? "text-primary-foreground glow-primary" : "border border-border hover:bg-accent"}`}
                style={p.featured ? { background: "var(--gradient-primary)" } : {}}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="cta" className="py-32 px-6">
      <div className="max-w-5xl mx-auto rounded-2xl border border-border glass-strong p-12 md:p-16 text-center relative overflow-hidden">
        <div
          className="absolute -top-32 -right-32 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Pronto para industrializar com IA?
        </h2>
        <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
          Comece hoje em menos de 60 segundos. Sem cartão de crédito.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/signup"
            className="h-12 px-6 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
            style={{ background: "var(--gradient-primary)" }}
          >
            Criar conta grátis <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            search={{ redirect: "/dashboard" }}
            className="h-12 px-6 inline-flex items-center rounded-md text-sm font-medium border border-border hover:bg-accent"
          >
            Já tenho conta
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div
            className="h-6 w-6 rounded-md flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <BrandBolt className="h-3 w-3 text-primary-foreground" />
          </div>
          <span>© 2026 EletricAI Industrial OS</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-foreground">
            Privacidade
          </a>
          <a href="#" className="hover:text-foreground">
            Termos
          </a>
          <a href="#" className="hover:text-foreground inline-flex items-center gap-1.5">
            <Github className="h-3.5 w-3.5" /> GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
