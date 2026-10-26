// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogoutButton } from "@/components/auth/logout-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProject } from "@/lib/current-project";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// Mock Sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Settings Logout functionality", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.clearAllMocks();
    useCurrentProject.getState().setProject({ id: "proj-123", name: "Projeto Teste" });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the logout button with proper accessible label and icon", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton label="Sair da conta" />
      </QueryClientProvider>
    );

    const btn = screen.getByRole("button", { name: /sair da conta/i });
    expect(btn).toBeDefined();
  });

  it("opens confirmation alert dialog when clicked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton label="Sair da conta" />
      </QueryClientProvider>
    );

    const triggerBtn = screen.getByRole("button", { name: /sair da conta/i });
    fireEvent.click(triggerBtn);

    expect(await screen.findByText(/deseja sair da sua conta\?/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sim, sair da conta/i })).toBeDefined();
  });

  it("closes dialog when user clicks Cancel without calling signOut", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton label="Sair da conta" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /sair da conta/i }));
    const cancelBtn = await screen.findByRole("button", { name: /cancelar/i });
    fireEvent.click(cancelBtn);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(useCurrentProject.getState().project).not.toBeNull();
  });

  it("calls supabase.auth.signOut, clears query cache and current project on confirmation", async () => {
    const clearSpy = vi.spyOn(queryClient, "clear");

    // Mock window.location.assign
    const originalLocation = window.location;
    const assignMock = vi.fn();
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = { assign: assignMock };

    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton label="Sair da conta" scope="local" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /sair da conta/i }));
    const confirmBtn = await screen.findByRole("button", { name: /sim, sair da conta/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    });

    expect(useCurrentProject.getState().project).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
    expect(assignMock).toHaveBeenCalledWith("/login");

    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("supports global scope for ending sessions on all devices", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: unknown }).location = { assign: assignMock };

    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton label="Encerrar todas" scope="global" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /encerrar todas/i }));
    const confirmBtn = await screen.findByRole("button", { name: /encerrar todas/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    });

    expect(assignMock).toHaveBeenCalledWith("/login");
    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("verifies settings.tsx contains 'Sair da conta' at the bottom", () => {
    const settingsSrc = readFileSync(resolve(__dirname, "../routes/settings.tsx"), "utf8");
    expect(settingsSrc).toContain("Conta & Segurança da Sessão");
    expect(settingsSrc).toContain("Sair da conta");
    expect(settingsSrc).toContain("<LogoutButton");

    // Garante que a seção de logout está após normas aplicadas
    const normasIdx = settingsSrc.indexOf("Normas aplicadas");
    const logoutIdx = settingsSrc.indexOf("Conta & Segurança da Sessão");
    expect(logoutIdx).toBeGreaterThan(normasIdx);
  });

  it("verifies settings.security.tsx provides both local and global logout", () => {
    const secSrc = readFileSync(resolve(__dirname, "../routes/settings.security.tsx"), "utf8");
    expect(secSrc).toContain('scope="local"');
    expect(secSrc).toContain('scope="global"');
    expect(secSrc).toContain("Sair deste dispositivo");
    expect(secSrc).toContain("Encerrar em todos os dispositivos");
  });
});
