import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { pushNotification } from "@/lib/notification-service";

export function AiCreditsBadge() {
  const fetchCredits = useServerFn(getAiCredits);
  const q = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const lowNotifiedRef = useRef(false);

  useEffect(() => {
    const refresh = () => q.refetch();
    window.addEventListener("ai-usage-event", refresh);
    return () => window.removeEventListener("ai-usage-event", refresh);
  }, [q]);

  useEffect(() => {
    if (!q.data || !q.data.ok) return;
    const { remaining, max_credits, unlimited, plan } = q.data;
    const low = !unlimited && remaining <= Math.max(1, Math.floor(max_credits * 0.1));
    if (low && !lowNotifiedRef.current) {
      lowNotifiedRef.current = true;
      pushNotification(
        "credits_low",
        "Créditos de IA baixos",
        `Restam apenas ${remaining} créditos de IA. Considere fazer upgrade do plano ${plan}.`,
        { remaining, max_credits, plan },
      );
    }
    if (!low) lowNotifiedRef.current = false;
  }, [q.data]);

  if (!q.data || !q.data.ok) {
    return (
      <div className="hidden lg:flex h-8 items-center gap-1.5 rounded border border-border bg-card px-2 text-[11px] font-mono text-muted-foreground">
        <Sparkles className="h-3 w-3" /> --
      </div>
    );
  }
  const { plan, remaining, max_credits, unlimited } = q.data;
  const low = !unlimited && remaining <= Math.max(1, Math.floor(max_credits * 0.1));
  return (
    <div
      onClick={() => window.dispatchEvent(new Event("trigger-upgrade-modal"))}
      className={`hidden lg:flex h-8 items-center gap-1.5 rounded border px-2 text-[11px] font-mono cursor-pointer hover:border-primary/40 hover:bg-accent/40 transition-colors ${
        low
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-card text-muted-foreground"
      }`}
      title={`Plano ${plan} · ${unlimited ? "ilimitado" : `${remaining}/${max_credits} créditos restantes`}`}
    >
      <Sparkles className="h-3 w-3" />
      {unlimited ? (
        <>
          <InfinityIcon className="h-3 w-3" /> IA
        </>
      ) : (
        <>
          {remaining}
          <span className="text-foreground/40">/{max_credits}</span>
        </>
      )}
    </div>
  );
}
