// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  changedTags,
  desiredFor,
  looksLikeDeviceToken,
  RuntimeReportSchema,
} from "@/lib/runtime/runtime-cloud";
import { buildRuntimePackage } from "@/lib/runtime/program-package";
import { RuntimeDaemon } from "@/lib/runtime/node/runtime-daemon";
import { CloudLink, validateCloudUrl } from "@/lib/runtime/node/cloud-link";

const row = (id: string, sha: string, approved: boolean, revoked = false) => ({
  id,
  sha256: sha,
  approved_at: approved ? "2026-11-20T00:00:00Z" : null,
  revoked_at: revoked ? "2026-11-20T01:00:00Z" : null,
});
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

describe("regras da nuvem", () => {
  it("entrega só o alvo aprovado; pacote revogado em execução volta como não aprovado", () => {
    expect(desiredFor(row("1", H1, true), null)).toEqual({
      packageId: "1",
      hash: H1,
      approved: true,
    });
    expect(desiredFor(row("1", H1, false), null)).toBeNull();
    expect(desiredFor(null, row("2", H2, true, true))).toEqual({
      packageId: "2",
      hash: H2,
      approved: false,
    });
    expect(desiredFor(null, row("2", H2, true))).toBeNull();
  });

  it("telemetria por exceção converte BOOL em 0/1", () => {
    expect(changedTags({ K1: true, PT: 2 }, { K1: true, PT: 3, S0: false })).toEqual([
      { tag: "PT", value: 3 },
      { tag: "S0", value: 0 },
    ]);
  });

  it("formato do token e do relatório", () => {
    expect(looksLikeDeviceToken(`ert_${"x".repeat(43)}`)).toBe(true);
    expect(looksLikeDeviceToken("ert_curto")).toBe(false);
    expect(
      RuntimeReportSchema.safeParse({ mode: "ARMED", packageHash: null, scans: 1, lastScanMs: 1 })
        .success,
    ).toBe(false);
  });

  it("URL da nuvem só HTTPS (ou localhost)", () => {
    expect(validateCloudUrl("https://app.exemplo.com/x")).toBe("https://app.exemplo.com");
    expect(() => validateCloudUrl("http://app.exemplo.com")).toThrow(/https/);
    expect(validateCloudUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("ligação gateway ↔ nuvem", () => {
  it("baixa o pacote aprovado, confere o hash, obedece parada e recusa hash adulterado", async () => {
    const built = await buildRuntimePackage({
      projectId: "00000000-0000-4000-8000-0000000000dd",
      projectName: "Nuvem",
      scanMs: 50,
      rungs: [
        {
          id: "r",
          label: "x",
          cols: 2,
          cells: [
            [
              { kind: "XIC", operand: "A" },
              { kind: "OTE", operand: "B" },
            ],
          ],
        },
      ],
      studio: null,
      hmi: null,
      ioMap: { connections: [], points: [] },
    });
    if (!built.ok) throw new Error(built.errors.join());
    const id = "11111111-1111-4111-8111-111111111111";
    const calls: string[] = [];
    let served: unknown = built.pkg;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ert_teste");
      const body = url.includes("/report")
        ? { desired: { packageId: id, hash: built.hash, approved: true }, stop: false }
        : { package: served, hash: built.hash, approved: true };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const daemon = new RuntimeDaemon();
    const link = new CloudLink(daemon, {
      cloudUrl: "https://nuvem.exemplo",
      token: "ert_teste",
      stateDir: `${process.cwd()}/node_modules/.cache/runtime-test-${Date.now()}`,
      fetchImpl: fakeFetch,
    });
    await link.sync();
    expect(link.lastError).toBeNull();
    expect(daemon.status().packageHash).toBe(built.hash);
    expect(daemon.status().approved).toBe(true);
    expect(calls).toEqual(["POST /api/public/runtime/report", "GET /api/public/runtime/package"]);

    // pacote adulterado no caminho: recusado
    const daemon2 = new RuntimeDaemon();
    served = { ...built.pkg, scanMs: 999 };
    const link2 = new CloudLink(daemon2, {
      cloudUrl: "https://nuvem.exemplo",
      token: "ert_teste",
      stateDir: `${process.cwd()}/node_modules/.cache/runtime-test2-${Date.now()}`,
      fetchImpl: fakeFetch,
    });
    await link2.sync();
    expect(link2.lastError).toMatch(/hash/);
    expect(daemon2.status().packageHash).toBeNull();
    daemon.stop();
    daemon2.stop();
  });
});
