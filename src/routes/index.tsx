import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Zap,
  Cpu,
  FileText,
  Sparkles,
  ShieldCheck,
  Cloud,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Check,
  CheckCircle2,
  ExternalLink,
  Layers,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { EletricAiLogo, EletricAiSymbol } from "@/components/brand/eletricai-logo";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ElétricAi — Projetos Elétricos e Automação com Inteligência Real" },
      {
        name: "description",
        content:
          "Plataforma industrial para criar, validar e documentar projetos elétricos e automação: unifilar, multifilar, Ladder IEC 61131-3, Dossiê Técnico e lista de materiais (BOM).",
      },
      { property: "og:title", content: "ElétricAi — Projetos Elétricos e Automação" },
      {
        property: "og:description",
        content:
          "Do conceito à documentação completa de engenharia com agilidade, precisão e conformidade com as normas.",
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
    <div className="min-h-screen bg-[#0B0F14] text-foreground selection:bg-primary selection:text-primary-foreground overflow-x-hidden">
      <Navbar authed={!!user} />
      <HeroSection authed={!!user} />
      <FeaturesSection />
      <DemonstrationSection />
      <WorkflowSection />
      <PricingSection />
      <EnergyWaveDivider />
      <FinalCTASection authed={!!user} />
      <Footer />
    </div>
  );
}

