import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { UpgradeModal } from "@/components/upgrade-modal";
import { ShareModal } from "@/components/share-modal";

const queryClient = new QueryClient();

const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
const PUBLIC_PREFIXES = ["/auth/callback", "/invite/"];
const AUTH_NO_CHROME = ["/onboarding"];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center">
        <h1 className="text-7xl font-mono text-primary text-glow">404</h1>
        <p className="mt-2 text-muted-foreground">Rota industrial não encontrada</p>
        <Link
          to="/"
          className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
        >
          Voltar
        </Link>
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
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
        >
          Reiniciar
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EletricAI Industrial OS - IA, PLC, SCADA, Digital Twin" },
      {
        name: "description",
        content:
          "Sistema operacional industrial unificado com IA nativa: unifilar, ladder, FBD, SCADA, Digital Twin, PLC e simulação em tempo real.",
      },
      { property: "og:title", content: "EletricAI Industrial OS - IA, PLC, SCADA, Digital Twin" },
      {
        property: "og:description",
        content:
          "EletricAI Industrial OS is a unified SaaS platform for electrical engineering and industrial automation.",
      },
      { name: "twitter:title", content: "EletricAI Industrial OS - IA, PLC, SCADA, Digital Twin" },
      {
        name: "twitter:description",
        content:
          "EletricAI Industrial OS is a unified SaaS platform for electrical engineering and industrial automation.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
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
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuth();
  const router = useRouter();
  const isPublic = isPublicPath(path);

  useAuthRedirect(loading, user, isPublic, path, router);

  if (isPublic) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (AUTH_NO_CHROME.includes(path)) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <Outlet />
      </div>
    </div>
  );
}

function useAuthRedirect(
  loading: boolean,
  user: unknown,
  isPublic: boolean,
  path: string,
  router: ReturnType<typeof useRouter>,
) {
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.navigate({ to: "/login", search: { redirect: path } });
    }
  }, [loading, user, isPublic, path, router]);
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
        <Toaster />
        <UpgradeModal />
        <ShareModal />
      </AuthProvider>
    </QueryClientProvider>
  );
}
