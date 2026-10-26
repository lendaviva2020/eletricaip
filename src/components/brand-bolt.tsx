import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import { EletricAiSymbol } from "@/components/brand/eletricai-logo";

export function BrandBolt({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <EletricAiSymbol className={cn("h-4 w-4", className)} {...props} />;
}
