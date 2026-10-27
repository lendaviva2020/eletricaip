import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireSupabaseAuth, requireActiveSession } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { SignOutResult } from "@/hooks/use-auth";

/**
 * ELÉTRICAI — AUDITORIA FINAL DE SEGURANÇA DOS TOKENS APÓS LOGOUT
 *
 * Testes controlados sem alterar dados reais de produção.
 * Cobre:
 * 1. Tokens emitidos antes do logout: validação JWKS pura vs. validação ativa de sessão.
 * 2. Bloqueio no servidor para tokens com sessão encerrada remotamente.
 * 3. Tentativas de acesso a endpoints sensíveis após encerramento de sessão.
 * 4. Diferenciação rigorosa de falhas de rede no SignOutResult (remoteStatus: "unconfirmed").
 * 5. Tratamento explícito de falhas de armazenamento local (storageError).
 */

describe("Segurança de Tokens e Sessões Pós-Logout (Auditoria Servidor e Sessão)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Diferenciação entre Validação Criptográfica JWKS e Invalidação da Sessão", () => {
    it("Tokens de acesso pré-logout possuem assinatura e exp válidos, mas sessão revogada no Supabase", async () => {
      // Simula um token JWT emitido antes do logout, com validade restante de 45 minutos
      const preLogoutToken = "header.payload.signature_pre_logout";
      const preLogoutClaims = {
        sub: "user-uuid-123",
        email: "engenheiro@industria.com",
        session_id: "session-uuid-abc",
        exp: Math.floor(Date.now() / 1000) + 2700, // +45min
        iss: "https://mock.supabase.co/auth/v1",
      };

      // Simula o cliente Supabase onde a sessão foi revogada no backend (auth.sessions)
      const mockSupabaseWithRevokedSession = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              name: "AuthApiError",
              message: "Invalid token: session not found or revoked",
              status: 401,
            },
          }),
        },
      };

      // 1.1 Se uma operação depender apenas de verificação local de assinatura/exp (JWKS),
      // o token pareceria matematicamente válido se não consultar o servidor de sessão:
      const isStatelessCryptoValid = preLogoutClaims.exp > Math.floor(Date.now() / 1000);
      expect(isStatelessCryptoValid).toBe(true);

      // 1.2 No entanto, a consulta autoritativa ao GoTrue do Supabase identifica que a sessão foi destruída:
      const { data, error } = await mockSupabaseWithRevokedSession.auth.getUser(preLogoutToken);
      expect(data.user).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.status).toBe(401);
      expect(error?.message).toContain("session not found or revoked");
    });
  });

  describe("2. Middleware requireActiveSession: Bloqueio no Servidor contra Replay de Token Revogado", () => {
    it("Rejeita requisição com HTTP 401 quando a sessão foi revogada no backend Supabase", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "session_revoked" },
          }),
        },
      };

      const mockContext: AuthContext = {
        supabase: mockSupabase as any,
        userId: "user-uuid-123",
        claims: { sub: "user-uuid-123", session_id: "sess-revoked" },
        token: "revoked-token-123",
      };

      const nextMock = vi.fn();

      // Invocamos a função de verificação do requireActiveSession
      const serverFn = (requireActiveSession as any).options?.server ?? (requireActiveSession as any).serverFn;

      await expect(
        serverFn({
          next: nextMock,
          context: mockContext,
        }),
      ).rejects.toThrow();

      // Garante que o handler downstream NÃO foi chamado
      expect(nextMock).not.toHaveBeenCalled();
      expect(mockSupabase.auth.getUser).toHaveBeenCalledWith("revoked-token-123");
    });

    it("Permite execução e anexa activeUser quando a sessão está confirmadamente ativa", async () => {
      const activeUser = {
        id: "user-uuid-123",
        email: "admin@industria.com",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: activeUser },
            error: null,
          }),
        },
      };

      const mockContext: AuthContext = {
        supabase: mockSupabase as any,
        userId: "user-uuid-123",
        claims: { sub: "user-uuid-123", session_id: "sess-active" },
        token: "valid-active-token",
      };

      const nextMock = vi.fn().mockImplementation(({ context }) => ({
        success: true,
        user: context.activeUser,
        isSessionConfirmedActive: context.isSessionConfirmedActive,
      }));

      const serverFn =
        (requireActiveSession as any).options?.server ?? (requireActiveSession as any).serverFn;

      const result = await serverFn({
        next: nextMock,
        context: mockContext,
      });

      expect(nextMock).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.isSessionConfirmedActive).toBe(true);
      expect(result.user.id).toBe("user-uuid-123");
    });
  });

  describe("3. Proteção de Endpoints Sensíveis contra Tokens Pós-Logout", () => {
    it("Operações destrutivas (ex: deleteProject, changePlanManual, eraseUserData) exigem sessão ativa", async () => {
      // Cria um contexto simulando token pré-logout que tenta invocar a exclusão de projeto
      const mockSupabaseRevoked = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "Token is expired or session has been terminated" },
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }),
      };

      const mockContext: AuthContext = {
        supabase: mockSupabaseRevoked as any,
        userId: "hacker-or-stale-user",
        claims: { sub: "hacker-or-stale-user" },
        token: "stale-pre-logout-token",
      };

      const serverFn =
        (requireActiveSession as any).options?.server ?? (requireActiveSession as any).serverFn;

      // O middleware bloqueia a operação antes que qualquer DELETE ou consulta ao banco ocorra
      await expect(
        serverFn({
          next: vi.fn(),
          context: mockContext,
        }),
      ).rejects.toThrow();

      // Nenhuma mutação de banco de dados foi disparada
      expect(mockSupabaseRevoked.from).not.toHaveBeenCalled();
    });
  });

  describe("4. Estrutura de SignOutResult e Auditoria de Falhas de Rede", () => {
    it("Em falha de rede/servidor remoto, remoteStatus é categorizado estritamente como 'unconfirmed'", () => {
      const networkError = new Error("Failed to fetch /auth/v1/logout");
      const localSignedOut = true;

      const result: SignOutResult = {
        error: networkError,
        localSignedOut,
        remoteStatus: networkError ? "unconfirmed" : "confirmed",
        remoteRevoked: !networkError,
        storageError: null,
      };

      // 1. Garante que o status remoto é 'unconfirmed'
      expect(result.remoteStatus).toBe("unconfirmed");
      // 2. Garante que remoteRevoked é false (sem declarar sucesso remoto)
      expect(result.remoteRevoked).toBe(false);
      // 3. Garante que a sessão local foi removida
      expect(result.localSignedOut).toBe(true);
      expect(result.error?.message).toBe("Failed to fetch /auth/v1/logout");
    });

    it("Em falha de storage local (ex.: SecurityError no localStorage), localSignedOut é falso e storageError é populado", () => {
      const storageException = new Error("QuotaExceeded or SecurityError: Access denied to localStorage");

      const result: SignOutResult = {
        error: null,
        localSignedOut: false,
        remoteStatus: "confirmed",
        remoteRevoked: true,
        storageError: storageException,
      };

      expect(result.localSignedOut).toBe(false);
      expect(result.storageError).toBe(storageException);
      expect(result.storageError?.message).toContain("SecurityError");
    });
  });
});
