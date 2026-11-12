/**
 * Authorial Pure-SVG Symbols for Compact Studio Hardware & Function Blocks.
 * Follows ElétricAi Design System & IEC 60617 / IEC 61131-3 proportions (Clean Room).
 */
import React from "react";
import type { CompactBlockCategory } from "@/lib/compact-studio/domain/types";

export const CompactBlockGlyph: React.FC<{
  readonly category: CompactBlockCategory;
  readonly className?: string;
}> = ({ category, className = "w-3.5 h-3.5" }) => {
  switch (category) {
    case "timer":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5" />
          <path d="M9 3h6" />
        </svg>
      );
    case "counter":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      );
    case "clock":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
          <circle cx="12" cy="15" r="2.5" />
        </svg>
      );
    case "analog":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <path d="M3 12c3-7 6-7 9 0s6 7 9 0" />
        </svg>
      );
    case "io":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <circle cx="6" cy="12" r="2.5" />
          <path d="M8.5 12H20" />
          <path d="M16 8l4 4-4 4" />
        </svg>
      );
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={className}
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 15h5" />
        </svg>
      );
  }
};
