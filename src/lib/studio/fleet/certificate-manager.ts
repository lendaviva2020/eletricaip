/**
 * ElétricAi Industrial OS — X.509 Certificate Manager
 * Paridade com o Security & Certificate Management do CODESYS V3.5:
 * Gerenciamento de certificados TLS e OPC UA, verificação de validade e alertas de expiração.
 */

import { X509Certificate } from "../canonical/types";

export type CertificateStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_YET_VALID";

export interface CertificateHealthReport {
  id: string;
  subject: string;
  issuer: string;
  purpose: string;
  status: CertificateStatus;
  daysUntilExpiration: number;
  thumbprint: string;
}

export class IndustrialCertificateManager {
  private certificates: Map<string, X509Certificate> = new Map();

  constructor(initialCertificates: X509Certificate[] = []) {
    for (const cert of initialCertificates) {
      this.certificates.set(cert.id, cert);
    }
  }

  public registerCertificate(cert: X509Certificate): void {
    this.certificates.set(cert.id, cert);
  }

  public removeCertificate(id: string): void {
    this.certificates.delete(id);
  }

  /**
   * Avalia a validade de todos os certificados cadastrados
   */
  public evaluateCertificates(now: Date = new Date()): CertificateHealthReport[] {
    const reports: CertificateHealthReport[] = [];

    for (const cert of this.certificates.values()) {
      const from = new Date(cert.validFrom);
      const to = new Date(cert.validTo);
      const diffTime = to.getTime() - now.getTime();
      const daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status: CertificateStatus = "VALID";

      if (now < from) {
        status = "NOT_YET_VALID";
      } else if (now > to) {
        status = "EXPIRED";
      } else if (daysUntilExpiration <= 30) {
        status = "EXPIRING_SOON";
      }

      reports.push({
        id: cert.id,
        subject: cert.subject,
        issuer: cert.issuer,
        purpose: cert.purpose,
        status,
        daysUntilExpiration,
        thumbprint: cert.thumbprintSha256,
      });
    }

    return reports;
  }
}
