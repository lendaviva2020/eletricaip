import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, Plus, Loader2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  listConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
  streamChat,
  type ChatMessage,
} from "@/lib/ai-chat.functions";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat IA · EletricAI" },
      { name: "description", content: "Copilot conversacional para engenharia industrial." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const fetchMessages = useServerFn(getConversationMessages);
  const remove = useServerFn(deleteConversation);
  const stream = useServerFn(streamChat);
  const creditsFn = useServerFn(getAiCredits);
  const qc = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data: convos = [] } = useQuery({
    queryKey: ["chat-convos"],
    queryFn: () => list({}),
  });

  const { data: credits } = useQuery({
    queryKey: ["ai-credits"],
    queryFn: () => creditsFn({}),
    refetchInterval: 30000,
  });


  const { data: messages = [] } = useQuery({
    queryKey: ["chat-msgs", activeId],
    queryFn: () =>
      activeId ? fetchMessages({ data: { conversationId: activeId } }) : Promise.resolve([]),
    enabled: !!activeId,
  });

  useEffect(() => {
    if (!activeId && convos.length) setActiveId(convos[0].id);
  }, [convos, activeId]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  async function handleNew() {
    try {
      const c = await create({ data: { title: "Nova conversa" } });
      await qc.invalidateQueries({ queryKey: ["chat-convos"] });
      setActiveId(c.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta conversa?")) return;
    await remove({ data: { conversationId: id } });
    await qc.invalidateQueries({ queryKey: ["chat-convos"] });
    if (activeId === id) setActiveId(null);
  }

  async function handleSend() {
    if (!draft.trim() || busy) return;
    let convId = activeId;
    if (!convId) {
      const c = await create({ data: { title: draft.slice(0, 60) } });
      convId = c.id;
      setActiveId(c.id);
      await qc.invalidateQueries({ queryKey: ["chat-convos"] });
    }
    const prompt = draft.trim();
    setDraft("");
    setBusy(true);
    setStreamingText("");
    try {
      // Optimistically refetch so user message appears immediately after server insert.
      const generator = await stream({ data: { conversationId: convId, prompt } });
      let acc = "";
      for await (const chunk of generator) {
        if (chunk.type === "delta") {
          acc += chunk.text;
          setStreamingText(acc);
        } else if (chunk.type === "error") {
          toast.error(chunk.message);
          break;
        }
      }
      await qc.invalidateQueries({ queryKey: ["chat-msgs", convId] });
      await qc.invalidateQueries({ queryKey: ["chat-convos"] });
      setStreamingText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[100dvh] bg-background text-foreground">
      <aside className="hidden md:flex w-72 border-r border-border flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <Button size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-1" /> Nova
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {convos.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Nenhuma conversa ainda.</p>
          )}
          {convos.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm ${
                c.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
              onClick={() => setActiveId(c.id)}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b border-border px-6 py-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-base font-semibold">EletricAI Copilot</h1>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && !streamingText && (
            <div className="text-center text-muted-foreground mt-20">
              <p className="text-lg font-medium">
                Pergunte algo sobre engenharia elétrica industrial
              </p>
              <p className="text-sm mt-2">NBR 5410, dimensionamento, NR-12, IoT…</p>
            </div>
          )}
          {messages.map((m: ChatMessage) => (
            <Bubble key={m.id} role={m.role} content={m.content} />
          ))}
          {streamingText && <Bubble role="assistant" content={streamingText} streaming />}
        </div>

        <footer className="border-t border-border p-4">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Digite sua pergunta…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={busy}
            />
            <Button onClick={handleSend} disabled={busy || !draft.trim()}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {streaming && <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />}
          </div>
        )}
      </div>
    </div>
  );
}
