import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Scripts, Link, useRouter } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center">
        <h1 className="text-7xl font-mono text-primary text-glow">404</h1>
        <p className="mt-2 text-muted-foreground">Rota industrial não encontrada</p>
        <Link to="/" className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">Voltar</Link>
      </div>
    </div>
  );
}

function ErrorComp({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold">Falha no runtime</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">Reiniciar</button>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EletricAI Industrial OS — IA, PLC, SCADA, Digital Twin" },
      { name: "description", content: "Sistema operacional industrial unificado com IA nativa: unifilar, ladder, FBD, SCADA, Digital Twin, PLC e simulação em tempo real." },
      { property: "og:title", content: "EletricAI Industrial OS" },
      { property: "og:description", content: "O primeiro Industrial OS com IA nativa." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComp,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <Outlet />
        </div>
      </div>
    </QueryClientProvider>
  );
}
