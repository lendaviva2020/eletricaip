import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Configurações · EletricAI" }, { name: "description", content: "Preferências do Industrial OS." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Configurações</h1>

        <Section title="Protocolos industriais">
          {[
            ["Modbus TCP/RTU", true],
            ["OPC-UA", true],
            ["MQTT", true],
            ["Profinet", false],
            ["EtherNet/IP", false],
            ["BACnet", false],
          ].map(([n, on]) => (
            <Row key={n as string} k={n as string}>
              <Toggle on={on as boolean} />
            </Row>
          ))}
        </Section>

        <Section title="Normas aplicadas">
          {["NBR 5410", "NBR 14039", "NR-10", "NR-12", "IEC 61131", "IEC 60617", "ISA-18.2"].map((n) => (
            <Row key={n} k={n}><Toggle on /></Row>
          ))}
        </Section>

        <Section title="Runtime">
          <Row k="Cycle time alvo"><span className="font-mono text-primary">8 ms</span></Row>
          <Row k="Solver"><span className="font-mono text-primary">RK4 · Δt 16ms</span></Row>
          <Row k="Modo IA"><span className="font-mono text-primary">Contextual + autopilot</span></Row>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">{title}</div>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">{children}</div>
    </div>
  );
}
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between px-4 py-3 text-sm"><span>{k}</span>{children}</div>;
}
function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex h-5 w-9 rounded-full p-0.5 transition-colors ${on ? "bg-primary glow-primary" : "bg-muted"}`}>
      <span className={`h-4 w-4 rounded-full bg-background transition-transform ${on ? "translate-x-4" : ""}`} />
    </span>
  );
}
