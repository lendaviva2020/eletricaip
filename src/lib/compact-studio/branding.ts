/**
 * Branding & Feature Identification for the Compact Logic Controller Studio.
 *
 * All UI-visible references to the module MUST read from {@link PRODUCT_NAME}
 * so the product name remains centrally configurable without scattering
 * third-party trademarks in code or translations.
 */

export const PRODUCT_NAME = "eletric Studio" as const;

export const PRODUCT_SHORT_NAME = "eletric" as const;

/** Feature flag key persisted per tenant in `tenant_settings`. */
export const COMPACT_STUDIO_FEATURE_FLAG = "logoStudio" as const;

/** Secondary feature flag governing optional live telemetry bridges to field hardware. */
export const FIELD_DEVICE_COMMS_FLAG = "fieldDeviceComms" as const;

export interface CompactStudioBranding {
  readonly productName: string;
  readonly shortName: string;
  readonly featureFlagKey: typeof COMPACT_STUDIO_FEATURE_FLAG;
}

export function getCompactStudioBranding(): CompactStudioBranding {
  return {
    productName: PRODUCT_NAME,
    shortName: PRODUCT_SHORT_NAME,
    featureFlagKey: COMPACT_STUDIO_FEATURE_FLAG,
  };
}
