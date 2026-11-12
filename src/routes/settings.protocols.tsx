import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  Plug as PlugIcon,
  Plug,
  ShieldCheck,
  Info,
  Pulse,
  HardDrives,
} from "@phosphor-icons/react";
import { testOpcuaConnection } from "@/lib/opcua-server.functions";
import { testModbusHost } from "@/lib/modbus-server.functions";
import {
  PROTOCOL_LAYER_CLASSIFICATION,
  type EdgeExecutionMode,
} from "@/lib/edge/protocol-classification";

export const Route = createFileRoute("/settings/protocols")({
  head: () => ({ meta: [{ title: "Protocolos Industriais · EletricAI" }] }),
  component: ProtocolsPage,
});

function ProtocolsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-3xl">
      <PageHeader />
      <OpcUaSection />
      <ModbusSection />
      <ProtocolArchitectureMatrix />
      <SecurityNotice />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Protocolos Industriais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure conexões OPC-UA e Modbus TCP para integração com CLPs, sensores e sistemas de
          supervisão.
        </p>
      </div>
      <div
        role="note"
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-400 space-y-1"
      >
        <p className="font-semibold">Ambiente de Simulação / Mock de Nuvem</p>
        <p>
          Esta plataforma roda na nuvem pública e{" "}
          <strong>não se comunica diretamente com CLPs de fábrica</strong>. As conexões abaixo
          operam em modo de simulação (host <code>simulation</code>). Para comunicar com
          equipamentos reais é necessário um <strong>Edge Gateway</strong> local (ex.: node-opcua /
          gateway Modbus na rede OT) que encaminhe os dados de forma segura para a plataforma.
        </p>
      </div>
    </div>
  );
}

// ── OPC-UA ──────────────────────────────────────────────────────

