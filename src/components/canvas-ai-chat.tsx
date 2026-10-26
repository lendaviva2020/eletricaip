import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  MessageSquare,
  AlertTriangle,
  Settings2,
  Upload,
  ShieldCheck,
  Compass,
  Download,
  Bot,
} from "lucide-react";
import { callArchitect, applyArchitectToStore, AIServiceError } from "@/lib/ai-architect-client";
import { extractBriefingServerFn, getAiCredits } from "@/lib/ai-architect.functions";
import type { BriefingDocumentInput } from "@/lib/ai/briefing-parser";
import { useProjectStore } from "@/lib/project-store";
import { validateProject } from "@/lib/norm-validator";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { generateDiagramPatch } from "@/lib/diagram/ai.functions";
import { useDiagramStore } from "@/lib/diagram/store";
import { AiPatchPreview } from "@/components/ai-patch-preview";
import { detectFormat } from "@/lib/importer/universal-importer";
import { useI18n } from "@/lib/i18n";

interface Msg {
  role: "user" | "ai";
  text: string;
  error?: string;
  steps?: string[];
  needsConfig?: boolean;
  patchApplied?: boolean;
  hasPatch?: boolean;
  patchData?: any;
}

export function CanvasAiChat() {
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileStep, setFileStep] = useState("");
  const [patchMode, setPatchMode] = useState(true);
  const fetchCredits = useServerFn(getAiCredits);
  const extractBriefing = useServerFn(extractBriefingServerFn);
  const creditsQuery = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const creditInfo = useMemo(() => {
    const d = creditsQuery.data;
    if (!d || !d.ok) return { plan: "free", remainingLabel: t("aiChat.creditsPlaceholder") };
    if (d.unlimited) return { plan: d.plan, remainingLabel: t("aiChat.creditsUnlimited") };
    return {
      plan: d.plan,
      remainingLabel: t("aiChat.creditsRemaining", { remaining: d.remaining, max: d.max_credits }),
    };
  }, [creditsQuery.data, t]);
  const genPatch = useServerFn(generateDiagramPatch);
  const applyAiPatch = useDiagramStore((s) => s.applyAiPatch);
  const diagramDoc = useDiagramStore((s) => s.doc);

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: t("aiChat.initialGreeting"),
    },
  ]);

  // Keep first greeting in sync if user changes language before sending prompts
  useEffect(() => {
    const nextGreeting = t("aiChat.initialGreeting");
    setMsgs((m) => {
      if (m.length === 1 && m[0].role === "ai" && m[0].text !== nextGreeting) {
        return [{ ...m[0], text: nextGreeting }];
      }
      return m;
    });
  }, [locale, t]);

  const loadDemo = useProjectStore((s) => s.loadDemoFaulty);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read current workspace nodes and edges for dynamic compliance analysis
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);

  // Calculate active compliance findings in real time
  const findings = useMemo(() => validateProject(nodes, edges), [nodes, edges]);

  // Map findings to readable warning cards
  const normWarnings = useMemo(() => {
    if (findings.length === 0) {
      return [t("aiChat.allCompliant")];
    }
    return findings.map((f) => {
      const emoji = f.severity === "error" ? "🚨" : f.severity === "warn" ? "⚠️" : "ℹ️";
      return `${emoji} [${f.norm}]: ${f.title} — ${f.detail}`;
    });
  }, [findings, t]);

  const quickChips = useMemo(
    () => [
      { label: t("aiChat.quickDirectOnline"), prompt: t("aiChat.quickDirectOnlinePrompt") },
      { label: t("aiChat.quickSocketRcd"), prompt: t("aiChat.quickSocketRcdPrompt") },
      { label: t("aiChat.quickSoftStarter"), prompt: t("aiChat.quickSoftStarterPrompt") },
    ],
    [t],
  );

  // Refetch server-side credits when any IA call dispatches the event
  const refetchCredits = creditsQuery.refetch;
  useEffect(() => {
    const handler = () => refetchCredits();
    window.addEventListener("ai-usage-event", handler);
    return () => window.removeEventListener("ai-usage-event", handler);
  }, [refetchCredits]);

  const send = async (textToSend?: string, briefingDocument?: BriefingDocumentInput) => {
    const p = (textToSend ?? val).trim();
    if (!p || busy) return;
    if (!textToSend) setVal("");

    // Interceptação determinística de pacotes de projeto externos (0 créditos de IA)
    const detectedFmt = detectFormat(p);
    const isRecognizedBundle =
      detectedFmt !== "unknown" ||
      p.includes("eletricai.canvas-bundle") ||
      (p.includes('"nodes"') && p.includes('"edges"') && (p.includes('"format"') || p.includes('"project"'))) ||
      (p.startsWith("<?xml") && p.includes("tc6_xml"));

    if (isRecognizedBundle) {
      const fmtLabels: Record<string, string> = {
        "json-bundle": "JSON Canvas Bundle",
        "yaml-bundle": "YAML Canvas Bundle",
        "csv-table": "Tabela CSV (Cargas / I/O)",
        "plcopen-xml": "PLCopen XML (IEC 61131-3)",
        "st-program": "Structured Text (ST / SCL)",
        "txt-spec": "Especificação Técnica TXT",
        "netlist": "Netlist SPICE",
      };
      const label = detectedFmt !== "unknown" ? (fmtLabels[detectedFmt] || detectedFmt) : "Canvas Bundle";
      const summaryText = p.length > 120 ? `${p.slice(0, 100)}... [pacote ${label} com ${p.length} caracteres]` : p;
      setMsgs((m) => [
        ...m,
        { role: "user", text: summaryText },
        {
          role: "ai",
          text: `📦 **Pacote de Projeto Detectado (${label})!**\n\nOperação interceptada com sucesso **antes** do envio ao provedor de IA interna.\n\n🛡️ **0 créditos consumidos.** O conteúdo foi direcionado ao **Importador Universal Seguro** para inspeção estrutural, validação Zero Trust e renderização direta no Canvas.`,
        },
      ]);
      window.dispatchEvent(new CustomEvent("eletricai-open-importer", { detail: { payload: p } }));
      return;
    }

    // Alerta caso o usuário tente colar estrutura de circuito com formato desconhecido/quebrado
    const isAttemptedExternalData =
      (p.includes('"nodes"') || p.includes('"components"') || p.includes('"circuit"')) &&
      (p.startsWith("{") || p.startsWith("```") || p.startsWith("["));

    if (isAttemptedExternalData) {
      const summaryText = p.length > 120 ? `${p.slice(0, 100)}...` : p;
      setMsgs((m) => [
        ...m,
        { role: "user", text: summaryText },
        {
          role: "ai",
          text: "⚠️ **Formato de pacote externo não suportado.**\n\nO conteúdo colado parece uma tentativa de intercâmbio de circuito, mas não corresponde ao contrato universal **ElétricAi Canvas Bundle (v1.0.0)** nem aos formatos seguros suportados (YAML, CSV, PLCopen XML, ST/SCL ou TXT).\n\n💡 **Como corrigir:** Solicite à sua IA externa que formate a resposta especificamente no padrão `eletricai.canvas-bundle`. Você pode copiar o prompt pronto na aba **\"4. Exportar & Prompts para IA Externa\"** do Importador Universal (0 créditos).",
        },
      ]);
      return;
    }

    setMsgs((m) => [
      ...m,
      { role: "user", text: p },
      {
        role: "ai",
        text: patchMode ? t("aiChat.generatingPatch") : t("aiChat.processingPrompt"),
      },
    ]);
    setBusy(true);

    try {
      const activeViolationsText = findings
        .map(
          (f) =>
            `- [${isEn ? "Standard" : "Norma"} ${f.norm} - ${isEn ? "Severity" : "Gravidade"} ${f.severity.toUpperCase()}]: ${f.title}. ${isEn ? "Detail" : "Detalhe"}: ${f.detail}. ${isEn ? "Suggested Fix" : "Dica de Correção"}: ${f.fixHint || "N/A"}`,
        )
        .join("\n");

      const contextualPrompt = activeViolationsText
        ? isEn
          ? `[ACTIVE ERRORS/VIOLATIONS CONTEXT ON CANVAS]:\n${activeViolationsText}\n\n[USER REQUEST]:\n${p}\n\nPlease respond suggesting electrical design improvements complying with IEC 60364, NFPA 70E, and ISA-18.2, generating a new corrected diagram if requested.`
          : `[CONTEXTO DE ERROS/VIOLAÇÕES ATIVAS NO CANVAS ELETRICAIP]:\n${activeViolationsText}\n\n[SOLICITAÇÃO DO USUÁRIO]:\n${p}\n\nPor favor, responda sugerindo melhorias elétricas conforme ABNT NBR 5410, NR-10 e ISA-18.2, gerando um novo diagrama corrigido se solicitado.`
        : p;

      if (patchMode) {
        const res: any = await genPatch({
          data: {
            prompt: contextualPrompt,
            doc: diagramDoc,
            locale,
            ...(briefingDocument ? { briefingDocument } : {}),
          },
        });
        if (!res || res.ok !== true) {
          const code = res?.error?.code ?? "UNKNOWN";
          const message =
            res?.error?.message ?? (isEn ? "The AI did not return a valid patch. Please rephrase." : "A IA não retornou um patch válido. Tente reformular o pedido.");
          const needsConfig = ["MISSING_KEY", "AUTH_401", "INSUFFICIENT_CREDITS"].includes(code);
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "ai", text: `[${code}] ${message}`, needsConfig };
            return c;
          });
        } else {
          applyAiPatch(res.patch);
          window.dispatchEvent(new Event("ai-usage-event"));
          const {
            addNodes = [],
            addEdges = [],
            removeNodeIds = [],
            removeEdgeIds = [],
            updateNodes = [],
            rationale,
          } = res.patch ?? {};
          setMsgs((m) => {
            const c = [...m];
            const title = t("aiChat.patchAppliedTitle");
            c[c.length - 1] = {
              role: "ai",
              text: `**${title}**\n\n${rationale ?? ""}\n\n• +${addNodes.length} ${isEn ? "nodes" : "nós"} · +${addEdges.length} edges\n• ~${updateNodes.length} updates · −${removeNodeIds.length} ${isEn ? "nodes" : "nós"} / −${removeEdgeIds.length} edges`,
              patchApplied: true,
            };
            return c;
          });
        }
      } else {
        const r = await callArchitect(contextualPrompt, true, briefingDocument, locale);
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = {
            role: "ai",
            text: `**${r.title}**\n\n${r.rationale}\n\n* CCM: ${r.ccm.columns} colunas / ${r.ccm.cells} gavetas\n* Trafo: ${r.transformer.kVA}kVA (${r.transformer.primary_kV}kV → ${r.transformer.secondary_V}V)\n* Motores adicionados: ${r.motors.map((mo) => `${mo.id} (${mo.power_kW}kW)`).join(", ")}`,
            hasPatch: true,
            patchData: r,
          };
          return c;
        });
      }
    } catch (e: any) {
      const isSvc = e instanceof AIServiceError;
      // Tenta extrair status do erro do middleware (Response-like ou Error com mensagem).
      const rawMsg = String(e?.message ?? e ?? "");
      const isAuth = rawMsg.includes("Unauthorized") || rawMsg.includes("401");
      const isRate =
        rawMsg.includes("BURST_LIMIT") ||
        rawMsg.includes("PLAN_RATE_LIMIT") ||
        rawMsg.includes("429");
      const isQuota = rawMsg.includes("AI_QUOTA") || rawMsg.includes("insufficient_credits");

      const friendly = isSvc
        ? e.userMessage
        : isAuth
          ? "Sessão necessária. Faça login para usar a IA."
          : isRate
            ? "Limite de requisições atingido. Aguarde alguns segundos ou faça upgrade do plano."
            : isQuota
              ? "Créditos de IA insuficientes neste mês. Faça upgrade do plano."
              : (e?.message ?? "Falha ao gerar resposta da IA.");
      const steps = isSvc ? e.steps : undefined;
      const needsConfig =
        (isSvc &&
          ["MISSING_KEY", "INVALID_KEY_FORMAT", "AUTH_401", "NO_CREDITS_402"].includes(e.code)) ||
        isAuth ||
        isQuota;

      console.error("[CanvasAiChat] send failed:", e);
      setMsgs((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "ai", text: friendly, steps, needsConfig };
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  // Pipeline real de extração de documentos de briefing (CSV / TXT / JSON / PDF) no servidor (Fase 6.1)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf";
    const isSupportedText =
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".json") ||
      lowerName.endsWith(".md") ||
      file.type.startsWith("text/");

    if (!isPdf && !isSupportedText) {
      setMsgs((m) => [
        ...m,
        { role: "user", text: `[Arquivo enviado: ${file.name}]` },
        {
          role: "ai",
          text: `Formato não suportado (${file.name}). Envie um arquivo de briefing em **.csv**, **.txt**, **.json** ou **.pdf**.`,
        },
      ]);
      return;
    }

    try {
      setFileLoading(true);
      setFileStep("Extraindo e validando especificações de engenharia...");

      let docInput: BriefingDocumentInput;
      if (isPdf) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        docInput = {
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          content: btoa(binary),
          encoding: "base64",
        };
      } else {
        const text = await file.text();
        docInput = {
          fileName: file.name,
          mimeType: file.type || "text/plain",
          content: text.slice(0, 200_000),
          encoding: "utf8",
        };
      }

      const extractedRes = await extractBriefing({ data: docInput });
      const briefing = extractedRes.briefing;

      setFileLoading(false);
      setFileStep("");

      if (isPdf && !briefing.extractedText.trim() && briefing.motors.length === 0) {
        setMsgs((m) => [
          ...m,
          { role: "user", text: `[Arquivo enviado: ${file.name}]` },
          {
            role: "ai",
            text: `📄 O PDF **${file.name}** não possui camada de texto selecionável (provável imagem escaneada).\n\nEnvie uma lista de cargas em **.csv**, **.txt** ou um **.pdf** com texto selecionável.`,
          },
        ]);
        return;
      }

      const motorCountMsg =
        briefing.motors.length > 0
          ? `(${briefing.motors.length} motores identificados: ${briefing.motors.map((m) => `${m.id} ${m.power_kW}kW`).join(", ")})`
          : "";

      const promptWithFile = `[Briefing anexado: ${file.name}] ${motorCountMsg}\n\n${briefing.formattedPromptBlock}\n\nProjete a arquitetura elétrica completa correspondente ao briefing acima em conformidade com a NBR 5410 e NR-12.`;
      await send(promptWithFile, docInput);
    } catch (err) {
      setFileLoading(false);
      setFileStep("");
      setMsgs((m) => [
        ...m,
        { role: "user", text: `[Arquivo: ${file.name}]` },
        {
          role: "ai",
          text: `Erro ao processar o briefing: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  };

  const handleApplyPatch = (msgIndex: number, data: any) => {
    applyArchitectToStore(data, { mode: "merge" });
    setMsgs((m) => {
      const next = [...m];
      next[msgIndex] = { ...next[msgIndex], patchApplied: true };
      return next;
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-6 right-6 z-20 h-12 w-12 rounded-full grid place-items-center text-primary-foreground glow-primary shadow-lg hover:scale-105 transition-transform cursor-pointer"
        style={{ background: "var(--gradient-primary)" }}
        aria-label="Abrir IA no canvas"
      >
        <Sparkles className="h-5 w-5 animate-pulse" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 z-20 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-lg border border-primary/30 flex flex-col shadow-2xl overflow-hidden glass-strong bg-background/95">
      {/* HEADER CONTROLS */}
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-card/40">
        <Sparkles className="h-4 w-4 text-primary animate-spin" />
        <div className="flex flex-col">
          <span className="text-[11px] font-display font-bold tracking-wider text-foreground">
            {t("aiChat.title")}
          </span>
          <span className="text-[9px] text-primary/80 font-mono tracking-tight font-medium uppercase">
            {creditInfo.remainingLabel}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPatchMode((v) => !v)}
            title="Alterna entre patch validado (WebGL) e arquiteto legado"
            className={`h-6 px-2 rounded text-[9px] font-medium border inline-flex items-center gap-1 cursor-pointer ${patchMode ? "border-primary/60 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-accent/40"}`}
          >
            <Sparkles className="h-3 w-3" /> {patchMode ? t("aiChat.modePatch") : t("aiChat.modeLegacy")}
          </button>
          <button
            onClick={loadDemo}
            title="Carregar exemplo com falhas para testar validador"
            className="h-6 px-2 rounded text-[9px] font-medium border border-warning/40 text-warning hover:bg-warning/10 inline-flex items-center gap-1 cursor-pointer"
          >
            <AlertTriangle className="h-3 w-3" /> {t("aiChat.demoFaulty")}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 grid place-items-center rounded hover:bg-accent/50 cursor-pointer text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* FILE SCAN LOADER */}
      {fileLoading && (
        <div className="shrink-0 p-3 border-b border-border bg-primary/10 flex items-center gap-3 animate-pulse">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <div className="flex-1 flex flex-col">
            <span className="text-[10px] font-bold text-primary uppercase">{t("aiChat.ocrActive")}</span>
            <span className="text-[10px] text-muted-foreground">{fileStep || t("aiChat.ocrExtracting")}</span>
          </div>
        </div>
      )}

      {/* MESSAGE AND SUGGESTION BOX */}
      <div className="flex-1 overflow-auto scrollbar-thin p-3 space-y-3">
        {/* Proactive ISA / NR Normative Suggestions */}
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2">
          <div className="text-[9px] font-display font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" />
            <span>{t("aiChat.normAlertsTitle")}</span>
          </div>
          <div className="space-y-1.5">
            {normWarnings.map((warn, index) => (
              <div
                key={index}
                className="text-[10px] font-mono text-muted-foreground leading-normal"
              >
                {warn}
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic chat thread */}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`rounded-md p-2.5 text-[11px] leading-relaxed relative ${
              m.role === "ai"
                ? "bg-primary/5 border border-primary/15 mr-4"
                : "bg-card border border-border ml-4 text-foreground/95"
            }`}
          >
            <div className="text-[8px] uppercase tracking-wider mb-0.5 font-bold text-muted-foreground">
              {m.role === "ai" ? t("aiChat.aiRole") : t("aiChat.userRole")}
            </div>
            <div className="whitespace-pre-wrap font-mono text-[11px] text-foreground/90">
              {m.text}
            </div>

            {m.steps && (
              <ol className="list-decimal list-inside mt-2 space-y-0.5 text-[10px] text-foreground/80 font-mono">
                {m.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            )}

            {m.needsConfig && (
              <Link
                to="/settings/ai-status"
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-primary hover:underline font-mono"
              >
                <Settings2 className="h-3 w-3" /> {t("aiChat.configAiKey")}
              </Link>
            )}

            {m.hasPatch && !m.patchApplied && (
              <div className="mt-3">
                <AiPatchPreview
                  patch={m.patchData?.patch ?? m.patchData}
                  onApply={() => handleApplyPatch(i, m.patchData)}
                  onCancel={() => {
                    setMsgs((prev) =>
                      prev.map((msg, idx) => (idx === i ? { ...msg, hasPatch: false } : msg)),
                    );
                  }}
                />
              </div>
            )}
            {m.hasPatch && m.patchApplied && (
              <div className="mt-3 pt-2 border-t border-border/60">
                <span className="text-[9px] text-success font-mono">{t("aiChat.patchAppliedSuccess")}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* INPUT AND BRIEFING UPLOAD BAR */}
      <div className="shrink-0 p-2 border-t border-border bg-card/10">
        <div className="flex gap-1.5 mb-1.5">
          <input
            type="file"
            aria-label="Enviar briefing de engenharia"
            title="Enviar briefing de engenharia"
            accept=".pdf,.csv,.txt"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload de Briefing de Engenharia (PDF / CSV)"
            className="h-8 px-2.5 rounded border border-border bg-card hover:bg-accent/40 text-[10px] inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{t("aiChat.uploadBriefing")}</span>
          </button>

          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("eletricai-open-importer", { detail: { initialTab: "export" } }),
              )
            }
            title="Copiar prompt padronizado para ChatGPT, Claude ou DeepSeek (0 créditos)"
            className="h-8 px-2 rounded border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-[10px] inline-flex items-center gap-1 cursor-pointer text-blue-600 dark:text-blue-400 font-semibold"
          >
            <Bot className="h-3 w-3" />
            <span>Prompt IA Externa</span>
          </button>

          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("eletricai-open-importer", { detail: { initialTab: "input" } }),
              )
            }
            title="Importar projeto externo em JSON seguro (0 créditos)"
            className="h-8 px-2 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] inline-flex items-center gap-1 cursor-pointer text-emerald-600 dark:text-emerald-400 font-semibold"
          >
            <Download className="h-3 w-3" />
            <span>Importar JSON</span>
          </button>
        </div>

        {/* Quick prompt suggestion pills */}
        <div className="flex flex-wrap gap-1 mb-1.5">
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => send(chip.prompt)}
              disabled={busy}
              className="px-2 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            aria-label="Prompt do copiloto IA do canvas"
            title="Prompt do copiloto IA do canvas"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={t("aiChat.promptPlaceholder")}
            className="w-full resize-none rounded-md bg-input border border-border p-2 pr-9 text-[11px] outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <button
            onClick={() => send()}
            disabled={busy || !val.trim()}
            className="absolute right-1.5 bottom-1.5 h-7 w-7 grid place-items-center rounded text-primary-foreground glow-primary disabled:opacity-50 cursor-pointer"
            style={{ background: "var(--gradient-primary)" }}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="mt-1 text-[8px] text-muted-foreground flex items-center gap-1 font-mono">
          <MessageSquare className="h-2.5 w-2.5" /> {t("aiChat.enterHint")}
        </div>
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  size,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded font-semibold transition-all disabled:opacity-50 ${
        size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${
        disabled
          ? "bg-accent/40 text-muted-foreground cursor-not-allowed"
          : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95 cursor-pointer"
      } ${className}`}
    >
      {children}
    </button>
  );
}
