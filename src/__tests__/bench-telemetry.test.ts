import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BENCH_CONFIG, toEngineering } from "@/lib/hardware/bench-config";
import {
  BENCH_HEARTBEAT_MS,
  FATAL_INGEST_ERRORS,
  benchDeviceExternalId,
  mapBenchIngestError,
  selectReadingsToSend,
  snapshotToCloudReadings,
  type BenchSnapshot,
} from "@/lib/hardware/bench-telemetry";

const cfg = DEFAULT_BENCH_CONFIG;

function snap(over: Partial<BenchSnapshot> = {}): BenchSnapshot {
  return {
    readings: [
      toEngineering(cfg.analog[0], 0, 512 + 40, 0), // ACS712 5 A: corrente CC
      toEngineering(cfg.analog[1], 1, 512, 100), // ZMPT101B: tensão CA
    ],
    inputsMask: 0, // Q1/Q2 fechados (pull-up em 0)
    outputsMask: 1 << 4,
    estop: false,
    ...over,
  };
}

describe("telemetria da bancada → nuvem", () => {
  it("converte o estado real em grandezas com nome estável", () => {
    const r = snapshotToCloudReadings(cfg, snap());
    const byMetric = new Map(r.map((x) => [x.metric, x]));
    expect(byMetric.get("A0")?.unit).toBe("A");
    expect(byMetric.get("A1")?.unit).toBe("V");
    expect(byMetric.get("out.D4")?.value).toBe(1);
    expect(byMetric.get("out.D5")?.value).toBe(0);
    expect(byMetric.get("in.D8")?.value).toBe(1); // contato fechado = ativo
    expect(byMetric.get("estop")?.value).toBe(0);
  });

  it("não envia canal sem sensor e marca leitura saturada como incerta", () => {
    const s = snap({
      readings: [toEngineering(cfg.analog[0], 0, 1023, 0), toEngineering(undefined, 3, 200, 0)],
    });
    const r = snapshotToCloudReadings(cfg, s);
    expect(r.find((x) => x.metric === "A0")?.quality).toBe("UNCERTAIN");
    expect(r.some((x) => x.metric === "A3")).toBe(false);
  });

  it("banda morta: valor parado não é reenviado; mudança e batimento são", () => {
    const now = 1_000_000;
    const current = snapshotToCloudReadings(cfg, snap());
    const first = selectReadingsToSend(cfg, current, new Map(), now);
    expect(first.batch.length).toBe(current.length);

    const again = selectReadingsToSend(cfg, current, first.next, now + 2000);
    expect(again.batch).toEqual([]);

    // Relé D5 ligou: só ele vai.
    const changed = snapshotToCloudReadings(cfg, snap({ outputsMask: (1 << 4) | (1 << 5) }));
    const delta = selectReadingsToSend(cfg, changed, first.next, now + 4000);
    expect(delta.batch.map((b) => b.metric)).toEqual(["out.D5"]);

    // Variação analógica menor que 1 % do fundo de escala (5 A → 0,05 A): não vai.
    const tiny = snapshotToCloudReadings(
      cfg,
      snap({ readings: [toEngineering(cfg.analog[0], 0, 512 + 41, 0), snap().readings[1]] }),
    );
    expect(selectReadingsToSend(cfg, tiny, first.next, now + 4000).batch).toEqual([]);

    // Batimento: depois de 60 s tudo é reenviado mesmo parado.
    const beat = selectReadingsToSend(cfg, current, first.next, now + BENCH_HEARTBEAT_MS);
    expect(beat.batch.length).toBe(current.length);
  });

  it("identificador do dispositivo é estável e seguro", () => {
    expect(benchDeviceExternalId("1b2c3d4e-0000-4000-8000-000000000000", false)).toBe(
      "arduino-uno-1b2c3d4e0000",
    );
    expect(benchDeviceExternalId(null, false)).toBe("arduino-uno-exemplo");
    expect(benchDeviceExternalId("abc", true)).toBe("arduino-uno-exemplo");
    expect(benchDeviceExternalId("<script>", false)).toMatch(/^arduino-uno-[a-z0-9]+$/);
  });

  it("mapeia erros do banco sem vazar detalhes e para nos definitivos", () => {
    expect(mapBenchIngestError("ERROR: plan_required")).toBe("plan_required");
    expect(mapBenchIngestError("device_limit")).toBe("device_limit");
    expect(mapBenchIngestError("bad_metric")).toBe("bad_input");
    expect(
      mapBenchIngestError("Could not find the function public.ingest_bench_telemetry (PGRST202)"),
    ).toBe("not_enabled");
    expect(mapBenchIngestError("connection reset")).toBe("server_error");
    expect(FATAL_INGEST_ERRORS.has("device_limit")).toBe(true);
    expect(FATAL_INGEST_ERRORS.has("rate_limited")).toBe(false);
  });
});

describe("migration da telemetria", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20261116170000_bench_telemetry.sql"),
    "utf8",
  );
  it("só o servidor executa a ingestão e o banco confere empresa, papel, plano e limite", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.ingest_bench_telemetry[\s\S]*authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ingest_bench_telemetry[\s\S]*service_role/,
    );
    for (const code of ["no_tenant", "forbidden", "plan_required", "device_limit", "bad_metric"]) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_readings");
  });

  it("a ingestão por chave de API não usa mais o tipo inexistente nem compara texto com uuid", () => {
    const plans = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20261116150000_plans_v2_iot_limits_expiry.sql"),
      "utf8",
    );
    expect(plans).not.toContain("::iot_device_kind");
    expect(plans).toContain("device_id = v_device::text");
    expect(plans).toContain("ingested_at SET DEFAULT now()");
  });
});
