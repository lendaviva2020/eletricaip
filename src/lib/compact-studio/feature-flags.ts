/**
 * Per-tenant feature flags controlling the availability of eletric Studio
 * and optional field device communication bridges.
 */
import { z } from "zod";
import { useCallback } from "react";
import { useTenantSetting } from "@/hooks/use-tenant-setting";
import { COMPACT_STUDIO_FEATURE_FLAG, FIELD_DEVICE_COMMS_FLAG } from "./branding";

export const CompactStudioFeatureFlagsSchema = z.object({
  [COMPACT_STUDIO_FEATURE_FLAG]: z.boolean().default(true),
  [FIELD_DEVICE_COMMS_FLAG]: z.boolean().default(false),
});

export type CompactStudioFeatureFlags = z.infer<typeof CompactStudioFeatureFlagsSchema>;

export const DEFAULT_COMPACT_STUDIO_FLAGS: CompactStudioFeatureFlags = {
  logoStudio: true,
  fieldDeviceComms: false,
};

/**
 * Parses arbitrary untrusted settings JSON into validated feature flags,
 * falling back safely to defaults on malformed payloads.
 */
export function resolveCompactStudioFlags(raw: unknown): CompactStudioFeatureFlags {
  const parsed = CompactStudioFeatureFlagsSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return { ...DEFAULT_COMPACT_STUDIO_FLAGS };
}

/**
 * React hook backed by `tenant_settings` (`compact_studio_flags`) with
 * localStorage mirror for instant workspace rendering.
 */
export function useCompactStudioFeatureFlags(): {
  flags: CompactStudioFeatureFlags;
  isStudioEnabled: boolean;
  isFieldCommsEnabled: boolean;
  setLogoStudioEnabled: (enabled: boolean) => void;
  setFieldCommsEnabled: (enabled: boolean) => void;
  isSaving: boolean;
} {
  const { value, update, isSaving } = useTenantSetting<CompactStudioFeatureFlags>(
    "compact_studio_flags",
    DEFAULT_COMPACT_STUDIO_FLAGS,
  );
  const resolved = resolveCompactStudioFlags(value);

  const setLogoStudioEnabled = useCallback(
    (enabled: boolean) => {
      update({ logoStudio: enabled });
    },
    [update],
  );

  const setFieldCommsEnabled = useCallback(
    (enabled: boolean) => {
      update({ fieldDeviceComms: enabled });
    },
    [update],
  );

  return {
    flags: resolved,
    isStudioEnabled: resolved.logoStudio,
    isFieldCommsEnabled: resolved.fieldDeviceComms,
    setLogoStudioEnabled,
    setFieldCommsEnabled,
    isSaving,
  };
}
