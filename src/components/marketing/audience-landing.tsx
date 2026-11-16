/**
 * Página por público (SEO): empresas × profissionais autônomos. Conteúdo e
 * preços vêm da mesma tabela do checkout (`lib/plans`) — nunca divergem.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { BrandBolt } from "@/components/brand-bolt";
import { SUBSCRIPTION_PLANS, LAUNCH_OFFER, type PlanId } from "@/lib/plans";
import type { AccountType } from "@/lib/account-type";

export interface AudienceContent {
  readonly perfil: AccountType;
  readonly eyebrow: string;
  readonly headline: string;
  readonly lead: string;
  readonly pains: readonly string[];
  readonly benefits: readonly { title: string; text: string }[];
  readonly plans: readonly PlanId[];
  readonly faq: readonly { q: string; a: string }[];
}

export function AudienceLanding({ content }: { content: AudienceContent }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandBolt className="h-6 w-6" />
            <span className="font-semibold">EletricAI</span>
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link to="/login" search={{ redirect: "/dashboard" }}>
              Entrar
            </Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-primary">
            {content.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
            {content.headline}
          </h1>
          <p className="mt-4 text-muted-foreground max-w-2xl">{content.lead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup" search={{ perfil: content.perfil }}>
                Criar conta grátis <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#planos">Ver preços</a>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-muted/20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold">O que resolvemos</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {content.pains.map((p) => (
                  <li key={p} className="flex gap-2">
                    <Check className="h-4 w-4 text-success shrink-0 mt-0.5" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4">
              {content.benefits.map((b) => (
                <div key={b.title} className="rounded-md border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold">{b.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Mensal ou anual (2 meses grátis). Lançamento: {LAUNCH_OFFER.discountPct}% de desconto
            por {LAUNCH_OFFER.months} meses para as {LAUNCH_OFFER.slots} primeiras empresas.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {content.plans.map((id) => {
              const p = SUBSCRIPTION_PLANS[id];
              return (
                <div key={id} className="rounded-md border border-border bg-card p-5">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.audience}</p>
                  <p className="mt-3 text-2xl font-semibold">
                    R$ {p.priceBRL.toLocaleString("pt-BR")}
                    <span className="text-xs font-normal text-muted-foreground">/mês</span>
                  </p>
                  {p.priceYearlyBRL > 0 && (
                    <p className="text-xs text-success">
                      ou R$ {p.priceYearlyBRL.toLocaleString("pt-BR")}/ano
                    </p>
                  )}
                  <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-border bg-muted/20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
            <h2 className="text-lg font-semibold">Perguntas frequentes</h2>
            <dl className="mt-4 space-y-4">
              {content.faq.map((f) => (
                <div key={f.q}>
                  <dt className="text-sm font-medium">{f.q}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
            <Button asChild className="mt-8">
              <Link to="/signup" search={{ perfil: content.perfil }}>
                Começar agora <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link to="/para-empresas" className="hover:text-foreground">
            Para empresas
          </Link>
          <Link to="/para-autonomos" className="hover:text-foreground">
            Para autônomos
          </Link>
          <Link to="/termos" className="hover:text-foreground">
            Termos
          </Link>
          <Link to="/privacidade" className="hover:text-foreground">
            Privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Dados estruturados (schema.org) para o Google entender o produto. */
export function softwareJsonLd(description: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EletricAI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description,
    offers: (["basic", "pro", "premium"] as const).map((id) => ({
      "@type": "Offer",
      name: SUBSCRIPTION_PLANS[id].name,
      price: SUBSCRIPTION_PLANS[id].priceBRL,
      priceCurrency: "BRL",
    })),
  });
}
