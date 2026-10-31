import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  variant?: "full" | "symbol" | "mono";
  size?: number | string;
}

/**
 * Logotipo oficial ElétricAi
 * Símbolo vetorial original: Letra E geométrica em aço escovado/metálico,
 * atravessada diagonalmente por um raio elétrico laranja industrial de alta voltagem.
 */
export function EletricAiSymbol({ className = "h-8 w-8", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ElétricAi Símbolo"
      {...props}
    >
      <defs>
        <linearGradient id="symMetalE" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="25%" stopColor="#CBD5E1" />
          <stop offset="55%" stopColor="#64748B" />
          <stop offset="85%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        <linearGradient id="symBolt" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF7ED" />
          <stop offset="25%" stopColor="#FDBA74" />
          <stop offset="55%" stopColor="#FF8A00" />
          <stop offset="85%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
      </defs>

      {/* Base Depth Shadow */}
      <path
        d="M 28 20 L 98 20 L 98 40 L 58 40 L 58 50 L 90 50 L 90 70 L 58 70 L 58 80 L 98 80 L 98 100 L 28 100 Z"
        fill="#05080E"
        opacity="0.75"
        transform="translate(2, 3)"
      />

      {/* Main Metallic Letter 'E' Body */}
      <path
        d="M 26 18 L 96 18 L 96 38 L 56 38 L 56 49 L 88 49 L 88 69 L 56 69 L 56 80 L 96 80 L 96 100 L 26 100 Z"
        fill="url(#symMetalE)"
      />

      {/* Chamfer & Bevel Highlights */}
      <polygon points="26,18 96,18 92,23 32,23 32,95 26,100" fill="#FFFFFF" opacity="0.65" />
      <polygon points="56,38 96,38 92,42 56,42" fill="#0F172A" opacity="0.7" />
      <polygon points="56,49 88,49 84,53 56,53" fill="#FFFFFF" opacity="0.45" />
      <polygon points="56,69 88,69 84,65 56,65" fill="#0F172A" opacity="0.8" />
      <polygon points="56,80 96,80 92,84 56,84" fill="#FFFFFF" opacity="0.3" />
      <polygon points="26,100 96,100 92,96 32,96" fill="#05080E" opacity="0.85" />

      {/* Lightning Bolt Contour */}
      <polygon points="82,8 34,62 58,62 16,114 46,114 94,54 70,54" fill="#9A3412" />

      {/* High-Voltage Radiant Bolt */}
      <polygon points="80,10 36,60 60,60 20,110 44,110 92,54 68,54" fill="url(#symBolt)" />

      {/* White-Hot Core Spark Line */}
      <polygon points="77,14 41,58 61,58 29,105 40,105 85,55 67,55" fill="#FFFBEB" opacity="0.9" />
    </svg>
  );
}

/**
 * Logotipo Horizontal Completo ElétricAi
 * Símbolo + Nome da Marca com tipografia geométrica premium
 */
export function EletricAiLogo({
  className = "h-8",
  showSubtitle = false,
  ...props
}: {
  className?: string;
  showSubtitle?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`} {...props}>
      <div className="relative shrink-0 flex items-center justify-center">
        {/* Subtle orange halo glow */}
        <div className="absolute -inset-1 rounded-full bg-primary/20 blur-sm pointer-events-none" />
        <EletricAiSymbol className="h-7 w-7 relative z-10 drop-shadow-sm" />
      </div>

      <div className="flex flex-col leading-none">
        <div className="flex items-baseline tracking-tight font-extrabold text-lg sm:text-xl font-sans">
          <span className="text-foreground tracking-[-0.03em]">Elétric</span>
          <span className="text-primary tracking-[-0.03em] font-black">Ai</span>
        </div>
        {showSubtitle && (
          <span className="text-[9px] font-mono font-semibold tracking-[0.22em] text-muted-foreground uppercase mt-0.5">
            Industrial OS
          </span>
        )}
      </div>
    </div>
  );
}
