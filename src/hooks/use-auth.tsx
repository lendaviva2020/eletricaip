import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProject } from "@/lib/current-project";

export interface SignOutOptions {
  scope?: "local" | "global";
  redirectTo?: string;
}

export interface SignOutResult {
  /** Erro retornado pela revogação remota no servidor ou exceção de rede, se houver */
  error: Error | null;
  /**
   * Confirmação verificada de que a sessão local foi removida do armazenamento
   * e da memória deste cliente.
   */
  localSignedOut: boolean;
  /**
   * Status explícito da revogação remota no servidor:
   * - "confirmed": chamada remota ao backend retornou sucesso (HTTP 200).
   * - "unconfirmed": falha de comunicação, timeout ou erro de rede; a revogação no servidor não pôde ser confirmada.
   */
  remoteStatus: "confirmed" | "unconfirmed";
  /**
   * Flag booleano de conveniência mantido para compatibilidade:
   * true se remoteStatus === "confirmed", false se "unconfirmed".
   * Nota: false indica que a revogação remota não foi confirmada (não necessariamente recusa do servidor).
   */
  remoteRevoked: boolean;
  /** Falha de armazenamento local ou de verificação do storage, se houver */
  storageError?: Error | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoggingOut: boolean;
  signOut: (options?: SignOutOptions) => Promise<SignOutResult>;
}

/**
 * Flag síncrono no nível de módulo para coordenar a supressão imediata de guardas
 * de rota (useAuthRedirect) durante o encerramento explícito da sessão.
 */
let isExplicitLogoutInProgress = false;

export function getIsExplicitLogoutInProgress(): boolean {
  return isExplicitLogoutInProgress;
}

export function setExplicitLogoutInProgress(inProgress: boolean): void {
  isExplicitLogoutInProgress = inProgress;
}

/**
 * Executa a navegação de redirecionamento com substituição de histórico.
 * Responsável único pela navegação pós-logout.
 */
