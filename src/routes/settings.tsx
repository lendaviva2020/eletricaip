import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Settings2,
  CreditCard,
  Users,
  Cpu,
  Sparkles,
  Gauge,
  ChevronRight,
  Wifi,
  Zap,
  HardDrive,
  BookText,
  Ruler,
  ToggleLeft,
  Box,
  User,
  Bell,
  Shield,
  Palette,
  Plug,
  HardDrive,
  BookText,
  Ruler,
  ToggleLeft,
  Box,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/lib/settings-store";
import { getIsPlatformAdmin } from "@/lib/billing.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configurações · EletricAI" },
      { name: "description", content: "Preferências do Industrial OS." },
    ],
  }),
  component: SettingsPage,
});

const PROTOCOLS: { name: string; desc: string }[] = [
  { name: "Modbus TCP/RTU", desc: "Comunicação serial e TCP para CLPs e IEDs" },
  { name: "OPC-UA", desc: "Servidor OPC-UA unificado para integração MES/SCADA" },
  { name: "MQTT", desc: "Pub/sub leve para telemetria e borda industrial" },
  { name: "Profinet", desc: "Padrão Siemens para automação em tempo real" },
  { name: "EtherNet/IP", desc: "Protocolo CIP sobre Ethernet industrial" },
  { name: "BACnet", desc: "Automação predial e HVAC" },
];

const NORMAS: { name: string; desc: string }[] = [
  { name: "NBR 5410", desc: "Instalações elétricas de baixa tensão" },
  { name: "NBR 14039", desc: "Instalações de média tensão" },
  { name: "NR-10", desc: "Segurança em instalações elétricas" },
  { name: "NR-12", desc: "Segurança no trabalho em máquinas" },
  { name: "IEC 61131", desc: "Linguagens e padrões para CLPs" },
  { name: "IEC 60617", desc: "Símbolos gráficos para diagramas" },
  { name: "ISA-18.2", desc: "Gerenciamento de alarmes industriais" },
];

function SettingsPage() {
  const adminFn = useServerFn(getIsPlatformAdmin);
  const { data: adminInfo } = useQuery({
    queryKey: ["settings", "is-platform-admin"],
    queryFn: () => adminFn({}),
  });
  const isPlatformAdmin = !!adminInfo?.isPlatformAdmin;
  const protocols = useSettingsStore((s) => s.protocols);
  const normas = useSettingsStore((s) => s.normas);
  const toggleProtocol = useSettingsStore((s) => s.toggleProtocol);
  const toggleNorma = useSettingsStore((s) => s.toggleNorma);

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Preferências do Industrial OS</p>
        </div>

        <section>
          <SectionLabel icon={Users} title="Conta & Workspace" />
          <div className="grid gap-3">
            {isPlatformAdmin && (
              <SettingsLinkCard
                icon={CreditCard}
                title="Faturamento & Assinatura"
                desc="Gerencie seu plano, forma de pagamento e faturas"
                to="/settings/billing"
                badge="Admin"
              />
            )}
            <SettingsLinkCard
              icon={Users}
              title="Equipe & Convites"
              desc="Gerencie membros, papéis e convites do workspace"
              to="/settings/team"
              badge={null}
            />
            <SettingsLinkCard
              icon={Sparkles}
              title="Status da IA"
              desc="Diagnóstico da chave DeepSeek, ping e histórico de chamadas"
              to="/settings/ai-status"
              badge="DeepSeek"
            />
            <SettingsLinkCard
              icon={Box}
              title="Digital Twin 3D"
              desc="Gêmeo Digital interativo com visualização 3D e telemetria ao vivo"
              to="/digital-twin"
              badge="Novo"
            />
          </div>
        </section>

        <section>
          <SectionLabel icon={Wifi} title="Protocolos industriais" />
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {PROTOCOLS.map((p) => {
                const on = protocols[p.name];
                return (
                  <div key={p.name} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                        {on ? (
                          <Zap className="h-4 w-4 text-primary" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </div>
                    </div>
                    <Switch checked={on} onCheckedChange={() => toggleProtocol(p.name)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionLabel icon={BookText} title="Normas aplicadas" />
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {NORMAS.map((n) => {
                const on = normas[n.name];
                return (
                  <div key={n.name} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                        <Ruler className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{n.name}</p>
                        <p className="text-xs text-muted-foreground">{n.desc}</p>
                      </div>
                    </div>
                    <Switch checked={on} onCheckedChange={() => toggleNorma(n.name)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionLabel icon={Gauge} title="Runtime" />
          <div className="grid gap-3 sm:grid-cols-3">
            <RuntimeCard
              icon={Cpu}
              label="Cycle time alvo"
              value="8 ms"
              desc="Intervalo do ciclo principal"
            />
            <RuntimeCard
              icon={HardDrive}
              label="Solver"
              value="RK4 · Δt 16ms"
              desc="Método numérico de integração"
            />
            <RuntimeCard
              icon={Sparkles}
              label="Modo IA"
              value="Contextual + autopilot"
              desc="Motor de inferência industrial"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
        {title}
      </span>
    </div>
  );
}

function SettingsLinkCard({
  icon: Icon,
  title,
  desc,
  to,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  to: string;
  badge: string | null;
}) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate({ to })} className="w-full text-left block">
      <Card className="group hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">{title}</CardTitle>
              {badge && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  {badge}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs mt-0.5">{desc}</CardDescription>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardContent>
      </Card>
    </button>
  );
}

function RuntimeCard({
  icon: Icon,
  label,
  value,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  desc: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {label}
        </div>
        <p className="text-lg font-mono text-primary font-medium">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{desc}</p>
      </CardContent>
    </Card>
  );
}