/* =========================================================================
   1. NAVBAR
========================================================================= */
function Navbar({ authed }: { authed: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0B0F14]/85 border-b border-slate-800/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
        {/* Logotipo Oficial */}
        <Link to="/" className="flex items-center gap-2 group">
          <EletricAiLogo className="h-8" />
        </Link>

        {/* Links Centrais com Indicador Laranja */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
          <a
            href="#"
            className="text-slate-100 relative py-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#FF8A00] after:rounded-full"
          >
            Início
          </a>
          <a href="#recursos" className="hover:text-slate-100 transition-colors">
            Recursos
          </a>
          <a href="#demonstracao" className="hover:text-slate-100 transition-colors">
            Demonstração
          </a>
          <a href="#planos" className="hover:text-slate-100 transition-colors">
            Planos
          </a>
          <a href="#workflow" className="hover:text-slate-100 transition-colors">
            Como funciona
          </a>
          <a href="#sobre" className="hover:text-slate-100 transition-colors">
            Sobre
          </a>
        </nav>

        {/* Ações / Botões */}
        <div className="hidden md:flex items-center gap-3">
          {authed ? (
            <Link
              to="/dashboard"
              className="h-10 px-5 inline-flex items-center gap-2 rounded-full text-sm font-bold bg-[#FF8A00] text-black hover:bg-[#FFA033] transition-all glow-orange-sm"
            >
              Abrir App <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                search={{ redirect: "/dashboard" }}
                className="h-10 px-5 inline-flex items-center rounded-full text-sm font-medium text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 bg-slate-900/60 transition-all"
              >
                Entrar
              </Link>
              <Link
                to="/signup"
                className="h-10 px-5 inline-flex items-center gap-1.5 rounded-full text-sm font-bold bg-[#FF8A00] text-black hover:bg-[#FFA033] shadow-lg hover:shadow-orange-500/25 transition-all glow-orange-sm"
              >
                Começar Agora <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        {/* Botão Mobile */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60"
          aria-label="Abrir Menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Menu Gaveta Mobile */}
      {mobileOpen && (
        <div className="md:hidden border-b border-slate-800 bg-[#0B0F14] px-6 py-5 space-y-4">
          <nav className="flex flex-col space-y-3 text-sm font-medium">
            <a href="#" onClick={() => setMobileOpen(false)} className="text-[#FF8A00]">
              Início
            </a>
            <a href="#recursos" onClick={() => setMobileOpen(false)} className="text-slate-300">
              Recursos
            </a>
            <a href="#demonstracao" onClick={() => setMobileOpen(false)} className="text-slate-300">
              Demonstração
            </a>
            <a href="#planos" onClick={() => setMobileOpen(false)} className="text-slate-300">
              Planos
            </a>
            <a href="#workflow" onClick={() => setMobileOpen(false)} className="text-slate-300">
              Como funciona
            </a>
          </nav>
          <div className="pt-3 border-t border-slate-800 flex flex-col gap-2.5">
            <Link
              to="/login"
              search={{ redirect: "/dashboard" }}
              className="h-10 w-full inline-flex items-center justify-center rounded-full text-sm font-medium border border-slate-800 text-slate-300"
            >
              Entrar
            </Link>
            <Link
              to="/signup"
              className="h-10 w-full inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-bold bg-[#FF8A00] text-black"
            >
              Começar Agora <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* =========================================================================
   2. HERO PRINCIPAL (Inspirado na referência visual)
========================================================================= */
function HeroSection({ authed }: { authed: boolean }) {
  const [videoModalOpen, setVideoModalOpen] = useState(false);

  const scrollToPlayer = () => {
    const el = document.getElementById("video-card");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <section className="relative pt-12 pb-24 md:pt-16 md:pb-32 px-4 sm:px-6 overflow-hidden">
      {/* Luz ambiente elétrica ao fundo */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-[#FF8A00]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Grid sutil industrial de fundo */}
      <div className="absolute inset-0 industrial-grid opacity-25 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* LADO ESQUERDO: Marca, Mensagem de Impacto e Chamadas */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            {/* Emblema Metálico 3D Original com Halo Elétrico */}
            <div className="flex items-center gap-5 mb-6">
              <div className="relative">
                {/* Halo de energia laranja atrás da letra E */}
                <div className="absolute -inset-2 bg-gradient-to-r from-orange-500/30 to-amber-500/20 rounded-2xl blur-lg pointer-events-none" />
                <div className="relative h-24 w-24 sm:h-28 sm:w-28 p-1.5 rounded-2xl bg-gradient-to-br from-slate-700/60 via-slate-800/80 to-slate-950 border border-slate-700/80 shadow-2xl flex items-center justify-center">
                  <EletricAiSymbol className="h-full w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]" />
                </div>
              </div>

              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight font-sans leading-none">
                  <span className="text-white">Elétric</span>
                  <span className="text-[#FF8A00]">Ai</span>
                </h1>
                <p className="mt-2 text-[11px] sm:text-xs font-mono font-bold tracking-[0.25em] text-slate-400 uppercase">
                  PROJETOS ELÉTRICOS E AUTOMAÇÃO
                  <br />
                  <span className="text-orange-400/90">COM INTELIGÊNCIA REAL</span>
                </p>
              </div>
            </div>

            {/* Descrição Objetiva e Profissional */}
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl font-normal">
              Do conceito à documentação completa. O <strong>ElétricAi</strong> é a plataforma
              industrial que transforma diagramas e lógica de controle em projetos de engenharia
              com agilidade, rastreabilidade e total conformidade com as normas NBR 5410 e IEC.
            </p>

            {/* Botões de Ação Principais */}
            <div className="mt-8 flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <Link
                to={authed ? "/dashboard" : "/signup"}
                className="h-12 px-7 inline-flex items-center justify-center gap-2 rounded-full text-base font-bold bg-[#FF8A00] text-black hover:bg-[#FFA033] shadow-xl hover:shadow-orange-500/30 transition-all glow-orange-sm cursor-pointer"
              >
                {authed ? "Abrir Workspace" : "Começar Agora"}{" "}
                <ChevronRight className="h-4 w-4" />
              </Link>

              <button
                onClick={scrollToPlayer}
                className="h-12 px-6 inline-flex items-center justify-center gap-2.5 rounded-full text-sm font-semibold border border-slate-700/80 hover:border-slate-500 bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 transition-all cursor-pointer backdrop-blur-md"
              >
                <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
                  <Play className="h-3 w-3 text-white ml-0.5" />
                </div>
                <span>Assista ao vídeo</span>
              </button>
            </div>

            {/* Badges de Confiança Industriais */}
            <div className="mt-12 pt-8 border-t border-slate-800/80 grid grid-cols-3 gap-4 sm:gap-6 w-full max-w-lg">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                  <div className="p-1.5 rounded bg-orange-500/10 text-[#FF8A00]">
                    <Zap className="h-4 w-4" />
                  </div>
                  <span>Rápido</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">Projetos em minutos</span>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                  <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span>Seguro</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">Conforme normas</span>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
                  <div className="p-1.5 rounded bg-sky-500/10 text-sky-400">
                    <Cloud className="h-4 w-4" />
                  </div>
                  <span>Na Nuvem</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">Acesso em qualquer lugar</span>
              </div>
            </div>
          </div>

          {/* LADO DIREITO: VÍDEO REAL DO PRODUTO (Player Profissional da Aplicação) */}
          <div className="lg:col-span-6" id="video-card">
            <VideoCardPlayer />
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   3. REPRODUTOR DE VÍDEO REAL COM CONTROLES E POSTER
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
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
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
    <div className="relative group rounded-2xl p-1 bg-gradient-to-b from-slate-700/60 via-slate-800/40 to-orange-950/40 border border-slate-700/80 shadow-2xl overflow-hidden">
      {/* Moldura elegante com iluminação ambiente */}
      <div className="relative rounded-xl bg-slate-950 overflow-hidden aspect-video flex items-center justify-center">
        {/* Vídeo real gravado da aplicação */}
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

        {/* Banner de Título Superior Sobreposto no Vídeo */}
        <div className="absolute top-4 right-4 z-20 pointer-events-none">
          <div className="px-3.5 py-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-slate-700/80 text-right">
            <span className="text-[11px] font-mono tracking-widest text-slate-300 uppercase block font-semibold">
              TECNOLOGIA QUE ENERGIZA SEUS
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FF8A00] text-black mt-0.5">
              PROJETOS REAIS
            </span>
          </div>
        </div>

        {/* Botão de Play Centralizado (quando pausado) */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute z-20 h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-black/60 hover:bg-[#FF8A00] text-white hover:text-black border-2 border-white/40 hover:border-[#FF8A00] backdrop-blur-md flex items-center justify-center transition-all transform hover:scale-105 shadow-2xl cursor-pointer"
            aria-label="Reproduzir vídeo da aplicação real"
          >
            <Play className="h-7 w-7 sm:h-8 sm:w-8 ml-1 fill-current" />
          </button>
        )}

        {/* Barra de Controles Inferior com Design Industrial */}
        <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-8 pb-3 px-4 flex flex-col gap-2">
          {/* Barra de Progresso com Scrubber Laranja */}
          <div
            onClick={handleSeek}
            className="w-full h-1.5 bg-slate-700/70 hover:h-2.5 rounded-full cursor-pointer relative transition-all"
          >
            <div
              className="h-full bg-[#FF8A00] rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md transform scale-0 group-hover:scale-100 transition-transform" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="hover:text-white transition-colors"
                aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              </button>

              <span>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="hover:text-white transition-colors"
                aria-label={isMuted ? "Ativar som" : "Desativar som"}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <button
                onClick={toggleFullscreen}
                className="hover:text-white transition-colors"
                aria-label="Tela cheia"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   4. SEÇÃO DE RECURSOS (Composição Editorial Fiel à Referência)
========================================================================= */
function FeaturesSection() {
  const cards = [
    {
      icon: Zap,
      title: "Diagramas Elétricos",
      desc: "Unifilar, multifilar, barramentos, disjuntores e cargas industriais.",
      highlight: true,
    },
    {
      icon: Cpu,
      title: "Automação Industrial",
      desc: "CLPs, lógica Ladder IEC 61131-3, racks I/O, tags e arquitetura SCADA.",
    },
    {
      icon: FileText,
      title: "Documentação Completa",
      desc: "Dossiê técnico de engenharia, lista de materiais (BOM), cabos e bornes.",
    },
    {
      icon: Sparkles,
      title: "Integração com IA",
      desc: "Copiloto industrial, importador universal sem gastar créditos e análise normativa.",
    },
  ];

  return (
    <section id="recursos" className="py-20 md:py-28 px-4 sm:px-6 relative border-t border-slate-900 bg-gradient-to-b from-[#0B0F14] to-[#0A0E17]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Lado Esquerdo: Mensagem Editorial */}
          <div className="lg:col-span-4 flex flex-col items-start text-left">
            <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#FF8A00] uppercase mb-3">
              RECURSOS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Tudo o que você precisa,{" "}
              <span className="text-[#FF8A00]">em um só lugar.</span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-slate-400 leading-relaxed">
              O <strong>ElétricAi</strong> oferece um ambiente completo para criar, editar,
              validar e documentar seus projetos elétricos, de automação e industriais, com o apoio
              da inteligência artificial e das melhores práticas do mercado.
            </p>

            <Link
              to="/workspace"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#FF8A00] hover:text-[#FFA149] transition-colors"
            >
              <span>Explorar no Canvas Industrial</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Lado Direito: Grid com os 4 Cards de Recursos */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
              <div
                key={card.title}
                className="group p-6 rounded-2xl bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 hover:border-orange-500/40 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="h-12 w-12 rounded-xl bg-slate-800/80 group-hover:bg-orange-500/10 border border-slate-700/60 group-hover:border-orange-500/40 flex items-center justify-center mb-5 transition-all">
                    <card.icon className="h-6 w-6 text-[#FF8A00]" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {card.desc}
                  </p>
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
   5. SEÇÃO DE DEMONSTRAÇÃO INTERATIVA DO CANVAS
========================================================================= */
function DemonstrationSection() {
  const [activeTab, setActiveTab] = useState<"unifilar" | "ladder" | "dossier">("unifilar");

  return (
    <section id="demonstracao" className="py-20 md:py-28 px-4 sm:px-6 relative border-t border-slate-900 bg-[#0B0F14]">
      <div className="max-w-6xl mx-auto text-center">
        <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#FF8A00] uppercase">
          DEMONSTRAÇÃO REAL
        </span>
        <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          A interface de engenharia que você domina em minutos
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
          Alterne perfeitamente entre os diferentes diagramas do mesmo projeto sem perder conexões,
          parâmetros elétricos ou rastreabilidade técnica.
        </p>

        {/* Seletor de Abas de Demonstração */}
        <div className="mt-8 inline-flex p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
          <button
            onClick={() => setActiveTab("unifilar")}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "unifilar"
                ? "bg-[#FF8A00] text-black shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Diagrama Unifilar
          </button>
          <button
            onClick={() => setActiveTab("ladder")}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "ladder"
                ? "bg-[#FF8A00] text-black shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Lógica Ladder IEC 61131-3
          </button>
          <button
            onClick={() => setActiveTab("dossier")}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "dossier"
                ? "bg-[#FF8A00] text-black shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Dossiê Técnico &amp; BOM
          </button>
        </div>

        {/* Quadro Interativo */}
        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 sm:p-4 text-left shadow-2xl overflow-hidden">
          {activeTab === "unifilar" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8 p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 industrial-grid min-h-[340px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-3">
                  <span>RAMAL CCM-01 · 380V / 60Hz</span>
                  <span className="text-emerald-400">● ENERGIZADO</span>
                </div>
                {/* Visualização de Nós Unifilares */}
                <div className="my-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-28 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-orange-400">
                      BAR-380V
                    </div>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-orange-500 to-amber-400" />
                    <span className="font-mono text-xs text-slate-400">250 A</span>
                  </div>
                  <div className="flex items-center gap-4 pl-8">
                    <div className="h-9 w-28 rounded bg-slate-800/90 border border-slate-600 flex items-center justify-center font-mono text-xs text-slate-200">
                      QF-01 (63A)
                    </div>
                    <div className="h-[2px] w-12 bg-slate-700" />
                    <div className="h-9 w-28 rounded bg-slate-800/90 border border-slate-600 flex items-center justify-center font-mono text-xs text-slate-200">
                      KM-01 (32A)
                    </div>
                    <div className="h-[2px] w-12 bg-slate-700" />
                    <div className="h-9 w-32 rounded bg-orange-950/40 border border-orange-500/50 flex items-center justify-center font-mono text-xs font-bold text-orange-400">
                      MOTOR 7.5 kW
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Cálculo automático de condutores: Cabo BWF 6 mm² · Queda de tensão: 1.2%
                </div>
              </div>
              <div className="md:col-span-4 p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4 text-xs">
                <div className="font-bold text-white uppercase tracking-wider text-[11px] text-orange-400">
                  Inspeção de Propriedades
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Tag do Equipamento:</span>
                    <span className="font-mono text-white">QF-01</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Corrente Nominal (In):</span>
                    <span className="font-mono text-[#FF8A00] font-bold">63 A</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Curva de Disparo:</span>
                    <span className="font-mono text-white">Curva C (Indutiva)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Capacidade Icu:</span>
                    <span className="font-mono text-white">10 kA @ 380V</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Norma Referência:</span>
                    <span className="font-mono text-emerald-400 font-bold">NBR NM 60898</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "ladder" && (
            <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 font-mono text-xs min-h-[340px] flex flex-col justify-between">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <span className="text-orange-400 font-bold">LADDER PROGRAM: ESTEIRA_TRANSPORTE</span>
                <span className="text-slate-500">CICLO: 10ms DETERMINÍSTICO</span>
              </div>
              <div className="my-6 space-y-6">
                <div className="p-3 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">RUNG 01:</span>
                    <span className="text-slate-300">[--| S1_LIGA |--]</span>
                    <span className="text-slate-300">[--|/| S0_EMERG |--]</span>
                    <span className="text-slate-300">[--|/| FT_TERM |--]</span>
                  </div>
                  <div className="text-orange-400 font-bold">---( KM1_BOBINA )---</div>
                </div>
                <div className="p-3 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">RUNG 02:</span>
                    <span className="text-slate-300">[--| KM1_AUX |--]</span>
                    <span className="text-slate-300">[ TON TIMER_LUB 5s ]</span>
                  </div>
                  <div className="text-emerald-400 font-bold">---( EV_LUBRIF )---</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500">
                Sincronização bidirecional: tags do Ladder ligadas automaticamente aos contatores do Unifilar.
              </div>
            </div>
          )}

          {activeTab === "dossier" && (
            <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 font-mono text-xs min-h-[340px] flex flex-col justify-between overflow-x-auto">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <span className="text-orange-400 font-bold">LISTA DE MATERIAIS &amp; ESPECIFICAÇÃO TÉCNICA</span>
                <span className="text-emerald-400">NBR 5410 COMPLIANT</span>
              </div>
              <table className="w-full text-left my-4">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="py-2">Item</th>
                    <th className="py-2">Descrição</th>
                    <th className="py-2">Qtd</th>
                    <th className="py-2">Fabricante Ref.</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr>
                    <td className="py-2 text-[#FF8A00]">QF-01</td>
                    <td className="py-2">Disjuntor Termomagnético 3P 63A Curva C</td>
                    <td className="py-2">01 un</td>
                    <td className="py-2 text-slate-400">Schneider / WEG</td>
                    <td className="py-2 text-emerald-400">✓ Validado</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[#FF8A00]">KM-01</td>
                    <td className="py-2">Contator Tripolar AC-3 32A Bobina 24Vcc</td>
                    <td className="py-2">01 un</td>
                    <td className="py-2 text-slate-400">Siemens / WEG</td>
                    <td className="py-2 text-emerald-400">✓ Validado</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-[#FF8A00]">CAB-01</td>
                    <td className="py-2">Cabo Cobre Unipolar 6 mm² 750V BWF Antichama</td>
                    <td className="py-2">45 m</td>
                    <td className="py-2 text-slate-400">Prysmian / Sil</td>
                    <td className="py-2 text-emerald-400">✓ Dimensionado</td>
                  </tr>
                </tbody>
              </table>
              <div className="text-[11px] text-slate-500">
                Exportação em 1 clique para PDF de Engenharia Industrial, planilha Excel e pacotes de compras.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   6. WORKFLOW: DO CONCEITO AO CHÃO DE FÁBRICA
========================================================================= */
function WorkflowSection() {
  const steps = [
    {
      num: "01",
      title: "Desenhe o Diagrama",
      desc: "Insira alimentadores, disjuntores, contatores e motores no Canvas Unifilar ou Multifilar.",
    },
    {
      num: "02",
      title: "Validação Automática",
      desc: "O motor calcula ampacidade, capacidade de ruptura e queda de tensão conforme NBR 5410.",
    },
    {
      num: "03",
      title: "Controle & Ladder",
      desc: "Gere a lógica em Ladder IEC 61131-3 integrada diretamente aos dispositivos de potência.",
    },
    {
      num: "04",
      title: "Dossiê Completo",
      desc: "Exporte lista de compras (BOM), diagramas para montagem de painel e memorial descritivo.",
    },
  ];

  return (
    <section id="workflow" className="py-20 md:py-28 px-4 sm:px-6 relative border-t border-slate-900 bg-gradient-to-b from-[#0A0E17] to-[#0B0F14]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#FF8A00] uppercase">
            FLUXO DE ENGENHARIA
          </span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Do primeiro traço ao painel montado
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-orange-500/40 transition-all flex flex-col justify-between"
            >
              <div>
                <span className="text-2xl font-mono font-black text-[#FF8A00] mb-4 block">
                  {s.num}
                </span>
                <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   7. SEÇÃO DE PLANOS COMERCIAIS
========================================================================= */
function PricingSection() {
  const plans = [
    {
      name: "Grátis",
      price: "R$ 0",
      period: "/mês",
      desc: "Para estudantes e experimentação da ferramenta.",
      features: [
        "Até 3 projetos simultâneos",
        "Canvas Unifilar e Ladder",
        "Importador Universal seguro",
        "Exportação em PDF básico",
      ],
      cta: "Começar grátis",
      to: "/signup",
      featured: false,
    },
    {
      name: "Básico",
      price: "R$ 100",
      period: "/mês",
      desc: "Para eletricistas e projetistas autônomos.",
      features: [
        "Até 10 projetos",
        "100 créditos de IA/mês",
        "Dossiê Técnico e BOM",
        "Dimensionamento NBR 5410",
        "Suporte por email",
      ],
      cta: "Assinar Básico",
      to: "/signup",
      featured: false,
    },
    {
      name: "Pro",
      price: "R$ 580",
      period: "/mês",
      desc: "Para escritórios de engenharia e montadores.",
      features: [
        "Projetos ilimitados",
        "250 créditos de IA/mês",
        "Dossiê completo de engenharia",
        "Importação de PLCopen XML",
        "Suporte prioritário",
      ],
      cta: "Assinar Pro",
      to: "/signup",
      featured: true,
    },
    {
      name: "Premium",
      price: "R$ 1.000",
      period: "/mês",
      desc: "Para plantas industriais críticas e indústrias.",
      features: [
        "Tudo do plano Pro",
        "Créditos de IA ilimitados",
        "Telemetria OPC-UA e Modbus",
        "Ambiente dedicado e SLA",
        "Consultoria e onboarding",
      ],
      cta: "Falar com Engenharia",
      to: "/signup",
      featured: false,
    },
  ];

  return (
    <section id="planos" className="py-20 md:py-28 px-4 sm:px-6 relative border-t border-slate-900 bg-[#0B0F14]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-mono font-bold tracking-[0.25em] text-[#FF8A00] uppercase">
            PLANOS TRANSPARENTES
          </span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Investimento direto no seu ganho de produtividade
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-7 flex flex-col justify-between transition-all ${
                p.featured
                  ? "bg-slate-900 border-2 border-[#FF8A00] shadow-[0_0_35px_rgba(255,107,0,0.25)] relative"
                  : "bg-slate-900/40 border border-slate-800"
              }`}
            >
              <div>
                {p.featured && (
                  <span className="absolute -top-3.5 left-6 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[#FF8A00] text-black">
                    Mais Escolhido
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{p.desc}</p>
                <div className="mt-5 text-3xl font-extrabold text-white tracking-tight">
                  {p.price}
                  <span className="text-xs font-normal text-slate-400 font-mono">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="text-xs text-slate-300 flex items-start gap-2">
                      <Check className="h-4 w-4 text-[#FF8A00] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                to={p.to}
                className={`mt-8 h-11 w-full inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
                  p.featured
                    ? "bg-[#FF8A00] text-black hover:bg-[#FFA033] shadow-lg shadow-orange-500/20"
                    : "border border-slate-700 text-slate-200 hover:bg-slate-800"
                }`}
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

/* =========================================================================
   8. DIVISOR DE ONDA ENERGIZADA COM SLOGAN DE MARCA
========================================================================= */
function EnergyWaveDivider() {
  return (
    <div className="relative py-12 overflow-hidden bg-[#0B0F14] border-t border-slate-900 select-none">
      {/* Linha de onda osciloscópica energizada */}
      <div className="max-w-6xl mx-auto px-4 relative">
        <svg
          viewBox="0 0 1000 70"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-12 text-[#FF8A00] opacity-75"
        >
          <path
            d="M0 35 Q 200 10, 350 35 T 600 35 T 800 20 Q 900 60, 1000 35"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <div className="mt-4 text-center">
          <p className="text-xs font-mono font-bold tracking-[0.35em] text-slate-400 uppercase">
            <span className="text-[#FF8A00]">ELÉTRICAI</span> · MAIS QUE UM APP, UMA VANTAGEM COMPETITIVA
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   9. CTA FINAL
========================================================================= */
function FinalCTASection({ authed }: { authed: boolean }) {
  return (
    <section className="py-20 md:py-28 px-4 sm:px-6 relative border-t border-slate-900 bg-gradient-to-b from-[#0B0F14] via-slate-950 to-[#0A0D15]">
      <div className="max-w-4xl mx-auto text-center rounded-3xl p-10 sm:p-16 border border-slate-800/80 bg-slate-900/40 backdrop-blur-md relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#FF8A00]/15 rounded-full blur-[100px] pointer-events-none" />

        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Pronto para elevar o nível dos seus projetos?
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
          Crie sua conta em menos de 1 minuto e comece a desenhar, simular e documentar com a
          precisão de uma engenharia industrial de ponta.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to={authed ? "/dashboard" : "/signup"}
            className="h-12 px-8 inline-flex items-center gap-2 rounded-full text-base font-bold bg-[#FF8A00] text-black hover:bg-[#FFA033] shadow-xl hover:shadow-orange-500/25 transition-all glow-orange-sm"
          >
            {authed ? "Acessar Plataforma" : "Criar Conta Gratuita"}{" "}
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            to="/workspace"
            className="h-12 px-6 inline-flex items-center rounded-full text-sm font-semibold border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
          >
            Testar Canvas no Navegador
          </Link>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   10. RODAPÉ INSTITUCIONAL PROFISSIONAL
========================================================================= */
function Footer() {
  return (
    <footer id="sobre" className="border-t border-slate-800 bg-[#06080C] py-14 px-4 sm:px-6 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-5 space-y-4">
          <EletricAiLogo className="h-8" />
          <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
            Plataforma de inteligência e engenharia para projetos elétricos, automação industrial,
            CLPs e documentação técnica em conformidade com as normas NBR 5410 e IEC.
          </p>
          <div className="text-[11px] font-mono text-slate-500">
            © {new Date().getFullYear()} ElétricAi Industrial OS. Todos os direitos reservados.
          </div>
        </div>

        <div className="md:col-span-2 space-y-2">
          <div className="font-bold text-white uppercase tracking-wider text-[11px]">Produto</div>
          <ul className="space-y-1.5">
            <li>
              <a href="#recursos" className="hover:text-slate-200">Recursos</a>
            </li>
            <li>
              <Link to="/workspace" className="hover:text-slate-200">Workspace Industrial</Link>
            </li>
            <li>
              <a href="#demonstracao" className="hover:text-slate-200">Demonstração</a>
            </li>
            <li>
              <a href="#planos" className="hover:text-slate-200">Planos &amp; Preços</a>
            </li>
          </ul>
        </div>

        <div className="md:col-span-2 space-y-2">
          <div className="font-bold text-white uppercase tracking-wider text-[11px]">Normas &amp; Docs</div>
          <ul className="space-y-1.5">
            <li className="text-slate-400">NBR 5410:2004</li>
            <li className="text-slate-400">IEC 61131-3</li>
            <li className="text-slate-400">IEC 60617</li>
            <li className="text-slate-400">NR-10 &amp; NR-12</li>
          </ul>
        </div>

        <div className="md:col-span-3 space-y-2">
          <div className="font-bold text-white uppercase tracking-wider text-[11px]">Segurança &amp; Legal</div>
          <ul className="space-y-1.5">
            <li>
              <Link to="/privacidade" className="hover:text-slate-200">Política de Privacidade</Link>
            </li>
            <li>
              <Link to="/termos" className="hover:text-slate-200">Termos de Uso</Link>
            </li>
            <li>
              <span className="text-emerald-400">● Sistema Operacional Ativo</span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