function OpcUaSection() {
  const [mode, setMode] = useState<EdgeExecutionMode>("SIMULATOR");
  const [endpoint, setEndpoint] = useState("opc.tcp://simulation:4840");
  const [gatewayId, setGatewayId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityMode, setSecurityMode] = useState<"None" | "Sign" | "SignAndEncrypt">("None");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    tags: number;
    provenance?: string;
    transport?: string;
    error?: string;
  } | null>(null);

  const testConn = useServerFn(testOpcuaConnection);

  const handleTest = async () => {
    if (!endpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConn({
        data: {
          mode,
          endpoint,
          gatewayId: mode === "EDGE_READ_ONLY" ? gatewayId || undefined : undefined,
          username: username || undefined,
          password: password || undefined,
          securityMode: securityMode || undefined,
        },
      });
      setTestResult({
        ok: true,
        tags: (res as any).tagCount ?? 0,
        provenance: (res as any).provenance,
        transport: (res as any).transport,
      });
    } catch (e: any) {
      setTestResult({ ok: false, tags: 0, error: e.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtocolSection
      icon={<PlugIcon className="h-5 w-5" />}
      title="OPC-UA (Simulador em Nuvem / Leitura via Edge Gateway)"
      description="Fronteira rígida Cloud -> Edge Gateway -> Rede OT. Conexões diretas da nuvem para CLPs são bloqueadas."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Modo de execução">
            <select
              value={mode}
              onChange={(e) => {
                const next = e.target.value as EdgeExecutionMode;
                setMode(next);
                if (next === "SIMULATOR" && !endpoint) {
                  setEndpoint("opc.tcp://simulation:4840");
                }
              }}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="SIMULATOR">SIMULATOR (Laboratório virtual em memória)</option>
              <option value="EDGE_READ_ONLY">EDGE_READ_ONLY (Mediado por Edge Gateway)</option>
            </select>
          </FormField>
          {mode === "EDGE_READ_ONLY" && (
            <FormField label="Edge Gateway ID (Tenant)">
              <input
                type="text"
                value={gatewayId}
                onChange={(e) => setGatewayId(e.target.value)}
                placeholder="gw_lab_ete_01"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm font-mono"
              />
            </FormField>
          )}
        </div>
        <FormField label="Endpoint do servidor">
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={
              mode === "SIMULATOR" ? "opc.tcp://simulation:4840" : "opc.tcp://192.168.10.20:4840"
            }
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm font-mono"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Usuário (opcional)">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </FormField>
          <FormField label="Senha (opcional)">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </FormField>
        </div>
        <FormField label="Modo de segurança">
          <select
            value={securityMode}
            onChange={(e) => setSecurityMode(e.target.value as typeof securityMode)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="None">Nenhum (None)</option>
            <option value="Sign">Assinatura (Sign)</option>
            <option value="SignAndEncrypt">Assinatura + Criptografia (SignAndEncrypt)</option>
          </select>
        </FormField>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={!endpoint || testing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin" /> Testando...
              </>
            ) : (
              <>
                <Pulse className="h-4 w-4" /> Testar conexão
              </>
            )}
          </button>
          {testResult && (
            <div
              className={`flex items-center gap-1.5 text-sm ${
                testResult.ok ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {testResult.ok ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Validado ({testResult.provenance ?? "SIMULATED"} ·{" "}
                  {testResult.transport ?? "SIMULATOR"}) — {testResult.tags} tags
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  {testResult.error ?? "Falha na conexão"}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtocolSection>
  );
}

// ── Modbus TCP ──────────────────────────────────────────────────

function ModbusSection() {
  const [mode, setMode] = useState<EdgeExecutionMode>("SIMULATOR");
  const [host, setHost] = useState("simulation");
  const [gatewayId, setGatewayId] = useState("");
  const [port, setPort] = useState("502");
  const [unitId, setUnitId] = useState("1");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    provenance?: string;
    transport?: string;
    error?: string;
  } | null>(null);

  const testConn = useServerFn(testModbusHost);

  const handleTest = async () => {
    if (!host) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConn({
        data: {
          mode,
          host,
          port: Number(port) || 502,
          gatewayId: mode === "EDGE_READ_ONLY" ? gatewayId || undefined : undefined,
        },
      });
      setTestResult({
        ok: true,
        provenance: (res as any).provenance,
        transport: (res as any).transport,
      });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtocolSection
      icon={<Plug className="h-5 w-5" />}
      title="Modbus TCP (Simulador em Nuvem / Leitura via Edge Gateway)"
      description="Sockets TCP/DNS diretos da nuvem estão permanentemente bloqueados. Alvos reais exigem Edge Gateway provisionado."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Modo de execução">
            <select
              value={mode}
              onChange={(e) => {
                const next = e.target.value as EdgeExecutionMode;
                setMode(next);
                if (next === "SIMULATOR" && !host) {
                  setHost("simulation");
                }
              }}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="SIMULATOR">SIMULATOR (Laboratório virtual em memória)</option>
              <option value="EDGE_READ_ONLY">EDGE_READ_ONLY (Mediado por Edge Gateway)</option>
            </select>
          </FormField>
          {mode === "EDGE_READ_ONLY" && (
            <FormField label="Edge Gateway ID (Tenant)">
              <input
                type="text"
                value={gatewayId}
                onChange={(e) => setGatewayId(e.target.value)}
                placeholder="gw_lab_ete_01"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm font-mono"
              />
            </FormField>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <FormField label="Host / IP">
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={mode === "SIMULATOR" ? "simulation" : "192.168.10.20"}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm font-mono"
              />
            </FormField>
          </div>
          <FormField label="Porta">
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </FormField>
        </div>
        <FormField label="Unit ID">
          <input
            type="number"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            min={1}
            max={247}
            className="w-full max-w-[160px] h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </FormField>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={!host || testing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <>
                <CircleNotch className="h-4 w-4 animate-spin" /> Testando...
              </>
            ) : (
              <>
                <Pulse className="h-4 w-4" /> Testar conexão
              </>
            )}
          </button>
          {testResult && (
            <div
              className={`flex items-center gap-1.5 text-sm ${
                testResult.ok ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {testResult.ok ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Validado ({testResult.provenance ?? "SIMULATED"} ·{" "}
                  {testResult.transport ?? "SIMULATOR"})
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  {testResult.error ?? "Falha na conexão"}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtocolSection>
  );
}

// ── Shared Components ───────────────────────────────────────────

function ProtocolSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ProtocolArchitectureMatrix() {
  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">
          <HardDrives className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Classificação Arquitetural das Camadas de Protocolo</h2>
          <p className="text-sm text-muted-foreground">
            Transparência operacional (Gate 4.3.1): diferenciação explícita entre parser, simulador
            virtual, adaptador de bancada e transporte Edge→Cloud.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Camada</th>
              <th className="py-2 pr-3 font-medium">Classe Real</th>
              <th className="py-2 pr-3 font-medium">Local</th>
              <th className="py-2 font-medium">Proveniência / Limite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {PROTOCOL_LAYER_CLASSIFICATION.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-3 font-mono">{item.id}</td>
                <td className="py-2 pr-3 font-semibold">{item.implementationClass}</td>
                <td className="py-2 pr-3">{item.runtimeLocation}</td>
                <td className="py-2 text-muted-foreground">
                  {item.supportedProvenances.join(", ")} · Read-Only
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SecurityNotice() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
      <ShieldCheck className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-amber-600">Nota de segurança Cloud–Edge–OT</h3>
        <p className="text-xs text-muted-foreground">
          Sockets TCP diretos e resolução DNS da nuvem para a rede OT estão desativados. Loopback
          (127.0.0.1, localhost), metadata cloud (169.254.169.254) e IPs públicos são bloqueados, e
          escrita física em CLPs é permanentemente impedida (
          <code>IS_PHYSICAL_CONTROL_ALLOWED = false</code>).
        </p>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Info className="h-3 w-3" />
          Fluxo obrigatório para telemetria real: Rede OT → Edge Gateway (read-only) → HTTPS/mTLS →
          ElétricAI Cloud.
        </p>
      </div>
    </div>
  );
}