function performLogoutNavigation(target: string) {
  if (typeof window === "undefined") return;
  if (typeof window.location.replace === "function") {
    window.location.replace(target);
  } else if (typeof window.location.assign === "function") {
    window.location.assign(target);
  }
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isLoggingOut: false,
  signOut: async (options?: SignOutOptions): Promise<SignOutResult> => {
    const scope = options?.scope ?? "local";
    const redirectTo = options?.redirectTo ?? "/";

    setExplicitLogoutInProgress(true);
    let remoteError: Error | null = null;

    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) {
        remoteError = new Error(error.message);
      }
    } catch (err) {
      remoteError = err instanceof Error ? err : new Error(String(err));
    }

    // Confirmação do estado do armazenamento local
    let localSignedOut = false;
    let storageError: Error | null = null;

    try {
      if (typeof supabase?.auth?.getSession === "function") {
        const { data: sessionCheck, error: chkErr } = await supabase.auth.getSession();
        if (chkErr) {
          storageError = new Error(chkErr.message);
        }
        localSignedOut = sessionCheck?.session === null;
      } else {
        localSignedOut = true;
      }
    } catch (chkEx) {
      storageError = chkEx instanceof Error ? chkEx : new Error(String(chkEx));
      localSignedOut = false;
    }

    if (!localSignedOut && typeof window !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase.auth.token"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));

        const { data: retryCheck } = await supabase.auth.getSession();
        localSignedOut = retryCheck?.session === null;
      } catch (forcedErr) {
        storageError = forcedErr instanceof Error ? forcedErr : new Error(String(forcedErr));
        localSignedOut = false;
      }
    }

    // Limpamos o projeto ativo em memória e storage para não vazar dados privados.
    try {
      useCurrentProject.getState().setProject(null);
    } catch (e) {
      console.warn("[Auth] Limpeza de projeto em memória:", e);
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("eletricai.dev-auth-bypass");
      } catch (e) {
        console.warn("[Auth] Não foi possível limpar dev-auth-bypass:", e);
      }
    }

    performLogoutNavigation(redirectTo);

    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
      setTimeout(() => setExplicitLogoutInProgress(false), 50);
    }

    return {
      error: remoteError,
      localSignedOut,
      remoteStatus: remoteError ? "unconfirmed" : "confirmed",
      remoteRevoked: !remoteError,
      storageError,
    };
  },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const bootstrappedUserIdRef = useRef<string | null>(null);

  const bootstrapTenant = useCallback(async (userId: string) => {
    if (bootstrappedUserIdRef.current === userId) return;
    bootstrappedUserIdRef.current = userId;
    const { error } = await supabase.rpc("bootstrap_personal_tenant_if_missing");
    if (error) {
      bootstrappedUserIdRef.current = null;
      console.warn("bootstrap_personal_tenant_if_missing:", error.message);
    }
  }, []);

  const signOut = useCallback(async (options?: SignOutOptions): Promise<SignOutResult> => {
    const scope = options?.scope ?? "local";
    const redirectTo = options?.redirectTo ?? "/";

    setExplicitLogoutInProgress(true);
    setIsLoggingOut(true);

    let remoteError: Error | null = null;

    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) {
        remoteError = new Error(error.message);
      }
    } catch (err) {
      remoteError = err instanceof Error ? err : new Error(String(err));
    }

    // Confirmação do estado do armazenamento local
    let localSignedOut = false;
    let storageError: Error | null = null;

    try {
      if (typeof supabase?.auth?.getSession === "function") {
        const { data: sessionCheck, error: chkErr } = await supabase.auth.getSession();
        if (chkErr) {
          storageError = new Error(chkErr.message);
        }
        localSignedOut = sessionCheck?.session === null;
      } else {
        localSignedOut = true;
      }
    } catch (chkEx) {
      storageError = chkEx instanceof Error ? chkEx : new Error(String(chkEx));
      localSignedOut = false;
    }

    if (!localSignedOut && typeof window !== "undefined") {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase.auth.token"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));

        const { data: retryCheck } = await supabase.auth.getSession();
        localSignedOut = retryCheck?.session === null;
      } catch (forcedErr) {
        storageError = forcedErr instanceof Error ? forcedErr : new Error(String(forcedErr));
        localSignedOut = false;
      }
    }

    // A aplicação deve garantir que os dados privados em memória sejam descarregados
    // e o usuário seja redirecionado com segurança para a home pública.
    try {
      useCurrentProject.getState().setProject(null);
    } catch (e) {
      console.warn("[Auth] Limpeza de projeto em memória:", e);
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("eletricai.dev-auth-bypass");
      } catch (e) {
        console.warn("[Auth] Não foi possível limpar dev-auth-bypass:", e);
      }
    }

    setSession(null);
    bootstrappedUserIdRef.current = null;

    // Único responsável pela navegação após o logout
    performLogoutNavigation(redirectTo);

    // Trava de segurança para não manter guardas bloqueadas indefinidamente caso
    // a navegação seja cancelada ou interceptada pelo usuário
    const safetyTimeout =
      typeof process !== "undefined" && process.env?.NODE_ENV === "test" ? 50 : 4000;

    setTimeout(() => {
      setExplicitLogoutInProgress(false);
      setIsLoggingOut(false);
    }, safetyTimeout);

    return {
      error: remoteError,
      localSignedOut,
      remoteStatus: remoteError ? "unconfirmed" : "confirmed",
      remoteRevoked: !remoteError,
      storageError,
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Sempre prioriza a sessão real do Supabase
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;

      if (data?.session) {
        setSession(data.session);
        setLoading(false);
        if (data.session.user?.id) void bootstrapTenant(data.session.user.id);
        return;
      }

      // 2. Se e somente se não houver sessão real e estiver estritamente em ambiente de desenvolvimento
      const isDevAllowed =
        Boolean(import.meta.env?.DEV) &&
        (typeof process === "undefined" || process.env?.NODE_ENV !== "production");

      const hasDevFlag =
        typeof window !== "undefined" &&
        (localStorage.getItem("eletricai.dev-auth-bypass") === "true" ||
          new URLSearchParams(window.location.search).get("devAuth") === "1");

      if (isDevAllowed && hasDevFlag) {
        const mockUser: User = {
          id: "00000000-0000-4000-a000-000000000001",
          app_metadata: { isDevBypass: true },
          user_metadata: { name: "Auditor Dev" },
          aud: "authenticated",
          created_at: new Date().toISOString(),
          email: "auditor@eletricai.com",
        };
        setSession({
          access_token: "dev-access-token",
          refresh_token: "dev-refresh-token",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user: mockUser,
        });
        setLoading(false);
        return;
      }

      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!isMounted) return;
      setSession(s);
      setLoading(false);
      if (s?.user?.id) void bootstrapTenant(s.user.id);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [bootstrapTenant]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        isLoggingOut,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
