import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sparkle,
  PaperPlaneRight,
  CircleNotch,
  X,
  ChatText,
  Warning,
  UploadSimple,
  ShieldCheck,
  Compass,
  DownloadSimple,
  Robot,
} from "@phosphor-icons/react";
import { applyArchitectToStore, AIServiceError } from "@/lib/ai-architect-client";
import { extractBriefingServerFn, getAiCredits } from "@/lib/ai-architect.functions";
import type { BriefingDocumentInput } from "@/lib/ai/briefing-parser";
import { useProjectStore } from "@/lib/project-store";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { generateDiagramPatch } from "@/lib/diagram/ai.functions";
import { getAiProviderPreference, setAiProviderPreference } from "@/lib/ai-preference.functions";
import {
  detectProviderIntent,
  switchConfirmation,
  whichProviderAnswer,
} from "@/lib/ai/provider-switch";
import { useDiagramStore } from "@/lib/diagram/store";
import { AiPatchPreview } from "@/components/ai-patch-preview";
import { detectFormat } from "@/lib/importer/universal-importer";
import { useI18n } from "@/lib/i18n";
import { getOrCreateProjectConversation, persistChatMessage } from "@/lib/ai-chat.functions";
import { askEditorAssistant } from "@/lib/ai/editor-assistant.functions";
import { editorKeyFromMode, type AssistantEditor } from "@/lib/ai/editor-context";
import {
  readEditorContext,
  runEditorActions,
  type UndoPoint,
} from "@/lib/ai/editor-assistant-client";
import { useEditorStore } from "@/lib/editor/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  formatDiagnosticFor7StepRemediation,
  type DiagnosticContext,
} from "@/lib/diagnostics/ai-repair-context";

interface Msg {
  role: "user" | "ai";
  text: string;
  error?: string;
  steps?: string[];
  needsConfig?: boolean;
  patchApplied?: boolean;
  hasPatch?: boolean;
  patchData?: any;
  /** Ponto de restauração das ações do assistente ("Desfazer"). */
  undoId?: string;
  undone?: boolean;
}

