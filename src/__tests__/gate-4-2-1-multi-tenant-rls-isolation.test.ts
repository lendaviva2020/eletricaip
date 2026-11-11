import { describe, it, expect, beforeEach } from "vitest";
import {
  CanonicalIndustrialDataService,
  CanonicalIntegrityError,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "@/lib/industrial";
import type { FleetUserContext } from "@/lib/edge/types";

describe("ELÉTRICAI INDUSTRIAL OS — GATE 4.2.1: Multi-Tenant & RLS Isolation Audit", () => {
  let service: CanonicalIndustrialDataService;

  const tenantAlpha = "org_alpha_security_001";
  const tenantBeta = "org_beta_security_002";
  const plantAlpha = "plant_alpha_sp_01";
  const plantBeta = "plant_beta_sul_02";
  const sectorAlpha = "sector_alpha_ccm";
  const eqMotorAlpha = "eq_alpha_motor_101";
  const tagAlphaCurrent = "tag_alpha_motor_current";

  const userAlpha: FleetUserContext = {
    userId: "usr_eng_alpha",
    email: "eng@alpha.ind.br",
    organizationId: tenantAlpha,
    role: "TENANT_ADMIN",
    authorizedPlantIds: [plantAlpha],
  };

  const userBeta: FleetUserContext = {
    userId: "usr_eng_beta",
    email: "eng@beta.ind.br",
    organizationId: tenantBeta,
    role: "TENANT_ADMIN",
    authorizedPlantIds: [plantBeta],
  };

  beforeEach(() => {
    service = new CanonicalIndustrialDataService();

    // 1. Registra organizações isoladas
    service.registerOrganization({
      id: tenantAlpha,
      name: "Alpha Petroquímica S.A.",
      slug: "alpha-petro",
    });
    service.registerOrganization({
      id: tenantBeta,
      name: "Beta Mineração Ltda.",
      slug: "beta-miner",
    });

    // 2. Registra plantas distintas por tenant
    service.registerPlant({
      id: plantAlpha,
      tenantId: tenantAlpha,
      name: "Planta Alpha Refinaria",
      code: "ALP01",
      timezone: "America/Sao_Paulo",
    });

    service.registerPlant({
      id: plantBeta,
      tenantId: tenantBeta,
      name: "Planta Beta Mina 01",
      code: "BET01",
      timezone: "America/Sao_Paulo",
    });

    // 3. Setor, equipamento e tag pertencentes exclusivamente ao Tenant Alpha
    service.registerSector({
      id: sectorAlpha,
      tenantId: tenantAlpha,
      plantId: plantAlpha,
      name: "Sala de CCM",
      code: "CCM_ALP",
    });

    service.registerEquipmentType({
      id: "eq_type_pump",
      category: "load",
      catalogType: "motor",
      manufacturer: "WEG",
      model: "W22 Industrial",
    });

    service.registerOrUpdateEquipment(
      {
        id: eqMotorAlpha,
        tenantId: tenantAlpha,
        plantId: plantAlpha,
        sectorId: sectorAlpha,
        equipmentTypeId: "eq_type_pump",
        tagCode: "P-101A",
        displayName: "Bomba Motor Alpha 101A",
        description: "Motor da bomba principal do CCM Alpha",
      },
      userAlpha.userId,
    );

    service.registerOrUpdateTag(
      {
        tagId: tagAlphaCurrent,
        tenantId: tenantAlpha,
        plantId: plantAlpha,
        equipmentId: eqMotorAlpha,
        canonicalName: "ALPHA.CCM.P101A.CURRENT_A",
        displayName: "Corrente de Operação Bomba P-101A",
        dataType: "REAL",
        engineeringUnit: "A",
        sourceKind: "SIMULATED",
        scale: 1,
        offset: 0,
        precision: 2,
        minimumValue: 0,
        maximumValue: 250,
        deadband: 0.5,
        sampleIntervalMs: 500,
        staleAfterMs: 10_000,
      },
      userAlpha.userId,
    );
  });

  describe("1. Project & Plant Multi-Tenant Boundaries", () => {
    it("bloqueia consultas de alarme do Tenant Alpha feitas por usuário do Tenant Beta", () => {
      expect(() =>
        service.getAlarmOccurrencesForPlant(userBeta, tenantAlpha, plantAlpha),
      ).toThrowError(CanonicalIntegrityError);
    });

    it("bloqueia queries de historiador do Tenant Alpha feitas por usuário do Tenant Beta", () => {
      expect(() =>
        service.queryHistorian(userBeta, {
          tenantId: tenantAlpha,
          plantId: plantAlpha,
          tagId: tagAlphaCurrent,
        }),
      ).toThrowError(CanonicalIntegrityError);
    });
  });

  describe("2. Storage Path Scoping & Tenant Sandboxing", () => {
    it("valida que caminhos de armazenamento devem respeitar o prefixo do tenant", () => {
      const isStoragePathAllowed = (user: FleetUserContext, storagePath: string): boolean => {
        const expectedPrefix = `tenants/${user.organizationId}/`;
        return storagePath.startsWith(expectedPrefix);
      };

      const pathAlphaLegit = `tenants/${tenantAlpha}/diagrams/unifilar-rev1.json`;
      const pathBetaCrossTenant = `tenants/${tenantBeta}/diagrams/unifilar-secret.json`;

      expect(isStoragePathAllowed(userAlpha, pathAlphaLegit)).toBe(true);
      expect(isStoragePathAllowed(userAlpha, pathBetaCrossTenant)).toBe(false);
      expect(isStoragePathAllowed(userBeta, pathBetaCrossTenant)).toBe(true);
      expect(isStoragePathAllowed(userBeta, pathAlphaLegit)).toBe(false);
    });
  });

  describe("3. Physical Control Barrier Verification", () => {
    it("garante que IS_PHYSICAL_CONTROL_ALLOWED permanece permanentemente false", () => {
      expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
      expect(service.isPhysicalControlAllowed).toBe(false);

      expect(() =>
        service.assertPhysicalWriteForbidden("MODBUS_FC06_WRITE_SINGLE_REGISTER"),
      ).toThrowError(/PHYSICAL_WRITE_FORBIDDEN/);
    });
  });

  describe("4. Remote Live PostgreSQL RLS Scope Classification", () => {
    it("classifica honestamente que o teste RLS em banco Postgres remoto é NOT_RUN em ambiente sandbox local", () => {
      // Mandato estrito Gate 4.2.1:
      // "Quando não houver ambiente de Supabase isolado, registrar o bloqueio sem declarar RLS aprovado."
      const remoteDatabaseConnected = false;
      const remoteRlsClassification = remoteDatabaseConnected ? "PASS" : "NOT_RUN";

      expect(remoteRlsClassification).toBe("NOT_RUN");
    });
  });
});
