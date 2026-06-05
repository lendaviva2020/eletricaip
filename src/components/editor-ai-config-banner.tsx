// Banner discreto no topo do workspace que avisa quando a IA do ELETRICAI
// não está pronta (chave LOVABLE_API_KEY ausente, 401, sem créditos ou
// health-check falhando). Faz UM ping ao montar — não fica em polling —
// e pode ser dispensado pelo usuário até o próximo reload.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Settings2, X } from "lucide-react";
import { pingArchitectHealth } from "@/lib/ai-architect-client";

type Status = "checking" | "ok" | "missing-key" | "auth" | "quota" | "down";

function classify(res: unknown): Status {
  if (!res || typeof res !== "object") return "down";
  const r = res as { ok?: boolean; error?: string; code?: string };
  if (r.ok) return "ok";
  const msg = `${r.error ?? ""} ${r.code ?? ""}`.toUpperCase();
  if (msg.includes("MISSING_KEY") || msg.includes("LOVABLE_API_KEY")) return "missing-key";
  if (msg.includes("401") || msg.includes("AUTH") || msg.includes("UNAUTHORIZED")) return "auth";
  if (msg.includes("402") || msg.includes("CREDIT") || msg.includes("QUOTA")) return "quota";
  return "down";
}

const MESSAGES: Record<Exclude<Status, "ok" | "checking">, string> = {
  "missing-key":
    "IA NexusMind indisponível: chave LOVABLE_API_KEY ausente no servidor. Configure para liberar o copiloto.",
  auth: "IA NexusMind sem autenticação válida. Faça login novamente ou revise as credenciais.",
  quota: "Créditos de IA insuficientes neste período. Faça upgrade do plano para continuar.",
  down: "IA NexusMind temporariamente indisponível. O canvas continua funcionando normalmente.",
};

export function EditorAiConfigBanner() {
  const [status, setStatus] = useState<Status>("checking");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    pingArchitectHealth()
      .then((res) => {
        if (!alive) return;
        setStatus(classify(res));
      })
      .catch(() => {
        if (alive) setStatus("down");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (dismissed || status === "ok" || status === "checking") return null;

  return (
    <div
      role="status"
      className="shrink-0 px-3 py-1.5 border-b border-warning/30 bg-warning/10 text-warning text-[11px] flex items-center gap-2"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{MESSAGES[status]}</span>
      <Link
        to="/settings/ai-status"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-warning/40 hover:bg-warning/20 font-medium"
      >
        <Settings2 className="h-3 w-3" /> Configurar
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="h-5 w-5 grid place-items-center rounded hover:bg-warning/20 cursor-pointer"
        aria-label="Dispensar aviso"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
