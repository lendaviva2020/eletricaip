import { useState } from "react";
import { Sparkles, ShieldCheck, Wrench, Settings2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/project-store";
import { getVoltaiCompDef } from "@/lib/voltai/component-definitions";
import { useVoltaiStore } from "@/lib/voltai/store";

const TABS = [
  { id: "props", label: "Propriedades", icon: Settings2 },
  { id: "ai", label: "IA", icon: Sparkles },
  { id: "norms", label: "Normas", icon: ShieldCheck },
  { id: "maint", label: "Manutenção", icon: Wrench },
] as const;

export function RightPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ai");

  return (
    <aside className="hidden xl:flex w-[340px] shrink-0 flex-col border-l border-border bg-panel">
      <div className="h-9 flex items-center px-2 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-7 px-2.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors",
                tab === t.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        {tab === "props" && <PropsPanel />}
        {tab === "ai" && <AiPanel />}
        {tab === "norms" && <NormsPanel />}
        {tab === "maint" && <MaintPanel />}
      </div>
    </aside>
  );
}

function PropsPanel() {
  const node = useProjectStore((s) => s.nodes.find((n) => n.id === s.selectedId));
  const removeNode = useProjectStore((s) => s.removeNode);
  const voltaiNode = useVoltaiStore((s) => s.components.find((n) => n.id === s.selectedId));
  const updateVoltaiParam = useVoltaiStore((s) => s.updateComponentParam);
  const restoreVoltaiFactory = useVoltaiStore((s) => s.restoreFactoryParams);

  if (voltaiNode) {
    const definition = getVoltaiCompDef(voltaiNode.type);
    return (
      <div className="p-4 space-y-3 text-[12px]">
        <Section title="Selecionado">
          <div className="text-sm font-medium">
            {voltaiNode.label} - {definition.name}
          </div>
          <div className="text-[11px] text-muted-foreground">{definition.category}</div>
        </Section>
        <Section title="Parametros">
          {Object.entries(definition.paramSpecs).map(([key, spec]) => (
            <ParamEditor
              key={key}
              spec={spec}
              value={voltaiNode.params[key] ?? spec.defaultValue}
              onChange={(value) => updateVoltaiParam(voltaiNode.id, key, value)}
            />
          ))}
        </Section>
        <Section title="Simulacao">
          {Object.entries(voltaiNode.simulationState).map(([k, v]) => (
            <Row key={k} k={k} v={String(v)} />
          ))}
        </Section>
        <button
          onClick={() => {
            restoreVoltaiFactory(voltaiNode.id);
            toast.success(`Configurações de fábrica restauradas para ${voltaiNode.label}`);
          }}
          className="w-full text-[11px] py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10"
        >
          Restaurar Fábrica
        </button>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-4 text-[12px] text-muted-foreground">
        Selecione um equipamento no Unifilar, SCADA, Twin ou Ladder para ver suas propriedades.
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3 text-[12px]">
      <Section title="Selecionado">
        <div className="text-sm font-medium">
          {node.label} · {node.kind.toUpperCase()}
        </div>
        <div className="text-[11px] text-muted-foreground capitalize">{node.category}</div>
      </Section>
      <Section title="Parâmetros">
        <Row k="Tag" v={node.id} />
        <Row k="Categoria" v={node.category} />
        <Row k="Energizado" v={node.energized ? "● SIM" : "○ NÃO"} />
        {Object.entries(node.params).map(([k, v]) => (
          <Row key={k} k={k} v={String(v)} />
        ))}
      </Section>
      <Section title="Tags vinculadas">
        {[`${node.id}.RUN`, `${node.id}.STATE`, `${node.id}.FAULT`].map((t) => (
          <div key={t} className="font-mono text-[11px] text-primary/90 py-0.5">
            {t}
          </div>
        ))}
      </Section>
      <button
        onClick={() => removeNode(node.id)}
        className="w-full text-[11px] py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        Remover do projeto
      </button>
    </div>
  );
}

function ParamEditor({
  spec,
  value,
  onChange,
}: {
  spec: {
    label: string;
    type: string;
    unit?: string;
    min?: number;
    max?: number;
    options?: { label: string; value: string }[];
  };
  value: unknown;
  onChange: (value: string | number | boolean) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px]">
      <span className="flex justify-between text-muted-foreground">
        {spec.label}
        {spec.unit && <span>{spec.unit}</span>}
      </span>
      {spec.type === "boolean" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4"
        />
      ) : spec.type === "select" && spec.options ? (
        <select
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 rounded bg-input border border-border px-2 text-foreground"
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={Number(value)}
          min={spec.min}
          max={spec.max}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-8 rounded bg-input border border-border px-2 font-mono text-foreground"
        />
      )}
    </label>
  );
}

