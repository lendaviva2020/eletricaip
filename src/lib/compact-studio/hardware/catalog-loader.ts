/**
 * Zod-validated data-driven catalog loader for Compact Studio hardware modules.
 */
import { z } from "zod";
import rawCatalog from "./compact-hardware-catalog.v1.json";

export const CompactCatalogItemSchema = z.object({
  id: z.string().min(1),
  partCode: z.string().min(1),
  name: z.string().min(1),
  family: z.enum([
    "BASE_COMPACT",
    "EXPANSION_DI_DO",
    "EXPANSION_AI",
    "EXPANSION_AO",
    "COMM_MODULE",
    "POWER_SUPPLY",
    "ACCESSORY",
  ]),
  supplyVoltage: z.string().min(1),
  ioVoltage: z.string().min(1),
  outputType: z.string().optional(),
  digitalInputs: z.number().int().min(0),
  digitalOutputs: z.number().int().min(0),
  analogInputs: z.number().int().min(0),
  analogOutputs: z.number().int().min(0),
  hasDisplay: z.boolean().optional(),
  hasEthernet: z.boolean().optional(),
  maxBlocks: z.number().int().positive().optional(),
  retentiveMemoryBytes: z.number().int().min(0).optional(),
  maxDigitalInputsTotal: z.number().int().min(0).optional(),
  maxDigitalOutputsTotal: z.number().int().min(0).optional(),
  maxAnalogInputsTotal: z.number().int().min(0).optional(),
  maxAnalogOutputsTotal: z.number().int().min(0).optional(),
  maxExpansionSlots: z.number().int().min(0).optional(),
  widthModules: z.number().int().positive(),
  verified: z.boolean(),
  verifiedAt: z.string().min(1),
  sourceRef: z.string().min(1),
});

export type CompactCatalogItem = z.infer<typeof CompactCatalogItemSchema>;

export const CompactHardwareCatalogSchema = z.object({
  catalogVersion: z.string().min(1),
  schema: z.literal("eletric-compact-hardware-catalog-v1"),
  items: z.array(CompactCatalogItemSchema).min(1),
});

export type CompactHardwareCatalog = z.infer<typeof CompactHardwareCatalogSchema>;

let cachedCatalog: CompactHardwareCatalog | null = null;

export function getCompactHardwareCatalog(): CompactHardwareCatalog {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = CompactHardwareCatalogSchema.parse(rawCatalog);
  return cachedCatalog;
}

export function findCatalogItemById(id: string): CompactCatalogItem | undefined {
  return getCompactHardwareCatalog().items.find((item) => item.id === id);
}
