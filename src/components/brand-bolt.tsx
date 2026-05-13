import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function BrandBolt({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-4 w-4", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M13.4 2.5 5.8 13.1h5.3l-.5 8.4 7.6-10.7h-5.3l.5-8.3Z" fill="currentColor" />
    </svg>
  );
}
