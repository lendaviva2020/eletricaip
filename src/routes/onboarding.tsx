import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, FolderKanban, ArrowRight, Sparkles } from "lucide-react";
import { BrandBolt } from "@/components/brand-bolt";
import { markTourPending } from "@/components/onboarding-tour";
import { useAuth } from "@/hooks/use-auth";
import {
  listMyProjects,
  createProject,
  useCurrentProject,
  type CurrentProject,
} from "@/lib/current-project";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Bem-vindo - EletricAI" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const setProject = useCurrentProject((s) => s.setProject);
  const [projects, setProjects] = useState<CurrentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [step, setStep] = useState<"choose" | "create">("choose");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const list = await listMyProjects();
      setProjects(list);
      setStep(list.length === 0 ? "create" : "choose");
    } catch (error) {
      setProjects([]);
      setLoadError((error as Error)?.message || "Não foi possível carregar seus projetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.navigate({ to: "/login", search: { redirect: "/onboarding" } });
      return;
    }
    void loadProjects();
  }, [authLoading, loadProjects, router, user]);

  const open = (project: CurrentProject, { withTour = false }: { withTour?: boolean } = {}) => {
    setProject(project);
    if (withTour) markTourPending();
    router.navigate({ to: "/workspace", search: { projectId: project.id } });
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || creating) return;

    setCreating(true);
    setFormError("");
    try {
      const project = await createProject({
        name: name.trim(),
        client: client.trim() || undefined,
      });

      if (!project) {
        setFormError(
          "Não foi possível criar o projeto. Verifique sua permissão e tente novamente.",
        );
        return;
      }

      open(project, { withTour: true });
    } catch (error) {
      setFormError((error as Error)?.message || "Falha ao criar projeto.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <BrandBolt className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">EletricAI</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Industrial OS
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary mb-3">
            <Sparkles className="h-3 w-3" /> Bem-vindo ao seu Industrial OS
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Vamos configurar seu primeiro projeto
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione um projeto existente ou crie um novo para abrir o Industrial Workspace.
          </p>
        </div>

        {loading && (
          <div className="grid place-items-center py-16 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="mt-4 h-10 px-4 rounded-md border border-border hover:bg-accent text-sm"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !loadError && step === "choose" && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => open(project)}
                  className="group text-left rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/40 p-4 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-md grid place-items-center bg-primary/10 text-primary">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{project.name}</div>
                      {project.client && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {project.client}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStep("create")}
                className="text-left rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-accent/40 p-4 transition-all flex items-center gap-3"
              >
                <div className="h-9 w-9 rounded-md grid place-items-center bg-primary/10 text-primary">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="text-sm font-medium">Criar novo projeto</div>
              </button>
            </div>
          </div>
        )}

        {!loading && !loadError && step === "create" && (
          <form
            onSubmit={handleCreate}
            className="rounded-lg border border-border bg-card p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-semibold">Novo projeto industrial</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Você poderá editar tudo depois.
              </p>
            </div>
            <label className="block">
              <span className="text-xs text-muted-foreground">Nome do projeto *</span>
              <input
                aria-label="Nome do projeto"
                title="Nome do projeto"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="Ex.: Sala de máquinas - Frigorífico XYZ"
                className="mt-1 h-11 w-full rounded-md bg-input/60 border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Cliente</span>
              <input
                aria-label="Cliente do projeto"
                title="Cliente do projeto"
                value={client}
                onChange={(event) => setClient(event.target.value)}
                placeholder="Opcional"
                className="mt-1 h-11 w-full rounded-md bg-input/60 border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2 pt-2">
              {projects.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStep("choose")}
                  className="h-11 px-4 rounded-md border border-border hover:bg-accent text-sm"
                >
                  Voltar
                </button>
              )}
              <button
                disabled={creating || !name.trim()}
                type="submit"
                className="flex-1 h-11 rounded-md text-sm font-semibold text-primary-foreground glow-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar e abrir Workspace
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
