// ElétricAi Official Design Tokens
// Single source of truth for Brand Palette, Semantic Colors, Typography, Spacing, and Elevation.
// Conforms to WCAG 2.2 AA (and AAA where applicable) for industrial & engineering applications.

export const BRAND_PALETTE = {
  graphite: "#0B0F14", // Deep Graphite — Fundo principal escuro, navegação principal
  steel: "#151C24",    // Dark Steel — Superfícies secundárias, painéis, cartões, menus
  orange: "#FF8A00",   // Industrial Orange — Ações primárias, botões, seleção, destaques
  white: "#F1F5F9",    // Technical White — Títulos, texto de alta prioridade sobre fundo escuro
  gray: "#A7B0BB",     // Reading Gray — Descrições, legendas, metadados, texto secundário
} as const;

export const THEME_TOKENS = {
  dark: {
    background: "#0B0F14",
    foreground: "#F1F5F9",
    surface: "#151C24",
    surfaceRaised: "#1C2530",
    surfaceMuted: "#10161E",
    surfaceInverted: "#F1F5F9",
    textPrimary: "#F1F5F9",
    textSecondary: "#A7B0BB",
    textMuted: "#738090",
    border: "rgba(241, 245, 249, 0.09)",
    borderStrong: "rgba(241, 245, 249, 0.18)",
    primary: "#FF8A00",
    primaryHover: "#FFA033",
    primaryActive: "#E67C00",
    primaryForeground: "#0B0F14", // 9.4:1 contrast ratio (AAA)
    secondary: "#1E2632",
    secondaryForeground: "#F1F5F9",
    focusRing: "#FF8A00",
    success: "#22C55E",
    successSurface: "rgba(34, 197, 94, 0.12)",
    warning: "#F59E0B",
    warningSurface: "rgba(245, 158, 11, 0.12)",
    danger: "#EF4444",
    dangerSurface: "rgba(239, 68, 68, 0.12)",
    info: "#38BDF8",
    infoSurface: "rgba(56, 189, 248, 0.12)",
    disabled: "#475569",
    disabledSurface: "#131820",
    overlay: "rgba(5, 8, 12, 0.78)",
    panel: "#151C24",
    grid: "rgba(241, 245, 249, 0.05)",
  },
  light: {
    background: "#F8FAFC",
    foreground: "#0B0F14",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceMuted: "#F1F5F9",
    surfaceInverted: "#0B0F14",
    textPrimary: "#0B0F14",
    textSecondary: "#334155",
    textMuted: "#64748B",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    primary: "#FF8A00",
    primaryHover: "#E67C00",
    primaryActive: "#CC6E00",
    primaryForeground: "#0B0F14", // 9.4:1 contrast ratio (AAA)
    // Para links textuais ou texto de ênfase laranja sobre fundo branco, usamos tom ajustado para WCAG AA >= 4.5:1
    primaryText: "#B45309",      // 4.9:1 contrast ratio sobre branco (AA)
    secondary: "#F1F5F9",
    secondaryForeground: "#0B0F14",
    focusRing: "#FF8A00",
    success: "#16A34A",
    successSurface: "#DCFCE7",
    warning: "#D97706",
    warningSurface: "#FEF3C7",
    danger: "#DC2626",
    dangerSurface: "#FEE2E2",
    info: "#0284C7",
    infoSurface: "#E0F2FE",
    disabled: "#94A3B8",
    disabledSurface: "#F1F5F9",
    overlay: "rgba(15, 23, 42, 0.5)",
    panel: "#FFFFFF",
    grid: "rgba(15, 23, 42, 0.06)",
  },
} as const;

export const TYPOGRAPHY = {
  fonts: {
    display: '"Space Grotesk", system-ui, -apple-system, sans-serif',
    sans: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  scale: {
    xs: { fontSize: "0.75rem", lineHeight: "1rem" },        // 12px
    sm: { fontSize: "0.875rem", lineHeight: "1.25rem" },    // 14px
    base: { fontSize: "1rem", lineHeight: "1.5rem" },       // 16px
    lg: { fontSize: "1.125rem", lineHeight: "1.75rem" },    // 18px
    xl: { fontSize: "1.25rem", lineHeight: "1.75rem" },     // 20px
    "2xl": { fontSize: "1.5rem", lineHeight: "2rem" },      // 24px
    "3xl": { fontSize: "1.875rem", lineHeight: "2.25rem" }, // 30px
    "4xl": { fontSize: "2.25rem", lineHeight: "2.5rem" },   // 36px
    "5xl": { fontSize: "3rem", lineHeight: "1.15" },        // 48px
  },
} as const;

export const SPACING = {
  0: "0px",
  1: "0.25rem", // 4px
  2: "0.5rem",  // 8px
  3: "0.75rem", // 12px
  4: "1rem",    // 16px
  5: "1.25rem", // 20px
  6: "1.5rem",  // 24px
  8: "2rem",    // 32px
  10: "2.5rem", // 40px
  12: "3rem",   // 48px
  16: "4rem",   // 64px
} as const;

export const RADIUS = {
  none: "0px",
  sm: "0.25rem", // 4px
  md: "0.375rem", // 6px
  lg: "0.5rem",   // 8px (padrão industrial)
  xl: "0.75rem",  // 12px
  full: "9999px",
} as const;

export const SHADOWS = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
  panel: "0 8px 30px rgba(0, 0, 0, 0.35)",
  glowOrange: "0 0 24px rgba(255, 138, 0, 0.28)",
} as const;

export const MOTION = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  normal: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;
