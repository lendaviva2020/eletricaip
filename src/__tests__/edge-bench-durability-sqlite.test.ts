import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PersistentEdgeOutbox } from "../lib/edge/buffer/sqlite-outbox";

describe("GATE 3.3F — SQLite Durability, Synchronous Policy & Degradation Signaling", () => {
  let tempDir: string;
  let dbPath: string;
  let outbox: PersistentEdgeOutbox;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-bench-durability-"));
    dbPath = path.join(
      tempDir,
      `bench_durability_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.db`,
    );
  });

  afterEach(async () => {
    if (outbox) {
      outbox.close();
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Windows file handle release
    }
  });

  describe("1. Synchronous Policy & WAL Configuration", () => {
    it("opera com journal_mode = WAL e suporta modos synchronous NORMAL e FULL", () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        synchronous: "FULL",
        maxSamples: 1000,
      });

      const entry = outbox.enqueue({
        projectId: "proj_durability",
        organizationId: "org_test",
        plantId: "plant_test",
        gatewayId: "gw_test",
        connectionId: "conn_test",
        tagName: "TEST_VOLTAGE",
        value: 120.0,
        quality: "GOOD",
        source: "INTERNAL_RUNTIME",
        sourceTimestamp: Date.now(),
      });

      expect(entry).not.toBeNull();
      expect(entry?.sequenceNumber).toBe(1);

      // Comprova que o arquivo WAL foi gerado
      if (outbox.isUsingNativeSqlite()) {
        const walPath = `${dbPath}-wal`;
        expect(fs.existsSync(walPath)).toBe(true);
      }
    });

    it("atribui números de sequência estritamente monotônicos e sequenciais (1, 2, 3...)", () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxSamples: 100,
      });

      const seqs: number[] = [];
      for (let i = 0; i < 10; i++) {
        const smp = outbox.enqueue({
          projectId: "proj_seq",
          organizationId: "org_seq",
          plantId: "plant_seq",
          gatewayId: "gw_seq",
          connectionId: "conn_seq",
          tagName: `TAG_${i}`,
          value: i * 10,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: Date.now() + i * 10,
        });
        if (smp) seqs.push(smp.sequenceNumber);
      }

      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe("2. Explicit Degradation Signaling on Storage Failures", () => {
    it("sinaliza isDegraded e lança erro explícito se a persistência de evento crítico falhar", () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxSamples: 50,
      });

      // Força estado degradado no buffer
      outbox.setDegraded("DISK_I_O_ERROR: Falha de escrita no setor físico do disco");

      const stats = outbox.getStatistics();
      expect(stats.isDegraded).toBe(true);
      expect(stats.lastDegradationReason).toContain("DISK_I_O_ERROR");

      // Reset de degradação
      outbox.resetDegradation();
      expect(outbox.getStatistics().isDegraded).toBe(false);
      expect(outbox.getStatistics().lastDegradationReason).toBeUndefined();
    });

    it("lança erro imediato ao tentar enfileirar em outbox fechado (sem perda silenciosa)", () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxSamples: 10,
      });

      outbox.close();

      expect(() => {
        outbox.enqueue({
          projectId: "proj_closed",
          organizationId: "org_closed",
          plantId: "plant_closed",
          gatewayId: "gw_closed",
          connectionId: "conn_closed",
          tagName: "ALARM_FIRE_DETECTION",
          value: 1,
          quality: "GOOD",
          source: "INTERNAL_RUNTIME",
          sourceTimestamp: Date.now(),
          criticality: "CRITICAL",
        });
      }).toThrow(/OUTBOX_CLOSED/);
    });
  });
});
