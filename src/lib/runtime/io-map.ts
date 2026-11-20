// Mapa de E/S do ElétricAi Runtime — PURO.
//
// Liga cada TAG do programa (as mesmas operandas do Ladder e símbolos do FB
// Studio) a um endereço REAL de campo. É o único lugar que diz o que o Runtime
// lê e, sobretudo, o que ele pode ESCREVER. Escrita é negada por padrão: uma
// saída só escreve com `writeEnabled: true` E com `safeValue` declarado (o
// valor que o Runtime grava ao parar, perder comunicação ou estourar o ciclo).
import { z } from "zod";

export const OPERAND_RE = /^[A-Za-z_%][A-Za-z0-9_.%]{0,47}$/;
export const RuntimeOperand = z.string().trim().regex(OPERAND_RE, "tag inválida");

const HOST_RE =
  /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,62}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/;

export const ModbusTcpConnectionSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,32}$/, "id inválido"),
  kind: z.literal("modbus_tcp"),
  label: z.string().trim().max(80).optional(),
  host: z.string().trim().regex(HOST_RE, "host inválido"),
  port: z.number().int().min(1).max(65535).default(502),
  unitId: z.number().int().min(0).max(255).default(1),
  timeoutMs: z.number().int().min(100).max(10_000).default(1000),
  pollMs: z.number().int().min(20).max(10_000).default(100),
});

/** E/S simulada no próprio Runtime (bancada virtual, sem campo). */
export const SimulatedConnectionSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,32}$/, "id inválido"),
  kind: z.literal("simulated"),
  label: z.string().trim().max(80).optional(),
});

export const FieldConnectionSchema = z.discriminatedUnion("kind", [
  ModbusTcpConnectionSchema,
  SimulatedConnectionSchema,
]);
export type FieldConnection = z.infer<typeof FieldConnectionSchema>;
export type ModbusTcpConnection = z.infer<typeof ModbusTcpConnectionSchema>;

export const MODBUS_AREAS = [
  "coil",
  "discrete_input",
  "holding_register",
  "input_register",
] as const;
export type ModbusArea = (typeof MODBUS_AREAS)[number];

export const ModbusAddressSchema = z.object({
  area: z.enum(MODBUS_AREAS),
  /** Endereço base 0 (o protocolo usa base 0; 40001 = holding 0). */
  address: z.number().int().min(0).max(65535),
  /** REAL ocupa dois registradores: ABCD = palavra alta primeiro. */
  wordOrder: z.enum(["ABCD", "CDAB"]).default("ABCD"),
  /** valor de engenharia = bruto × scale + offset (INT/REAL). */
  scale: z
    .number()
    .finite()
    .refine((v) => v !== 0, "escala não pode ser zero")
    .default(1),
  offset: z.number().finite().default(0),
  /** INT com sinal (complemento de dois) ou sem sinal. */
  signed: z.boolean().default(true),
});
export type ModbusAddress = z.infer<typeof ModbusAddressSchema>;

export const IoPointSchema = z.object({
  tag: RuntimeOperand,
  direction: z.enum(["input", "output"]),
  dataType: z.enum(["BOOL", "INT", "REAL"]),
  connectionId: z.string().trim().min(1).max(32),
  modbus: ModbusAddressSchema.optional(),
  /** Saída: só escreve no campo com isto ligado (negado por padrão). */
  writeEnabled: z.boolean().default(false),
  /** Saída: valor gravado ao parar/perder comunicação/estourar o ciclo. */
  safeValue: z.union([z.boolean(), z.number().finite()]).optional(),
  /** Saída analógica: limites aceitos (fora disso a escrita é recusada). */
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  comment: z.string().trim().max(120).optional(),
});
export type IoPoint = z.infer<typeof IoPointSchema>;

