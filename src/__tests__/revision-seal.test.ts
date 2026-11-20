// Selo de revisão aprovada: SHA-256 em JSON canônico, memorial e adulteração.
import { describe, expect, it } from "vitest";
import {
  blockingUnifilarErrors,
  buildUnifilarMemorial,
  canonicalJson,
  computeRevisionHash,
  sealableContent,
  verifyRevision,
  type RevisionSeal,
} from "@/lib/dossier/revision-seal";
import type { DiagramDoc } from "@/lib/diagram/schema";

const doc: DiagramDoc = {
  version: 1,
  id: "d",
  metadata: { title: "t", norms: ["NBR 5410"] },
  sheets: ["unifilar"],
  nodes: {
    tr: {
      id: "tr",
      sheet: "unifilar",
      position: { x: 0, y: 0 },
      rotation: 0,
      label: "T1",
      params: {
        kind: "transformer",
        kVA: 150,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
        tag: "T1",
      },
    },
    q1: {
      id: "q1",
      sheet: "unifilar",
      position: { x: 0, y: 100 },
      rotation: 0,
      label: "Q1",
      params: { kind: "breaker", in_A: 40, curve: "C", poles: 3, tag: "Q1" },
    },
  },
  edges: {
    e1: {
      id: "e1",
      sheet: "unifilar",
      source: "tr",
      target: "q1",
      kind: "power",
      cable: { section_mm2: 95, length_m: 5, insulation: "PVC" },
    },
  },
};

/** Simula a ida e volta pelo JSONB do Postgres: chaves reordenadas. */
function jsonbRoundTrip<T>(v: T): T {
  const reorder = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(reorder)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x as object)
              .sort((a, b) => b.length - a.length || b.localeCompare(a))
              .map((k) => [k, reorder((x as Record<string, unknown>)[k])]),
          )
        : x;
  return reorder(JSON.parse(JSON.stringify(v))) as T;
}

describe("selo da revisão", () => {
  it("JSON canônico independe da ordem das chaves", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("revisão gravada confere após a ida e volta pelo banco e acusa adulteração", async () => {
    const snapshot = { schemaVersion: 3, diagram: doc } as Record<string, unknown>;
    const memorial = buildUnifilarMemorial(doc);
    const hash = await computeRevisionHash(snapshot, memorial);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const seal: RevisionSeal = {
      algorithm: "SHA-256",
      hash,
      revision: 1,
      approvedAt: "2026-11-20T00:00:00.000Z",
      approvedBy: "u",
      engineerName: "Responsável",
      professionalRegistration: "REG",
    };
    const stored = jsonbRoundTrip({
      ...sealableContent(snapshot),
      calculationMemorial: memorial,
      engineeringDossierApproval: { isApproved: true },
      revisionSeal: seal,
    });
    expect(await verifyRevision(stored, hash)).toEqual({ status: "intact", hash });

    // Alguém troca o disjuntor de 40 A por 63 A direto no banco.
    const tampered = JSON.parse(JSON.stringify(stored));
    tampered.diagram.nodes.q1.params.in_A = 63;
    expect((await verifyRevision(tampered, hash)).status).toBe("tampered");

    // Alterar só o memorial também é detectado.
    const memTampered = JSON.parse(JSON.stringify(stored));
    memTampered.calculationMemorial.premises = [];
    expect((await verifyRevision(memTampered, hash)).status).toBe("tampered");
  });

  it("sem selo e sem auditoria = não selada", async () => {
    expect((await verifyRevision({ schemaVersion: 3 }, undefined)).status).toBe("unsealed");
  });

  it("memorial traz curto por ponto e premissas; erros do unifilar bloqueiam", () => {
    const m = buildUnifilarMemorial(doc)!;
    expect(m.points.find((p) => p.id === "q1")?.Ik3max_kA).toBeGreaterThan(0);
    expect(m.premises.length).toBeGreaterThan(0);
    expect(buildUnifilarMemorial(undefined)).toBeNull();
    const bad: DiagramDoc = JSON.parse(JSON.stringify(doc));
    bad.nodes.q2 = { ...bad.nodes.q1, id: "q2", params: { ...bad.nodes.q1.params, tag: "Q1" } };
    expect(Array.isArray(blockingUnifilarErrors(bad))).toBe(true);
  });
});

describe("valores padrão da biblioteca", () => {
  it("parâmetro não confirmado vira aviso e bloqueia a emissão", () => {
    const d: DiagramDoc = JSON.parse(JSON.stringify(doc));
    d.nodes.m1 = {
      id: "m1",
      sheet: "unifilar",
      position: { x: 0, y: 300 },
      rotation: 0,
      label: "M1",
      params: {
        kind: "motor",
        power_kW: 7.5,
        voltage_V: 380,
        startMethod: "DOL",
        tag: "M1",
        unconfirmed: ["power_kW", "voltage_V"],
      },
    };
    d.edges.e2 = { id: "e2", sheet: "unifilar", source: "q1", target: "m1", kind: "power" };
    expect(blockingUnifilarErrors(d).some((m) => m.includes("valores padrão da biblioteca"))).toBe(
      true,
    );
    // Confirmado (sem a lista): deixa de bloquear por esse motivo.
    delete (d.nodes.m1.params as { unconfirmed?: string[] }).unconfirmed;
    expect(blockingUnifilarErrors(d).some((m) => m.includes("valores padrão"))).toBe(false);
  });
});
