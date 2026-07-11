// #ONB-01 · Tour guiado pós-criação de tenant/projeto.
//
// - Ativado uma única vez por usuário: flag `eletricai:tour-seen:v1` no localStorage.
// - Disparado após a criação/seleção de projeto no /onboarding (que grava
//   `eletricai:tour-pending`).
// - Passa pelos modos Unifilar → Ladder → FBD → SCADA, destacando cada tab
//   (via `data-tour="mode-<id>"`) e ativando o modo correspondente ao avançar.
// - Renderiza um card de instrução no rodapé com um anel pulsante no alvo.
// - Todo o estado é local; nada persiste além dos flags acima.
import { useEffect, useLayoutEffect, useState } from "react";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import type { WorkspaceMode } from "@/lib/workspace-data";

const TOUR_SEEN_KEY = "eletricai:tour-seen:v1";
const TOUR_PENDING_KEY = "eletricai:tour-pending";

export const markTourPending = () => {
  try {
    localStorage.setItem(TOUR_PENDING_KEY, "1");
  } catch {
    // storage indisponível → tour simplesmente não abre; sem prejuízo funcional.
  }
};

type Step = {
  id: string;
  title: string;
  body: string;
  targetSelector?: string;
  activateMode?: WorkspaceMode;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao Industrial Workspace",
    body: "Vamos passar rapidamente pelos 4 modos principais. Você pode pular a qualquer momento.",
  },
  {
    id: "unifilar",
    title: "Unifilar (IEC 60617)",
    body: "Desenhe o diagrama elétrico do painel arrastando símbolos da paleta lateral.",
    targetSelector: '[data-tour="mode-unifilar"]',
    activateMode: "unifilar",
  },
  {
    id: "ladder",
    title: "Ladder (IEC 61131-3)",
    body: "Programe a lógica de comando em rungs com contatos, bobinas, timers e counters.",
    targetSelector: '[data-tour="mode-ladder"]',
    activateMode: "ladder",
  },
  {
    id: "fbd",
    title: "FBD (Function Block Diagram)",
    body: "Monte a lógica em blocos funcionais conectando entradas e saídas visualmente.",
    targetSelector: '[data-tour="mode-fbd"]',
    activateMode: "fbd",
  },
  {
    id: "scada",
    title: "SCADA (ISA-101)",
    body: "Monte a interface de supervisão vinculando widgets às tags do PLC.",
    targetSelector: '[data-tour="mode-scada"]',
    activateMode: "scada",
  },
  {
    id: "done",
    title: "Tudo pronto",
    body: "Explore também Digital Twin, PLC, Simulação e Alarmes na barra superior. Bom trabalho!",
  },
];

function useTargetRect(selector: string | undefined, step: number): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    // Re-mede após transições (ex.: troca de modo pode reordenar o layout).
    const t = window.setTimeout(measure, 100);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, step]);
  return rect;
}

export function OnboardingTour() {
  const setMode = useEditorStore((s) => s.setActiveMode);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(TOUR_SEEN_KEY);
      const pending = localStorage.getItem(TOUR_PENDING_KEY);
      if (!seen && pending === "1") {
        setOpen(true);
        localStorage.removeItem(TOUR_PENDING_KEY);
      }
    } catch {
      /* noop */
    }
  }, []);

  const current = STEPS[step];
  const rect = useTargetRect(current?.targetSelector, step);

  useEffect(() => {
    if (!open) return;
    if (current?.activateMode) setMode(current.activateMode);
  }, [open, step, current, setMode]);

  const close = (markSeen: boolean) => {
    setOpen(false);
    if (markSeen) {
      try {
        localStorage.setItem(TOUR_SEEN_KEY, "1");
      } catch {
        /* noop */
      }
    }
  };

  if (!open || !current) return null;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[200] pointer-events-none"
      aria-live="polite"
      data-testid="onboarding-tour"
    >
      {/* Backdrop clicável para pular */}
      <button
        type="button"
        aria-label="Fechar tour"
        onClick={() => close(true)}
        className="absolute inset-0 bg-background/60 backdrop-blur-[1px] pointer-events-auto cursor-default"
      />

      {/* Anel de destaque no alvo */}
      {rect && (
        <div
          className="absolute rounded-md ring-2 ring-primary shadow-glow animate-pulse pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Card de instrução (rodapé, mobile-first) */}
      <div className="absolute inset-x-3 bottom-4 sm:inset-x-auto sm:right-6 sm:left-auto sm:bottom-6 sm:w-96 pointer-events-auto">
        <div className="rounded-xl border border-border bg-card shadow-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary">
                Passo {step + 1} de {STEPS.length}
              </div>
              <h3 className="mt-1 text-sm font-semibold">{current.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {current.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Pular tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => close(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Pular
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isFirst}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="h-8 px-3 rounded-md border border-border text-xs inline-flex items-center gap-1 disabled:opacity-40 hover:bg-accent"
              >
                <ArrowLeft className="h-3 w-3" /> Anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLast) {
                    close(true);
                  } else {
                    setStep((s) => Math.min(STEPS.length - 1, s + 1));
                  }
                }}
                className="h-8 px-3 rounded-md text-xs font-semibold text-primary-foreground inline-flex items-center gap-1 glow-primary"
                style={{ background: "var(--gradient-primary)" }}
              >
                {isLast ? "Concluir" : "Próximo"}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
