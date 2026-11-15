import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Sparkle,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  Key,
  ShieldWarning,
  ArrowSquareOut,
  Cpu,
  PlugsConnected,
  Code,
  Wrench,
  Database,
  ChatCircleText,
  FlowArrow,
  ShieldCheck,
  HardDrives,
} from "@phosphor-icons/react";
import {
  pingArchitectHealth,
  getStatusEvents,
  fetchAiStatusEvents,
} from "@/lib/ai-architect-client";
import {
  configureAiGatewayProviderServerFn,
  getAiGatewayStatusServerFn,
  probeLocalOllamaServerFn,
  testAiGatewayConnectionServerFn,
  testAiStructuredResponseServerFn,
  validateAiModelCapabilitiesServerFn,
} from "@/lib/ai/gateway/ai-gateway.functions";
import type {
  AiConnectionState,
  AiGatewayHealthStatus,
  AiProviderId,
} from "@/lib/ai/gateway/types";

export const Route = createFileRoute("/settings/ai-status")({
  head: () => ({
    meta: [
      { title: "Configurações → Inteligência Artificial · EletricAI Industrial OS" },
      {
        name: "description",
        content:
          "Gateway Central de IA, Registro de Provedores, Roteador de Modelos, Validação de Capacidades e Agente de Engenharia.",
      },
    ],
  }),
  component: AiSettingsPage,
});

