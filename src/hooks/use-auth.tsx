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

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
      if (s?.user?.id) void bootstrapTenant(s.user.id);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user?.id) void bootstrapTenant(data.session.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [bootstrapTenant]);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
