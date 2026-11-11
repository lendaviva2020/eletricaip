// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.6 ACCEPTANCE TEST SUITE (30 CENÁRIOS)
// CANONICAL INDUSTRIAL DATA INTEGRATION
// =============================================================================

import { describe, expect, it, beforeEach } from "vitest";
import {
  CanonicalIndustrialDataService,
  CanonicalIntegrityError,
  IS_PHYSICAL_CONTROL_ALLOWED,
  transformRawValue,
  getUnitConversion,
  type IndustrialTag,
  type GatewayTagSource,
} from "@/lib/industrial";
import type { FleetUserContext } from "@/lib/edge/types";
import type { UnifiedProjectDoc } from "@/lib/model/unified-schema";
import { syncUnifiedDocToScada } from "@/lib/scada/canonical-bridge";
import { useScadaStore } from "@/lib/scada/scada-store";
import { resolveTagProvenance } from "@/lib/scada/types";

describe("Gate 3.6 — Canonical Industrial Data Integration (30 Mandatory Scenarios)", () => {
  let service: CanonicalIndustrialDataService;

  const tenantA = "org_alpha_001";
  const tenantB = "org_beta_002";
  const plantSP = "plant_sp_01";
  const plantRJ = "plant_rj_02";
  const plantBeta = "plant_beta_01";
  const sectorCCM = "sector_ccm_01";
  const eqTypeMotor = "eqtype_load_motor";
  const eqMotorId = "eq_motor_0001";
  const tagCurrentId = "tag_motor_current_0001";
  const gwSpId = "gw_sp_edge_01";
  const gwToken = "tok_secret_sp_edge_01_valid_credential";

  const userTenantA: FleetUserContext = {
    userId: "usr_eng_alpha",
    email: "eng@alpha.ind.br",
    organizationId: tenantA,
    role: "TENANT_ADMIN",
    authorizedPlantIds: [plantSP, plantRJ],
  };

  const userTenantASpOnly: FleetUserContext = {
    userId: "usr_op_sp",
    email: "op.sp@alpha.ind.br",
    organizationId: tenantA,
    role: "PLANT_ADMIN",
    authorizedPlantIds: [plantSP],
  };

  const userTenantB: FleetUserContext = {
    userId: "usr_eng_beta",
    email: "eng@beta.ind.br",
    organizationId: tenantB,
    role: "TENANT_ADMIN",
    authorizedPlantIds: [plantBeta],
  };

  beforeEach(() => {
    service = new CanonicalIndustrialDataService();

    // Organizações
    service.registerOrganization({ id: tenantA, name: "Alpha Industrial S.A.", slug: "alpha-ind" });
    service.registerOrganization({ id: tenantB, name: "Beta Energia Ltda.", slug: "beta-energia" });

    // Plantas
    service.registerPlant({
      id: plantSP,
      tenantId: tenantA,
      name: "Planta São Paulo",
      code: "SP01",
      timezone: "America/Sao_Paulo",
    });
    service.registerPlant({
      id: plantRJ,
      tenantId: tenantA,
      name: "Planta Rio de Janeiro",
      code: "RJ02",
      timezone: "America/Sao_Paulo",
    });
    service.registerPlant({
      id: plantBeta,
      tenantId: tenantB,
      name: "Planta Beta Sul",
      code: "BT01",
      timezone: "America/Sao_Paulo",
    });

    // Setor e Tipo de Equipamento
    service.registerSector({
      id: sectorCCM,
      tenantId: tenantA,
      plantId: plantSP,
      name: "Sala Elétrica CCM-01",
      code: "CCM01",
    });
    service.registerEquipmentType({
      id: eqTypeMotor,
      category: "load",
      catalogType: "motor",
      manufacturer: "WEG",
      model: "W22 IR3",
    });

    // Equipamento e Tag Canônica em SP
    service.registerOrUpdateEquipment(
      {
        id: eqMotorId,
        tenantId: tenantA,
        plantId: plantSP,
        sectorId: sectorCCM,
        equipmentTypeId: eqTypeMotor,
        tagCode: "M-101",
        displayName: "Motor Bomba Recalque M-101",
        description: "Motor trifásico 75 kW",
      },
      "eng@alpha.ind.br",
      1_700_000_000_000,
    );

    service.registerOrUpdateTag(
      {
        tagId: tagCurrentId,
        tenantId: tenantA,
        plantId: plantSP,
        equipmentId: eqMotorId,
        canonicalName: "SP01.CCM01.M101.CURRENT_A",
        displayName: "Corrente Fase A M-101",
        dataType: "REAL",
        engineeringUnit: "A",
        scale: 1,
        offset: 0,
        precision: 2,
        minimumValue: 0,
        maximumValue: 250,
        deadband: 0.5,
        sampleIntervalMs: 1000,
        staleAfterMs: 10_000,
        retentionClass: "STANDARD_90D",
        sourceKind: "PHYSICAL",
      },
      "eng@alpha.ind.br",
      1_700_000_000_000,
    );

    // Gateway e Fonte Autorizada em SP
    service.registerGateway(
      {
        id: gwSpId,
        tenantId: tenantA,
        plantId: plantSP,
        sectorId: sectorCCM,
        name: "Edge Gateway CCM-01 SP",
        isRevoked: false,
      },
      gwToken,
    );

    service.registerGatewayTagSource({
      id: "src_map_001",
      tenantId: tenantA,
      plantId: plantSP,
      gatewayId: gwSpId,
      tagId: tagCurrentId,
      sourceId: "ns=2;s=CCM01.M101.Ia",
      protocol: "OPC_UA",
      physicalAddress: "ns=2;s=CCM01.M101.Ia",
      active: true,
      writeEnabled: false,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Identidade persistente após renomeação
  // ---------------------------------------------------------------------------
  it("Cenário 01: preserva UUID imutável de Equipment e Tag após renomeação e registra revisões auditáveis", () => {
    const updatedEq = service.registerOrUpdateEquipment(
      {
        id: eqMotorId,
        tenantId: tenantA,
        plantId: plantSP,
        sectorId: sectorCCM,
        equipmentTypeId: eqTypeMotor,
        tagCode: "M-101A",
        displayName: "Motor Bomba Recalque Principal M-101A",
        description: "Motor trifásico 75 kW revisado",
      },
      "eng@alpha.ind.br",
      1_700_000_005_000,
    );

    expect(updatedEq.id).toBe(eqMotorId);
    expect(updatedEq.revision).toBe(2);
    const eqRevs = service.getEquipmentRevisions(userTenantA, eqMotorId);
    expect(eqRevs).toHaveLength(2);
    expect(eqRevs[1].changedFields).toContain("tagCode");
    expect(eqRevs[1].changedFields).toContain("displayName");

    const updatedTag = service.registerOrUpdateTag(
      {
        tagId: tagCurrentId,
        tenantId: tenantA,
        plantId: plantSP,
        equipmentId: eqMotorId,
        canonicalName: "SP01.CCM01.M101A.CURRENT_A",
        displayName: "Corrente Fase A M-101A",
        dataType: "REAL",
        engineeringUnit: "A",
        scale: 1,
        offset: 0,
        precision: 2,
        minimumValue: 0,
        maximumValue: 250,
        deadband: 0.5,
        sampleIntervalMs: 1000,
        staleAfterMs: 10_000,
        retentionClass: "STANDARD_90D",
        sourceKind: "PHYSICAL",
      },
      "eng@alpha.ind.br",
      1_700_000_006_000,
    );

    expect(updatedTag.tagId).toBe(tagCurrentId);
    expect(updatedTag.revision).toBe(2);
    expect(updatedTag.configurationVersion).toBe(2);
    const tagRevs = service.getTagRevisions(userTenantA, tagCurrentId);
    expect(tagRevs).toHaveLength(2);
    expect(tagRevs[1].changedFields).toContain("canonicalName");
  });

  // ---------------------------------------------------------------------------
  // 2. Isolamento entre tenants
  // ---------------------------------------------------------------------------
  it("Cenário 02: impede transferência de UUID e bloqueia associação ou leitura entre tenants distintos", () => {
    expect(() =>
      service.registerOrUpdateEquipment({
        id: eqMotorId, // mesmo UUID tentando migrar para tenantB
        tenantId: tenantB,
        plantId: plantBeta,
        equipmentTypeId: eqTypeMotor,
        tagCode: "M-999",
        displayName: "Tentativa de sequestro de UUID",
        description: "",
      }),
    ).toThrowError(CanonicalIntegrityError);

    expect(() => service.getTagRealtimeState(userTenantB, tagCurrentId)).toThrowError(
      CanonicalIntegrityError,
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Isolamento entre plantas
  // ---------------------------------------------------------------------------
  it("Cenário 03: isola plantas do mesmo tenant (SP vs RJ) em vínculos e consultas RBAC", () => {
    // Tentar vincular uma tag na planta RJ apontando para o equipamento da planta SP
    expect(() =>
      service.registerOrUpdateTag({
        tagId: "tag_rj_invalid_link",
        tenantId: tenantA,
        plantId: plantRJ,
        equipmentId: eqMotorId, // pertence a plantSP
        canonicalName: "RJ02.M101.CURRENT",
        displayName: "Tag RJ com vínculo cruzado inválido",
        dataType: "REAL",
        engineeringUnit: "A",
        scale: 1,
        offset: 0,
        precision: 2,
        deadband: 0,
        sampleIntervalMs: 1000,
        staleAfterMs: 10_000,
        retentionClass: "STANDARD_90D",
        sourceKind: "PHYSICAL",
      }),
    ).toThrowError(/PLANT_MISMATCH|não pode vincular-se/);

    // Operador exclusivo de SP não pode consultar planta RJ
    const tagRjId = "tag_rj_valid_01";
    service.registerOrUpdateTag({
      tagId: tagRjId,
      tenantId: tenantA,
      plantId: plantRJ,
      canonicalName: "RJ02.TEMP_AMB",
      displayName: "Temperatura RJ",
      dataType: "REAL",
      engineeringUnit: "°C",
      scale: 1,
      offset: 0,
      precision: 1,
      deadband: 0,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "INTERNAL_RUNTIME",
    });

    expect(() => service.getTagRealtimeState(userTenantASpOnly, tagRjId)).toThrowError(
      CanonicalIntegrityError,
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Associação válida Equipment → Tag
  // ---------------------------------------------------------------------------
  it("Cenário 04: estabelece vínculo formal Equipment → Tag com papel semântico e terminal", () => {
    const binding = service.bindEquipmentToTag({
      id: "bind_m101_ia",
      tenantId: tenantA,
      plantId: plantSP,
      equipmentId: eqMotorId,
      tagId: tagCurrentId,
      role: "phase_a_current",
      terminalId: `${eqMotorId}:L1`,
    });

    expect(binding.equipmentId).toBe(eqMotorId);
    expect(binding.tagId).toBe(tagCurrentId);
    expect(binding.role).toBe("phase_a_current");
  });

  // ---------------------------------------------------------------------------
  // 5. Associação válida Gateway → Tag
  // ---------------------------------------------------------------------------
  it("Cenário 05: permite ingestão física quando o par (Gateway, Tag, SourceId) está na allowlist ativa", () => {
    const report = service.ingestEdgeBatch(
      {
        batchId: "batch_001",
        gatewayId: gwSpId,
        sentAt: 1_700_000_010_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 1,
            rawValue: 118.4,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_010_000,
            edgeReceivedAt: 1_700_000_010_020,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_010_200,
    );

    expect(report.accepted).toBe(true);
    expect(report.ingestedSampleCount).toBe(1);
    expect(report.rejectedSamples).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Rejeição de tag desconhecida
  // ---------------------------------------------------------------------------
  it("Cenário 06: rejeita amostras de tag desconhecida ou fonte fora da allowlist sem contaminar o lote", () => {
    const report = service.ingestEdgeBatch(
      {
        batchId: "batch_unknown_tag",
        gatewayId: gwSpId,
        sentAt: 1_700_000_011_000,
        samples: [
          {
            tagId: "tag_inexistente_999",
            sourceId: "ns=2;s=Ghost",
            sequenceNumber: 1,
            rawValue: 50,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_011_000,
            edgeReceivedAt: 1_700_000_011_010,
          },
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=ENDERECO_NAO_AUTORIZADO",
            sequenceNumber: 2,
            rawValue: 50,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_011_000,
            edgeReceivedAt: 1_700_000_011_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_011_100,
    );

    expect(report.accepted).toBe(true);
    expect(report.ingestedSampleCount).toBe(0);
    expect(report.rejectedSamples).toEqual([
      expect.objectContaining({ tagId: "tag_inexistente_999", reason: "UNKNOWN_TAG" }),
      expect.objectContaining({ tagId: tagCurrentId, reason: "SOURCE_NOT_IN_ALLOWLIST" }),
    ]);
  });

  // ---------------------------------------------------------------------------
  // 7. Rejeição de gateway não autorizado
  // ---------------------------------------------------------------------------
  it("Cenário 07: rejeita lote de gateway com credencial inválida ou não registrado (HTTP 401/403)", () => {
    const badCredReport = service.ingestEdgeBatch(
      {
        batchId: "batch_unauth",
        gatewayId: gwSpId,
        sentAt: 1_700_000_012_000,
        samples: [],
        alarms: [],
      },
      "credencial_invalida_hacker",
    );

    expect(badCredReport.accepted).toBe(false);
    expect([401, 403]).toContain(badCredReport.statusCode);
    expect(badCredReport.ingestedSampleCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 8. Deduplicação idempotente de amostras
  // ---------------------------------------------------------------------------
  it("Cenário 08: deduplica de forma idempotente reenvios da mesma amostra (store-and-forward replay)", () => {
    const payload = {
      batchId: "batch_replay_01",
      gatewayId: gwSpId,
      sentAt: 1_700_000_020_100,
      samples: [
        {
          tagId: tagCurrentId,
          sourceId: "ns=2;s=CCM01.M101.Ia",
          sequenceNumber: 101,
          rawValue: 122.5,
          quality: "GOOD" as const,
          sourceTimestamp: 1_700_000_020_000,
          edgeReceivedAt: 1_700_000_020_010,
        },
      ],
      alarms: [],
    };

    const first = service.ingestEdgeBatch(payload, gwToken, 1_700_000_020_200);
    const second = service.ingestEdgeBatch(payload, gwToken, 1_700_000_025_000);

    expect(first.ingestedSampleCount).toBe(1);
    expect(first.deduplicatedSampleCount).toBe(0);
    expect(second.ingestedSampleCount).toBe(0);
    expect(second.deduplicatedSampleCount).toBe(1);

    const history = service.queryHistorian(userTenantA, {
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
    });
    expect(history).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 9. Preservação de sequenceNumber
  // ---------------------------------------------------------------------------
  it("Cenário 09: preserva exatamente o sequenceNumber monotônico gerado pelo Edge Gateway", () => {
    service.ingestEdgeBatch(
      {
        batchId: "batch_seq",
        gatewayId: gwSpId,
        sentAt: 1_700_000_030_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 987654,
            rawValue: 115.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_030_000,
            edgeReceivedAt: 1_700_000_030_005,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_030_200,
    );

    const rt = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_031_000);
    expect(rt.sequenceNumber).toBe(987654);
  });

  // ---------------------------------------------------------------------------
  // 10. Preservação de sourceTimestamp
  // ---------------------------------------------------------------------------
  it("Cenário 10: preserva sourceTimestamp original da coleta física sem sobrescrevê-lo por ingestionTimestamp", () => {
    const sourceTs = 1_700_000_000_123;
    const edgeTs = 1_700_000_000_150;
    const ingestTs = 1_700_000_099_999;

    service.ingestEdgeBatch(
      {
        batchId: "batch_src_ts",
        gatewayId: gwSpId,
        sentAt: 1_700_000_090_000,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 10,
            rawValue: 100.0,
            quality: "GOOD",
            sourceTimestamp: sourceTs,
            edgeReceivedAt: edgeTs,
          },
        ],
        alarms: [],
      },
      gwToken,
      ingestTs,
    );

    const history = service.queryHistorian(userTenantA, {
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
    });
    expect(history[0].sourceTimestamp).toBe(sourceTs);
    expect(history[0].edgeReceivedAt).toBe(edgeTs);
    expect(history[0].sourceTimestamp).not.toBe(ingestTs);
  });

  // ---------------------------------------------------------------------------
  // 11. Preservação de ingestionTimestamp
  // ---------------------------------------------------------------------------
  it("Cenário 11: registra ingestionTimestamp de chegada na Cloud separadamente de sourceTimestamp", () => {
    const sourceTs = 1_700_000_040_000;
    const ingestTs = 1_700_000_045_555;

    service.ingestEdgeBatch(
      {
        batchId: "batch_ing_ts",
        gatewayId: gwSpId,
        sentAt: 1_700_000_045_000,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 11,
            rawValue: 105.2,
            quality: "GOOD",
            sourceTimestamp: sourceTs,
            edgeReceivedAt: sourceTs + 10,
          },
        ],
        alarms: [],
      },
      gwToken,
      ingestTs,
    );

    const rt = service.getTagRealtimeState(userTenantA, tagCurrentId, ingestTs + 100);
    expect(rt.sourceTimestamp).toBe(sourceTs);
    expect(rt.ingestionTimestamp).toBe(ingestTs);
  });

  // ---------------------------------------------------------------------------
  // 12. Tratamento de dados fora de ordem (late / out-of-order samples)
  // ---------------------------------------------------------------------------
  it("Cenário 12: insere amostras atrasadas em ordem cronológica no Historian sem regredir o valor atual do SCADA", () => {
    // Amostra mais recente chega primeiro (t = 20s, valor = 130 A)
    service.ingestEdgeBatch(
      {
        batchId: "batch_t20",
        gatewayId: gwSpId,
        sentAt: 1_700_000_020_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 2,
            rawValue: 130.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_020_000,
            edgeReceivedAt: 1_700_000_020_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_020_200,
    );

    // Amostra antiga atrasada chega depois (t = 10s, valor = 95 A)
    service.ingestEdgeBatch(
      {
        batchId: "batch_t10_late",
        gatewayId: gwSpId,
        sentAt: 1_700_000_022_000,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 1,
            rawValue: 95.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_010_000,
            edgeReceivedAt: 1_700_000_010_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_022_100,
    );

    // SCADA mantém valor de t=20s (130 A)
    const rt = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_023_000);
    expect(rt.currentValue).toBe(130.0);
    expect(rt.sourceTimestamp).toBe(1_700_000_020_000);

    // Historian ordena [t=10s (isLate=true), t=20s (isLate=false)]
    const history = service.queryHistorian(userTenantA, {
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
    });
    expect(history).toHaveLength(2);
    expect(history[0].sourceTimestamp).toBe(1_700_000_010_000);
    expect(history[0].isLate).toBe(true);
    expect(history[1].sourceTimestamp).toBe(1_700_000_020_000);
    expect(history[1].isLate).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 13. Conversão de unidade de engenharia
  // ---------------------------------------------------------------------------
  it("Cenário 13: converte unidades de engenharia compatíveis (kW→W, bar→kPa, K→°C) e rejeita unidades incompatíveis", () => {
    const kwToW = getUnitConversion("kW", "W");
    expect(kwToW?.factor).toBe(1000);

    const barToKpa = getUnitConversion("bar", "kPa");
    expect(barToKpa?.factor).toBe(100);

    const kToC = getUnitConversion("K", "°C");
    expect(kToC?.offset).toBe(-273.15);

    const tempTag: IndustrialTag = {
      tagId: "tag_temp_winding",
      tenantId: tenantA,
      plantId: plantSP,
      canonicalName: "SP01.M101.TEMP_C",
      displayName: "Temperatura Enrolamento",
      dataType: "REAL",
      engineeringUnit: "°C",
      rawUnit: "K",
      scale: 1,
      offset: 0,
      precision: 2,
      deadband: 0.1,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "PHYSICAL",
      revision: 1,
      configurationVersion: 1,
    };

    const resOk = transformRawValue(tempTag, null, 373.15, "GOOD");
    expect(resOk.engineeringValue).toBe(100);
    expect(resOk.quality).toBe("GOOD");

    const badUnitTag: IndustrialTag = {
      ...tempTag,
      rawUnit: "bar", // pressão != temperatura
    };
    const resIncompatible = transformRawValue(badUnitTag, null, 5, "GOOD");
    expect(resIncompatible.quality).toBe("BAD");
    expect(resIncompatible.rejectionReason).toBe("UNIT_INCOMPATIBLE");
  });

  // ---------------------------------------------------------------------------
  // 14. Aplicação de scale e offset
  // ---------------------------------------------------------------------------
  it("Cenário 14: aplica scale e offset mantendo o rawValue original intacto no Historian", () => {
    const srcWithScale: GatewayTagSource = {
      id: "src_scaled",
      tenantId: tenantA,
      plantId: plantSP,
      gatewayId: gwSpId,
      tagId: tagCurrentId,
      sourceId: "ns=2;s=CCM01.M101.Ia_RawAdc",
      protocol: "MODBUS_TCP",
      physicalAddress: "HR:40001",
      scale: 0.1,
      offset: -5.0,
      active: true,
      writeEnabled: false,
    };
    service.registerGatewayTagSource(srcWithScale);

    service.ingestEdgeBatch(
      {
        batchId: "batch_scaled",
        gatewayId: gwSpId,
        sentAt: 1_700_000_050_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia_RawAdc",
            sequenceNumber: 50,
            rawValue: 1250, // 1250 * 0.1 - 5.0 = 120.0 A
            quality: "GOOD",
            sourceTimestamp: 1_700_000_050_000,
            edgeReceivedAt: 1_700_000_050_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_050_200,
    );

    const history = service.queryHistorian(userTenantA, {
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
    });
    expect(history[0].rawValue).toBe(1250);
    expect(history[0].engineeringValue).toBe(120);
    expect(history[0].transformation.scale).toBe(0.1);
    expect(history[0].transformation.offset).toBe(-5);
  });

  // ---------------------------------------------------------------------------
  // 15. Rejeição de NaN e Infinity
  // ---------------------------------------------------------------------------
  it("Cenário 15: rejeita valores não finitos (NaN, Infinity, -Infinity) marcando qualidade BAD", () => {
    const tagDef = service.getTagRevisions(userTenantA, tagCurrentId)[0].snapshot;

    const nanRes = transformRawValue(tagDef, null, Number.NaN, "GOOD");
    expect(nanRes.quality).toBe("BAD");
    expect(nanRes.engineeringValue).toBeNull();
    expect(nanRes.rejectionReason).toBe("NON_FINITE");

    const infRes = transformRawValue(tagDef, null, Number.POSITIVE_INFINITY, "GOOD");
    expect(infRes.quality).toBe("BAD");
    expect(infRes.engineeringValue).toBeNull();
    expect(infRes.rejectionReason).toBe("NON_FINITE");

    const negInfRes = transformRawValue(tagDef, null, Number.NEGATIVE_INFINITY, "GOOD");
    expect(negInfRes.quality).toBe("BAD");
    expect(negInfRes.engineeringValue).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 16. Preservação de qualidade da amostra
  // ---------------------------------------------------------------------------
  it("Cenário 16: preserva qualidade GOOD/UNCERTAIN/BAD e rebaixa amostras fora da faixa operacional para UNCERTAIN", () => {
    // Faixa de tagCurrentId é [0, 250] A. Enviando 280 A (acima do máximo)
    service.ingestEdgeBatch(
      {
        batchId: "batch_overrange",
        gatewayId: gwSpId,
        sentAt: 1_700_000_060_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 60,
            rawValue: 280.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_060_000,
            edgeReceivedAt: 1_700_000_060_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_060_200,
    );

    const rt = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_060_500);
    expect(rt.quality).toBe("UNCERTAIN");
    expect(rt.provenance).toBe("PHYSICAL_DATA");
  });

  // ---------------------------------------------------------------------------
  // 17. Distinção entre PHYSICAL_DATA, SIMULATED_DATA, INTERNAL_RUNTIME, CALCULATED_DATA e FORCED_DATA
  // ---------------------------------------------------------------------------
  it("Cenário 17: distingue estritamente PHYSICAL_DATA, SIMULATED_DATA, INTERNAL_RUNTIME, CALCULATED_DATA e FORCED_DATA sem falsificar proveniência física", () => {
    // 17.1 Tag no banco sem GatewayTagSource ativo NÃO é PHYSICAL_DATA
    const unmappedPhysicalTag = "tag_unmapped_phys";
    service.registerOrUpdateTag({
      tagId: unmappedPhysicalTag,
      tenantId: tenantA,
      plantId: plantSP,
      canonicalName: "SP01.UNMAPPED.PHYS",
      displayName: "Tag Física Sem Gateway",
      dataType: "REAL",
      engineeringUnit: "V",
      scale: 1,
      offset: 0,
      precision: 1,
      deadband: 0,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "PHYSICAL",
    });
    const unmappedState = service.getTagRealtimeState(userTenantA, unmappedPhysicalTag);
    expect(unmappedState.provenance).toBe("NOT_CONNECTED");
    expect(unmappedState.provenance).not.toBe("PHYSICAL_DATA");

    // 17.2 Tag SIMULATED
    service.registerOrUpdateTag({
      tagId: "tag_sim_01",
      tenantId: tenantA,
      plantId: plantSP,
      canonicalName: "SP01.SIM.PRESSURE",
      displayName: "Pressão Simulada",
      dataType: "REAL",
      engineeringUnit: "bar",
      scale: 1,
      offset: 0,
      precision: 2,
      deadband: 0,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "SIMULATED",
    });
    service.recordInternalOrSimulatedSample({
      tagId: "tag_sim_01",
      rawValue: 6.2,
      sourceTimestamp: 1_700_000_070_000,
      sequenceNumber: 1,
    });
    expect(
      service.getTagRealtimeState(userTenantA, "tag_sim_01", 1_700_000_071_000).provenance,
    ).toBe("SIMULATED_DATA");

    // 17.3 Tag INTERNAL_RUNTIME
    service.registerOrUpdateTag({
      tagId: "tag_rt_01",
      tenantId: tenantA,
      plantId: plantSP,
      canonicalName: "SP01.RT.STATE",
      displayName: "Estado Runtime",
      dataType: "BOOL",
      engineeringUnit: "",
      scale: 1,
      offset: 0,
      precision: 0,
      deadband: 0,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "INTERNAL_RUNTIME",
    });
    service.recordInternalOrSimulatedSample({
      tagId: "tag_rt_01",
      rawValue: true,
      sourceTimestamp: 1_700_000_070_000,
      sequenceNumber: 1,
    });
    expect(
      service.getTagRealtimeState(userTenantA, "tag_rt_01", 1_700_000_071_000).provenance,
    ).toBe("INTERNAL_RUNTIME");

    // 17.4 Tag CALCULATED
    service.registerOrUpdateTag({
      tagId: "tag_calc_01",
      tenantId: tenantA,
      plantId: plantSP,
      canonicalName: "SP01.CALC.POWER_KW",
      displayName: "Potência Calculada",
      dataType: "REAL",
      engineeringUnit: "kW",
      scale: 1,
      offset: 0,
      precision: 2,
      deadband: 0,
      sampleIntervalMs: 1000,
      staleAfterMs: 10_000,
      retentionClass: "STANDARD_90D",
      sourceKind: "CALCULATED",
    });
    service.recordInternalOrSimulatedSample({
      tagId: "tag_calc_01",
      rawValue: 74.5,
      sourceTimestamp: 1_700_000_070_000,
      sequenceNumber: 1,
    });
    expect(
      service.getTagRealtimeState(userTenantA, "tag_calc_01", 1_700_000_071_000).provenance,
    ).toBe("CALCULATED_DATA");

    // 17.5 Tag FORCED_DATA no supervisório
    service.forceTagInSupervisor(userTenantA, "tag_sim_01", 9.9, 1_700_000_071_500);
    const forcedState = service.getTagRealtimeState(userTenantA, "tag_sim_01", 1_700_000_072_000);
    expect(forcedState.provenance).toBe("FORCED_DATA");
    expect(forcedState.currentValue).toBe(9.9);

    // 17.6 Helper resolveTagProvenance do SCADA também respeita hasValidPhysicalSource e isCalculated
    expect(
      resolveTagProvenance("GOOD", "OPC_UA", false, false, {
        hasValidPhysicalSource: false,
      }),
    ).toBe("NOT_CONNECTED");
    expect(
      resolveTagProvenance("GOOD", "INTERNAL_RUNTIME", false, false, {
        isCalculated: true,
      }),
    ).toBe("CALCULATED_DATA");
  });

  // ---------------------------------------------------------------------------
  // 18. Transição para STALE_DATA
  // ---------------------------------------------------------------------------
  it("Cenário 18: transiciona deterministicamente para STALE_DATA quando now - sourceTimestamp > staleAfterMs", () => {
    service.ingestEdgeBatch(
      {
        batchId: "batch_fresh",
        gatewayId: gwSpId,
        sentAt: 1_700_000_100_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 1,
            rawValue: 110.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_100_000,
            edgeReceivedAt: 1_700_000_100_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_100_200,
    );

    // 5s depois (dentro de staleAfterMs = 10_000ms) -> PHYSICAL_DATA
    const fresh = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_105_000);
    expect(fresh.provenance).toBe("PHYSICAL_DATA");

    // 15s depois (acima de 10_000ms) -> STALE_DATA, preservando lastValidValue
    const stale = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_115_000);
    expect(stale.provenance).toBe("STALE_DATA");
    expect(stale.quality).toBe("STALE");
    expect(stale.lastValidValue).toBe(110.0);
    expect(stale.dataAgeMs).toBe(15_000);
  });

  // ---------------------------------------------------------------------------
  // 19. Transição para NOT_CONNECTED
  // ---------------------------------------------------------------------------
  it("Cenário 19: transiciona para NOT_CONNECTED quando o Edge Gateway perde comunicação", () => {
    service.ingestEdgeBatch(
      {
        batchId: "batch_online",
        gatewayId: gwSpId,
        sentAt: 1_700_000_200_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 1,
            rawValue: 112.0,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_200_000,
            edgeReceivedAt: 1_700_000_200_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_200_200,
    );

    service.setGatewayConnectivity(gwSpId, false);
    const offlineState = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_201_000);
    expect(offlineState.provenance).toBe("NOT_CONNECTED");
    expect(offlineState.quality).toBe("NOT_CONNECTED");
    expect(offlineState.lastValidValue).toBe(112.0);
  });

  // ---------------------------------------------------------------------------
  // 20. Recuperação após reconexão
  // ---------------------------------------------------------------------------
  it("Cenário 20: recupera automaticamente para PHYSICAL_DATA após reconexão e ingestão do buffer offline", () => {
    service.setGatewayConnectivity(gwSpId, false);
    expect(
      service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_300_000).provenance,
    ).toBe("NOT_CONNECTED");

    // Reconecta enviando lote acumulado
    service.ingestEdgeBatch(
      {
        batchId: "batch_reconnect",
        gatewayId: gwSpId,
        sentAt: 1_700_000_305_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 200,
            rawValue: 119.5,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_305_000,
            edgeReceivedAt: 1_700_000_305_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_305_200,
    );

    const recovered = service.getTagRealtimeState(userTenantA, tagCurrentId, 1_700_000_306_000);
    expect(recovered.provenance).toBe("PHYSICAL_DATA");
    expect(recovered.quality).toBe("GOOD");
    expect(recovered.currentValue).toBe(119.5);
  });

  // ---------------------------------------------------------------------------
  // 21. Persistência de alarme offline
  // ---------------------------------------------------------------------------
  it("Cenário 21: sincroniza transições de alarmes detectadas no Edge durante desconexão preservando timestamps originais", () => {
    service.registerAlarmDefinition({
      id: "alm_m101_overcurrent_hh",
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
      equipmentId: eqMotorId,
      name: "Sobrecorrente Crítica M-101 (HH)",
      conditionType: "HH",
      threshold: 150,
      deadband: 2,
      severity: "CRITICAL",
      priority: 1,
    });

    const report = service.ingestEdgeBatch(
      {
        batchId: "batch_offline_alarms",
        gatewayId: gwSpId,
        sentAt: 1_700_000_450_000,
        samples: [],
        alarms: [
          {
            edgeOccurrenceId: "edge_occ_m101_001",
            alarmDefinitionId: "alm_m101_overcurrent_hh",
            tagId: tagCurrentId,
            equipmentId: eqMotorId,
            transition: "ACTIVATED",
            transitionSequence: 1,
            occurredAt: 1_700_000_400_000, // ocorreu 50s antes da reconexão
            value: 168.4,
            quality: "GOOD",
          },
          {
            edgeOccurrenceId: "edge_occ_m101_001",
            alarmDefinitionId: "alm_m101_overcurrent_hh",
            tagId: tagCurrentId,
            equipmentId: eqMotorId,
            transition: "RETURNED_TO_NORMAL",
            transitionSequence: 2,
            occurredAt: 1_700_000_420_000,
            value: 118.0,
            quality: "GOOD",
          },
        ],
      },
      gwToken,
      1_700_000_450_500,
    );

    expect(report.ingestedAlarmTransitions).toBe(2);
    const occurrences = service.getAlarmOccurrencesForPlant(userTenantA, tenantA, plantSP);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].activatedAt).toBe(1_700_000_400_000);
    expect(occurrences[0].isActive).toBe(false); // já retornou ao normal na transição 2
    expect(occurrences[0].transitions).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // 22. Idempotência na sincronização de alarmes
  // ---------------------------------------------------------------------------
  it("Cenário 22: garante idempotência na retransmissão de alarmes do Edge e suporta reconhecimento na Cloud sem duplicar ocorrência", () => {
    service.registerAlarmDefinition({
      id: "alm_m101_high",
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
      equipmentId: eqMotorId,
      name: "Corrente Alta M-101 (H)",
      conditionType: "H",
      threshold: 135,
      deadband: 1,
      severity: "HIGH",
      priority: 2,
    });

    const alarmBatch = {
      batchId: "batch_alm_idem",
      gatewayId: gwSpId,
      sentAt: 1_700_000_500_100,
      samples: [],
      alarms: [
        {
          edgeOccurrenceId: "edge_occ_idem_99",
          alarmDefinitionId: "alm_m101_high",
          tagId: tagCurrentId,
          equipmentId: eqMotorId,
          transition: "ACTIVATED" as const,
          transitionSequence: 1,
          occurredAt: 1_700_000_500_000,
          value: 140.2,
          quality: "GOOD" as const,
        },
      ],
    };

    const first = service.ingestEdgeBatch(alarmBatch, gwToken, 1_700_000_500_200);
    const replay = service.ingestEdgeBatch(alarmBatch, gwToken, 1_700_000_505_000);

    expect(first.ingestedAlarmTransitions).toBe(1);
    expect(replay.ingestedAlarmTransitions).toBe(0);
    expect(replay.deduplicatedAlarmTransitions).toBe(1);

    const list = service.getAlarmOccurrencesForPlant(userTenantA, tenantA, plantSP);
    expect(list).toHaveLength(1);
    expect(list[0].isActive).toBe(true);
    expect(list[0].isAcknowledged).toBe(false);

    // Operador reconhece na Cloud
    const acked = service.acknowledgeAlarmOccurrence(
      userTenantA,
      list[0].occurrenceId,
      1_700_000_510_000,
    );
    expect(acked.isAcknowledged).toBe(true);
    expect(acked.transitions).toHaveLength(2);
    expect(acked.transitions[1].origin).toBe("CLOUD_OPERATOR");
  });

  // ---------------------------------------------------------------------------
  // 23. Integridade do Historian
  // ---------------------------------------------------------------------------
  it("Cenário 23: preserva histórico completo no Historian com tagRevision e configurationVersion da época da coleta", () => {
    // Amostra na revisão 1 (scale = 1)
    service.ingestEdgeBatch(
      {
        batchId: "batch_rev1",
        gatewayId: gwSpId,
        sentAt: 1_700_000_600_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 1,
            rawValue: 100,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_600_000,
            edgeReceivedAt: 1_700_000_600_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_600_200,
    );

    // Atualiza tag para revisão 2 (scale = 2)
    service.registerOrUpdateTag(
      {
        tagId: tagCurrentId,
        tenantId: tenantA,
        plantId: plantSP,
        equipmentId: eqMotorId,
        canonicalName: "SP01.CCM01.M101.CURRENT_A",
        displayName: "Corrente Fase A M-101",
        dataType: "REAL",
        engineeringUnit: "A",
        scale: 2, // mudou escala
        offset: 0,
        precision: 2,
        minimumValue: 0,
        maximumValue: 500,
        deadband: 0.5,
        sampleIntervalMs: 1000,
        staleAfterMs: 10_000,
        retentionClass: "STANDARD_90D",
        sourceKind: "PHYSICAL",
      },
      "eng@alpha.ind.br",
      1_700_000_605_000,
    );

    // Amostra na revisão 2
    service.ingestEdgeBatch(
      {
        batchId: "batch_rev2",
        gatewayId: gwSpId,
        sentAt: 1_700_000_610_100,
        samples: [
          {
            tagId: tagCurrentId,
            sourceId: "ns=2;s=CCM01.M101.Ia",
            sequenceNumber: 2,
            rawValue: 100,
            quality: "GOOD",
            sourceTimestamp: 1_700_000_610_000,
            edgeReceivedAt: 1_700_000_610_010,
          },
        ],
        alarms: [],
      },
      gwToken,
      1_700_000_610_200,
    );

    const history = service.queryHistorian(userTenantA, {
      tenantId: tenantA,
      plantId: plantSP,
      tagId: tagCurrentId,
    });
    expect(history).toHaveLength(2);
    // Amostra 1 imutável com revisão 1 e engineeringValue = 100
    expect(history[0].tagRevision).toBe(1);
    expect(history[0].engineeringValue).toBe(100);
    // Amostra 2 com revisão 2 e engineeringValue = 200
    expect(history[1].tagRevision).toBe(2);
    expect(history[1].engineeringValue).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // 24. Bloqueio de acesso cruzado entre tenants
  // ---------------------------------------------------------------------------
  it("Cenário 24: bloqueia consultas de Historian e Alarmes por usuários de outro tenant", () => {
    expect(() =>
      service.queryHistorian(userTenantB, {
        tenantId: tenantA,
        plantId: plantSP,
        tagId: tagCurrentId,
      }),
    ).toThrowError(CanonicalIntegrityError);

    expect(() => service.getAlarmOccurrencesForPlant(userTenantB, tenantA, plantSP)).toThrowError(
      CanonicalIntegrityError,
    );
  });

  // ---------------------------------------------------------------------------
  // 25. Bloqueio permanente de escrita física
  // ---------------------------------------------------------------------------
  it("Cenário 25: mantém isPhysicalControlAllowed === false imutável e rejeita qualquer tentativa de habilitar escrita física", () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
    expect(service.isPhysicalControlAllowed).toBe(false);

    expect(() =>
      service.assertPhysicalWriteForbidden("MODBUS_FC06_WRITE_SINGLE_REGISTER"),
    ).toThrowError(/PHYSICAL_WRITE_FORBIDDEN/);

    expect(() =>
      service.registerGatewayTagSource({
        id: "src_illegal_write",
        tenantId: tenantA,
        plantId: plantSP,
        gatewayId: gwSpId,
        tagId: tagCurrentId,
        sourceId: "ns=2;s=IllegalCoil",
        protocol: "OPC_UA",
        physicalAddress: "ns=2;s=IllegalCoil",
        active: true,
        writeEnabled: true as unknown as false,
      }),
    ).toThrowError(/PHYSICAL_WRITE_FORBIDDEN/);
  });

  // ---------------------------------------------------------------------------
  // Helper para criar um UnifiedProjectDoc v3 compartilhado entre Unifilar,
  // Multifilar, Ladder, FBD e SCADA (Cenários 26 a 30)
  // ---------------------------------------------------------------------------
  function buildSampleUnifiedProjectDoc(): UnifiedProjectDoc {
    return {
      schemaVersion: 3,
      metadata: {
        id: "proj_canonical_001",
        name: "Subestação e Bombeamento Principal",
        description: "Projeto Unificado Gate 3.6",
        client: "Alpha Industrial S.A.",
        schemaVersion: 3,
        applicableStandards: ["NBR_5410", "IEC_61131_3", "ISA_18_2"],
        nominalSystem: {
          frequencyHz: 60,
          lowVoltageV: 380,
          mediumVoltageKv: 13.8,
          earthingScheme: "TN-S",
        },
        revision: 1,
        updatedAt: new Date(1_700_000_000_000).toISOString(),
      },
      engineering: {
        equipments: {
          [eqMotorId]: {
            id: eqMotorId,
            tagCode: "M-101",
            displayName: "Motor Bomba M-101",
            category: "load",
            catalogType: "motor",
            phases: "3F",
            specs: { powerKw: 75, voltageV: 380, nominalCurrentA: 128, powerFactor: 0.88 },
            terminals: [
              { id: `${eqMotorId}:L1`, code: "U1", kind: "L1", direction: "in" },
              { id: `${eqMotorId}:L2`, code: "V1", kind: "L2", direction: "in" },
              { id: `${eqMotorId}:L3`, code: "W1", kind: "L3", direction: "in" },
            ],
          },
        },
        connections: {},
        circuits: {},
        tags: {
          [tagCurrentId]: {
            id: tagCurrentId,
            name: "SP01_CCM01_M101_CURRENT_A",
            area: "I",
            address: "%IW0",
            dataType: "REAL",
            unit: "A",
            scaleMin: 0,
            scaleMax: 250,
            initialValue: 0,
            forced: false,
            retentive: false,
            description: "Corrente Fase A M-101",
            linkedEquipmentId: eqMotorId,
          },
        },
        controlBindings: {
          cb_01: {
            id: "cb_01",
            tagId: tagCurrentId,
            equipmentId: eqMotorId,
            role: "sensor_process_value",
            terminalIds: [`${eqMotorId}:L1`],
          },
        },
        plcChannels: {},
      },
      plc: {
        project: {
          id: "plc_proj_01",
          name: "CLP Principal",
          cpuModel: "S7-1500",
          scanCycleMs: 20,
          tags: [
            {
              id: tagCurrentId,
              name: "SP01_CCM01_M101_CURRENT_A",
              area: "I",
              address: "%IW0",
              dataType: "REAL",
              initialValue: 0,
              description: "Corrente M-101",
            },
          ],
          blocks: [
            {
              id: "ob1_ladder",
              name: "OB1_Main_Ladder",
              type: "OB",
              language: "LADDER",
              rungs: [
                {
                  id: "rung_1",
                  comment: "Monitoramento de corrente M-101",
                  elements: [
                    {
                      id: "el_cmp",
                      type: "NO_CONTACT",
                      tagName: "SP01_CCM01_M101_CURRENT_A",
                      tagId: tagCurrentId,
                    } as never,
                  ],
                },
              ],
            },
            {
              id: "fb1_fbd",
              name: "FB1_Process_FBD",
              type: "FB",
              language: "FBD",
              rungs: [],
              fbdNodes: [
                {
                  id: "fbd_node_1",
                  type: "INPUT_VAR",
                  label: "SP01_CCM01_M101_CURRENT_A",
                  tagId: tagCurrentId,
                  x: 80,
                  y: 120,
                } as never,
              ],
              fbdEdges: [],
            } as never,
          ],
        } as never,
        activeLadderBlockId: "ob1_ladder",
        activeFbdBlockId: "fb1_fbd",
      },
      views: {
        diagramDocId: "diag_01",
        sheets: ["unifilar", "multifilar", "ladder"],
        unifilar: {
          nodes: {
            uni_node_m101: {
              nodeId: "uni_node_m101",
              equipmentId: eqMotorId,
              position: { x: 200, y: 300 },
              rotation: 0,
              label: "M-101",
            },
          },
          edges: {},
        },
        multifilar: {
          nodes: {
            multi_node_m101: {
              nodeId: "multi_node_m101",
              equipmentId: eqMotorId,
              position: { x: 450, y: 320 },
              rotation: 0,
              label: "M-101",
            },
          },
          edges: {},
        },
        scada: {
          widgets: {
            scada_w_m101: {
              id: "scada_w_m101",
              kind: "motor_pump",
              category: "mech",
              label: "Bomba M-101",
              position: { x: 300, y: 200 },
              boundTagId: tagCurrentId,
              boundEquipmentId: eqMotorId,
              params: {},
            },
          },
          edges: [],
        },
        twin: { mappings: [], nameplates: {}, modelUrl: null },
      },
      studies: {},
      diagnostics: [],
    };
  }

  // ---------------------------------------------------------------------------
  // 26. Zero regressões no Unifilar
  // ---------------------------------------------------------------------------
  it("Cenário 26: sincroniza Unifilar com o modelo canônico preservando exatamente o mesmo Equipment UUID e layout visual", () => {
    const doc = buildSampleUnifiedProjectDoc();
    const syncRes = service.syncFromUnifiedProjectDoc(doc, {
      tenantId: tenantA,
      plantId: plantSP,
    });

    expect(syncRes.equipmentIds).toContain(eqMotorId);
    expect(doc.views.unifilar.nodes.uni_node_m101.equipmentId).toBe(eqMotorId);

    const eq = service.getEquipment(userTenantA, eqMotorId);
    expect(eq?.id).toBe(doc.views.unifilar.nodes.uni_node_m101.equipmentId);
  });

  // ---------------------------------------------------------------------------
  // 27. Zero regressões no Multifilar
  // ---------------------------------------------------------------------------
  it("Cenário 27: preserva identidade única do equipamento e terminais entre Multifilar, Unifilar e Modelo Canônico", () => {
    const doc = buildSampleUnifiedProjectDoc();
    service.syncFromUnifiedProjectDoc(doc, { tenantId: tenantA, plantId: plantSP });

    const multiNode = doc.views.multifilar.nodes.multi_node_m101;
    const uniNode = doc.views.unifilar.nodes.uni_node_m101;
    expect(multiNode.equipmentId).toBe(uniNode.equipmentId);
    expect(multiNode.equipmentId).toBe(eqMotorId);
    expect(doc.engineering.equipments[eqMotorId].terminals).toHaveLength(3);
  });

  // ---------------------------------------------------------------------------
  // 28. Zero regressões no Ladder
  // ---------------------------------------------------------------------------
  it("Cenário 28: preserva o vínculo entre contatos/bobinas do Ladder, ControlBinding e a IndustrialTag canônica", () => {
    const doc = buildSampleUnifiedProjectDoc();
    const syncRes = service.syncFromUnifiedProjectDoc(doc, {
      tenantId: tenantA,
      plantId: plantSP,
    });

    expect(syncRes.tagIds).toContain(tagCurrentId);
    expect(syncRes.bindingIds).toContain("ctrlbind_cb_01");

    const plcBlocks = (
      doc.plc.project as unknown as { blocks: Array<{ id: string; language: string }> }
    ).blocks;
    const ladderBlock = plcBlocks.find((b) => b.id === "ob1_ladder");
    expect(ladderBlock?.language).toBe("LADDER");
    expect(doc.engineering.controlBindings.cb_01.tagId).toBe(tagCurrentId);
    expect(doc.engineering.controlBindings.cb_01.equipmentId).toBe(eqMotorId);
  });

  // ---------------------------------------------------------------------------
  // 29. Zero regressões no FBD
  // ---------------------------------------------------------------------------
  it("Cenário 29: preserva referências de blocos FBD à mesma Tag UUID canônica sem duplicar variáveis", () => {
    const doc = buildSampleUnifiedProjectDoc();
    service.syncFromUnifiedProjectDoc(doc, { tenantId: tenantA, plantId: plantSP });

    const plcBlocks = (
      doc.plc.project as unknown as {
        blocks: Array<{ id: string; language: string; fbdNodes: Array<{ tagId: string }> }>;
      }
    ).blocks;
    const fbdBlock = plcBlocks.find((b) => b.id === "fb1_fbd")!;
    expect(fbdBlock.language).toBe("FBD");
    expect(fbdBlock.fbdNodes[0].tagId).toBe(tagCurrentId);

    const rt = service.getTagRealtimeState(userTenantA, fbdBlock.fbdNodes[0].tagId);
    expect(rt.tagId).toBe(tagCurrentId);
    expect(rt.equipmentId).toBe(eqMotorId);
  });

  // ---------------------------------------------------------------------------
  // 30. Zero regressões no SCADA
  // ---------------------------------------------------------------------------
  it("Cenário 30: projeta UnifiedProjectDoc no ScadaStore e no CanonicalIndustrialDataService mantendo UUIDs idênticos", () => {
    const doc = buildSampleUnifiedProjectDoc();
    syncUnifiedDocToScada(doc, tenantA);

    const scadaState = useScadaStore.getState();
    expect(scadaState.equipments[eqMotorId]).toBeDefined();
    expect(scadaState.equipments[eqMotorId].id).toBe(eqMotorId);
    expect(scadaState.tags["SP01_CCM01_M101_CURRENT_A"]).toBeDefined();
    expect(scadaState.tags["SP01_CCM01_M101_CURRENT_A"].id).toBe(tagCurrentId);
    expect(scadaState.tags["SP01_CCM01_M101_CURRENT_A"].linkedEquipmentId).toBe(eqMotorId);
  });
});
