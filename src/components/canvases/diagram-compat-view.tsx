/**
 * Aviso de WebGL indisponível no canvas unifilar/multifilar.
 *
 * O editor roda SOMENTE em WebGL (completo e, se preciso, leve). Este aviso
 * só aparece quando nem o modo leve consegue iniciar — normalmente porque a
 * aceleração por hardware está desligada no navegador. Em vez de uma imagem
 * travada do diagrama, explica como ligar o WebGL e oferece nova tentativa.
 * O projeto continua salvo; nada é perdido.
 */
import { ArrowClockwise, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { DiagramDoc, SheetKind } from "@/lib/diagram/schema";

interface Props {
  readonly doc: DiagramDoc;
  readonly sheet: SheetKind;
  readonly reason: "init" | "contextlost";
  readonly onRetry: () => void;
}

export function DiagramCompatView({ doc, sheet, reason, onRetry }: Props) {
  const count = Object.values(doc.nodes).filter((n) => n.sheet === sheet).length;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1220] p-4"
      data-testid="diagram-webgl-unavailable"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg border border-amber-500/40 bg-[#101929] p-5 text-sm text-zinc-200">
        <div className="flex items-start gap-2">
          <Warning className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="font-semibold text-white">
              {reason === "contextlost"
                ? "O navegador interrompeu o WebGL"
                : "O WebGL está desligado neste navegador"}
            </h2>
            <p className="mt-1 text-[13px] text-zinc-400">
              O editor do diagrama precisa do WebGL. Seu projeto está salvo
              {count ? ` (${count} componentes nesta folha)` : ""}.
            </p>
          </div>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-zinc-300">
          <li>
            Chrome/Edge: Configurações → Sistema → ligue{" "}
            <strong>“Usar aceleração de hardware quando disponível”</strong> e reinicie o navegador.
          </li>
          <li>Firefox: Configurações → Desempenho → ligue a aceleração de hardware.</li>
          <li>Celular: atualize o navegador e feche abas pesadas (memória de vídeo).</li>
        </ol>
        <Button className="w-full" onClick={onRetry}>
          <ArrowClockwise className="mr-1.5 h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    </div>
  );
}
