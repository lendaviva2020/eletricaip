// SCADA SUPERVISÓRIO — Industrial Tag Runtime Engine (Hardened Gate 2.5)
// Standards: ISA-101, IEC 62443, OPC UA Unified Architecture (Part 8: Data Access)
// Provenance: source, sourceTimestamp, receivedAt, sequenceNumber, quality, unforcedValue

import type {
  ScadaTagDefinition,
  TagUpdateInput,
  TagQuality,
  HistoricalSample,
} from "./types";

export interface ProcessedTagResult {
  tag: ScadaTagDefinition;
  hasChanged: boolean;
  historicalSample: HistoricalSample | null;
  qualityChanged: boolean;
  previousQuality?: TagQuality;
  isOutOfRange: boolean;
  isTimestampOutOfOrder: boolean;
  isClockSkewed: boolean;
  rawSampleValue?: number;
  unclampedValue?: number | boolean | string;
}

export interface TagRuntimeOptions {
  staleTimeoutMs?: number;
  defaultDeadband?: number;
  timeProvider?: () => number;
  monotonicClock?: () => number;
}

export interface ForceTagOptions {
  operator?: string;
  reason?: string;
  ttlMs?: number;
  authorizedSafetyOverride?: boolean;
}

export class IndustrialTagRuntime {
  private tags: Map<string, ScadaTagDefinition> = new Map();
  private lastStoredValues: Map<string, number> = new Map();
  private lastSourceTimestamps: Map<string, number> = new Map();
  private monotonicLastUpdated: Map<string, number> = new Map();
  private staleTimeoutMs: number;
  private defaultDeadband: number;
  private timeProvider: () => number;
  private monotonicClock: () => number;

  constructor(options?: TagRuntimeOptions) {
    this.staleTimeoutMs = options?.staleTimeoutMs ?? 5000;
    this.defaultDeadband = options?.defaultDeadband ?? 0.05;
    this.timeProvider = options?.timeProvider ?? (() => Date.now());
    this.monotonicClock =
      options?.monotonicClock ??
      (options?.timeProvider
        ? options.timeProvider
        : typeof performance !== "undefined" && performance.now
          ? () => performance.now()
          : () => Date.now());
  }

  /**
   * Registers or updates tag metadata definitions in the runtime.
   */
  public registerTag(definition: ScadaTagDefinition): void {
    const existing = this.tags.get(definition.id);
    if (existing) {
      this.tags.set(definition.id, {
        ...existing,
        ...definition,
        // preserve runtime state if existing
        value: existing.value,
        unforcedValue: existing.unforcedValue,
        rawSampleValue: existing.rawSampleValue,
        quality: existing.quality,
        lastUpdated: existing.lastUpdated,
        forced: existing.forced,
        forcedBy: existing.forcedBy,
        forceReason: existing.forceReason,
        forcedAt: existing.forcedAt,
        forceExpiresAt: existing.forceExpiresAt,
      });
    } else {
      this.tags.set(definition.id, { ...definition });
      if (typeof definition.value === "number") {
        this.lastStoredValues.set(definition.id, definition.value);
      }
      this.monotonicLastUpdated.set(definition.id, this.monotonicClock());
    }
  }

  public registerTags(definitions: ScadaTagDefinition[]): void {
    for (const def of definitions) {
      this.registerTag(def);
    }
  }

  public getTag(idOrName: string): ScadaTagDefinition | undefined {
    const byId = this.tags.get(idOrName);
    if (byId) return byId;
    for (const tag of this.tags.values()) {
      if (tag.name === idOrName) return tag;
    }
    return undefined;
  }

  public getAllTags(): ScadaTagDefinition[] {
    return Array.from(this.tags.values());
  }

  public getTagsMap(): Record<string, ScadaTagDefinition> {
    const record: Record<string, ScadaTagDefinition> = {};
    for (const [id, tag] of this.tags.entries()) {
      record[id] = tag;
    }
    return record;
  }

