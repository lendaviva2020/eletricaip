import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clientes · EletricAI" }, { name: "description", content: "Clientes industriais." }] }),
  component: ClientsPage,
});

const CLIENTS = [
  { n: "Coca-Cola FEMSA", s: "Bebidas", p: 4 },
  { n: "Energisa", s: "Energia", p: 2 },
  { n: "Braskem", s: "Petroquímica", p: 3 },
  { n: "Vale", s: "Mineração", p: 5 },
  { n: "Ambev", s: "Bebidas", p: 6 },
  { n: "Multiplan", s: "Real Estate", p: 1 },
];

function ClientsPage() {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Clientes</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CLIENTS.map((c) => (
            <div key={c.n} className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full grid place-items-center font-semibold text-primary bg-primary/15">
                  {c.n[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold">{c.n}</div>
                  <div className="text-[11px] text-muted-foreground">{c.s}</div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex justify-between text-[11px] text-muted-foreground font-mono">
                <span>{c.p} projetos</span><span>SLA 99.9%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
