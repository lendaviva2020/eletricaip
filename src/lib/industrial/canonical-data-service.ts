// ELÉTRICAI INDUSTRIAL OS — GATE 3.6 CANONICAL INDUSTRIAL DATA SERVICE
// Integração ponta a ponta: UnifiedProjectDoc ↔ Equipment ↔ Tag ↔ Gateway ↔ Historian ↔ Alarmes ↔ SCADA
//
// Invariantes aplicados no servidor:
//  1. Isolamento estrito por tenantId e plantId em todas as leituras e escritas.
//  2. Proibição de transferência de UUID entre tenants ou plantas.
//  3. Renomeação de Equipment ou Tag preserva UUID e gera revisão auditável.
//  4. PHYSICAL_DATA exige GatewayTagSource ativo + amostra autenticada de gateway válido.
//  5. Dados SIMULATED, INTERNAL_RUNTIME, CALCULATED e FORCED nunca viram PHYSICAL_DATA.
//  6. Deduplicação idempotente de amostras e de transições de alarme do Edge.
//  7. Preservação de rawValue, engineeringValue, transformation, sourceTimestamp,
//     edgeReceivedAt, ingestionTimestamp e sequenceNumber.
//  8. isPhysicalControlAllowed === false permanente e imutável.

import { z } from "zod";
import type { UnifiedProjectDoc } from "@/lib/model/unified-schema";
import { CloudGatewayRegistry } from "@/lib/edge/cloud-gateway-registry";
import { FleetRbacEngine } from "@/lib/edge/fleet-rbac";
import type { FleetUserContext } from "@/lib/edge/types";
import { transformRawValue } from "./tag-contract";
import {
  AlarmDefinitionSchema,
  CanonicalEdgeBatchSchema,
  CanonicalGatewaySchema,
  CanonicalIntegrityError,
  EquipmentSchema,
  EquipmentTypeSchema,
  GatewayTagSourceSchema,
  IS_PHYSICAL_CONTROL_ALLOWED,
  IndustrialTagSchema,
  OrganizationSchema,
  PlantSchema,
  SectorSchema,
  TagBindingSchema,
  type AlarmDefinition,
  type AlarmOccurrence,
  type AlarmTransitionKind,
  type AlarmTransitionRecord,
  type CanonicalEdgeBatch,
  type CanonicalGateway,
  type DataProvenance,
  type EdgeAlarmTransition,
  type EntityRevision,
  type Equipment,
  type EquipmentRevision,
  type EquipmentType,
  type GatewayTagSource,
  type HistorianSample,
  type IndustrialTag,
  type Organization,
  type Plant,
  type SampleQuality,
  type Sector,
  type TagBinding,
  type TagRevision,
} from "./types";

export interface TagRuntimeValueState {
  tagId: string;
  tenantId: string;
  plantId: string;
  equipmentId?: string;
  gatewayId?: string;
  sourceId?: string;
  canonicalName: string;
  displayName: string;
  engineeringUnit: string;
  currentValue: number | boolean | string | null;
  rawValue: number | boolean | string | null;
  lastValidValue: number | boolean | string | null;
  lastValidTimestamp: number | null;
  sourceTimestamp: number | null;
  ingestionTimestamp: number | null;
  sequenceNumber: number | null;
  dataAgeMs: number | null;
  quality: SampleQuality | "STALE" | "NOT_CONNECTED" | "FORCED";
  provenance: DataProvenance;
  isForced: boolean;
  forcedBy?: string;
  isLate: boolean;
  revision: number;
  configurationVersion: number;
}

export interface BatchIngestReport {
  accepted: boolean;
  statusCode: number;
  gatewayId: string;
  batchId: string;
  ingestionTimestamp: number;
  ingestedSampleCount: number;
  deduplicatedSampleCount: number;
  rejectedSamples: Array<{ tagId: string; sourceId: string; sequenceNumber: number; reason: string }>;
  ingestedAlarmTransitions: number;
  deduplicatedAlarmTransitions: number;
  error?: string;
}

interface InternalTagRuntimeSlot {
  latestSample?: HistorianSample;
  lastValidValue: number | boolean | string | null;
  lastValidTimestamp: number | null;
  forced: boolean;
  forcedValue?: number | boolean | string;
  forcedBy?: string;
  forcedAt?: number;
  gatewayOffline: boolean;
}

export class CanonicalIndustrialDataService {
  public readonly isPhysicalControlAllowed = IS_PHYSICAL_CONTROL_ALLOWED;

  private organizations = new Map<string, Organization>();
  private plants = new Map<string, Plant>();
  private sectors = new Map<string, Sector>();
  private equipmentTypes = new Map<string, EquipmentType>();
  private equipments = new Map<string, Equipment>();
  private tags = new Map<string, IndustrialTag>();
  private tagBindings = new Map<string, TagBinding>();
  private gateways = new Map<string, CanonicalGateway>();
  private gatewayTagSources = new Map<string, GatewayTagSource>();
  private alarmDefinitions = new Map<string, AlarmDefinition>();
  private alarmOccurrences = new Map<string, AlarmOccurrence>();

  private equipmentRevisions = new Map<string, EquipmentRevision[]>();
  private tagRevisions = new Map<string, TagRevision[]>();

  /** Chave de deduplicação: `${gatewayId}|${tagId}|${sourceId}|${sequenceNumber}|${sourceTimestamp}` */
  private sampleDedupKeys = new Set<string>();
  /** Amostras do Historian por tagId (ordenadas por sourceTimestamp ASC, sequenceNumber ASC). */
  private historianByTag = new Map<string, HistorianSample[]>();
  private runtimeSlots = new Map<string, InternalTagRuntimeSlot>();

  private gatewayRegistry: CloudGatewayRegistry;
  private rbac: FleetRbacEngine;
  private audit?: { logEvent?: (...args: any[]) => void };