  /**
   * Processes a raw telemetry update from any driver/source.
   * Performs scaling, deadband checking, quality validation, and provenance tracking.
   */
  public processUpdate(input: TagUpdateInput): ProcessedTagResult {
    const nowUtc = this.timeProvider();
    const monoNow = this.monotonicClock();
    const tag = this.getTag(input.tagId) || this.getTag(input.tagName);

    // 1. Check for Invalid Numeric Inputs (NaN, Infinity)
    let isInvalidNumber = false;
    if (typeof input.rawValue === "number") {
      if (!Number.isFinite(input.rawValue) || Number.isNaN(input.rawValue)) {
        isInvalidNumber = true;
      }
    }

    // 2. Check for Future Timestamps (Clock Skew > 60s)
    const isClockSkewed = input.sourceTimestamp > nowUtc + 60000;

    // 3. Dynamic Tag Creation if not preregistered
    if (!tag) {
      const engValue = isInvalidNumber
        ? input.rawValue
        : this.scaleValue(
            input.rawValue,
            input.scaleMultiplier,
            input.scaleOffset,
            undefined,
            undefined,
            input.clampToLimits,
          );

      const resolvedQuality: TagQuality = isInvalidNumber
        ? "BAD"
        : isClockSkewed
          ? "UNCERTAIN"
          : (input.quality ?? "GOOD");

      const newTag: ScadaTagDefinition = {
        id: input.tagId,
        name: input.tagName,
        description: input.tagName,
        dataType: input.dataType,
        unit: input.unit ?? "",
        scaleMin: 0,
        scaleMax: 100,
        value: engValue,
        rawSampleValue: typeof input.rawValue === "number" && !isInvalidNumber ? input.rawValue : undefined,
        unforcedValue: engValue,
        quality: resolvedQuality,
        driver: input.source,
        scanRateMs: 1000,
        lastUpdated: nowUtc,
        forced: false,
        sourceAddress: input.connectionId ?? `${input.source}:${input.tagName}`,
        linkedEquipmentId: input.equipmentId,
        isSimulated: input.source === "SIMULATION",
        isSafetyCritical: input.isSafetyCritical || false,
        isOutOfRange: false,
      };
      this.tags.set(newTag.id, newTag);
      this.lastSourceTimestamps.set(newTag.id, input.sourceTimestamp);
      this.monotonicLastUpdated.set(newTag.id, monoNow);

      const sample: HistoricalSample | null =
        typeof engValue === "number" && Number.isFinite(engValue)
          ? {
              projectId: input.projectId,
              tagName: input.tagName,
              value: engValue,
              quality: resolvedQuality,
              source: input.source,
              sampledAt: input.sourceTimestamp || nowUtc,
              receivedAt: input.receivedAt || nowUtc,
              sequenceNumber: input.sequenceNumber,
            }
          : null;

      if (typeof engValue === "number" && Number.isFinite(engValue)) {
        this.lastStoredValues.set(newTag.id, engValue);
      }

      return {
        tag: newTag,
        hasChanged: true,
        historicalSample: sample,
        qualityChanged: true,
        previousQuality: undefined,
        isOutOfRange: false,
        isTimestampOutOfOrder: false,
        isClockSkewed,
        rawSampleValue: newTag.rawSampleValue,
        unclampedValue: engValue,
      };
    }

    // Check for Out-of-Order Source Timestamps
    const lastSourceTs = this.lastSourceTimestamps.get(tag.id) ?? 0;
    const isTimestampOutOfOrder = input.sourceTimestamp > 0 && input.sourceTimestamp < lastSourceTs;
    if (!isTimestampOutOfOrder && input.sourceTimestamp > 0) {
      this.lastSourceTimestamps.set(tag.id, input.sourceTimestamp);
    }

    // 4. Check Forcing TTL Expiration
    if (tag.forced && tag.forceExpiresAt && nowUtc >= tag.forceExpiresAt) {
      tag.forced = false;
      tag.forcedBy = undefined;
      tag.forceReason = undefined;
      tag.forceExpiresAt = undefined;
      tag.quality = "UNCERTAIN"; // Until next live telemetry update
    }

    // 5. Engineering Value Calculation (Preserves Raw & Unclamped Values)
    let engineeringValue: number | boolean | string = input.rawValue;
    let isOutOfRange = false;

    if (!isInvalidNumber) {
      engineeringValue = this.scaleValue(
        input.rawValue,
        input.scaleMultiplier,
        input.scaleOffset,
        tag.scaleMin,
        tag.scaleMax,
        input.clampToLimits ?? false,
      );

      if (typeof engineeringValue === "number" && tag.scaleMin < tag.scaleMax) {
        if (engineeringValue < tag.scaleMin || engineeringValue > tag.scaleMax) {
          isOutOfRange = true;
        }
      }
    }

    tag.isOutOfRange = isOutOfRange;

    // If tag is forced, preserve the unforced value in background and DO NOT overwrite forced value
    if (tag.forced) {
      tag.unforcedValue = engineeringValue;
      tag.rawSampleValue = typeof input.rawValue === "number" && !isInvalidNumber ? input.rawValue : tag.rawSampleValue;
      return {
        tag,
        hasChanged: false,
        historicalSample: null,
        qualityChanged: false,
        previousQuality: tag.quality,
        isOutOfRange,
        isTimestampOutOfOrder,
        isClockSkewed,
        rawSampleValue: tag.rawSampleValue,
        unclampedValue: engineeringValue,
      };
    }

    // 6. Quality Resolution
    const previousQuality = tag.quality;
    let resolvedQuality: TagQuality = input.quality ?? "GOOD";

    if (isInvalidNumber) {
      resolvedQuality = "BAD";
    } else if (isClockSkewed || isTimestampOutOfOrder) {
      resolvedQuality = "UNCERTAIN";
    }

    const qualityChanged = previousQuality !== resolvedQuality;

    // 7. Deadband Evaluation for Historian Ingestion
    const prevValue = tag.value;
    const deadband = input.deadband ?? this.defaultDeadband;

    let hasChanged = false;
    let shouldStore = false;

    if (typeof engineeringValue === "number" && typeof prevValue === "number") {
      const lastStored = this.lastStoredValues.get(tag.id) ?? prevValue;
      const delta = Math.abs(engineeringValue - lastStored);
      hasChanged = delta > 0.0001;
      shouldStore = delta >= deadband || qualityChanged;
    } else {
      hasChanged = prevValue !== engineeringValue;
      shouldStore = hasChanged || qualityChanged;
    }

    // 8. Update Tag Definition in Runtime
    tag.value = engineeringValue;
    tag.unforcedValue = engineeringValue;
    tag.rawSampleValue = typeof input.rawValue === "number" && !isInvalidNumber ? input.rawValue : undefined;
    tag.quality = resolvedQuality;
    tag.driver = input.source;
    tag.lastUpdated = nowUtc;
    tag.isSimulated = input.source === "SIMULATION";
    if (input.equipmentId) {
      tag.linkedEquipmentId = input.equipmentId;
    }
    this.monotonicLastUpdated.set(tag.id, monoNow);

    let historicalSample: HistoricalSample | null = null;
    if (shouldStore && typeof engineeringValue === "number" && Number.isFinite(engineeringValue)) {
      this.lastStoredValues.set(tag.id, engineeringValue);
      historicalSample = {
        projectId: input.projectId,
        tagName: tag.name,
        value: engineeringValue,
        quality: resolvedQuality,
        source: input.source,
        sampledAt: input.sourceTimestamp || nowUtc,
        receivedAt: input.receivedAt || nowUtc,
        sequenceNumber: input.sequenceNumber,
      };
    }

    return {
      tag,
      hasChanged,
      historicalSample,
      qualityChanged,
      previousQuality,
      isOutOfRange,
      isTimestampOutOfOrder,
      isClockSkewed,
      rawSampleValue: tag.rawSampleValue,
      unclampedValue: engineeringValue,
    };
  }