export function CanvasAiChat() {
  const { locale, t } = useI18n();
  const isEn = locale === "en";
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileStep, setFileStep] = useState("");
  // Padrão: assistente (conversa + ações). "Alterar diagrama" força o motor de patch.
  const [patchMode, setPatchMode] = useState(false);
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
  const askAssistant = useServerFn(askEditorAssistant);
  const getProviderPref = useServerFn(getAiProviderPreference);
  const setProviderPref = useServerFn(setAiProviderPreference);
  const applyAiPatch = useDiagramStore((s) => s.applyAiPatch);
  const diagramDoc = useDiagramStore((s) => s.doc);

  const projectId = useProjectStore((s) => s.projectId);
  const activeMode = useEditorStore((s) => s.activeMode);
  const editorKey: AssistantEditor = editorKeyFromMode(activeMode);
  const getOrCreateConv = useServerFn(getOrCreateProjectConversation);
  const persistMsg = useServerFn(persistChatMessage);

  // Uma conversa por editor: o que se fala no unifilar não vai para o Ladder.
  const greetingFor = useCallback(
    (key: AssistantEditor): Msg => ({
      role: "ai",
      text: t("aiChat.editorGreeting", { editor: t(`aiChat.editorName_${key}`) }),
    }),
    [t],
  );
  const [threads, setThreads] = useState<Partial<Record<AssistantEditor, Msg[]>>>({});
  const [convIds, setConvIds] = useState<Partial<Record<AssistantEditor, string>>>({});
  const undoRef = useRef<Map<string, UndoPoint>>(new Map());
  const msgs = threads[editorKey] ?? [greetingFor(editorKey)];
  const activeConvId = convIds[editorKey] ?? null;
  const setThreadMsgs = useCallback(
    (key: AssistantEditor, fn: Msg[] | ((m: Msg[]) => Msg[])) =>
      setThreads((prev) => {
        const cur = prev[key] ?? [greetingFor(key)];
        return { ...prev, [key]: typeof fn === "function" ? fn(cur) : fn };
      }),
    [greetingFor],
  );
  const setMsgs = (fn: Msg[] | ((m: Msg[]) => Msg[])) => setThreadMsgs(editorKey, fn);

  // Carrega a conversa DESTE editor neste projeto (memória separada por editor).
  useEffect(() => {
    if (!projectId || convIds[editorKey]) return;
    let mounted = true;
    const key = editorKey;
    getOrCreateConv({
      data: { projectId, title: `Editor · ${key}`, scope: key },
    })
      .then((res) => {
        if (!mounted || !res) return;
        setConvIds((prev) => ({ ...prev, [key]: res.conversation.id }));
        if (res.messages && res.messages.length > 0) {
          setThreadMsgs(
            key,
            res.messages.slice(-60).map((m) => ({
              role: m.role === "assistant" ? "ai" : "user",
              text: m.content,
            })),
          );
        }
      })
      .catch((err) => {
        console.warn("[CanvasAiChat] memória da conversa do editor:", err);
      });
    return () => {
      mounted = false;
    };
  }, [projectId, editorKey, convIds, getOrCreateConv, setThreadMsgs]);

  // Captura eventos do botão "CORRIGIR COM IA" disparados em qualquer módulo
  useEffect(() => {
    const handler = (evt: any) => {
      setOpen(true);
      const detail = evt?.detail;
      const target = detail?.batch && detail.batch.length > 0 ? detail.batch : detail?.context;
      if (target) {
        const prompt = formatDiagnosticFor7StepRemediation(
          target,
          locale === "en" ? "en" : "pt-BR",
        );
        // Vai para o ASSISTENTE (não direto ao patch): ele recebe o diagnóstico real,
        // corrige valores, pede os dados que faltam e só aciona o patch estrutural
        // quando é mudança de ligação/equipamento. sendRef = função do render atual.
        void sendRef.current?.(prompt);
      }
    };
    window.addEventListener("eletricai-ai-repair", handler as EventListener);
    return () => window.removeEventListener("eletricai-ai-repair", handler as EventListener);
  }, [locale]);

  // Pedido livre vindo do painel lateral de IA: abre este chat e envia.
  // Antes o campo do painel não enviava para lugar nenhum.
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ prompt?: unknown; forcePatch?: unknown }>).detail;
      const prompt = typeof detail?.prompt === "string" ? detail.prompt.trim().slice(0, 4000) : "";
      if (!prompt) return;
      setOpen(true);
      const forcePatch = detail?.forcePatch === true;
      if (forcePatch) setPatchMode(true);
      // Fora do unifilar respeita o modo escolhido no próprio chat.
      void sendRef.current?.(prompt, undefined, forcePatch ? { forcePatch: true } : undefined);
    };
    window.addEventListener("eletricai-ai-prompt", handler);
    return () => window.removeEventListener("eletricai-ai-prompt", handler);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<typeof send | null>(null);

  // Problemas REAIS do editor aberto (diagnóstico do unifilar, redes do Ladder,
  // programa do Studio, alarmes do SCADA) — antes vinha de um validador legado.
  const watchDoc = useDiagramStore((s) => s.doc);
  const watchRungs = useEditorStore((s) => s.rungs);
  const watchTags = useEditorStore((s) => s.editorTags);
  const watchStudio = useUnifiedProjectStore((s) => s.doc.compactStudio);
  const watchAlarms = useScadaStore((s) => s.alarms);
  const editorCtx = useMemo(
    () => (open ? readEditorContext(editorKey) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, editorKey, watchDoc, watchRungs, watchTags, watchStudio, watchAlarms],
  );
  const issues = useMemo(() => editorCtx?.issues ?? [], [editorCtx]);
  const normWarnings = useMemo(() => {
    if (issues.length === 0) return [t("aiChat.noIssues")];
    return issues
      .slice(0, 8)
      .map((f) => `${f.severity === "error" ? "🚨" : "⚠️"} ${f.text}`)
      .concat(issues.length > 8 ? [t("aiChat.moreIssues", { n: issues.length - 8 })] : []);
  }, [issues, t]);
  const isDiagramEditor = editorKey === "unifilar" || editorKey === "multifilar";

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

  const send = async (
    textToSend?: string,
    briefingDocument?: BriefingDocumentInput,
    opts?: { forcePatch?: boolean },
  ) => {
    const p = (textToSend ?? val).trim();
    if (!p || busy) return;
    // A conversa pertence ao editor em que a mensagem foi enviada, mesmo que o
    // usuário troque de editor enquanto a IA responde.
    const threadKey = editorKey;
    const setMsgs = (fn: Msg[] | ((m: Msg[]) => Msg[])) => setThreadMsgs(threadKey, fn);
    const activeConvId = convIds[threadKey] ?? null;
    const priorTurns = (threads[threadKey] ?? []).filter((m) => m.text && !m.error).slice(-12);
    // "CORRIGIR COM IA" força o modo patch: setPatchMode(true) só vale no próximo render.
    const usePatch =
      opts?.forcePatch === true ||
      (patchMode && (threadKey === "unifilar" || threadKey === "multifilar"));
    if (!textToSend) setVal("");

    // Interceptação determinística de pacotes de projeto externos (0 créditos de IA)
    const detectedFmt = detectFormat(p);
    const isRecognizedBundle =
      detectedFmt !== "unknown" ||
      p.includes("eletricai.canvas-bundle") ||
      (p.includes('"nodes"') &&
        p.includes('"edges"') &&
        (p.includes('"format"') || p.includes('"project"'))) ||
      (p.startsWith("<?xml") && p.includes("tc6_xml"));

    if (isRecognizedBundle) {
      const fmtLabels: Record<string, string> = {
        "json-bundle": "JSON Canvas Bundle",
        "yaml-bundle": "YAML Canvas Bundle",
        "csv-table": "Tabela CSV (Cargas / I/O)",
        "plcopen-xml": "PLCopen XML (IEC 61131-3)",
        "st-program": "Structured Text (ST / SCL)",
        "txt-spec": "Especificação Técnica TXT",
        netlist: "Netlist SPICE",
      };
      const label =
        detectedFmt !== "unknown" ? fmtLabels[detectedFmt] || detectedFmt : "Canvas Bundle";
      const summaryText =
        p.length > 120 ? `${p.slice(0, 100)}... [pacote ${label} com ${p.length} caracteres]` : p;
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

    // Troca de IA conversando (DeepSeek ↔ Gemini): sem créditos, sem modelo.
    const providerIntent = detectProviderIntent(p);
    if (providerIntent) {
      setMsgs((m) => [...m, { role: "user", text: p }, { role: "ai", text: "…" }]);
      try {
        let reply: string;
        if (providerIntent.kind === "switch") {
          const r = await setProviderPref({ data: { provider: providerIntent.provider } });
          reply = r.saved
            ? switchConfirmation(providerIntent.provider, r.available)
            : "Não consegui salvar sua preferência agora. Tente de novo em instantes.";
        } else {
          const r = await getProviderPref();
          reply = whichProviderAnswer(r.preferred, r.available);
        }
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "ai", text: reply };
          return c;
        });
      } catch {
        setMsgs((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "ai", text: "Não consegui trocar a IA agora." };
          return c;
        });
      }
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
          text: '⚠️ **Formato de pacote externo não suportado.**\n\nO conteúdo colado parece uma tentativa de intercâmbio de circuito, mas não corresponde ao contrato universal **ElétricAi Canvas Bundle (v1.0.0)** nem aos formatos seguros suportados (YAML, CSV, PLCopen XML, ST/SCL ou TXT).\n\n💡 **Como corrigir:** Solicite à sua IA externa que formate a resposta especificamente no padrão `eletricai.canvas-bundle`. Você pode copiar o prompt pronto na aba **"4. Exportar & Prompts para IA Externa"** do Importador Universal (0 créditos).',
        },
      ]);
      return;
    }

    setMsgs((m) => [
      ...m,
      { role: "user", text: p },
      {
        role: "ai",
        text: usePatch ? t("aiChat.generatingPatch") : t("aiChat.processingPrompt"),
      },
    ]);
    if (activeConvId) {
      persistMsg({
        data: {
          conversationId: activeConvId,
          role: "user",
          content: p,
        },
      }).catch((err) => console.warn("[CanvasAiChat] persist user turn:", err));
    }
    setBusy(true);

    try {
      // Correção do diagrama recebe o DIAGNÓSTICO REAL do unifilar (antes: validador legado).
      const patchPrompt = (request: string): string => {
        const diag = readEditorContext("unifilar").issues;
        if (diag.length === 0) return request;
        const lines = diag
          .slice(0, 60)
          .map((f) => `- [${f.severity === "error" ? "ERRO" : "AVISO"}] ${f.text}`)
          .join("\n");
        return isEn
          ? `[CURRENT SINGLE-LINE DIAGNOSTICS]:\n${lines}\n\n[USER REQUEST]:\n${request}\n\nFix following IEC 60364, IEC 60947 and NR-10 without inventing data.`
          : `[DIAGNÓSTICO ATUAL DO UNIFILAR]:\n${lines}\n\n[SOLICITAÇÃO DO USUÁRIO]:\n${request}\n\nCorrija conforme ABNT NBR 5410, IEC 60947 e NR-10, sem inventar dados (comprimento, placa, curto).`;
      };

      const runPatch = async (contextualPrompt: string) => {
        let res: any = await genPatch({
          data: {
            prompt: contextualPrompt,
            doc: diagramDoc,
            locale,
            ...(briefingDocument ? { briefingDocument } : {}),
          },
        });
        // Bloqueio do middleware (limite, cota, sessão) chega como Response:
        // ler o corpo para mostrar o motivo real em vez de "[UNKNOWN]".
        if (typeof Response !== "undefined" && res instanceof Response) {
          const status = res.status;
          res = await res.json().catch(() => null);
          if (res && !res.error && status >= 400)
            res = { ok: false, error: { code: `HTTP_${status}`, message: undefined } };
        }
        if (!res || res.ok !== true) {
          const code = res?.error?.code ?? "UNKNOWN";
          const message =
            res?.error?.message ??
            (isEn
              ? "The AI did not return a valid patch. Please rephrase."
              : "A IA não retornou um patch válido. Tente reformular o pedido.");
          const needsConfig = ["MISSING_KEY", "AUTH_401", "INSUFFICIENT_CREDITS"].includes(code);
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "ai", text: `[${code}] ${message}`, needsConfig };
            return c;
          });
        } else {
          applyAiPatch(res.patch);
          window.dispatchEvent(new Event("ai-usage-event"));
          window.dispatchEvent(new CustomEvent("eletricai-fit-view"));
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
            const reportSummary = res.report?.summary
              ? `\n\n⚡ **Relatório de Conectividade:**\n${res.report.summary}`
              : "";
            const responseText = `**${title}**\n\n${rationale ?? ""}\n\n• +${addNodes.length} ${isEn ? "nodes" : "nós"} · +${addEdges.length} conexões elétricas\n• ~${updateNodes.length} updates · −${removeNodeIds.length} ${isEn ? "nodes" : "nós"} / −${removeEdgeIds.length} edges${reportSummary}`;
            if (activeConvId) {
              persistMsg({
                data: {
                  conversationId: activeConvId,
                  role: "assistant",
                  content: responseText,
                  tokensUsed: res.tokensUsed,
                },
              }).catch((err) => console.warn("[CanvasAiChat] persist ai patch:", err));
            }
            c[c.length - 1] = {
              role: "ai",
              text: responseText,
              patchApplied: true,
            };
            return c;
          });
        }
      };

      if (usePatch) {
        await runPatch(patchPrompt(p));
      } else {
        // Assistente do editor: conversa + ações validadas sobre o editor aberto.
        const ctxNow = readEditorContext(threadKey);
        let res: any = await askAssistant({
          data: {
            editor: threadKey,
            message: p,
            history: priorTurns.map((m) => ({
              role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
              content: m.text.slice(0, 3000),
            })),
            context: ctxNow.summary,
            locale: isEn ? "en" : "pt-BR",
          },
        });
        if (typeof Response !== "undefined" && res instanceof Response) {
          const status = res.status;
          res = await res.json().catch(() => null);
          if (res && !res.error && status >= 400)
            res = { ok: false, error: { code: `HTTP_${status}`, message: undefined } };
        }
        if (!res || res.ok !== true) {
          const code = res?.error?.code ?? "UNKNOWN";
          const message = res?.error?.message ?? t("aiChat.assistantFailed");
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "ai", text: `[${code}] ${message}`, error: message };
            return c;
          });
        } else {
          const run = runEditorActions(threadKey, res.actions ?? []);
          let undoId: string | undefined;
          if (run.undo) {
            undoId = `u${Date.now().toString(36)}`;
            undoRef.current.set(undoId, run.undo);
          }
          const text = [
            String(res.reply ?? ""),
            run.notes.length ? `\n✅ ${run.notes.join("\n✅ ")}` : "",
            res.rejected ? `\n${t("aiChat.actionsRejected", { n: res.rejected })}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          setMsgs((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "ai", text, ...(undoId ? { undoId } : {}) };
            return c;
          });
          if (activeConvId) {
            persistMsg({
              data: {
                conversationId: activeConvId,
                role: "assistant",
                content: text,
                tokensUsed: res.tokens,
              },
            }).catch((err) => console.warn("[CanvasAiChat] persist assistant:", err));
          }
          window.dispatchEvent(new Event("ai-usage-event"));
          // Mudança estrutural no diagrama: motor de patch (reparo + saneamento + créditos).
          for (const instruction of run.diagramChanges.slice(0, 2)) {
            setMsgs((m) => [...m, { role: "ai", text: t("aiChat.generatingPatch") }]);
            await runPatch(patchPrompt(instruction));
          }
        }
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
  sendRef.current = send;

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
        className="absolute bottom-6 right-6 z-20 h-10 w-10 rounded-md border border-border bg-primary text-primary-foreground grid place-items-center shadow-md hover:bg-primary/90 transition-colors cursor-pointer"
        aria-label="Abrir IA no canvas"
      >
        <Sparkle className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 z-20 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-8rem)] rounded-lg border border-border flex flex-col shadow-lg overflow-hidden bg-card">
      {/* HEADER CONTROLS */}
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-panel">
        <Sparkle className="h-4 w-4 text-primary" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-display font-bold tracking-wider text-foreground">
              {t("aiChat.title")}
            </span>
            <span
              className="text-[8px] border border-border px-1 rounded font-mono uppercase text-muted-foreground"
              data-testid="ai-chat-editor"
            >
              {t(`aiChat.editorName_${editorKey}`)}
            </span>
            {activeConvId && (
              <span
                className="text-[8px] bg-emerald-950/70 text-emerald-400 border border-emerald-500/40 px-1 py-0.2 rounded font-mono font-semibold uppercase tracking-wider"
                title="Memória técnica contínua persistida no Supabase ativa para este projeto"
              >
                Memória Ativa
              </span>
            )}
          </div>
          <span className="text-[9px] text-primary/80 font-mono tracking-tight font-medium uppercase">
            {creditInfo.remainingLabel}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {isDiagramEditor && (
            <button
              onClick={() => setPatchMode((v) => !v)}
              title={t("aiChat.modeHint")}
              className={`h-6 px-2 rounded text-[9px] font-medium border inline-flex items-center gap-1 cursor-pointer ${patchMode ? "border-primary/60 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-accent/40"}`}
              data-testid="ai-chat-mode"
            >
              <Sparkle className="h-3 w-3" />{" "}
              {patchMode ? t("aiChat.modePatch") : t("aiChat.modeAssistant")}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar IA do canvas"
            className="h-7 w-7 grid place-items-center rounded-sm hover:bg-accent/50 cursor-pointer text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* FILE SCAN LOADER */}
      {fileLoading && (
        <div className="shrink-0 p-3 border-b border-border bg-primary/10 flex items-center gap-3 animate-pulse">
          <CircleNotch className="h-4 w-4 text-primary animate-spin" />
          <div className="flex-1 flex flex-col">
            <span className="text-[10px] font-bold text-primary uppercase">
              {t("aiChat.ocrActive")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {fileStep || t("aiChat.ocrExtracting")}
            </span>
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

            {m.undoId && (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={m.undone}
                  onClick={() => {
                    const u = undoRef.current.get(m.undoId!);
                    if (!u) return;
                    u.restore();
                    undoRef.current.delete(m.undoId!);
                    setMsgs((prev) =>
                      prev.map((msg, idx) => (idx === i ? { ...msg, undone: true } : msg)),
                    );
                  }}
                  className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent/40 disabled:opacity-50"
                >
                  {m.undone ? t("aiChat.undone") : t("aiChat.undo")}
                </button>
              </div>
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
                <span className="text-[9px] text-success font-mono">
                  {t("aiChat.patchAppliedSuccess")}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* INPUT AND BRIEFING UPLOAD BAR */}
      <div className="shrink-0 p-2 border-t border-border bg-card/10">
        <div className={isDiagramEditor ? "flex gap-1.5 mb-1.5" : "hidden"}>
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
            title="UploadSimple de Briefing de Engenharia (PDF / CSV)"
            className="h-8 px-2.5 rounded border border-border bg-card hover:bg-accent/40 text-[10px] inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <UploadSimple className="h-3.5 w-3.5" />
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
            <Robot className="h-3 w-3" />
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
            <DownloadSimple className="h-3 w-3" />
            <span>Importar JSON</span>
          </button>
        </div>

        {/* Quick prompt suggestion pills */}
        <div className={isDiagramEditor ? "flex flex-wrap gap-1 mb-1.5" : "hidden"}>
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
            placeholder={
              isDiagramEditor && patchMode
                ? t("aiChat.promptPlaceholder")
                : t("aiChat.promptPlaceholderEditor")
            }
            className="w-full resize-none rounded-md bg-input border border-border p-2 pr-9 text-[11px] outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <button
            onClick={() => send()}
            disabled={busy || !val.trim()}
            aria-label="Enviar mensagem para IA"
            className="absolute right-1.5 bottom-1.5 h-7 w-7 grid place-items-center rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {busy ? (
              <CircleNotch className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PaperPlaneRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="mt-1 text-[8px] text-muted-foreground flex items-center gap-1 font-mono">
          <ChatText className="h-2.5 w-2.5" /> {t("aiChat.enterHint")}
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
