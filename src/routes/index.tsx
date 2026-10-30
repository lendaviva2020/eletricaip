import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lightning,
  Cpu,
  FileText,
  Sparkle,
  ArrowRight,
  Play,
  Pause,
  SpeakerHigh,
  SpeakerSlash,
  ArrowsOutSimple,
  Check,
  Minus,
  List,
  X,
  Sun,
  Moon,
} from "@phosphor-icons/react";
import { EletricAiLogo } from "@/components/brand/eletricai-logo";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/lib/design-system/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ElétricAi — Engenharia Elétrica Industrial e Automação" },
      {
        name: "description",
        content:
          "Ambiente integrado de engenharia elétrica e automação industrial: diagramas unifilar e multifilar sincronizados, Ladder IEC 61131-3, cálculos NBR 5410, dossiê técnico e BOM.",
      },
      { property: "og:title", content: "ElétricAi — Engenharia Elétrica Industrial e Automação" },
      {
        property: "og:description",
        content:
          "Diagramas unifilar e multifilar, Ladder IEC 61131-3, dimensionamento NBR 5410 e documentação técnica para engenharia industrial.",
      },
      { property: "og:image", content: "/media/eletricai-demo-poster.jpg" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.navigate({ to: "/dashboard" });
    }
  }, [router, user]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
      <Navbar authed={!!user} />
      <main>
        <HeroSection authed={!!user} />
        <ArchitectureSection />
        <DemonstrationSection />
        <WorkflowSection />
        <PricingSection authed={!!user} />
      </main>
      <Footer authed={!!user} />
    </div>
  );
}