  /**
   * Scales a raw telemetry reading to engineering units.
   * By default, clamping is DISABLED to ensure physical excursions are NOT hidden from alarms.
   */
  public scaleValue(
    raw: number | boolean | string,
    multiplier?: number,
    offset?: number,
    min?: number,
    max?: number,
    clamp?: boolean,
  ): number | boolean | string {
    if (typeof raw !== "number") {
      return raw;
    }

    if (!Number.isFinite(raw) || Number.isNaN(raw)) {
      return raw;
    }

    const mult = multiplier ?? 1;
    const off = offset ?? 0;
    let scaled = raw * mult + off;

    const shouldClamp = clamp ?? (min !== undefined && max !== undefined);
    if (shouldClamp && min !== undefined && max !== undefined && min < max) {
      scaled = Math.max(min, Math.min(max, scaled));
    }

    return Math.round(scaled * 1000) / 1000;
  }

  /**
   * Evaluates staleness across all registered tags using monotonic elapsed time
   * and per-tag configured timeout (defaulting to scanRateMs * 3 or staleTimeoutMs).
   */
  public evaluateStale(
    overrideTimeoutMs?: number,
    overrideNow?: number,
  ): Array<{ tag: ScadaTagDefinition; previousQuality: TagQuality }> {
    const monoNow = overrideNow ?? this.monotonicClock();
    const staleTags: Array<{ tag: ScadaTagDefinition; previousQuality: TagQuality }> = [];

    for (const tag of this.tags.values()) {
      if (tag.forced) continue;

      // Determine per-tag timeout: explicit override, or tag staleTimeoutMs, or scanRateMs * 3, or runtime default
      const tagTimeout =
        overrideTimeoutMs ??
        tag.staleTimeoutMs ??
        (tag.scanRateMs && tag.scanRateMs > 0 ? tag.scanRateMs * 3 : this.staleTimeoutMs);

      const lastMono = this.monotonicLastUpdated.get(tag.id) ?? 0;
      const elapsed = monoNow - lastMono;

      if (elapsed > tagTimeout) {
        if (tag.quality === "GOOD" || tag.quality === "UNCERTAIN") {
          const prevQuality = tag.quality;
          tag.quality = "STALE";
          staleTags.push({ tag, previousQuality: prevQuality });
        }
      }
    }

    return staleTags;
  }

