// Tipos compartilhados do relatório de verificação da IA (normativa + simulação).
import type { NormFinding } from "@/lib/norm-validator";
import type { LogicFinding } from "@/lib/ladder/verify-estop";

export type VerificationFinding =
  (NormFinding & { kind: "norm" }) | (LogicFinding & { kind: "logic" });

export interface VerificationReport {
  rounds: number;
  findings: VerificationFinding[];
  summary: { errors: number; warns: number; infos: number };
  correctionFailed?: boolean;
}

export const summarizeVerification = (findings: VerificationFinding[]) => ({
  errors: findings.filter((f) => f.severity === "error").length,
  warns: findings.filter((f) => f.severity === "warn").length,
  infos: findings.filter((f) => f.severity === "info").length,
});