  constructor(deps?: {
    gatewayRegistry?: CloudGatewayRegistry;
    rbac?: FleetRbacEngine;
    audit?: { logEvent?: (...args: any[]) => void };
  }) {
    this.gatewayRegistry = deps?.gatewayRegistry ?? new CloudGatewayRegistry();
    this.rbac = deps?.rbac ?? new FleetRbacEngine();
    this.audit = deps?.audit;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Guardas de segurança e isolamento
  // ───────────────────────────────────────────────────────────────────────────

  public assertPhysicalWriteForbidden(operation: string): never {
    throw new CanonicalIntegrityError(
      "PHYSICAL_WRITE_FORBIDDEN",
      `Operação de escrita física '${operation}' bloqueada permanentemente (isPhysicalControlAllowed=${this.isPhysicalControlAllowed}).`,
    );
  }

  private assertUserAccessToPlant(
    user: FleetUserContext,
    tenantId: string,
    plantId: string,
    action: "VIEW_FLEET" | "VIEW_TELEMETRY" | "PROPOSE_CONFIG" = "VIEW_TELEMETRY",
  ): void {
    try {
      this.rbac.assertCanPerformAction(user, action, {
        organizationId: tenantId,
        plantId,
        gatewayId: "canonical_scope",
      });
    } catch (err) {
      throw new CanonicalIntegrityError(
        "FORBIDDEN",
        err instanceof Error ? err.message : "Acesso negado pelo motor RBAC.",
      );
    }
  }

  private assertPlantBelongsToTenant(tenantId: string, plantId: string): Plant {
    const plant = this.plants.get(plantId);
    if (!plant) {
      throw new CanonicalIntegrityError("UNKNOWN_ENTITY", `Planta '${plantId}' não cadastrada.`);
    }
    if (plant.tenantId !== tenantId) {
      throw new CanonicalIntegrityError(
        "TENANT_MISMATCH",
        `Planta '${plantId}' pertence ao tenant '${plant.tenantId}', não a '${tenantId}'.`,
      );
    }
    return plant;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cadastro canônico: Organization, Plant, Sector, EquipmentType
  // ───────────────────────────────────────────────────────────────────────────

  public registerOrganization(input: Organization): Organization {
    const parsed = OrganizationSchema.parse(input);
    this.organizations.set(parsed.id, parsed);
    return parsed;
  }

  public registerPlant(input: z.input<typeof PlantSchema>): Plant {
    const parsed = PlantSchema.parse(input);
    if (!this.organizations.has(parsed.tenantId)) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `Organização '${parsed.tenantId}' não existe.`,
      );
    }
    const existing = this.plants.get(parsed.id);
    if (existing && existing.tenantId !== parsed.tenantId) {
      throw new CanonicalIntegrityError(
        "IDENTITY_TRANSFER_FORBIDDEN",
        `Planta '${parsed.id}' não pode ser transferida entre organizações.`,
      );
    }
    this.plants.set(parsed.id, parsed);
    return parsed;
  }

  public registerSector(input: Sector): Sector {
    const parsed = SectorSchema.parse(input);
    this.assertPlantBelongsToTenant(parsed.tenantId, parsed.plantId);
    this.sectors.set(parsed.id, parsed);
    return parsed;
  }

  public registerEquipmentType(input: EquipmentType): EquipmentType {
    const parsed = EquipmentTypeSchema.parse(input);
    this.equipmentTypes.set(parsed.id, parsed);
    return parsed;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Equipment (UUID === CanonicalEquipment.id) + Revisões
  // ───────────────────────────────────────────────────────────────────────────

  public registerOrUpdateEquipment(
    input: Omit<Equipment, "revision"> & { revision?: number },
    actor: string = "system",
    now: number = Date.now(),
  ): Equipment {
    this.assertPlantBelongsToTenant(input.tenantId, input.plantId);
    if (!this.equipmentTypes.has(input.equipmentTypeId)) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `EquipmentType '${input.equipmentTypeId}' não cadastrado.`,
      );
    }
    if (input.sectorId) {
      const sec = this.sectors.get(input.sectorId);
      if (!sec || sec.tenantId !== input.tenantId || sec.plantId !== input.plantId) {
        throw new CanonicalIntegrityError(
          "PLANT_MISMATCH",
          `Setor '${input.sectorId}' não pertence ao mesmo tenant/planta do equipamento.`,
        );
      }
    }

    const existing = this.equipments.get(input.id);
    if (existing) {
      if (existing.tenantId !== input.tenantId || existing.plantId !== input.plantId) {
        throw new CanonicalIntegrityError(
          "IDENTITY_TRANSFER_FORBIDDEN",
          `Equipamento '${input.id}' não pode ser transferido de (${existing.tenantId}/${existing.plantId}) para (${input.tenantId}/${input.plantId}).`,
        );
      }
      const changedFields: string[] = [];
      if (existing.tagCode !== input.tagCode) changedFields.push("tagCode");
      if (existing.displayName !== (input.displayName ?? "")) changedFields.push("displayName");
      if (existing.description !== (input.description ?? "")) changedFields.push("description");
      if (existing.sectorId !== input.sectorId) changedFields.push("sectorId");

      const nextRevision = changedFields.length > 0 ? existing.revision + 1 : existing.revision;
      const updated = EquipmentSchema.parse({
        ...existing,
        ...input,
        id: existing.id, // UUID imutável
        revision: nextRevision,
      });
      this.equipments.set(updated.id, updated);
      if (changedFields.length > 0) {
        this.appendRevision(this.equipmentRevisions, updated.id, {
          entityId: updated.id,
          revision: updated.revision,
          changedAt: now,
          changedBy: actor,
          changedFields,
          snapshot: updated,
        });
      }
      return updated;
    }