  /**
   * Forces a tag value with operator authority and sets quality to FORCED.
   * Safety Interlock: Blocks forcing on safety-critical variables unless authorized.
   */
  public forceTagValue(
    tagIdOrName: string,
    value: number | boolean | string,
    options?: ForceTagOptions,
  ): ScadaTagDefinition | null {
    const tag = this.getTag(tagIdOrName);
    if (!tag) return null;

    // Safety Interlock Check
    if (tag.isSafetyCritical && !options?.authorizedSafetyOverride) {
      throw new Error(
        `SAFETY_INTERLOCK_VIOLATION: Forçamento bloqueado para TAG crítica de segurança [${tag.name}]. Exige aprovação e credencial de segurança qualificada.`,
      );
    }

    const nowUtc = this.timeProvider();
    tag.forced = true;
    tag.unforcedValue = tag.value; // Store unforced value before imposing override
    tag.value = value;
    tag.quality = "FORCED";
    tag.forcedBy = options?.operator || "OPERADOR";
    tag.forceReason = options?.reason || "Forçamento manual autorizado";
    tag.forcedAt = nowUtc;
    tag.forceExpiresAt = options?.ttlMs ? nowUtc + options.ttlMs : undefined;
    tag.lastUpdated = nowUtc;
    this.monotonicLastUpdated.set(tag.id, this.monotonicClock());

    return tag;
  }

  /**
   * Unforces a tag, returning control to field telemetry driver.
   */
  public unforceTag(tagIdOrName: string): ScadaTagDefinition | null {
    const tag = this.getTag(tagIdOrName);
    if (!tag) return null;

    tag.forced = false;
    tag.forcedBy = undefined;
    tag.forceReason = undefined;
    tag.forceExpiresAt = undefined;
    tag.quality = "UNCERTAIN"; // Until next live telemetry update arrives
    tag.value = tag.unforcedValue ?? tag.value;
    tag.lastUpdated = this.timeProvider();
    this.monotonicLastUpdated.set(tag.id, this.monotonicClock());

    return tag;
  }

  /**
   * Clears all tags from the runtime.
   */
  public clear(): void {
    this.tags.clear();
    this.lastStoredValues.clear();
    this.lastSourceTimestamps.clear();
    this.monotonicLastUpdated.clear();
  }
}
