// Auth store — Zustand-based authentication replacing Context API
// Benefits: selective subscriptions, no full-tree re-renders, SSR-safe
import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  /** Current authenticated user, or null */
  user: User | null;
  /** Current Supabase session, or null */
  session: Session | null;
  /** Auth loading state */
  loading: boolean;
  /** Derived auth status */
  status: AuthStatus;

  // === Actions ===
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  status: "loading",

  setSession: (session) =>
    set({
      user: session?.user ?? null,
      session,
      loading: false,
      status: session?.user ? "authenticated" : "unauthenticated",
    }),

  setUser: (user) =>
    set((s) => ({
      user,
      status: user ? "authenticated" : "unauthenticated",
      session: user ? s.session : null,
    })),

  setLoading: (loading) =>
    set((s) => ({
      loading,
      status: loading ? "loading" : s.user ? "authenticated" : "unauthenticated",
    })),

  reset: () =>
    set({
      user: null,
      session: null,
      loading: false,
      status: "unauthenticated",
    }),
}));
