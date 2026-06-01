import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Cable,
  Plug,
  ShieldCheck,
  Info,
  Activity,
  Server,
} from "lucide-react";
import { testOpcuaConnection } from "@/lib/opcua-server.functions";
import { testModbusHost } from "@/lib/modbus-server.functions";

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
      <SecurityNotice />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Protocolos Industriais</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure conexões OPC-UA e Modbus TCP para integração com CLPs, sensores e sistemas de
        supervisão.
      </p>
    </div>
  );
}

// ── OPC-UA ──────────────────────────────────────────────────────

function OpcUaSection() {
  const [endpoint, setEndpoint] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityMode, setSecurityMode] = useState<"None" | "Sign" | "SignAndEncrypt">("None");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    tags: number;
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
          endpoint,
          username: username || undefined,
          password: password || undefined,
          securityMode: securityMode || undefined,
        },
      });
      setTestResult({ ok: true, tags: (res as any).tagCount ?? 0 });
    } catch (e: any) {
      setTestResult({ ok: false, tags: 0, error: e.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtocolSection
      icon={<Cable className="h-5 w-5" />}
      title="OPC-UA"
      description="Conecte-se a servidores OPC-UA para ler/escrever tags de CLPs e dispositivos de campo."
    >
      <div className="space-y-4">
        <FormField label="Endpoint do servidor">
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="opc.tcp://192.168.0.10:4840"
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
                <Loader2 className="h-4 w-4 animate-spin" /> Testando...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" /> Testar conexão
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
                  <CheckCircle2 className="h-4 w-4" />
                  Conectado — {testResult.tags} tags encontradas
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
  const [host, setHost] = useState("");
  const [port, setPort] = useState("502");
  const [unitId, setUnitId] = useState("1");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const testConn = useServerFn(testModbusHost);

  const handleTest = async () => {
    if (!host) return;
    setTesting(true);
    setTestResult(null);
    try {
      await testConn({
        data: {
          host,
          port: Number(port) || 502,
        },
      });
      setTestResult({ ok: true });
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtocolSection
      icon={<Plug className="h-5 w-5" />}
      title="Modbus TCP"
      description="Conecte-se a dispositivos Modbus TCP (CLPs, inversores, medidores) via rede Ethernet industrial."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <FormField label="Host / IP">
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.0.100"
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
                <Loader2 className="h-4 w-4 animate-spin" /> Testando...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" /> Testar conexão
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
                  <CheckCircle2 className="h-4 w-4" />
                  Conexão estabelecida
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

function SecurityNotice() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
      <ShieldCheck className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-amber-600">Nota de segurança</h3>
        <p className="text-xs text-muted-foreground">
          As credenciais de protocolo são armazenadas apenas em sessão. Em caso de reinicialização
          do servidor, as conexões precisarão ser reestabelecidas. Acesso a hosts de loopback
          (127.0.0.1, localhost) e redes privadas restritas é bloqueado para prevenir ataques SSRF.
        </p>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Info className="h-3 w-3" />
          Para implantação multi-instância com estado persistente, configure Redis ou Upstash como
          backend de sessão.
        </p>
      </div>
    </div>
  );
}