function AiPanel() {
  const [msg, setMsg] = useState("");
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="rounded-md p-3 glass border border-primary/30">
          <div className="flex items-center gap-2 text-[11px] font-medium text-primary mb-1">
            <Sparkles className="h-3.5 w-3.5" /> EletricAI Copilot
          </div>
          <p className="text-[12px] text-foreground/90 leading-relaxed">
            Olá! Posso gerar <strong>unifilar, ladder, FBD, SCADA, alarmes e Digital Twin</strong> a
            partir de uma descrição em linguagem natural. Ex.:
          </p>
          <div className="mt-2 text-[11px] font-mono text-muted-foreground italic">
            "Criar esteira com motor 7.5kW, E-STOP, sensor e inversor com proteção NR-12."
          </div>
        </div>

        <div className="rounded-md p-3 bg-card border border-border">
          <div className="text-[11px] text-muted-foreground mb-1">Sugestão contextual</div>
          <p className="text-[12px]">
            Detectei que <strong>M-03</strong> está com sobrecorrente. Recomendo aumentar o tempo de
            rampa do VFD para 4s e revisar o cabo (2.5 mm² → 4 mm² conforme <em>NBR 5410</em>).
          </p>
          <div className="mt-2 flex gap-1.5">
            <button className="text-[10px] font-semibold px-2 py-1 rounded bg-primary text-primary-foreground">
              Aplicar
            </button>
            <button className="text-[10px] font-semibold px-2 py-1 rounded bg-muted text-foreground">
              Detalhes
            </button>
          </div>
        </div>

        <div className="rounded-md p-3 bg-card border border-border">
          <div className="text-[11px] text-muted-foreground mb-1">Geração automática</div>
          <p className="text-[12px]">
            ✓ Unifilar criado · ✓ Ladder gerada (4 rungs) · ✓ Tags 142 · ✓ HMI montado
          </p>
        </div>
      </div>

      <div className="p-2 border-t border-border">
        <div className="relative">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Pergunte ao EletricAI…"
            className="w-full h-9 pl-3 pr-9 rounded-md bg-input border border-border text-[12px] outline-none focus:ring-2 focus:ring-ring"
          />
          <button className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded text-primary hover:bg-accent">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function NormsPanel() {
  const items = [
    { id: "NBR 5410", status: "ok", note: "Instalações BT em conformidade" },
    { id: "NBR 14039", status: "ok", note: "Instalações de média tensão OK" },
    { id: "NR-10", status: "warn", note: "Falta laudo de ATPV em 2 painéis" },
    { id: "NR-12", status: "ok", note: "Intertravamentos validados" },
    { id: "IEC 61131", status: "ok", note: "Ladder e FBD compliant" },
    { id: "IEC 60617", status: "ok", note: "Símbolos unifilar OK" },
    { id: "ISA-18.2", status: "warn", note: "2 alarmes sem prioridade definida" },
  ];
  return (
    <div className="p-4 space-y-2">
      {items.map((i) => (
        <div key={i.id} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">{i.id}</span>
            <span
              className={cn(
                "text-[10px] font-mono uppercase",
                i.status === "ok" ? "text-success" : "text-warning",
              )}
            >
              {i.status === "ok" ? "✓ OK" : "⚠ Revisar"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{i.note}</p>
        </div>
      ))}
    </div>
  );
}

function MaintPanel() {
  return (
    <div className="p-4 space-y-3 text-[12px]">
      <Section title="Manutenção Preditiva">
        <Row k="MTBF" v="9 240 h" />
        <Row k="MTTR" v="4.2 min" />
        <Row k="Disponibilidade" v="99.6%" />
      </Section>
      <Section title="Alertas">
        <div className="rounded-md p-2 bg-warning/10 border border-warning/30 text-[11px]">
          🔧 Rolamento M-03 com vibração acima do baseline. Substituir em ~120h.
        </div>
        <div className="rounded-md p-2 bg-info/10 border border-info/30 text-[11px] mt-2">
          🛢️ Lubrificação P-201 prevista em 14 dias.
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
        {title}
      </div>
      <div className="rounded-md border border-border bg-card p-3 space-y-1">{children}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground">{v}</span>
    </div>
  );
}
