import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, CircleNotch } from "@phosphor-icons/react";
import { BrandBolt } from "@/components/brand-bolt";

export function LegalPage({
  title,
  subtitle,
  docPath,
}: {
  title: string;
  subtitle: string;
  docPath: string;
}) {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(docPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setMd(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandBolt className="h-6 w-6" />
            <span className="font-semibold">EletricAI</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
          <Link to="/privacidade" className="hover:text-foreground hover:underline">
            Privacidade
          </Link>
          <span aria-hidden>·</span>
          <Link to="/termos" className="hover:text-foreground hover:underline">
            Termos
          </Link>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-card p-6 md:p-8">
          {error ? (
            <div role="alert" className="text-sm">
              <p className="font-medium text-destructive">Não foi possível carregar o documento.</p>
              <p className="mt-1 text-muted-foreground">
                Detalhe: {error}. Tente recarregar ou solicite uma cópia em
                privacidade@eletricai.com.
              </p>
            </div>
          ) : md === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleNotch className="h-4 w-4 animate-spin" /> Carregando documento…
            </div>
          ) : (
            <article className="prose-legal">
              <ReactMarkdown>{md}</ReactMarkdown>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