    const created = EquipmentSchema.parse({ ...input, revision: input.revision ?? 1 });
    this.equipments.set(created.id, created);
    this.appendRevision(this.equipmentRevisions, created.id, {
      entityId: created.id,
      revision: created.revision,
      changedAt: now,
      changedBy: actor,
      changedFields: ["<created>"],
      snapshot: created,
    });
    return created;
  }

  public getEquipment(user: FleetUserContext, equipmentId: string): Equipment | undefined {
    const eq = this.equipments.get(equipmentId);
    if (!eq) return undefined;
    this.assertUserAccessToPlant(user, eq.tenantId, eq.plantId, "VIEW_FLEET");
    return eq;
  }

  public getEquipmentRevisions(user: FleetUserContext, equipmentId: string): EquipmentRevision[] {
    const eq = this.equipments.get(equipmentId);
    if (!eq) return [];
    this.assertUserAccessToPlant(user, eq.tenantId, eq.plantId, "VIEW_FLEET");
    return [...(this.equipmentRevisions.get(equipmentId) ?? [])];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // IndustrialTag (tagId === CanonicalTag.id) + TagBinding + Revisões
  // ───────────────────────────────────────────────────────────────────────────

  public registerOrUpdateTag(
    input: Omit<
      z.input<typeof IndustrialTagSchema>,
      "revision" | "configurationVersion"
    > & {
      revision?: number;
      configurationVersion?: number;
    },
    actor: string = "system",
    now: number = Date.now(),
  ): IndustrialTag {
    this.assertPlantBelongsToTenant(input.tenantId, input.plantId);

    if (input.equipmentId) {
      const eq = this.equipments.get(input.equipmentId);
      if (!eq) {
        throw new CanonicalIntegrityError(
          "UNKNOWN_ENTITY",
          `Equipamento '${input.equipmentId}' referenciado pela tag '${input.tagId}' não existe.`,
        );
      }
      if (eq.tenantId !== input.tenantId) {
        throw new CanonicalIntegrityError(
          "TENANT_MISMATCH",
          `Tag '${input.tagId}' (${input.tenantId}) não pode vincular-se ao equipamento '${eq.id}' (${eq.tenantId}).`,
        );
      }
      if (eq.plantId !== input.plantId) {
        throw new CanonicalIntegrityError(
          "PLANT_MISMATCH",
          `Tag '${input.tagId}' (${input.plantId}) não pode vincular-se ao equipamento '${eq.id}' (${eq.plantId}).`,
        );
      }
    }

    const existing = this.tags.get(input.tagId);
    if (existing) {
      if (existing.tenantId !== input.tenantId || existing.plantId !== input.plantId) {
        throw new CanonicalIntegrityError(
          "IDENTITY_TRANSFER_FORBIDDEN",
          `Tag '${input.tagId}' não pode ser transferida entre organizações ou plantas.`,
        );
      }
      const changedFields: string[] = [];
      if (existing.canonicalName !== input.canonicalName) changedFields.push("canonicalName");
      if (existing.displayName !== (input.displayName ?? "")) changedFields.push("displayName");
      if (existing.engineeringUnit !== (input.engineeringUnit ?? ""))
        changedFields.push("engineeringUnit");
      if (existing.scale !== (input.scale ?? 1)) changedFields.push("scale");
      if (existing.offset !== (input.offset ?? 0)) changedFields.push("offset");

      const nextRev = changedFields.length > 0 ? existing.revision + 1 : existing.revision;
      const nextCfg =
        input.configurationVersion ??
        (changedFields.length > 0
          ? existing.configurationVersion + 1
          : existing.configurationVersion);

      const updated = IndustrialTagSchema.parse({
        ...existing,
        ...input,
        tagId: existing.tagId,
        revision: nextRev,
        configurationVersion: nextCfg,
      });
      this.tags.set(updated.tagId, updated);
      if (changedFields.length > 0) {
        this.appendRevision(this.tagRevisions, updated.tagId, {
          entityId: updated.tagId,
          revision: updated.revision,
          changedAt: now,
          changedBy: actor,
          changedFields,
          snapshot: updated,
        });
      }
      return updated;
    }

    const parsedRes = IndustrialTagSchema.safeParse({
      ...input,
      revision: input.revision ?? 1,
      configurationVersion: input.configurationVersion ?? 1,
    });
    if (!parsedRes.success) {
      throw new CanonicalIntegrityError("INVALID_SCHEMA", parsedRes.error.message);
    }
    const created = parsedRes.data;
    this.tags.set(created.tagId, created);
    this.runtimeSlots.set(created.tagId, {
      lastValidValue: null,
      lastValidTimestamp: null,
      forced: false,
      gatewayOffline: false,
    });
    this.appendRevision(this.tagRevisions, created.tagId, {
      entityId: created.tagId,
      revision: created.revision,
      changedAt: now,
      changedBy: actor,
      changedFields: ["<created>"],
      snapshot: created,
    });
    return created;
  }

  public bindEquipmentToTag(input: TagBinding): TagBinding {
    const parsed = TagBindingSchema.parse(input);
    this.assertPlantBelongsToTenant(parsed.tenantId, parsed.plantId);
    const eq = this.equipments.get(parsed.equipmentId);
    const tag = this.tags.get(parsed.tagId);
    if (!eq) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `Equipamento '${parsed.equipmentId}' inexistente.`,
      );
    }
    if (!tag) {
      throw new CanonicalIntegrityError("UNKNOWN_ENTITY", `Tag '${parsed.tagId}' inexistente.`);
    }
    if (eq.tenantId !== parsed.tenantId || tag.tenantId !== parsed.tenantId) {
      throw new CanonicalIntegrityError(
        "TENANT_MISMATCH",
        "Equipment e Tag devem pertencer ao mesmo tenant.",
      );
    }
    if (eq.plantId !== parsed.plantId || tag.plantId !== parsed.plantId) {
      throw new CanonicalIntegrityError(
        "PLANT_MISMATCH",
        "Equipment e Tag devem pertencer à mesma planta.",
      );
    }
    this.tagBindings.set(parsed.id, parsed);
    this.tags.set(tag.tagId, { ...tag, equipmentId: eq.id });
    return parsed;
  }

  public getTagRevisions(user: FleetUserContext, tagId: string): TagRevision[] {
    const tag = this.tags.get(tagId);
    if (!tag) return [];
    this.assertUserAccessToPlant(user, tag.tenantId, tag.plantId, "VIEW_FLEET");
    return [...(this.tagRevisions.get(tagId) ?? [])];
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Gateway & GatewayTagSource (allowlist explícita de aquisição física)
  // ───────────────────────────────────────────────────────────────────────────

  public registerGateway(
    input: CanonicalGateway,
    credentialToken: string,
    certificateFingerprint: string = `SHA256:${input.id}`,
  ): CanonicalGateway {
    const parsed = CanonicalGatewaySchema.parse(input);
    this.assertPlantBelongsToTenant(parsed.tenantId, parsed.plantId);
    const existing = this.gateways.get(parsed.id);
    if (existing && (existing.tenantId !== parsed.tenantId || existing.plantId !== parsed.plantId)) {
      throw new CanonicalIntegrityError(
        "IDENTITY_TRANSFER_FORBIDDEN",
        `Gateway '${parsed.id}' não pode mudar de tenant ou planta.`,
      );
    }
    this.gateways.set(parsed.id, parsed);
    this.gatewayRegistry.registerGateway(
      {
        gatewayId: parsed.id,
        organizationId: parsed.tenantId,
        plantId: parsed.plantId,
        stationId: `station_${parsed.id}`,
        gatewayVersion: "1.2.0",
        installationId: `inst_${parsed.id}`,
        certificateFingerprint,
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        operationalState: "ONLINE",
        isRevoked: false,
        name: parsed.name,
      },
      credentialToken,
    );
    return parsed;
  }

  public registerGatewayTagSource(input: GatewayTagSource): GatewayTagSource {
    if ((input as { writeEnabled?: boolean }).writeEnabled === true) {
      this.assertPhysicalWriteForbidden("registerGatewayTagSource(writeEnabled=true)");
    }
    const parsed = GatewayTagSourceSchema.parse(input);
    this.assertPlantBelongsToTenant(parsed.tenantId, parsed.plantId);

    const gw = this.gateways.get(parsed.gatewayId);
    if (!gw) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `Gateway '${parsed.gatewayId}' não cadastrado.`,
      );
    }
    if (gw.tenantId !== parsed.tenantId || gw.plantId !== parsed.plantId) {
      throw new CanonicalIntegrityError(
        "PLANT_MISMATCH",
        `Gateway '${gw.id}' pertence a (${gw.tenantId}/${gw.plantId}), não a (${parsed.tenantId}/${parsed.plantId}).`,
      );
    }

    const tag = this.tags.get(parsed.tagId);
    if (!tag) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `Tag '${parsed.tagId}' não cadastrada.`,
      );
    }
    if (tag.tenantId !== parsed.tenantId) {
      throw new CanonicalIntegrityError(
        "TENANT_MISMATCH",
        `Gateway '${gw.id}' (${parsed.tenantId}) não pode publicar na tag '${tag.tagId}' (${tag.tenantId}).`,
      );
    }
    if (tag.plantId !== parsed.plantId) {
      throw new CanonicalIntegrityError(
        "PLANT_MISMATCH",
        `Gateway '${gw.id}' (${parsed.plantId}) não pode publicar na tag '${tag.tagId}' (${tag.plantId}).`,
      );
    }

    this.gatewayTagSources.set(this.sourceKey(parsed.gatewayId, parsed.tagId, parsed.sourceId), parsed);
    return parsed;
  }

  public setGatewayConnectivity(gatewayId: string, online: boolean): void {
    const gw = this.gateways.get(gatewayId);
    if (!gw) return;
    for (const src of this.gatewayTagSources.values()) {
      if (src.gatewayId === gatewayId && src.active) {
        const slot = this.runtimeSlots.get(src.tagId);
        if (slot) slot.gatewayOffline = !online;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ponte com UnifiedProjectDoc (Unifilar / Multifilar / Ladder / FBD / PLC)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Importa/sincroniza os equipamentos e tags de um UnifiedProjectDoc sem criar
   * cadastros paralelos: reutiliza exatamente `eq.id` e `tag.id`.
   */
  public syncFromUnifiedProjectDoc(
    doc: UnifiedProjectDoc,
    scope: { tenantId: string; plantId: string; actor?: string },
    now: number = Date.now(),
  ): { equipmentIds: string[]; tagIds: string[]; bindingIds: string[] } {
    this.assertPlantBelongsToTenant(scope.tenantId, scope.plantId);
    const actor = scope.actor ?? "unified-doc-bridge";
    const equipmentIds: string[] = [];
    const tagIds: string[] = [];
    const bindingIds: string[] = [];

    for (const eq of Object.values(doc.engineering.equipments)) {
      if (!eq?.id) continue;
      const typeId = `eqtype_${eq.category}_${eq.catalogType || "generic"}`;
      if (!this.equipmentTypes.has(typeId)) {
        this.registerEquipmentType({
          id: typeId,
          category: eq.category,
          catalogType: eq.catalogType || "generic",
        });
      }
      this.registerOrUpdateEquipment(
        {
          id: eq.id,
          tenantId: scope.tenantId,
          plantId: scope.plantId,
          projectId: doc.metadata.id,
          equipmentTypeId: typeId,
          tagCode: eq.tagCode || eq.id,
          displayName: eq.displayName || eq.tagCode || eq.id,
          description: "",
        },
        actor,
        now,
      );
      equipmentIds.push(eq.id);
    }

    const mapDataType = (dt: string): IndustrialTag["dataType"] => {
      if (dt === "BOOL") return "BOOL";
      if (dt === "STRING") return "STRING";
      if (dt === "DINT" || dt === "DWORD") return "DINT";
      if (dt === "INT" || dt === "BYTE" || dt === "WORD") return "INT";
      return "REAL";
    };

    for (const t of Object.values(doc.engineering.tags)) {
      if (!t?.id) continue;
      const safeName = t.name.replace(/[^A-Za-z0-9_.:\-/]/g, "_");
      const linkedEquipmentId =
        t.linkedEquipmentId && this.equipments.has(t.linkedEquipmentId)
          ? t.linkedEquipmentId
          : undefined;

      this.registerOrUpdateTag(
        {
          tagId: t.id,
          tenantId: scope.tenantId,
          plantId: scope.plantId,
          equipmentId: linkedEquipmentId,
          canonicalName: safeName,
          displayName: t.description || t.name,
          dataType: mapDataType(t.dataType),
          engineeringUnit: t.unit ?? "",
          scale: 1,
          offset: 0,
          precision: 2,
          minimumValue: t.scaleMin,
          maximumValue: t.scaleMax,
          staleAfterMs: 10_000,
          sourceKind: "INTERNAL_RUNTIME",
        },
        actor,
        now,
      );
      tagIds.push(t.id);

      if (linkedEquipmentId) {
        const bindingId = `bind_${linkedEquipmentId}_${t.id}`;
        this.bindEquipmentToTag({
          id: bindingId,
          tenantId: scope.tenantId,
          plantId: scope.plantId,
          equipmentId: linkedEquipmentId,
          tagId: t.id,
          role: "engineering_link",
        });
        bindingIds.push(bindingId);
      }
    }

    for (const cb of Object.values(doc.engineering.controlBindings)) {
      if (!cb?.id) continue;
      if (this.equipments.has(cb.equipmentId) && this.tags.has(cb.tagId)) {
        const bindingId = `ctrlbind_${cb.id}`;
        this.bindEquipmentToTag({
          id: bindingId,
          tenantId: scope.tenantId,
          plantId: scope.plantId,
          equipmentId: cb.equipmentId,
          tagId: cb.tagId,
          role: cb.role,
        });
        bindingIds.push(bindingId);
      }
    }

    return { equipmentIds, tagIds, bindingIds };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ingestão Edge (autenticação, allowlist, deduplicação, transformação, alarmes)
  // ───────────────────────────────────────────────────────────────────────────

  public ingestEdgeBatch(
    rawBatch: unknown,
    credential: string,
    ingestionTimestamp: number = Date.now(),
  ): BatchIngestReport {
    const parsedBatch = CanonicalEdgeBatchSchema.safeParse(rawBatch);
    if (!parsedBatch.success) {
      return {
        accepted: false,
        statusCode: 400,
        gatewayId: (rawBatch as { gatewayId?: string })?.gatewayId ?? "unknown",
        batchId: (rawBatch as { batchId?: string })?.batchId ?? "unknown",
        ingestionTimestamp,
        ingestedSampleCount: 0,
        deduplicatedSampleCount: 0,
        rejectedSamples: [],
        ingestedAlarmTransitions: 0,
        deduplicatedAlarmTransitions: 0,
        error: `INVALID_BATCH_SCHEMA: ${parsedBatch.error.message}`,
      };
    }

    const batch: CanonicalEdgeBatch = parsedBatch.data;

    // 1. Autentica o gateway no registro central e deriva tenant/plant no servidor
    const auth = this.gatewayRegistry.authenticateGateway(batch.gatewayId, credential);
    const canonicalGw = this.gateways.get(batch.gatewayId);
    if (!auth.authorized || !auth.gateway || !canonicalGw) {
      return {
        accepted: false,
        statusCode: auth.statusCode ?? 401,
        gatewayId: batch.gatewayId,
        batchId: batch.batchId,
        ingestionTimestamp,
        ingestedSampleCount: 0,
        deduplicatedSampleCount: 0,
        rejectedSamples: [],
        ingestedAlarmTransitions: 0,
        deduplicatedAlarmTransitions: 0,
        error: auth.error ?? "GATEWAY_NOT_REGISTERED",
      };
    }

    const tenantId = canonicalGw.tenantId;
    const plantId = canonicalGw.plantId;
    this.setGatewayConnectivity(batch.gatewayId, true);

    let ingestedSampleCount = 0;
    let deduplicatedSampleCount = 0;
    const rejectedSamples: BatchIngestReport["rejectedSamples"] = [];

    for (const s of batch.samples) {
      const tag = this.tags.get(s.tagId);
      if (!tag) {
        rejectedSamples.push({
          tagId: s.tagId,
          sourceId: s.sourceId,
          sequenceNumber: s.sequenceNumber,
          reason: "UNKNOWN_TAG",
        });
        continue;
      }

      if (tag.tenantId !== tenantId || tag.plantId !== plantId) {
        rejectedSamples.push({
          tagId: s.tagId,
          sourceId: s.sourceId,
          sequenceNumber: s.sequenceNumber,
          reason: "CROSS_TENANT_OR_PLANT_TAG",
        });
        continue;
      }

      // Allowlist explícita: exige GatewayTagSource ativo para (gatewayId, tagId, sourceId)
      const source = this.gatewayTagSources.get(
        this.sourceKey(batch.gatewayId, s.tagId, s.sourceId),
      );
      if (!source || !source.active) {
        rejectedSamples.push({
          tagId: s.tagId,
          sourceId: s.sourceId,
          sequenceNumber: s.sequenceNumber,
          reason: "SOURCE_NOT_IN_ALLOWLIST",
        });
        continue;
      }

      // Deduplicação idempotente
      const dedupKey = `${batch.gatewayId}|${s.tagId}|${s.sourceId}|${s.sequenceNumber}|${s.sourceTimestamp}`;
      if (this.sampleDedupKeys.has(dedupKey)) {
        deduplicatedSampleCount++;
        continue;
      }
      this.sampleDedupKeys.add(dedupKey);

      // Transformação raw → engenharia (rejeita NaN/Infinity sem lançar exceção)
      const tx = transformRawValue(tag, source, s.rawValue, s.quality);

      const provenance: DataProvenance =
        tx.quality === "BAD"
          ? "BAD_QUALITY"
          : tag.sourceKind === "SIMULATED"
            ? "SIMULATED_DATA"
            : tag.sourceKind === "CALCULATED"
              ? "CALCULATED_DATA"
              : tag.sourceKind === "INTERNAL_RUNTIME"
                ? "INTERNAL_RUNTIME"
                : "PHYSICAL_DATA";

      const slot = this.runtimeSlots.get(tag.tagId) ?? {
        lastValidValue: null,
        lastValidTimestamp: null,
        forced: false,
        gatewayOffline: false,
      };

      const previousLatestTs = slot.latestSample?.sourceTimestamp ?? -1;
      const isLate = previousLatestTs > 0 && s.sourceTimestamp < previousLatestTs;

      const historianSample: HistorianSample = {
        tenantId,
        plantId,
        tagId: tag.tagId,
        equipmentId: tag.equipmentId,
        gatewayId: batch.gatewayId,
        sourceId: s.sourceId,
        sequenceNumber: s.sequenceNumber,
        rawValue: s.rawValue, // bruto preservado
        engineeringValue: tx.engineeringValue,
        transformation: tx.transformation,
        quality: tx.quality,
        provenance,
        sourceTimestamp: s.sourceTimestamp, // NUNCA substituído por ingestionTimestamp
        edgeReceivedAt: s.edgeReceivedAt,
        ingestionTimestamp,
        isLate,
        tagRevision: tag.revision,
        configurationVersion: tag.configurationVersion,
        batchId: batch.batchId,
      };

      this.insertHistorianSampleChronologically(tag.tagId, historianSample);

      // Estado em tempo real avança apenas se a amostra não for mais antiga que a atual
      if (!isLate) {
        slot.latestSample = historianSample;
      }
      if (tx.quality === "GOOD" && tx.engineeringValue !== null) {
        if (slot.lastValidTimestamp === null || s.sourceTimestamp >= slot.lastValidTimestamp) {
          slot.lastValidValue = tx.engineeringValue;
          slot.lastValidTimestamp = s.sourceTimestamp;
        }
      }
      slot.gatewayOffline = false;
      this.runtimeSlots.set(tag.tagId, slot);
      ingestedSampleCount++;
    }

    // 2. Sincronização idempotente de transições de alarmes geradas no Edge
    let ingestedAlarmTransitions = 0;
    let deduplicatedAlarmTransitions = 0;
    for (const tr of batch.alarms) {
      const outcome = this.applyEdgeAlarmTransition(
        tenantId,
        plantId,
        batch.gatewayId,
        tr,
        ingestionTimestamp,
      );
      if (outcome === "INGESTED") ingestedAlarmTransitions++;
      else if (outcome === "DUPLICATE") deduplicatedAlarmTransitions++;
    }

    return {
      accepted: true,
      statusCode: 200,
      gatewayId: batch.gatewayId,
      batchId: batch.batchId,
      ingestionTimestamp,
      ingestedSampleCount,
      deduplicatedSampleCount,
      rejectedSamples,
      ingestedAlarmTransitions,
      deduplicatedAlarmTransitions,
    };
  }

  /**
   * Ingestão direta de amostra interna (SIMULATED, INTERNAL_RUNTIME, CALCULATED).
   * Jamais produz PHYSICAL_DATA, mesmo se chamada indevidamente.
   */
  public recordInternalOrSimulatedSample(input: {
    tagId: string;
    rawValue: number | boolean | string;
    sourceTimestamp: number;
    ingestionTimestamp?: number;
    sequenceNumber: number;
    quality?: SampleQuality;
  }): HistorianSample {
    const tag = this.tags.get(input.tagId);
    if (!tag) {
      throw new CanonicalIntegrityError("UNKNOWN_ENTITY", `Tag '${input.tagId}' não encontrada.`);
    }
    if (tag.sourceKind === "PHYSICAL") {
      throw new CanonicalIntegrityError(
        "FORBIDDEN",
        `Tag física '${tag.tagId}' só pode receber amostras via Edge Gateway autenticado.`,
      );
    }
    const ingestionTimestamp = input.ingestionTimestamp ?? Date.now();
    const tx = transformRawValue(tag, null, input.rawValue, input.quality ?? "GOOD");

    const provenance: DataProvenance =
      tx.quality === "BAD"
        ? "BAD_QUALITY"
        : tag.sourceKind === "SIMULATED"
          ? "SIMULATED_DATA"
          : tag.sourceKind === "CALCULATED"
            ? "CALCULATED_DATA"
            : "INTERNAL_RUNTIME";

    const slot = this.runtimeSlots.get(tag.tagId) ?? {
      lastValidValue: null,
      lastValidTimestamp: null,
      forced: false,
      gatewayOffline: false,
    };
    const isLate =
      (slot.latestSample?.sourceTimestamp ?? -1) > 0 &&
      input.sourceTimestamp < (slot.latestSample?.sourceTimestamp ?? -1);

    const sample: HistorianSample = {
      tenantId: tag.tenantId,
      plantId: tag.plantId,
      tagId: tag.tagId,
      equipmentId: tag.equipmentId,
      gatewayId: "internal_engine",
      sourceId: tag.sourceKind.toLowerCase(),
      sequenceNumber: input.sequenceNumber,
      rawValue: input.rawValue,
      engineeringValue: tx.engineeringValue,
      transformation: tx.transformation,
      quality: tx.quality,
      provenance,
      sourceTimestamp: input.sourceTimestamp,
      edgeReceivedAt: input.sourceTimestamp,
      ingestionTimestamp,
      isLate,
      tagRevision: tag.revision,
      configurationVersion: tag.configurationVersion,
      batchId: `internal_${input.sequenceNumber}`,
    };

    this.insertHistorianSampleChronologically(tag.tagId, sample);
    if (!isLate) slot.latestSample = sample;
    if (tx.quality === "GOOD" && tx.engineeringValue !== null) {
      slot.lastValidValue = tx.engineeringValue;
      slot.lastValidTimestamp = input.sourceTimestamp;
    }
    this.runtimeSlots.set(tag.tagId, slot);
    return sample;
  }

  public forceTagInSupervisor(
    user: FleetUserContext,
    tagId: string,
    forcedValue: number | boolean | string,
    now: number = Date.now(),
  ): void {
    const tag = this.tags.get(tagId);
    if (!tag) throw new CanonicalIntegrityError("UNKNOWN_ENTITY", `Tag '${tagId}' inexistente.`);
    this.assertUserAccessToPlant(user, tag.tenantId, tag.plantId, "PROPOSE_CONFIG");
    const slot = this.runtimeSlots.get(tagId) ?? {
      lastValidValue: null,
      lastValidTimestamp: null,
      forced: false,
      gatewayOffline: false,
    };
    slot.forced = true;
    slot.forcedValue = forcedValue;
    slot.forcedBy = user.email;
    slot.forcedAt = now;
    this.runtimeSlots.set(tagId, slot);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Consulta SCADA em tempo real e Historian
  // ───────────────────────────────────────────────────────────────────────────

  public getTagRealtimeState(
    user: FleetUserContext,
    tagId: string,
    now: number = Date.now(),
  ): TagRuntimeValueState {
    const tag = this.tags.get(tagId);
    if (!tag) {
      throw new CanonicalIntegrityError("UNKNOWN_ENTITY", `Tag '${tagId}' não encontrada.`);
    }
    this.assertUserAccessToPlant(user, tag.tenantId, tag.plantId, "VIEW_TELEMETRY");

    const slot = this.runtimeSlots.get(tagId) ?? {
      lastValidValue: null,
      lastValidTimestamp: null,
      forced: false,
      gatewayOffline: false,
    };

    const hasActivePhysicalSource = this.hasActiveGatewaySourceForTag(tagId);
    const latest = slot.latestSample;

    // Sem fonte ativa (para tags físicas) ou gateway desconectado ou nunca recebeu amostra
    if (
      slot.gatewayOffline ||
      (tag.sourceKind === "PHYSICAL" && !hasActivePhysicalSource) ||
      !latest
    ) {
      return {
        tagId: tag.tagId,
        tenantId: tag.tenantId,
        plantId: tag.plantId,
        equipmentId: tag.equipmentId,
        canonicalName: tag.canonicalName,
        displayName: tag.displayName,
        engineeringUnit: tag.engineeringUnit,
        currentValue: slot.forced ? (slot.forcedValue ?? null) : (latest?.engineeringValue ?? null),
        rawValue: latest?.rawValue ?? null,
        lastValidValue: slot.lastValidValue,
        lastValidTimestamp: slot.lastValidTimestamp,
        sourceTimestamp: latest?.sourceTimestamp ?? null,
        ingestionTimestamp: latest?.ingestionTimestamp ?? null,
        sequenceNumber: latest?.sequenceNumber ?? null,
        dataAgeMs: latest ? Math.max(0, now - latest.sourceTimestamp) : null,
        quality: slot.forced ? "FORCED" : "NOT_CONNECTED",
        provenance: slot.forced ? "FORCED_DATA" : "NOT_CONNECTED",
        isForced: slot.forced,
        forcedBy: slot.forcedBy,
        isLate: latest?.isLate ?? false,
        revision: tag.revision,
        configurationVersion: tag.configurationVersion,
      };
    }

    const dataAgeMs = Math.max(0, now - latest.sourceTimestamp);
    const isStale = dataAgeMs > tag.staleAfterMs;

    let provenance: DataProvenance;
    let quality: TagRuntimeValueState["quality"];

    if (slot.forced) {
      provenance = "FORCED_DATA";
      quality = "FORCED";
    } else if (latest.quality === "BAD") {
      provenance = "BAD_QUALITY";
      quality = "BAD";
    } else if (isStale) {
      provenance = "STALE_DATA";
      quality = "STALE";
    } else if (tag.sourceKind === "SIMULATED") {
      provenance = "SIMULATED_DATA";
      quality = latest.quality;
    } else if (tag.sourceKind === "CALCULATED") {
      provenance = "CALCULATED_DATA";
      quality = latest.quality;
    } else if (tag.sourceKind === "INTERNAL_RUNTIME") {
      provenance = "INTERNAL_RUNTIME";
      quality = latest.quality;
    } else {
      provenance = "PHYSICAL_DATA";
      quality = latest.quality;
    }

    return {
      tagId: tag.tagId,
      tenantId: tag.tenantId,
      plantId: tag.plantId,
      equipmentId: tag.equipmentId,
      gatewayId: latest.gatewayId,
      sourceId: latest.sourceId,
      canonicalName: tag.canonicalName,
      displayName: tag.displayName,
      engineeringUnit: tag.engineeringUnit,
      currentValue: slot.forced ? (slot.forcedValue ?? null) : latest.engineeringValue,
      rawValue: latest.rawValue,
      lastValidValue: slot.lastValidValue,
      lastValidTimestamp: slot.lastValidTimestamp,
      sourceTimestamp: latest.sourceTimestamp,
      ingestionTimestamp: latest.ingestionTimestamp,
      sequenceNumber: latest.sequenceNumber,
      dataAgeMs,
      quality,
      provenance,
      isForced: slot.forced,
      forcedBy: slot.forcedBy,
      isLate: latest.isLate,
      revision: tag.revision,
      configurationVersion: tag.configurationVersion,
    };
  }

  public queryHistorian(
    user: FleetUserContext,
    query: {
      tenantId: string;
      plantId: string;
      tagId: string;
      fromSourceTimestamp?: number;
      toSourceTimestamp?: number;
    },
  ): HistorianSample[] {
    this.assertUserAccessToPlant(user, query.tenantId, query.plantId, "VIEW_TELEMETRY");
    const tag = this.tags.get(query.tagId);
    if (!tag || tag.tenantId !== query.tenantId || tag.plantId !== query.plantId) {
      throw new CanonicalIntegrityError(
        "FORBIDDEN",
        `Tag '${query.tagId}' não pertence ao escopo (${query.tenantId}/${query.plantId}).`,
      );
    }
    const list = this.historianByTag.get(query.tagId) ?? [];
    return list.filter((s) => {
      if (query.fromSourceTimestamp !== undefined && s.sourceTimestamp < query.fromSourceTimestamp)
        return false;
      if (query.toSourceTimestamp !== undefined && s.sourceTimestamp > query.toSourceTimestamp)
        return false;
      return true;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Ciclo de vida de alarmes (ISA-18.2) com identidade preservada Edge → Cloud
  // ───────────────────────────────────────────────────────────────────────────

  public registerAlarmDefinition(input: AlarmDefinition): AlarmDefinition {
    const parsed = AlarmDefinitionSchema.parse(input);
    this.assertPlantBelongsToTenant(parsed.tenantId, parsed.plantId);
    const tag = this.tags.get(parsed.tagId);
    if (!tag || tag.tenantId !== parsed.tenantId || tag.plantId !== parsed.plantId) {
      throw new CanonicalIntegrityError(
        "PLANT_MISMATCH",
        `AlarmDefinition '${parsed.id}' deve pertencer ao mesmo tenant/planta da tag '${parsed.tagId}'.`,
      );
    }
    this.alarmDefinitions.set(parsed.id, parsed);
    return parsed;
  }

  private applyEdgeAlarmTransition(
    tenantId: string,
    plantId: string,
    gatewayId: string,
    tr: EdgeAlarmTransition,
    receivedAt: number,
  ): "INGESTED" | "DUPLICATE" | "REJECTED" {
    const def = this.alarmDefinitions.get(tr.alarmDefinitionId);
    if (!def || def.tenantId !== tenantId || def.plantId !== plantId) {
      return "REJECTED";
    }

    const occurrenceId = `occ_${tenantId}_${gatewayId}_${tr.edgeOccurrenceId}`;
    let occ = this.alarmOccurrences.get(occurrenceId);

    if (!occ) {
      occ = {
        occurrenceId,
        edgeOccurrenceId: tr.edgeOccurrenceId,
        tenantId,
        plantId,
        gatewayId,
        alarmDefinitionId: def.id,
        tagId: def.tagId,
        equipmentId: def.equipmentId,
        severity: def.severity,
        priority: def.priority,
        isActive: false,
        isAcknowledged: false,
        isShelved: false,
        activatedAt: tr.occurredAt,
        transitions: [],
      };
    }

    // Idempotência: se a mesma transitionSequence já foi aplicada, ignora sem duplicar
    if (occ.transitions.some((x) => x.transitionSequence === tr.transitionSequence)) {
      return "DUPLICATE";
    }

    const record: AlarmTransitionRecord = {
      kind: tr.transition,
      transitionSequence: tr.transitionSequence,
      occurredAt: tr.occurredAt,
      receivedAt,
      operatorId: tr.operatorId,
      value: tr.value,
      quality: tr.quality,
      origin: "EDGE",
    };

    occ.transitions.push(record);
    occ.transitions.sort((a, b) => a.transitionSequence - b.transitionSequence);
    this.recomputeAlarmState(occ);
    this.alarmOccurrences.set(occurrenceId, occ);
    return "INGESTED";
  }

  public acknowledgeAlarmOccurrence(
    user: FleetUserContext,
    occurrenceId: string,
    occurredAt: number = Date.now(),
  ): AlarmOccurrence {
    const occ = this.alarmOccurrences.get(occurrenceId);
    if (!occ) {
      throw new CanonicalIntegrityError(
        "UNKNOWN_ENTITY",
        `Ocorrência de alarme '${occurrenceId}' não encontrada.`,
      );
    }
    this.assertUserAccessToPlant(user, occ.tenantId, occ.plantId, "VIEW_TELEMETRY");

    const nextSeq =
      occ.transitions.reduce((m, t) => Math.max(m, t.transitionSequence), 0) + 1;
    occ.transitions.push({
      kind: "ACKNOWLEDGED",
      transitionSequence: nextSeq,
      occurredAt,
      receivedAt: occurredAt,
      operatorId: user.email,
      quality: "GOOD",
      origin: "CLOUD_OPERATOR",
    });
    this.recomputeAlarmState(occ);
    return occ;
  }

  public getAlarmOccurrencesForPlant(
    user: FleetUserContext,
    tenantId: string,
    plantId: string,
  ): AlarmOccurrence[] {
    this.assertUserAccessToPlant(user, tenantId, plantId, "VIEW_TELEMETRY");
    return Array.from(this.alarmOccurrences.values()).filter(
      (o) => o.tenantId === tenantId && o.plantId === plantId,
    );
  }

  private recomputeAlarmState(occ: AlarmOccurrence): void {
    let active = false;
    let acked = false;
    let shelved = false;
    let activatedAt = occ.activatedAt;

    for (const t of occ.transitions) {
      const k: AlarmTransitionKind = t.kind;
      if (k === "ACTIVATED") {
        active = true;
        activatedAt = Math.min(activatedAt, t.occurredAt);
      } else if (k === "RETURNED_TO_NORMAL") {
        active = false;
      } else if (k === "ACKNOWLEDGED") {
        acked = true;
      } else if (k === "SHELVED") {
        shelved = true;
      } else if (k === "UNSHELVED") {
        shelved = false;
      }
    }
    occ.isActive = active;
    occ.isAcknowledged = acked;
    occ.isShelved = shelved;
    occ.activatedAt = activatedAt;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Utilitários internos
  // ───────────────────────────────────────────────────────────────────────────

  private sourceKey(gatewayId: string, tagId: string, sourceId: string): string {
    return `${gatewayId}::${tagId}::${sourceId}`;
  }

  private hasActiveGatewaySourceForTag(tagId: string): boolean {
    for (const s of this.gatewayTagSources.values()) {
      if (s.tagId === tagId && s.active) return true;
    }
    return false;
  }

  private insertHistorianSampleChronologically(tagId: string, sample: HistorianSample): void {
    const list = this.historianByTag.get(tagId) ?? [];
    list.push(sample);
    list.sort((a, b) =>
      a.sourceTimestamp !== b.sourceTimestamp
        ? a.sourceTimestamp - b.sourceTimestamp
        : a.sequenceNumber - b.sequenceNumber,
    );
    this.historianByTag.set(tagId, list);
  }

  private appendRevision<T>(
    store: Map<string, EntityRevision<T>[]>,
    id: string,
    rev: EntityRevision<T>,
  ): void {
    const list = store.get(id) ?? [];
    list.push(rev);
    store.set(id, list);
  }
}

export const canonicalIndustrialDataService = new CanonicalIndustrialDataService();
