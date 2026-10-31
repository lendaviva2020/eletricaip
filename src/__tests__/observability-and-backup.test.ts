import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureException,
  clearCapturedErrorEvents,
  consumeLastCapturedError,
  getCapturedErrorEvents,
  maskSensitiveData,
  maskSensitiveString,
  parseSentryDsn,
  parseStackFrames,
  setErrorTelemetryTransport,
} from "../lib/error-capture";

describe("Fase 9 — Observabilidade, Rastreamento de Erros e Backups", () => {
  beforeEach(() => {
    clearCapturedErrorEvents();
    setErrorTelemetryTransport(null);
  });

  describe("Tarefa 9.1 — Captura de Exceções e Mascaramento de Credenciais", () => {
    it("mascara tokens Bearer, JWTs, chaves Gemini/Stripe/Supabase e senhas em strings", () => {
      const raw =
        "Falha ao conectar em postgresql://postgres:SuperSecret123!@db.internal:5432/app " +
        "com header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c " +
        "e apiKey=AIzaSyD-9876543210abcdefghijklmnopqrstuvwx " +
        "e stripe=sk_live_51NxyzABCDEFGHIJKLMNOPQRST";

      const scrubbed = maskSensitiveString(raw);

      expect(scrubbed).not.toContain("SuperSecret123!");
      expect(scrubbed).toContain("[REDACTED_PASSWORD]");
      expect(scrubbed).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(scrubbed).toContain("Bearer [REDACTED_TOKEN]");
      expect(scrubbed).not.toContain("AIzaSyD-9876543210abcdefghijklmnopqrstuvwx");
      expect(scrubbed).toContain("[REDACTED_API_KEY]");
      expect(scrubbed).not.toContain("sk_live_51NxyzABCDEFGHIJKLMNOPQRST");
      expect(scrubbed).toContain("[REDACTED_STRIPE_KEY]");
    });

    it("mascara recursivamente objetos aninhados contendo senhas, tokens e cookies", () => {
      const context = {
        user: {
          id: "usr_123",
          password: "my-plain-password",
          senhaConfirmacao: "outra-senha",
        },
        headers: {
          Authorization: "Bearer secret-jwt-token",
          Cookie: "sb-access-token=xyz987",
          "x-request-id": "req-001",
        },
        stripeWebhookSecret: "whsec_1234567890abcdefghijklmnop",
      };

      const masked = maskSensitiveData(context);

      expect(masked.user.id).toBe("usr_123");
      expect(masked.user.password).toBe("[REDACTED]");
      expect(masked.user.senhaConfirmacao).toBe("[REDACTED]");
      expect(masked.headers.Authorization).toBe("[REDACTED]");
      expect(masked.headers.Cookie).toBe("[REDACTED]");
      expect(masked.headers["x-request-id"]).toBe("req-001");
      expect(masked.stripeWebhookSecret).toBe("[REDACTED]");
    });

    it("captura exceção com rastreamento completo da pilha (stack trace) e envia ao transporte Sentry", () => {
      const dispatchedPayloads: Array<{
        eventId: string;
        sentryPayload: Record<string, unknown>;
      }> = [];

      setErrorTelemetryTransport((event, sentryPayload) => {
        dispatchedPayloads.push({ eventId: event.eventId, sentryPayload });
      });

      const err = new Error("Erro fatal com token=segredo_industrial_999");
      const captured = captureException(
        err,
        {
          source: "RootErrorComponent",
          apiKey: "AIzaSyD1234567890abcdefghijklmnopqrstuv",
          route: "/workspace",
        },
        "fatal",
      );

      expect(captured.eventId).toMatch(/^[0-9a-f]{32}$/);
      expect(captured.level).toBe("fatal");
      expect(captured.message).not.toContain("segredo_industrial_999");
      expect(captured.message).toContain("token=[REDACTED]");
      expect(captured.stack).toBeDefined();
      expect(captured.frames.length).toBeGreaterThan(0);
      expect(captured.context.apiKey).toBe("[REDACTED]");
      expect(captured.context.route).toBe("/workspace");

      expect(getCapturedErrorEvents()).toHaveLength(1);
      expect(dispatchedPayloads).toHaveLength(1);
      expect(dispatchedPayloads[0].eventId).toBe(captured.eventId);

      // Também preserva compatibilidade com consumeLastCapturedError usado pelo server.ts
      expect(consumeLastCapturedError()).toBe(err);
      expect(consumeLastCapturedError()).toBeUndefined();
    });

    it("faz parsing correto de Sentry DSN e de frames de stack trace", () => {
      const parsed = parseSentryDsn("https://abcdef123456@o12345.ingest.sentry.io/987654");
      expect(parsed).not.toBeNull();
      expect(parsed?.publicKey).toBe("abcdef123456");
      expect(parsed?.projectId).toBe("987654");
      expect(parsed?.endpointUrl).toContain(
        "https://o12345.ingest.sentry.io/api/987654/store/?sentry_version=7&sentry_key=abcdef123456",
      );

      const frames = parseStackFrames(
        "Error: Boom\n    at calculateShortCircuit (src/lib/electrical-calculations.ts:120:15)\n    at src/routes/__root.tsx:60:5",
      );
      expect(frames).toHaveLength(2);
      expect(frames[0].function).toBe("calculateShortCircuit");
      expect(frames[0].lineno).toBe(120);
    });
  });

  describe("Tarefa 9.2 — Rotina Automatizada de Backup e Restauração (30 dias)", () => {
    const rootDir = resolve(__dirname, "../..");

    it("possui scripts de backup (pg_dump + 30d retention) e restore com verificação SHA-256 e proteção de produção", () => {
      const backupScriptPath = resolve(rootDir, "scripts/backup-db.sh");
      const restoreScriptPath = resolve(rootDir, "scripts/restore-db.sh");
      const workflowPath = resolve(rootDir, ".github/workflows/db-backup.yml");
      const runbookPath = resolve(rootDir, "docs/auditoria/PROCEDIMENTO_BACKUP_RESTORE.md");

      expect(existsSync(backupScriptPath)).toBe(true);
      expect(existsSync(restoreScriptPath)).toBe(true);
      expect(existsSync(workflowPath)).toBe(true);
      expect(existsSync(runbookPath)).toBe(true);

      const backupContent = readFileSync(backupScriptPath, "utf-8");
      expect(backupContent).toContain("pg_dump");
      expect(backupContent).toContain("--format=custom");
      expect(backupContent).toContain("BACKUP_RETENTION_DAYS:-30");
      expect(backupContent).toContain("sha256sum");

      const restoreContent = readFileSync(restoreScriptPath, "utf-8");
      expect(restoreContent).toContain("pg_restore");
      expect(restoreContent).toContain("--single-transaction");
      expect(restoreContent).toContain("ALLOW_PRODUCTION_RESTORE");
      expect(restoreContent).toContain("information_schema.tables");

      const workflowContent = readFileSync(workflowPath, "utf-8");
      expect(workflowContent).toContain('cron: "0 3 * * *"');
      expect(workflowContent).toContain('BACKUP_RETENTION_DAYS: "30"');
      expect(workflowContent).toContain("./scripts/backup-db.sh");
      expect(workflowContent).toContain("./scripts/restore-db.sh");
    });
  });
});
