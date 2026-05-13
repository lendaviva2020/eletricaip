import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Cpu } from "lucide-react";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Projetos · EletricAI" },
      { name: "description", content: "Seus projetos industriais." },
    ],
  }),
  component: Projects,
});

const PROJECTS = [
  { n: "Engarrafamento · Linha 03", c: "Coca-Cola FEMSA", tags: 142, mode: "Run" },
  { n: "Subestação SE-02", c: "Energisa", tags: 84, mode: "Run" },
  { n: "Reator químico R-401", c: "Braskem", tags: 56, mode: "Edit" },
  { n: "CCM-03 motores", c: "Vale", tags: 38, mode: "Sim" },
  { n: "Esteira E-04", c: "Ambev", tags: 22, mode: "Edit" },
  { n: "BMS Predial Torre A", c: "Multiplan", tags: 312, mode: "Run" },
];

function Projects() {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Projetos industriais</h1>
            <p className="text-sm text-muted-foreground">
              {PROJECTS.length} projetos · 3 ativos agora
            </p>
          </div>
          <button
            className="h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground inline-flex items-center gap-2 glow-primary"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="h-4 w-4" /> Novo projeto
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROJECTS.map((p) => (
            <Link
              to="/workspace"
              key={p.n}
              className="group rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/30 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="h-9 w-9 rounded-md grid place-items-center bg-primary/15 text-primary">
                  <Cpu className="h-4 w-4" />
                </div>
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    p.mode === "Run"
                      ? "bg-success/20 text-success"
                      : p.mode === "Sim"
                        ? "bg-info/20 text-info"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.mode}
                </span>
              </div>
              <div className="mt-3 text-sm font-semibold group-hover:text-primary transition-colors">
                {p.n}
              </div>
              <div className="text-[11px] text-muted-foreground">{p.c}</div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-[11px] font-mono text-muted-foreground">
                <span>{p.tags} tags</span>
                <span>Atualizado há 2h</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
