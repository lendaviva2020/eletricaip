import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth, getIsExplicitLogoutInProgress } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { installDiagnosticsInterceptor } from "@/lib/diagnostics-counter";
import { captureException, maskSensitiveString } from "@/lib/error-capture";

// Lazy-load authenticated shells and heavy modals so public routes (like Landing /)
// don't download billing, workspace chrome, and diagnostics bundles upfront.
const LazyAppSidebar = lazy(() =>
  import("@/components/app-sidebar").then((m) => ({ default: m.AppSidebar })),
);
const LazyTopbar = lazy(() => import("@/components/topbar").then((m) => ({ default: m.Topbar })));
const LazyUpgradeModal = lazy(() =>
  import("@/components/upgrade-modal").then((m) => ({ default: m.UpgradeModal })),
);
const LazyShareModal = lazy(() =>
  import("@/components/share-modal").then((m) => ({ default: m.ShareModal })),
);
const LazyCommandPalette = lazy(() =>
  import("@/components/command-palette").then((m) => ({ default: m.CommandPalette })),
);

if (typeof window !== "undefined") installDiagnosticsInterceptor();

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacidade",
  "/termos",
  "/design-system",
];
const PUBLIC_PREFIXES = ["/auth/callback", "/invite/"];
const AUTH_NO_CHROME = ["/onboarding"];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center">
        <h1 className="text-7xl font-mono text-primary tabular-nums">404</h1>
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

function ErrorComp({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    const captured = captureException(error, {
      source: "RootErrorComponent",
      path: router.state?.location?.pathname,
    });
    console.error("[RootErrorComponent]", captured.message, captured.stack ?? "");
  }, [error, router.state?.location?.pathname]);

  const rawMessage = error instanceof Error ? error.message : String(error);
  const safeMessage = maskSensitiveString(rawMessage);
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold">Falha no runtime</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="alert">
          {safeMessage}
        </p>
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem('eletricai-theme')||'{}').state?.theme||'dark';var d=(t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t);document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(d);document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
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
  const { user, loading, isLoggingOut } = useAuth();
  const router = useRouter();
  const isPublic = isPublicPath(path);

  useAuthRedirect(loading, user, isPublic, path, router, isLoggingOut);

  if (isPublic) {
    return <Outlet />;
  }

  if (loading || isLoggingOut) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }

  if (!user) {
    // NUNCA retornar null aqui: um render vazio é indistinguível de "tela branca".
    // O redirect do useAuthRedirect é best-effort; esta tela é o fallback visível.
    return <SessionExpired path={path} />;
  }

  if (AUTH_NO_CHROME.includes(path)) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Suspense
        fallback={
          <div className="w-[240px] hidden md:block border-r border-border bg-sidebar shrink-0" />
        }
      >
        <LazyAppSidebar />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-10 border-b border-border bg-card shrink-0" />}>
          <LazyTopbar />
        </Suspense>
        <Outlet />
      </div>
    </div>
  );
}

function AuthenticatedModals() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <LazyUpgradeModal />
      <LazyShareModal />
      <LazyCommandPalette />
    </Suspense>
  );
}

function SessionExpired({ path }: { path: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-semibold">Sessão necessária</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua sessão expirou ou você ainda não entrou. Faça login para acessar esta área.
        </p>
        <Link
          to="/login"
          search={{ redirect: path }}
          className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
        >
          Entrar
        </Link>
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
  isLoggingOut: boolean,
) {
  useEffect(() => {
    // Se um encerramento explícito de sessão estiver em andamento, NUNCA redirecionar para /login com redirect!
    if (isLoggingOut || getIsExplicitLogoutInProgress()) {
      return;
    }

    if (!loading && !user && !isPublic) {
      router.navigate({ to: "/login", search: { redirect: path } });
    }
  }, [loading, user, isPublic, path, router, isLoggingOut]);
}

function RootComponent() {
  // Instância única de QueryClient: criada em getRouter() e compartilhada
  // entre loaders (router context) e componentes (QueryClientProvider).
  const { queryClient } = Route.useRouteContext();
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate />
          <Toaster />
          <AuthenticatedModals />
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