/* =========================================================================
   1. NAVBAR TÉCNICA (40px / 48px)
========================================================================= */
function Navbar({ authed }: { authed: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <EletricAiLogo className="h-6" />
          </Link>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-5 text-[13px] font-medium text-muted-foreground"
          >
            <a href="#arquitetura" className="hover:text-foreground transition-colors">
              Arquitetura
            </a>
            <a href="#demonstracao" className="hover:text-foreground transition-colors">
              Inspeção Técnica
            </a>
            <a href="#workflow" className="hover:text-foreground transition-colors">
              Fluxo de Projeto
            </a>
            <a href="#planos" className="hover:text-foreground transition-colors">
              Planos e Preços
            </a>
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {authed ? (
            <Button asChild size="default">
              <Link to="/dashboard">
                Abrir Workspace <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="default">
                <Link to="/login" search={{ redirect: "/dashboard" }}>
                  Entrar
                </Link>
              </Button>
              <Button asChild size="default">
                <Link to="/signup">
                  Começar agora <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex md:hidden items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2 text-[13px] font-medium">
            <a
              href="#arquitetura"
              onClick={() => setMobileOpen(false)}
              className="py-1 text-foreground"
            >
              Arquitetura
            </a>
            <a
              href="#demonstracao"
              onClick={() => setMobileOpen(false)}
              className="py-1 text-muted-foreground"
            >
              Inspeção Técnica
            </a>
            <a
              href="#workflow"
              onClick={() => setMobileOpen(false)}
              className="py-1 text-muted-foreground"
            >
              Fluxo de Projeto
            </a>
            <a
              href="#planos"
              onClick={() => setMobileOpen(false)}
              className="py-1 text-muted-foreground"
            >
              Planos e Preços
            </a>
          </nav>
          <div className="pt-3 border-t border-border flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link to="/login" search={{ redirect: "/dashboard" }}>
                Entrar
              </Link>
            </Button>
            <Button asChild className="w-full">
              <Link to="/signup">
                Começar agora <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

/* =========================================================================
   2. HERO TÉCNICO E ENXUTO (1 CTA primário + Moldura de Engenharia)
========================================================================= */
function HeroSection({ authed }: { authed: boolean }) {
  return (
    <section className="py-12 md:py-16 px-4 sm:px-6 border-b border-border bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5 flex flex-col items-start text-left pt-2">
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-sm border border-border bg-card text-[11px] font-mono text-muted-foreground mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>NBR 5410 · IEC 61131-3 · IEC 60617</span>
            </div>

            <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.02em] leading-[1.15] text-foreground max-w-[60ch]">
              Engenharia elétrica industrial e automação em grafo semântico único.
            </h1>

            <p className="mt-3.5 text-sm text-muted-foreground leading-relaxed max-w-[58ch]">
              Projete diagramas unifilar e multifilar sincronizados, programe lógica Ladder IEC
              61131-3 com ciclo de varredura determinístico e emita o dossiê técnico com memória de
              cálculo NBR 5410 e lista de materiais (BOM).
            </p>

            <div className="mt-6 flex items-center gap-3">
              <Button asChild size="lg">
                <Link to={authed ? "/dashboard" : "/signup"}>
                  Começar agora <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <dl className="mt-8 pt-6 border-t border-border grid grid-cols-3 gap-4 w-full text-left">
              <div>
                <dt className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Representação
                </dt>
                <dd className="mt-1 text-[13px] font-mono font-semibold text-foreground tabular-nums">
                  Unifilar ↔ Multifilar
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Motor CLP
                </dt>
                <dd className="mt-1 text-[13px] font-mono font-semibold text-foreground tabular-nums">
                  Ladder / FBD / IL
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Dimensionamento
                </dt>
                <dd className="mt-1 text-[13px] font-mono font-semibold text-foreground tabular-nums">
                  NBR 5410 / NR-10
                </dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-7" id="video-card">
            <VideoCardPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   3. MOLDURA TÉCNICA DO WORKSPACE REAL (VÍDEO E CAPTURA)
========================================================================= */
function VideoCardPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(25.5);
  const [progress, setProgress] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const total = videoRef.current.duration || 25.5;
    setCurrentTime(current);
    setDuration(total);
    setProgress((current / total) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const target = pos * (videoRef.current.duration || 25.5);
    videoRef.current.currentTime = target;
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Barra de janela estilo IDE */}
      <div className="h-8 px-3 border-b border-border bg-muted/40 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-foreground font-semibold">CCM-01_PARTIDA_DIRETA.eai</span>
          <span>—</span>
          <span>Folha: Unifilar / Multifilar / Ladder</span>
        </div>
        <span className="tabular-nums">380 V · 60 Hz · TN-S</span>
      </div>

      <div className="relative bg-background aspect-video flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          src="/media/eletricai-demo.webm"
          poster="/media/eletricai-demo-poster.jpg"
          preload="metadata"
          playsInline
          muted={isMuted}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-full object-cover cursor-pointer"
          onClick={togglePlay}
        />

        {!isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute z-20 h-12 w-12 rounded-md bg-card/95 hover:bg-primary text-foreground hover:text-primary-foreground border border-border flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Reproduzir demonstração do workspace"
          >
            <Play weight="fill" className="h-5 w-5 ml-0.5" />
          </button>
        )}

        <div className="absolute bottom-0 inset-x-0 z-20 bg-card/95 border-t border-border py-2 px-3 flex flex-col gap-1.5">
          <div
            onClick={handleSeek}
            className="w-full h-1 bg-muted rounded-sm cursor-pointer relative"
          >
            <div className="h-full bg-primary rounded-sm" style={{ width: `${progress}%` }} />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlay}
                className="hover:text-foreground transition-colors"
                aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play weight="fill" className="h-3.5 w-3.5" />
                )}
              </button>
              <span>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleMute}
                className="hover:text-foreground transition-colors"
                aria-label={isMuted ? "Ativar som" : "Desativar som"}
              >
                {isMuted ? (
                  <SpeakerSlash className="h-3.5 w-3.5" />
                ) : (
                  <SpeakerHigh className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="hover:text-foreground transition-colors"
                aria-label="Tela cheia"
              >
                <ArrowsOutSimple className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. ARQUITETURA TÉCNICA (Layout Assimétrico 4/8 com Especificações Reais)
========================================================================= */
function ArchitectureSection() {
  const modules = [
    {
      code: "MOD-01",
      icon: Lightning,
      title: "Grafo Elétrico Unifilar e Multifilar",
      norm: "IEC 60617 / NBR 5410",
      desc: "Edição simultânea em representação unifilar ou multifilar sobre o mesmo modelo semântico. Condutores (F, N, PE, 3F+N+PE), barramentos, disjuntores, contatores, relés térmicos, inversores (VFD) e bornes X1 mantêm tags e conectividade unificadas.",
      specs: [
        "Tags sincronizadas sem duplicação",
        " Numeração de bornes e anilhas",
        "Roteamento ortogonal de condutores",
      ],
    },
    {
      code: "MOD-02",
      icon: Cpu,
      title: "Automação CLP & Ladder IEC 61131-3",
      norm: "IEC 61131-3",
      desc: "Editor e simulador Ladder com ciclo de varredura determinístico (leitura de entradas, avaliação sequencial de rungs, escrita de saídas), temporizadores TON/TOF/TP, contadores CTU/CTD/CTUD, blocos matemáticos tipados (INT, DINT, REAL, LREAL) e ponte direta com contatores do diagrama elétrico.",
      specs: [
        "Arredondamento IEEE 754 (round-to-even)",
        "Detecção de divisão por zero e overflow",
        "Intertravamento com bobinas K1/K2/K3",
      ],
    },
    {
      code: "MOD-03",
      icon: FileText,
      title: "Cálculos Normativos e Dossiê de Engenharia",
      norm: "NBR 5410:2004",
      desc: "Verificação contínua de capacidade de condução de corrente (Iz), coordenação de proteção (Ib ≤ In ≤ Iz), queda de tensão percentual por trecho e geração automática de Lista de Materiais (BOM), Tabela de Cabos e Plano de Bornes.",
      specs: [
        "Validação automática de seção em mm²",
        "Memorial descritivo e folha de rosto ABNT",
        "Exportação estruturada para PDF e CSV",
      ],
    },
    {
      code: "MOD-04",
      icon: Sparkle,
      title: "Copiloto de Engenharia e Importação Universal",
      norm: "JSON / CSV / PLCopen XML",
      desc: "Importação determinística de listas de tags, tabelas de I/O e projetos sem consumo de créditos de IA, combinada a um assistente técnico para geração de malhas de partida (direta, estrela-triângulo, inversor) e revisão de conformidade.",
      specs: [
        "Preview de diff antes de aplicar alterações",
        "Importador Universal sem custo de IA",
        "Histórico de revisões e snapshots",
      ],
    },
  ];

  return (
    <section
      id="arquitetura"
      className="py-14 md:py-16 px-4 sm:px-6 border-b border-border bg-background"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 lg:sticky lg:top-20 space-y-3">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
              Especificação de Subsistemas
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Quatro motores acoplados ao mesmo modelo de projeto.
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Diferente de ferramentas de desenho genéricas, cada símbolo inserido no canvas possui
              semântica elétrica real, terminais tipados e validação imediata de engenharia.
            </p>
            <div className="pt-2">
              <Link
                to="/workspace"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                <span>Inspecionar Workspace Industrial</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-8 divide-y divide-border rounded-md border border-border bg-card">
            {modules.map((mod) => (
              <div
                key={mod.code}
                className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-start"
              >
                <div className="sm:col-span-3 flex sm:flex-col justify-between sm:justify-start gap-2">
                  <div className="inline-flex items-center gap-2">
                    <div className="h-7 w-7 rounded-sm border border-border bg-muted flex items-center justify-center text-primary">
                      <mod.icon className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                      {mod.code}
                    </span>
                  </div>
                  <Badge variant="outline" className="w-fit font-mono text-[10px]">
                    {mod.norm}
                  </Badge>
                </div>

                <div className="sm:col-span-9 space-y-2.5">
                  <h3 className="text-sm font-semibold text-foreground">{mod.title}</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{mod.desc}</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {mod.specs.map((spec) => (
                      <li
                        key={spec}
                        className="text-[11px] font-mono text-foreground bg-muted/50 border border-border rounded-sm px-2 py-1 truncate"
                      >
                        {spec.trim()}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   5. INSPEÇÃO TÉCNICA INTERATIVA (Unifilar · Ladder · BOM)
========================================================================= */
function DemonstrationSection() {
  const [activeTab, setActiveTab] = useState<"unifilar" | "ladder" | "dossier">("unifilar");

  return (
    <section
      id="demonstracao"
      className="py-14 md:py-16 px-4 sm:px-6 border-b border-border bg-background"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
              Rastreabilidade Entre Vistas
            </span>
            <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Um equipamento, três representações técnicas sincronizadas.
            </h2>
          </div>

          <div
            role="tablist"
            aria-label="Representações do projeto"
            className="inline-flex h-8 items-center rounded-md border border-border bg-muted/60 p-0.5 w-fit"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "unifilar"}
              onClick={() => setActiveTab("unifilar")}
              className={`px-3 h-7 rounded-sm text-xs font-medium transition-colors ${
                activeTab === "unifilar"
                  ? "bg-background text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              1. Diagrama Unifilar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ladder"}
              onClick={() => setActiveTab("ladder")}
              className={`px-3 h-7 rounded-sm text-xs font-medium transition-colors ${
                activeTab === "ladder"
                  ? "bg-background text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              2. Lógica Ladder IEC
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dossier"}
              onClick={() => setActiveTab("dossier")}
              className={`px-3 h-7 rounded-sm text-xs font-medium transition-colors ${
                activeTab === "dossier"
                  ? "bg-background text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              3. Dossiê &amp; BOM
            </button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card overflow-hidden">
          {activeTab === "unifilar" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
              <div className="lg:col-span-8 p-5 industrial-grid min-h-[280px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-b border-border pb-2.5 bg-card/90 px-2 py-1 rounded-sm">
                  <span>RAMAL CCM-01 · 380 V / 60 Hz · 3F+N+PE</span>
                  <Badge variant="success">ENERGIZADO</Badge>
                </div>

                <div className="my-6 space-y-4 bg-card/95 p-4 rounded-md border border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-8 px-3 rounded-sm bg-muted border border-border flex items-center justify-center font-mono text-xs font-semibold text-primary">
                      BAR-380V
                    </div>
                    <div className="h-px flex-1 bg-primary" />
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      In = 250 A
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-6">
                    <div className="h-8 px-3 rounded-sm bg-card border border-border flex items-center justify-center font-mono text-xs text-foreground">
                      Q1 (63 A)
                    </div>
                    <div className="h-px w-8 bg-border" />
                    <div className="h-8 px-3 rounded-sm bg-card border border-border flex items-center justify-center font-mono text-xs text-foreground">
                      K1 (32 A)
                    </div>
                    <div className="h-px w-8 bg-border" />
                    <div className="h-8 px-3 rounded-sm bg-card border border-border flex items-center justify-center font-mono text-xs text-foreground">
                      F1 (11–17 A)
                    </div>
                    <div className="h-px w-8 bg-border" />
                    <div className="h-8 px-3 rounded-sm bg-primary/10 border border-primary/40 flex items-center justify-center font-mono text-xs font-semibold text-primary">
                      M1 · 7.5 kW (4P)
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  Condutor dimensionado: 3×6 mm² + PE 6 mm² (Cobre PVC 70 °C, Método B1) · ΔU =
                  1,18% (≤ 4%)
                </div>
              </div>

              <div className="lg:col-span-4 p-4 space-y-3 text-xs bg-card">
                <div className="font-mono font-semibold uppercase tracking-wider text-[11px] text-muted-foreground border-b border-border pb-2">
                  Inspetor de Propriedades — Q1
                </div>
                <dl className="divide-y divide-border font-mono text-xs tabular-nums">
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground font-sans">Tag IEC:</dt>
                    <dd className="text-foreground font-semibold">Q1</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground font-sans">Corrente Nominal (In):</dt>
                    <dd className="text-primary font-semibold">63 A</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground font-sans">Curva Termomagnética:</dt>
                    <dd className="text-foreground">Curva C (5–10 × In)</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground font-sans">Capacidade Icu:</dt>
                    <dd className="text-foreground">25 kA @ 380 V</dd>
                  </div>
                  <div className="flex justify-between py-2">
                    <dt className="text-muted-foreground font-sans">Critério NBR 5410:</dt>
                    <dd className="text-success font-semibold">Ib (15,2 A) ≤ In ≤ Iz</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === "ladder" && (
            <div className="p-5 font-mono text-xs min-h-[280px] flex flex-col justify-between space-y-4">
              <div className="border-b border-border pb-2.5 flex justify-between items-center">
                <span className="text-foreground font-semibold">
                  PROGRAMA LADDER: PARTIDA_MOTOR_M1
                </span>
                <span className="text-muted-foreground tabular-nums">
                  SCAN: 20 ms · PERFIL IEC-61131
                </span>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-sm bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted-foreground">RUNG 01</span>
                    <span className="text-foreground">[--| S1_LIGA |--]</span>
                    <span className="text-foreground">[--|/| S0_EMERG |--]</span>
                    <span className="text-foreground">[--|/| F1_TERM |--]</span>
                  </div>
                  <div className="text-primary font-semibold">---( K1_CONTATOR )---</div>
                </div>
                <div className="p-3 rounded-sm bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted-foreground">RUNG 02</span>
                    <span className="text-foreground">[--| K1_AUX_13_14 |--]</span>
                    <span className="text-foreground">[ TON T1_LUB PT=T#5s ]</span>
                  </div>
                  <div className="text-success font-semibold">---( Y1_VALVULA_LUB )---</div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Ponte Unifilar ↔ Ladder ativa: o acionamento da bobina{" "}
                <code className="text-foreground">K1_CONTATOR</code> fecha os contatos principais
                1L1-2T1, 3L2-4T2, 5L3-6T3 no diagrama elétrico.
              </div>
            </div>
          )}

          {activeTab === "dossier" && (
            <div className="p-5 font-mono text-xs min-h-[280px] flex flex-col justify-between overflow-x-auto">
              <div className="border-b border-border pb-2.5 flex justify-between items-center mb-3">
                <span className="text-foreground font-semibold">
                  LISTA DE MATERIAIS CONSOLIDADA (BOM)
                </span>
                <Badge variant="success">CONFORME NBR 5410</Badge>
              </div>
              <table className="w-full text-left border-collapse tabular-nums">
                <thead>
                  <tr className="h-8 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
                    <th className="px-3">Tag</th>
                    <th className="px-3">Especificação Técnica</th>
                    <th className="px-3">Qtd</th>
                    <th className="px-3">Referência Industrial</th>
                    <th className="px-3 text-right">Verificação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-[12px]">
                  <tr className="h-9">
                    <td className="px-3 font-semibold text-primary">Q1</td>
                    <td className="px-3 font-sans">Disjuntor Caixa Moldada 3P 63 A Icu 25 kA</td>
                    <td className="px-3">1 un</td>
                    <td className="px-3 text-muted-foreground">WEG DWB160 / Schneider NSX</td>
                    <td className="px-3 text-right text-success">Coord. OK</td>
                  </tr>
                  <tr className="h-9">
                    <td className="px-3 font-semibold text-primary">K1</td>
                    <td className="px-3 font-sans">
                      Contator de Potência 3P 32 A AC-3 Bobina 24 Vcc
                    </td>
                    <td className="px-3">1 un</td>
                    <td className="px-3 text-muted-foreground">WEG CWB32 / Siemens 3RT2</td>
                    <td className="px-3 text-right text-success">AC-3 OK</td>
                  </tr>
                  <tr className="h-9">
                    <td className="px-3 font-semibold text-primary">W1</td>
                    <td className="px-3 font-sans">Cabo Cobre Unipolar 6 mm² 750 V BWF 70 °C</td>
                    <td className="px-3">45 m</td>
                    <td className="px-3 text-muted-foreground">Prysmian Superastic / Cobrecom</td>
                    <td className="px-3 text-right text-success">ΔU 1,18%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   6. FLUXO DE TRABALHO (4 Etapas Objetivas em Linha Técnica)
========================================================================= */
function WorkflowSection() {
  const steps = [
    {
      num: "01",
      title: "Topologia Elétrica",
      desc: "Posicione alimentadores, barramentos, proteções e motores no Canvas Unifilar ou Multifilar.",
    },
    {
      num: "02",
      title: "Dimensionamento NBR 5410",
      desc: "Valide ampacidade, coordenação de disjuntores, curto-circuito e queda de tensão por circuito.",
    },
    {
      num: "03",
      title: "Controle & Simulação",
      desc: "Programe o Ladder IEC 61131-3 e teste intertravamentos e falhas térmicas antes da montagem.",
    },
    {
      num: "04",
      title: "Emissão do Dossiê",
      desc: "Gere o memorial descritivo, tabela de cabos, régua de bornes e lista de materiais (BOM).",
    },
  ];

  return (
    <section
      id="workflow"
      className="py-14 md:py-16 px-4 sm:px-6 border-b border-border bg-background"
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
            Engenharia Sistemática
          </span>
          <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Do diagrama unifilar ao dossiê de fabricação do painel.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-border rounded-md bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
          {steps.map((s) => (
            <div key={s.num} className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                    ETAPA {s.num}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{s.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   7. TABELA COMPARATIVA DENSA DE PLANOS (Sem alterar preços de src/lib/plans.ts)
========================================================================= */
function PricingSection({ authed }: { authed: boolean }) {
  const rows: Array<{
    feature: string;
    free: string | boolean;
    basic: string | boolean;
    pro: string | boolean;
    premium: string | boolean;
  }> = [
    {
      feature: "Projetos industriais",
      free: "Até 3 projetos",
      basic: "Até 10 projetos",
      pro: "Ilimitados",
      premium: "Ilimitados",
    },
    {
      feature: "Créditos de IA por mês",
      free: "10 créditos",
      basic: "100 créditos",
      pro: "250 créditos",
      premium: "Ilimitados",
    },
    {
      feature: "Canvas Unifilar, Multifilar e Ladder IEC 61131-3",
      free: true,
      basic: true,
      pro: true,
      premium: true,
    },
    {
      feature: "Importador Universal (JSON, CSV, PLCopen XML)",
      free: true,
      basic: true,
      pro: true,
      premium: true,
    },
    {
      feature: "Dimensionamento NBR 5410, Dossiê Técnico e BOM",
      free: "Exportação PDF",
      basic: "Completo",
      pro: "Completo + Revisões",
      premium: "Completo + Customizado",
    },
    {
      feature: "Telemetria em Tempo Real (OPC-UA / Modbus) & Digital Twin",
      free: false,
      basic: false,
      pro: true,
      premium: true,
    },
    {
      feature: "Atendimento e SLA",
      free: "Comunidade",
      basic: "Suporte por email",
      pro: "Suporte prioritário",
      premium: "SLA + Capacidade dedicada",
    },
  ];

  const renderCell = (val: string | boolean) => {
    if (typeof val === "boolean") {
      return val ? (
        <Check className="h-4 w-4 text-success mx-auto" aria-label="Incluído" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" aria-label="Não incluído" />
      );
    }
    return <span className="text-xs font-mono tabular-nums">{val}</span>;
  };

  return (
    <section
      id="planos"
      className="py-14 md:py-16 px-4 sm:px-6 border-b border-border bg-background"
    >
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
              Licenciamento Comercial
            </span>
            <h2 className="mt-1 text-xl sm:text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Tabela comparativa de planos e recursos técnicos.
            </h2>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            Valores mensais em Reais (BRL) · Cancele a qualquer momento
          </p>
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 align-top">
                <th className="p-4 w-[28%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Parâmetro / Recurso
                </th>

                <th className="p-4 w-[18%] border-l border-border text-center">
                  <div className="text-sm font-semibold text-foreground">Grátis</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                    R$ 0<span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-muted-foreground">
                    Avaliação técnica
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to={authed ? "/dashboard" : "/signup"}>Começar grátis</Link>
                  </Button>
                </th>

                <th className="p-4 w-[18%] border-l border-border text-center">
                  <div className="text-sm font-semibold text-foreground">Básico</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                    R$ 100<span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-muted-foreground">
                    Projetistas autônomos
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to={authed ? "/dashboard" : "/signup"}>Assinar Básico</Link>
                  </Button>
                </th>

                <th className="p-4 w-[18%] border-l-2 border-r-2 border-t-2 border-primary bg-primary/5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">Pro</span>
                    <Badge variant="brand">Recomendado</Badge>
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                    R$ 580<span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-muted-foreground">
                    Engenharia e integradores
                  </div>
                  <Button asChild size="sm" className="mt-3 w-full">
                    <Link to={authed ? "/dashboard" : "/signup"}>Assinar Pro</Link>
                  </Button>
                </th>

                <th className="p-4 w-[18%] border-l border-border text-center">
                  <div className="text-sm font-semibold text-foreground">Premium</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                    R$ 1.000<span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </div>
                  <div className="mt-1 text-[11px] font-normal text-muted-foreground">
                    Plantas industriais
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to={authed ? "/dashboard" : "/signup"}>Assinar Premium</Link>
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[13px]">
              {rows.map((row, idx) => (
                <tr key={row.feature} className="h-10 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2 font-medium text-foreground">{row.feature}</td>
                  <td className="px-4 py-2 border-l border-border text-center text-muted-foreground">
                    {renderCell(row.free)}
                  </td>
                  <td className="px-4 py-2 border-l border-border text-center text-muted-foreground">
                    {renderCell(row.basic)}
                  </td>
                  <td
                    className={`px-4 py-2 border-l-2 border-r-2 border-primary bg-primary/5 text-center text-foreground font-medium ${
                      idx === rows.length - 1 ? "border-b-2" : ""
                    }`}
                  >
                    {renderCell(row.pro)}
                  </td>
                  <td className="px-4 py-2 border-l border-border text-center text-muted-foreground">
                    {renderCell(row.premium)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   8. RODAPÉ TÉCNICO E INSTITUCIONAL
========================================================================= */
function Footer({ authed }: { authed: boolean }) {
  return (
    <footer id="sobre" className="bg-card py-10 px-4 sm:px-6 text-xs text-muted-foreground">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-5 space-y-3">
          <EletricAiLogo className="h-6" />
          <p className="text-xs max-w-sm leading-relaxed">
            Plataforma de engenharia elétrica industrial e automação para diagramas
            unifilar/multifilar, lógica Ladder IEC 61131-3 e documentação técnica conforme NBR 5410.
          </p>
          <div className="text-[11px] font-mono text-muted-foreground tabular-nums">
            © {new Date().getFullYear()} ElétricAi Industrial OS. Todos os direitos reservados.
          </div>
        </div>

        <div className="md:col-span-2 space-y-2">
          <div className="font-mono font-semibold text-foreground uppercase tracking-wider text-[11px]">
            Plataforma
          </div>
          <ul className="space-y-1.5">
            <li>
              <a href="#arquitetura" className="hover:text-foreground transition-colors">
                Arquitetura
              </a>
            </li>
            <li>
              <Link
                to={authed ? "/dashboard" : "/workspace"}
                className="hover:text-foreground transition-colors"
              >
                Workspace Industrial
              </Link>
            </li>
            <li>
              <a href="#demonstracao" className="hover:text-foreground transition-colors">
                Inspeção Técnica
              </a>
            </li>
            <li>
              <a href="#planos" className="hover:text-foreground transition-colors">
                Planos e Preços
              </a>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2 space-y-2">
          <div className="font-mono font-semibold text-foreground uppercase tracking-wider text-[11px]">
            Referências Normativas
          </div>
          <ul className="space-y-1.5 font-mono text-[11px]">
            <li>ABNT NBR 5410:2004</li>
            <li>IEC 61131-3 (CLP)</li>
            <li>IEC 60617 (Símbolos)</li>
            <li>NR-10 / NR-12</li>
          </ul>
        </div>

        <div className="md:col-span-3 space-y-2">
          <div className="font-mono font-semibold text-foreground uppercase tracking-wider text-[11px]">
            Legal &amp; Acesso
          </div>
          <ul className="space-y-1.5">
            <li>
              <Link to="/privacidade" className="hover:text-foreground transition-colors">
                Política de Privacidade
              </Link>
            </li>
            <li>
              <Link to="/termos" className="hover:text-foreground transition-colors">
                Termos de Uso
              </Link>
            </li>
            <li>
              <Link
                to="/login"
                search={{ redirect: "/dashboard" }}
                className="hover:text-foreground transition-colors"
              >
                Acessar Conta
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