function AiSettingsPage() {
  const getGatewayStatus = useServerFn(getAiGatewayStatusServerFn);
  const configureProvider = useServerFn(configureAiGatewayProviderServerFn);
  const testConnection = useServerFn(testAiGatewayConnectionServerFn);
  const validateCapabilities = useServerFn(validateAiModelCapabilitiesServerFn);
  const testStructured = useServerFn(testAiStructuredResponseServerFn);
  const probeOllama = useServerFn(probeLocalOllamaServerFn);

  const [gateway, setGateway] = useState<AiGatewayHealthStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>("gemini");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-flash-preview");
  const [uiStateOverride, setUiStateOverride] = useState<AiConnectionState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionResultBanner, setActionResultBanner] = useState<{
    tone: "ok" | "warn" | "err";
    title: string;
    detail: string;
  } | null>(null);
  const [legacyEvents, setLegacyEvents] = useState(getStatusEvents());

  const loadStatus = async (runLivePing = false, checkOllama = false) => {
    setBusyAction("status");
    try {
      const status = await getGatewayStatus({
        data: { runLivePing, probeOllama: checkOllama },
      });
      setGateway(status);
      setSelectedProvider(status.activeProvider);
      setSelectedModel(status.activeModel);
      setUiStateOverride(null);
    } catch {
      const legacy = await pingArchitectHealth();
      setLegacyEvents(await fetchAiStatusEvents());
      const legacyModel =
        legacy && typeof legacy === "object" && "model" in legacy
          ? (legacy as { model?: unknown }).model
          : undefined;
      if (legacy) {
        setSelectedModel(
          typeof legacyModel === "string" && legacyModel ? legacyModel : "gemini-3-flash-preview",
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    void loadStatus(true, true);
  }, []);

  const activeProviderMeta = gateway?.providers.find((p) => p.provider === selectedProvider);
  const effectiveState: AiConnectionState =
    uiStateOverride ?? activeProviderMeta?.connectionState ?? gateway?.state ?? "NOT_CONFIGURED";

  const handleApplyProviderAndModel = async () => {
    setBusyAction("configure");
    setUiStateOverride("CONFIGURING");
    try {
      const updated = await configureProvider({
        data: {
          provider: selectedProvider,
          model: selectedModel,
        },
      });
      setGateway(updated);
      setUiStateOverride(null);
      setActionResultBanner({
        tone: "ok",
        title: "Provedor e modelo configurados no AI Gateway",
        detail: `Provedor ativo: ${updated.activeProvider} · Modelo selecionado: ${updated.activeModel}`,
      });
    } catch (err) {
      setUiStateOverride("ERROR");
      setActionResultBanner({
        tone: "err",
        title: "Falha ao configurar provedor",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestConnection = async () => {
    setBusyAction("test_connection");
    setUiStateOverride("CONFIGURING");
    try {
      const res = await testConnection({
        data: { provider: selectedProvider, model: selectedModel },
      });
      await loadStatus(false, false);
      setUiStateOverride(res.state);
      setActionResultBanner({
        tone: res.ok ? "ok" : "err",
        title: res.ok
          ? `Conexão real verificada (${res.provider} · ${res.model})`
          : `Falha no teste de conexão (${res.state})`,
        detail: res.ok
          ? `HTTP ${res.httpStatus ?? 200} em ${res.latencyMs} ms · Resposta: "${res.responsePreview ?? "OK"}"`
          : res.error || "Sem comunicação com o provedor.",
      });
    } catch (err) {
      setUiStateOverride("ERROR");
      setActionResultBanner({
        tone: "err",
        title: "Erro ao testar conexão",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleValidateCapabilities = async () => {
    setBusyAction("validate_capabilities");
    try {
      const res = await validateCapabilities({
        data: { provider: selectedProvider, model: selectedModel },
      });
      await loadStatus(false, false);
      setActionResultBanner({
        tone: res.ok ? "ok" : "warn",
        title: res.ok
          ? `Capacidades validadas em ${res.model} (${res.latencyMs} ms)`
          : `Validação parcial/falha (${res.model})`,
        detail: res.ok
          ? `Texto: OK · JSON Estruturado: OK · Tool Calling: ${res.verifiedCapabilities.toolCalling ? "OK" : "N/A"} · Streaming: ${res.verifiedCapabilities.streaming ? "OK" : "N/A"}`
          : res.error || "Não foi possível validar todas as capacidades.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestStructuredOutput = async () => {
    setBusyAction("test_structured");
    try {
      const res = await testStructured({
        data: { provider: selectedProvider, model: selectedModel },
      });
      await loadStatus(false, false);
      if (res.ok) {
        setActionResultBanner({
          tone: "ok",
          title: `Resposta estruturada validada com Zod (${res.provider} · ${res.model})`,
          detail: `Latência: ${res.durationMs} ms · Tokens: ${res.tokensUsed} · Payload: ${JSON.stringify(res.data)}`,
        });
      } else {
        setActionResultBanner({
          tone: "err",
          title: "Falha no teste de resposta estruturada",
          detail: res.error.message,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleCheckAvailability = async () => {
    setBusyAction("availability");
    try {
      await probeOllama({});
      await loadStatus(true, true);
      setActionResultBanner({
        tone: "ok",
        title: "Disponibilidade de provedores atualizada",
        detail: "Verificação executada nos provedores configurados e no runtime local Ollama.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const auditEvents = gateway?.recentAuditEvents ?? [];
  const failureEvents = gateway?.recentFailures ?? [];

  return (
    <div className="flex-1 overflow-auto scrollbar-thin" data-testid="ai-settings-page">
      <div className="max-w-[1080px] mx-auto p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-2">
              <Sparkle className="h-3 w-3" /> CONFIGURAÇÕES → INTELIGÊNCIA ARTIFICIAL
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              AI Gateway & Agente de Engenharia Industrial
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Provedor ativo:{" "}
              <span className="font-mono text-foreground" data-testid="ai-active-provider">
                {gateway?.activeProvider ?? selectedProvider}
              </span>{" "}
              · Modelo selecionado:{" "}
              <span className="font-mono text-foreground" data-testid="ai-active-model">
                {gateway?.activeModel ?? selectedModel}
              </span>{" "}
              · Estado:{" "}
              <span
                className="font-mono font-semibold text-foreground"
                data-testid="ai-connection-state"
              >
                {effectiveState}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="btn-check-availability"
              onClick={handleCheckAvailability}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent disabled:opacity-50"
            >
              <ArrowsClockwise
                className={`h-3.5 w-3.5 ${busyAction === "availability" || busyAction === "status" ? "animate-spin" : ""}`}
              />
              Consultar disponibilidade
            </button>
            <button
              type="button"
              data-testid="btn-test-connection"
              onClick={handleTestConnection}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <PlugsConnected className="h-3.5 w-3.5" />
              Testar conexão
            </button>
          </div>
        </header>

        {actionResultBanner && (
          <div
            data-testid="ai-action-banner"
            className={`rounded-xl border p-4 text-xs ${
              actionResultBanner.tone === "ok"
                ? "border-success/40 bg-success/10 text-foreground"
                : actionResultBanner.tone === "warn"
                  ? "border-warning/40 bg-warning/10 text-foreground"
                  : "border-destructive/40 bg-destructive/10 text-foreground"
            }`}
          >
            <div className="font-semibold">{actionResultBanner.title}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              {actionResultBanner.detail}
            </div>
          </div>
        )}

        {/* Primary Telemetry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card
            icon={PlugsConnected}
            label="Estado da Conexão"
            tone={
              effectiveState === "CONNECTED"
                ? "ok"
                : effectiveState === "DEGRADED" || effectiveState === "CONFIGURING"
                  ? "warn"
                  : "err"
            }
            value={effectiveState}
            hint={
              gateway?.lastCheckedAt
                ? `Última verificação: ${new Date(gateway.lastCheckedAt).toLocaleTimeString()}`
                : "Aguardando verificação"
            }
          />
          <Card
            icon={Key}
            label="Credencial Server-Side"
            tone={activeProviderMeta?.credentialConfigured ? "ok" : "err"}
            value={
              activeProviderMeta?.credentialConfigured
                ? activeProviderMeta.credentialValidFormat
                  ? "CONFIGURADA"
                  : "FORMATO INVÁLIDO"
                : "NÃO CONFIGURADA"
            }
            hint={activeProviderMeta?.credentialMaskedPreview ?? "GEMINI_API_KEY"}
          />
          <Card
            icon={Cpu}
            label="Consumo de Tokens"
            tone="ok"
            value={`${gateway?.usageStats.totalTokens ?? 0} tok`}
            hint={`${gateway?.usageStats.successfulRequests ?? 0} chamadas OK · US$ ${(gateway?.usageStats.estimatedCostUsd ?? 0).toFixed(4)}`}
          />
          <Card
            icon={ShieldCheck}
            label="Segurança Física Industrial"
            tone="ok"
            value="VIRTUAL ONLY"
            hint="IS_PHYSICAL_CONTROL_ALLOWED = false"
          />
        </div>

        {/* Provider & Model Configuration Controls */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Configuração do Provedor e Modelo
              </h2>
              <p className="text-xs text-muted-foreground">
                Selecione o provedor, escolha o modelo verificado e valide capacidades reais antes
                da execução.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="btn-configure-provider"
                onClick={handleApplyProviderAndModel}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent disabled:opacity-50"
              >
                Configurar provedor
              </button>
              <button
                type="button"
                data-testid="btn-validate-capabilities"
                onClick={handleValidateCapabilities}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Validar capacidades
              </button>
              <button
                type="button"
                data-testid="btn-test-structured"
                onClick={handleTestStructuredOutput}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent disabled:opacity-50"
              >
                <Code className="h-3.5 w-3.5" />
                Testar resposta estruturada
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Provedor de IA
              </label>
              <select
                data-testid="select-ai-provider"
                value={selectedProvider}
                onChange={(e) => {
                  const nextProv = e.target.value as AiProviderId;
                  setSelectedProvider(nextProv);
                  const meta = gateway?.providers.find((p) => p.provider === nextProv);
                  if (meta) setSelectedModel(meta.model);
                }}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-mono"
              >
                {(gateway?.providers ?? []).map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.label} ({p.provider}) — {p.connectionState}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Selecionar Modelo
              </label>
              <select
                data-testid="select-ai-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-mono"
              >
                {(
                  activeProviderMeta?.availableModels ?? [
                    "gemini-3-flash-preview",
                    "gemini-3.5-flash-lite",
                    "gemini-3.1-flash-lite",
                  ]
                ).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Explicit Credential Guidance When Not Configured or Degraded */}
          {activeProviderMeta &&
            (!activeProviderMeta.credentialConfigured ||
              effectiveState === "NOT_CONFIGURED" ||
              effectiveState === "DISCONNECTED" ||
              effectiveState === "ERROR") && (
              <div
                data-testid="ai-credential-guidance"
                className="rounded-xl border border-destructive/40 bg-destructive/5 p-4"
              >
                <div className="flex items-start gap-3">
                  <WarningCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs space-y-1.5">
                    <div className="font-semibold text-destructive">
                      Orientação de Configuração — {activeProviderMeta.label} ({effectiveState})
                    </div>
                    <p className="text-foreground/90">{activeProviderMeta.credentialGuidance}</p>
                    {activeProviderMeta.lastError && (
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Detalhe diagnóstico: {activeProviderMeta.lastError}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Variável requerida no servidor:{" "}
                      <code className="px-1 py-0.5 rounded bg-muted font-mono">
                        {activeProviderMeta.credentialEnvVar}
                      </code>{" "}
                      (jamais exposta no navegador).{" "}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="underline inline-flex items-center gap-1 text-primary"
                      >
                        Google AI Studio <ArrowSquareOut className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
        </section>

        {/* Subsystems & Capabilities Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FlowArrow className="h-4 w-4 text-primary" />
              Estado dos Subsistemas de Engenharia
            </h2>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <SubsystemBadge
                icon={Database}
                label="Estado da Memória"
                status={gateway?.subsystems.memory ?? "READY"}
              />
              <SubsystemBadge
                icon={ChatCircleText}
                label="Estado do Chat"
                status={gateway?.subsystems.chat ?? "BLOCKED"}
              />
              <SubsystemBadge
                icon={FlowArrow}
                label="Geração de Diagramas"
                status={gateway?.subsystems.diagramGeneration ?? "BLOCKED"}
              />
              <SubsystemBadge
                icon={ShieldWarning}
                label="Análise de Engenharia"
                status={gateway?.subsystems.engineeringAnalysis ?? "BLOCKED"}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HardDrives className="h-4 w-4 text-primary" />
              Recursos Disponíveis & Runtime Local (Ollama)
            </h2>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 rounded border border-border bg-muted/40">
                Streaming: {activeProviderMeta?.capabilities.streaming ? "SIM" : "NÃO"}
              </span>
              <span className="px-2 py-1 rounded border border-border bg-muted/40">
                JSON Estruturado:{" "}
                {activeProviderMeta?.capabilities.structuredOutput ? "SIM" : "NÃO"}
              </span>
              <span className="px-2 py-1 rounded border border-border bg-muted/40">
                Tool Calling (18 tools):{" "}
                {activeProviderMeta?.capabilities.toolCalling ? "SIM" : "NÃO"}
              </span>
              <span className="px-2 py-1 rounded border border-border bg-muted/40">
                Max Output: {activeProviderMeta?.maxOutputTokens ?? 4096} tok
              </span>
            </div>
            <div className="text-xs text-muted-foreground border-t border-border pt-2">
              <span className="font-medium text-foreground">Ollama Local:</span>{" "}
              {gateway?.ollamaStatus.reachable
                ? `Conectado em ${gateway.ollamaStatus.endpoint} (${gateway.ollamaStatus.installedModels.join(", ") || "sem modelos"})`
                : `Inacessível (${gateway?.ollamaStatus.endpoint ?? "http://127.0.0.1:11434"}) — ${gateway?.ollamaStatus.error ?? "serviço local offline"}`}
            </div>
          </section>
        </div>

        {/* Audit History & Failures Table */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Histórico de Auditoria e Falhas ({auditEvents.length} chamadas ·{" "}
              {failureEvents.length} falhas)
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Quando</th>
                  <th className="text-left font-medium px-3 py-2">Operação / Módulo</th>
                  <th className="text-left font-medium px-3 py-2">Provedor / Modelo</th>
                  <th className="text-left font-medium px-3 py-2">Resultado</th>
                  <th className="text-right font-medium px-3 py-2">Tokens</th>
                  <th className="text-right font-medium px-3 py-2">Latência</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.length === 0 && legacyEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhuma chamada registrada ainda nesta sessão.
                    </td>
                  </tr>
                )}
                {auditEvents.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {e.operation} <span className="text-muted-foreground">({e.module})</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono">
                      {e.provider} · {e.model}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-medium ${e.ok ? "text-success" : "text-destructive"}`}
                    >
                      {e.ok ? "✓ OK" : `✗ ${e.errorCode ?? "ERRO"}`}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{e.totalTokens}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{e.durationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function SubsystemBadge({
  icon: Icon,
  label,
  status,
}: {
  icon: any;
  label: string;
  status: string;
}) {
  const tone =
    status === "READY"
      ? "border-success/30 bg-success/5 text-success"
      : status === "DEGRADED"
        ? "border-warning/30 bg-warning/5 text-warning"
        : "border-destructive/30 bg-destructive/5 text-destructive";
  return (
    <div className={`rounded-lg border p-2.5 flex items-center justify-between ${tone}`}>
      <span className="flex items-center gap-1.5 text-foreground font-medium">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-mono text-[11px] font-semibold">{status}</span>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "ok" | "warn" | "err";
  hint?: string;
}) {
  const c =
    tone === "ok"
      ? "text-success border-success/30 bg-success/5"
      : tone === "warn"
        ? "text-warning border-warning/30 bg-warning/5"
        : "text-destructive border-destructive/30 bg-destructive/5";
  return (
    <div className={`rounded-xl border p-4 ${c}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-mono mt-1 font-semibold">{value}</div>
      {hint && <div className="text-[11px] mt-1 text-muted-foreground line-clamp-2">{hint}</div>}
    </div>
  );
}
