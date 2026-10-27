// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogoutButton } from "@/components/auth/logout-dialog";
import {
  AuthProvider,
  useAuth,
  getIsExplicitLogoutInProgress,
  setExplicitLogoutInProgress,
} from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProject } from "@/lib/current-project";
import { isSafeRedirect, getSafeRedirect } from "@/lib/safe-redirect";
import { toast } from "sonner";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock Sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("ELÉTRICAI — Fluxo Definitivo de Autenticação, Logout e Redirecionamento", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    setExplicitLogoutInProgress(false);
    useCurrentProject.getState().setProject({ id: "proj-123", name: "Painel Elétrico Linha 1" });
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Logout a partir de /settings redireciona para a página pública inicial '/' SEM parâmetro redirect", async () => {
    const replaceMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      replace: replaceMock,
      pathname: "/settings",
      search: "",
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton label="Sair da conta" scope="local" />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Abre o modal de confirmação
    fireEvent.click(screen.getByRole("button", { name: /sair da conta/i }));
    expect(await screen.findByText(/deseja sair da sua conta\?/i)).toBeDefined();

    // Confirma saída
    fireEvent.click(screen.getByRole("button", { name: /sim, sair da conta/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    });

    // Valida que o redirecionamento foi para '/' e nunca conteve '?redirect=/settings'
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(replaceMock).not.toHaveBeenCalledWith(expect.stringContaining("redirect"));
    expect(useCurrentProject.getState().project).toBeNull();

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("2. O flag isExplicitLogoutInProgress suprime guardas de rota prevenindo que useAuthRedirect force /login?redirect=/settings", async () => {
    expect(getIsExplicitLogoutInProgress()).toBe(false);

    setExplicitLogoutInProgress(true);
    expect(getIsExplicitLogoutInProgress()).toBe(true);

    // Simula a lógica do useAuthRedirect quando deslogado
    const routerNavigateMock = vi.fn();
    const loading = false;
    const user = null;
    const isPublic = false;
    const path = "/settings";

    // Quando isExplicitLogoutInProgress é true:
    if (!getIsExplicitLogoutInProgress() && !loading && !user && !isPublic) {
      routerNavigateMock({ to: "/login", search: { redirect: path } });
    }
    expect(routerNavigateMock).not.toHaveBeenCalled();

    // Quando isExplicitLogoutInProgress é false (sessão expirada naturalmente):
    setExplicitLogoutInProgress(false);
    if (!getIsExplicitLogoutInProgress() && !loading && !user && !isPublic) {
      routerNavigateMock({ to: "/login", search: { redirect: path } });
    }
    expect(routerNavigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/settings" },
    });
  });

  it("3. Histórico do navegador: substituição via location.replace impede retorno a páginas privadas", async () => {
    const replaceMock = vi.fn();
    const assignMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      replace: replaceMock,
      assign: assignMock,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton label="Sair da conta" />
        </AuthProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /sair da conta/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sim, sair da conta/i }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/");
    });

    // replace substitui a entrada atual no histórico exatamente 1 vez, sem duplo redirecionamento
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();

    // Memória privada foi invalidada
    expect(useCurrentProject.getState().project).toBeNull();

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("4. Suporte a logout global ('Encerrar todas') repassando scope='global' ao Supabase oficial e confirmando sucesso", async () => {
    const replaceMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      replace: replaceMock,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton label="Encerrar todas" scope="global" />
        </AuthProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /encerrar todas/i }));
    fireEvent.click(await screen.findByRole("button", { name: /encerrar todas/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    });

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(toast.success).toHaveBeenCalledWith("Todas as sessões foram encerradas com sucesso.");

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("5. Falha de rede/API em logout local: remove sessão local, purga cache/projeto, redireciona para '/' e emite aviso claro", async () => {
    // Simula falha remota no Supabase (status 503 / network failure)
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
      error: {
        name: "AuthApiError",
        message: "Network connection lost",
        status: 503,
      } as unknown as import("@supabase/supabase-js").AuthError,
    });

    const replaceMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      replace: replaceMock,
    };

    const clearSpy = vi.spyOn(queryClient, "clear");

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton label="Sair da conta" scope="local" />
        </AuthProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /sair da conta/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sim, sair da conta/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    });

    // 1. Mensagem transparente de aviso (NÃO declara falso sucesso remoto)
    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Sessão encerrada neste dispositivo. A revogação no servidor não pôde ser confirmada (Network connection lost).",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();

    // 2. Projeto ativo e cache do React Query FORAM expurgados para não deixar dados privados expostos
    expect(useCurrentProject.getState().project).toBeNull();
    expect(clearSpy).toHaveBeenCalled();

    // 3. Redirecionamento para '/' FOI disparado (usuário não fica preso em /settings)
    expect(replaceMock).toHaveBeenCalledWith("/");

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("6. Falha de rede/API em logout global: alerta que os demais dispositivos não puderam ser confirmados", async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
      error: {
        name: "AuthApiError",
        message: "Server unreachable",
        status: 500,
      } as unknown as import("@supabase/supabase-js").AuthError,
    });

    const replaceMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = {
      replace: replaceMock,
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LogoutButton label="Encerrar todas" scope="global" />
        </AuthProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /encerrar todas/i }));
    fireEvent.click(await screen.findByRole("button", { name: /encerrar todas/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    });

    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Sessão deste dispositivo encerrada. Não foi possível confirmar a desconexão nos demais dispositivos (Server unreachable).",
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/");

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("7. Validação de destino pós-login: impede ciclos /login -> /login e sanitiza destinos maliciosos", () => {
    // Ciclos bloqueados
    expect(isSafeRedirect("/login")).toBe(false);
    expect(isSafeRedirect("/login?redirect=%2Fsettings")).toBe(false);
    expect(isSafeRedirect("/signup")).toBe(false);
    expect(getSafeRedirect("/login")).toBe("/dashboard");

    // URLs maliciosas bloqueadas
    expect(isSafeRedirect("//phishing.com/dashboard")).toBe(false);
    expect(isSafeRedirect("/\\phishing.com")).toBe(false);
    expect(isSafeRedirect("https://attacker.com")).toBe(false);
    expect(getSafeRedirect("//phishing.com")).toBe("/dashboard");

    // Destinos válidos permitidos
    expect(isSafeRedirect("/settings")).toBe(true);
    expect(isSafeRedirect("/workspace")).toBe(true);
    expect(isSafeRedirect("/")).toBe(true);
    expect(getSafeRedirect("/settings")).toBe("/settings");
  });

  it("8. Hook useAuth expõe isLoggingOut e signOut estruturado com SignOutResult discriminando remoteRevoked", async () => {
    let resultRef: unknown = null;
    function TestConsumer() {
      const { user, isLoggingOut, signOut } = useAuth();
      return (
        <div>
          <span data-testid="user-status">{user ? "authenticated" : "anonymous"}</span>
          <span data-testid="logging-out">{isLoggingOut ? "yes" : "no"}</span>
          <button
            onClick={async () => {
              resultRef = await signOut({ scope: "local", redirectTo: "/" });
            }}
          >
            Trigger SignOut
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("logging-out").textContent).toBe("no");
    expect(screen.getByTestId("user-status").textContent).toBe("anonymous");

    fireEvent.click(screen.getByRole("button", { name: /trigger signout/i }));

    await waitFor(() => {
      expect(resultRef).not.toBeNull();
    });

    expect(resultRef).toEqual({
      error: null,
      localSignedOut: true,
      remoteStatus: "confirmed",
      remoteRevoked: true,
      storageError: null,
    });
  });
});