export const IoMapSchema = z
  .object({
    connections: z.array(FieldConnectionSchema).max(32).default([]),
    points: z.array(IoPointSchema).max(4096).default([]),
    /**
     * Tag de emergência lida do campo (contato NF, 1 = íntegra). Com ela em 0
     * ou sem dado, o Runtime põe todas as saídas no estado seguro.
     */
    estopTag: RuntimeOperand.optional(),
  })
  .superRefine((map, ctx) => {
    const connections = new Map(map.connections.map((c) => [c.id, c]));
    if (connections.size !== map.connections.length) {
      ctx.addIssue({ code: "custom", message: "id de conexão repetido", path: ["connections"] });
    }
    const tags = new Set<string>();
    const writeTargets = new Map<string, string>();
    map.points.forEach((p, i) => {
      const at = ["points", i];
      if (tags.has(p.tag)) {
        ctx.addIssue({ code: "custom", message: `tag ${p.tag} mapeada duas vezes`, path: at });
      }
      tags.add(p.tag);
      const conn = connections.get(p.connectionId);
      if (!conn) {
        ctx.addIssue({
          code: "custom",
          message: `conexão ${p.connectionId} inexistente`,
          path: at,
        });
        return;
      }
      if (conn.kind === "modbus_tcp") {
        const m = p.modbus;
        if (!m) {
          ctx.addIssue({ code: "custom", message: `${p.tag}: endereço Modbus ausente`, path: at });
          return;
        }
        const bitArea = m.area === "coil" || m.area === "discrete_input";
        if ((p.dataType === "BOOL") !== bitArea) {
          ctx.addIssue({
            code: "custom",
            message: `${p.tag}: ${p.dataType} não combina com a área ${m.area}`,
            path: at,
          });
        }
        if (p.direction === "output" && m.area !== "coil" && m.area !== "holding_register") {
          ctx.addIssue({
            code: "custom",
            message: `${p.tag}: saída só pode ser bobina (coil) ou holding register`,
            path: at,
          });
        }
        if (p.dataType === "REAL" && m.address > 65534) {
          ctx.addIssue({
            code: "custom",
            message: `${p.tag}: REAL precisa de 2 registradores`,
            path: at,
          });
        }
        if (p.direction === "output") {
          const words = p.dataType === "REAL" ? [m.address, m.address + 1] : [m.address];
          for (const w of words) {
            const key = `${conn.id}|${m.area}|${w}`;
            const other = writeTargets.get(key);
            if (other) {
              ctx.addIssue({
                code: "custom",
                message: `${p.tag} e ${other} escrevem no mesmo endereço`,
                path: at,
              });
            }
            writeTargets.set(key, p.tag);
          }
        }
      }
      if (p.direction === "output" && p.writeEnabled && p.safeValue === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `${p.tag}: saída com escrita precisa do valor seguro`,
          path: at,
        });
      }
      if (
        p.safeValue !== undefined &&
        (typeof p.safeValue === "boolean") !== (p.dataType === "BOOL")
      ) {
        ctx.addIssue({
          code: "custom",
          message: `${p.tag}: valor seguro com tipo errado`,
          path: at,
        });
      }
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) {
        ctx.addIssue({ code: "custom", message: `${p.tag}: mínimo maior que máximo`, path: at });
      }
      if (
        typeof p.safeValue === "number" &&
        ((p.min !== undefined && p.safeValue < p.min) ||
          (p.max !== undefined && p.safeValue > p.max))
      ) {
        ctx.addIssue({
          code: "custom",
          message: `${p.tag}: valor seguro fora dos limites`,
          path: at,
        });
      }
    });
    if (map.estopTag) {
      const e = map.points.find((p) => p.tag === map.estopTag);
      if (!e || e.direction !== "input" || e.dataType !== "BOOL") {
        ctx.addIssue({
          code: "custom",
          message: "a emergência precisa ser uma entrada BOOL mapeada",
          path: ["estopTag"],
        });
      }
    }
  });
export type IoMap = z.infer<typeof IoMapSchema>;

export const EMPTY_IO_MAP: IoMap = { connections: [], points: [] };

/** Valida sem lançar; inválido vira mapa vazio + erros (nunca escrita por engano). */
export function parseIoMap(raw: unknown): { map: IoMap; errors: string[] } {
  const r = IoMapSchema.safeParse(raw ?? EMPTY_IO_MAP);
  if (r.success) return { map: r.data, errors: [] };
  return {
    map: EMPTY_IO_MAP,
    errors: r.error.issues.map((i) => i.message),
  };
}

export function writableOutputs(map: IoMap): IoPoint[] {
  return map.points.filter((p) => p.direction === "output" && p.writeEnabled);
}
