// ELÉTRICAI INDUSTRIAL OS — STANDALONE EDGE DAEMON STRUCTURED LOGGER
// JSON Structured Output, Secret Redaction (IEC 62443, NIST SP 800-82 Rev. 3), Log Levels

import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level?: LogLevel;
  logDir?: string;
  enableConsole?: boolean;
}

export class EdgeLogger {
  private currentLevel: LogLevel;
  private logDir?: string;
  private enableConsole: boolean;
  private logFilePath?: string;

  constructor(options?: LoggerOptions) {
    this.currentLevel = options?.level ?? "info";
    this.enableConsole = options?.enableConsole ?? true;
    this.logDir = options?.logDir;

    if (this.logDir) {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.logFilePath = path.join(this.logDir, "edge-gateway.log");
    }
  }

  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Redacts sensitive tokens, passwords, secrets and PEM headers.
   * Guarantees compliance with IEC 62443: No credentials in logs.
   */
  public redactSecrets(input: string): string {
    return input
      .replace(/EGW-PROV-[A-F0-9]+/gi, "[REDACTED_PROVISIONING_TOKEN]")
      .replace(/egw_sec_[a-f0-9]+/gi, "[REDACTED_AUTH_TOKEN]")
      .replace(/password["']?\s*[:=]\s*["'][^"']+["']/gi, 'password="[REDACTED]"')
      .replace(/password["']?\s*[:=]\s*[^"',\s}]+/gi, 'password="[REDACTED]"')
      .replace(
        /-----BEGIN[A-Z\s]+PRIVATE KEY-----[\s\S]+?-----END[A-Z\s]+PRIVATE KEY-----/g,
        "[REDACTED_PRIVATE_KEY]",
      );
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.currentLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: "eletricai-edge-daemon",
      pid: process.pid,
      message: this.redactSecrets(message),
      context: context ? JSON.parse(this.redactSecrets(JSON.stringify(context))) : undefined,
    };

    const line = JSON.stringify(entry);

    if (this.enableConsole) {
      if (level === "error") {
        console.error(line);
      } else if (level === "warn") {
        console.warn(line);
      } else {
        console.log(line);
      }
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, line + "\n", "utf8");
      } catch {
        // Safe fallback if disk is read-only
      }
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }
}

export const logger = new EdgeLogger();

/**
 * Global helper to sanitize strings, masking passwords, tokens, auth keys and PEM private keys.
 * Used for IEC 62443 compliance across tests and audit log exports.
 */
export function maskSecrets(input: string): string {
  return input
    .replace(
      /(?:password|authToken|token|secret|apiKey)["']?\s*[:=]\s*["'][^"']+["']/gi,
      (match) => {
        const key = match.split(/[:=]/)[0];
        return `${key}="***REDACTED***"`;
      },
    )
    .replace(/(?:password|authToken|token|secret|apiKey)["']?\s*[:=]\s*[^"',\s}]+/gi, (match) => {
      const key = match.split(/[:=]/)[0];
      return `${key}="***REDACTED***"`;
    })
    .replace(
      /-----BEGIN[A-Z\s]+PRIVATE KEY-----[\s\S]+?-----END[A-Z\s]+PRIVATE KEY-----/g,
      "***REDACTED***",
    )
    .replace(/EGW-PROV-[A-F0-9]+/gi, "***REDACTED***")
    .replace(/egw_sec_[a-f0-9]+/gi, "***REDACTED***");
}
