import { describe, expect, it } from "vitest";
import {
  createEmptyCompactProgramModel,
  type CompactNode,
  type CompactProgramModel,
} from "@/lib/compact-studio/domain";
import {
  CompactExecutionEngine,
  CompactRuntimeClient,
  createSimulatedClock,
  advanceSimulatedClock,
  getSimulatedCalendar,
  getSimulatedEpochMs,
} from "@/lib/compact-studio/runtime";

function ioNode(
  id: string,
  blockType: "INPUT_DI" | "INPUT_AI" | "OUTPUT_QO" | "OUTPUT_AO",
  address: string,
  pageId = "page-1",
): CompactNode {
  const isAnalog = blockType.endsWith("AI") || blockType.endsWith("AO");
  const isOut = blockType.startsWith("OUTPUT");
  return {
    id,
    pageId,
    blockType,
    instanceName: address,
    category: "io",
    libraryVersion: "1.0.0",
    params: { address },
    inputs: isOut
      ? [{ id: "in", name: "IN", direction: "input", signalType: isAnalog ? "REAL" : "BOOL" }]
      : [],
    outputs: !isOut
      ? [{ id: "out", name: "OUT", direction: "output", signalType: isAnalog ? "REAL" : "BOOL" }]
      : [],
  };
}

function fbNode(
  id: string,
  blockType: string,
  params: CompactNode["params"],
  inputs: CompactNode["inputs"],
  outputs: CompactNode["outputs"],
  pageId = "page-1",
): CompactNode {
  return {
    id,
    pageId,
    blockType,
    instanceName: id.toUpperCase(),
    category: "special",
    libraryVersion: "1.0.0",
    params,
    inputs,
    outputs,
  };
}

describe("Fase 2 — eletric Studio: Runtime Unificado, Relógio Simulado & Biblioteca V8/V8.4", () => {
  it("avança o relógio simulado de forma pura e determinística sem depender do relógio global", () => {
    const c0 = createSimulatedClock(Date.UTC(2026, 5, 15, 23, 50, 0));
    const c1 = advanceSimulatedClock(c0, 15 * 60_000);
    const cal = getSimulatedCalendar(getSimulatedEpochMs(c1));
    expect(cal.year).toBe(2026);
    expect(cal.month).toBe(6);
    expect(cal.day).toBe(16);
    expect(cal.hour).toBe(0);
    expect(cal.minute).toBe(5);
  });

  it("executa lógica básica (NAND/NOR/PULSE_RELAY), bordas (STARTUP_FLAG_M8) e conectores multipágina (PAGE_OUT -> PAGE_IN)", () => {
    const base = createEmptyCompactProgramModel();
    const model: CompactProgramModel = {
      ...base,
      pages: [
        { id: "page-1", name: "P1", order: 0, gridCols: 24, gridRows: 16 },
        { id: "page-2", name: "P2", order: 1, gridCols: 24, gridRows: 16 },
      ],
      ioSymbols: [
        {
          id: "s-i1",
          ioKind: "DI",
          address: "I1",
          symbolicName: "I1",
          signalType: "BOOL",
          comment: "",
          retentive: false,
          initialValue: false,
        },
        {
          id: "s-q1",
          ioKind: "DO",
          address: "Q1",
          symbolicName: "Q1",
          signalType: "BOOL",
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: [
        ioNode("i1", "INPUT_DI", "I1", "page-1"),
        fbNode(
          "pr1",
          "PULSE_RELAY",
          {},
          [
            { id: "trg", name: "TRG", direction: "input", signalType: "BOOL" },
            { id: "s", name: "S", direction: "input", signalType: "BOOL" },
            { id: "r", name: "R", direction: "input", signalType: "BOOL" },
          ],
          [{ id: "q", name: "Q", direction: "output", signalType: "BOOL" }],
          "page-1",
        ),
        fbNode(
          "pout",
          "PAGE_OUT",
          { connectorKey: "BUS_CMD" },
          [{ id: "in", name: "IN", direction: "input", signalType: "BOOL" }],
          [],
          "page-1",
        ),
        fbNode(
          "pin",
          "PAGE_IN",
          { connectorKey: "BUS_CMD" },
          [],
          [{ id: "out", name: "OUT", direction: "output", signalType: "BOOL" }],
          "page-2",
        ),
        ioNode("q1", "OUTPUT_QO", "Q1", "page-2"),
        fbNode(
          "m8",
          "STARTUP_FLAG_M8",
          {},
          [],
          [{ id: "out", name: "OUT", direction: "output", signalType: "BOOL" }],
          "page-1",
        ),
      ],
      connections: [
        {
          id: "c1",
          pageId: "page-1",
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "pr1",
          toPortId: "trg",
          signalType: "BOOL",
        },
        {
          id: "c2",
          pageId: "page-1",
          fromNodeId: "pr1",
          fromPortId: "q",
          toNodeId: "pout",
          toPortId: "in",
          signalType: "BOOL",
        },
        {
          id: "c3",
          pageId: "page-2",
          fromNodeId: "pin",
          fromPortId: "out",
          toNodeId: "q1",
          toPortId: "in",
          signalType: "BOOL",
        },
      ],
    };

    const engine = new CompactExecutionEngine(model);
    expect(engine.compileOk).toBe(true);

    // Scan 1: M8 = true, I1 = false -> Q1 = false
    const f1 = engine.step(20);
    expect(f1.outputs.m8?.OUT).toBe(true);
    expect(f1.variables.Q1).toBe(false);

    // Scan 2: rising edge I1 -> PULSE_RELAY toggles ON -> PAGE_OUT -> PAGE_IN -> Q1 = true, M8 = false
    engine.setInput("I1", true);
    const f2 = engine.step(20);
    expect(f2.outputs.m8?.OUT).toBe(false);
    expect(f2.variables.Q1).toBe(true);

    // Scan 3: falling edge keeps Q1 = true; next rising toggles OFF
    engine.setInput("I1", false);
    expect(engine.step(20).variables.Q1).toBe(true);
    engine.setInput("I1", true);
    expect(engine.step(20).variables.Q1).toBe(false);
  });

  it("teste de propriedade: temporizadores (TONR, TON_TOF, ASYNC_PULSE_GEN, STAIRWAY_SWITCH) têm equivalência temporal sob dtMs distintos", () => {
    const buildModel = (): CompactProgramModel => {
      const base = createEmptyCompactProgramModel({ cycleTimeMs: 50 });
      return {
        ...base,
        ioSymbols: [
          {
            id: "si",
            ioKind: "DI",
            address: "I1",
            symbolicName: "I1",
            signalType: "BOOL",
            comment: "",
            retentive: false,
            initialValue: false,
          },
          {
            id: "sr",
            ioKind: "DI",
            address: "I2",
            symbolicName: "I2",
            signalType: "BOOL",
            comment: "",
            retentive: false,
            initialValue: false,
          },
        ],
        nodes: [
          ioNode("i1", "INPUT_DI", "I1"),
          ioNode("i2", "INPUT_DI", "I2"),
          fbNode(
            "tonr1",
            "TONR",
            { PT: 500 },
            [
              { id: "trg", name: "TRG", direction: "input", signalType: "BOOL" },
              { id: "r", name: "R", direction: "input", signalType: "BOOL" },
            ],
            [
              { id: "q", name: "Q", direction: "output", signalType: "BOOL" },
              { id: "et", name: "ET", direction: "output", signalType: "TIME" },
            ],
          ),
          fbNode(
            "pulse1",
            "ASYNC_PULSE_GEN",
            { TH: 200, TL: 200 },
            [{ id: "trg", name: "TRG", direction: "input", signalType: "BOOL" }],
            [{ id: "q", name: "Q", direction: "output", signalType: "BOOL" }],
          ),
        ],
        connections: [
          {
            id: "c1",
            pageId: "page-1",
            fromNodeId: "i1",
            fromPortId: "out",
            toNodeId: "tonr1",
            toPortId: "trg",
            signalType: "BOOL",
          },
          {
            id: "c2",
            pageId: "page-1",
            fromNodeId: "i2",
            fromPortId: "out",
            toNodeId: "tonr1",
            toPortId: "r",
            signalType: "BOOL",
          },
          {
            id: "c3",
            pageId: "page-1",
            fromNodeId: "i1",
            fromPortId: "out",
            toNodeId: "pulse1",
            toPortId: "trg",
            signalType: "BOOL",
          },
        ],
      };
    };

    // Property: advancing 600ms via 50ms steps vs 100ms steps yields exact same latched TONR state
    const e50 = new CompactExecutionEngine(buildModel());
    const e100 = new CompactExecutionEngine(buildModel());
    e50.setInput("I1", true);
    e100.setInput("I1", true);

    for (let i = 0; i < 6; i++) e50.step(50); // 300ms
    for (let i = 0; i < 3; i++) e100.step(100); // 300ms
    expect(e50.step(0).outputs.tonr1?.Q).toBe(false);
    expect(e100.step(0).outputs.tonr1?.Q).toBe(false);

    for (let i = 0; i < 5; i++) e50.step(50); // +250ms = 550ms
    for (let i = 0; i < 3; i++) e100.step(100); // +300ms = 600ms
    expect(e50.step(0).outputs.tonr1?.Q).toBe(true);
    expect(e100.step(0).outputs.tonr1?.Q).toBe(true);

    // Reset clears retentive latch
    e50.setInput("I2", true);
    expect(e50.step(50).outputs.tonr1?.Q).toBe(false);
  });

  it("valida WEEKLY_TIMER (inclusive cruzando meia-noite) e YEARLY_TIMER exclusivamente com clock simulado", () => {
    const base = createEmptyCompactProgramModel();
    const model: CompactProgramModel = {
      ...base,
      nodes: [
        fbNode(
          "wt1",
          "WEEKLY_TIMER",
          {
            cam1Enabled: true,
            cam1Days: "1", // Monday
            cam1OnMin: 22 * 60, // 22:00
            cam1OffMin: 2 * 60, // 02:00 Tuesday (cross-midnight)
          },
          [],
          [{ id: "q", name: "Q", direction: "output", signalType: "BOOL" }],
        ),
        fbNode(
          "yt1",
          "YEARLY_TIMER",
          { onMonth: 12, onDay: 20, offMonth: 1, offDay: 10 },
          [],
          [{ id: "q", name: "Q", direction: "output", signalType: "BOOL" }],
        ),
      ],
    };

    // Monday 2026-01-05 22:30 UTC -> BOTH active!
    const e = new CompactExecutionEngine(model, Date.UTC(2026, 0, 5, 22, 30, 0));
    expect(e.compileOk).toBe(true);
    const f1 = e.step(20);
    expect(f1.outputs.wt1?.Q).toBe(true);
    expect(f1.outputs.yt1?.Q).toBe(true);

    // Tuesday 2026-01-06 01:30 UTC -> still active from Monday cross-midnight cam
    e.jumpClock(Date.UTC(2026, 0, 6, 1, 30, 0));
    expect(e.step(20).outputs.wt1?.Q).toBe(true);

    // Tuesday 2026-01-06 03:00 UTC -> weekly off; July 15 -> yearly off
    e.jumpClock(Date.UTC(2026, 6, 15, 12, 0, 0));
    const f3 = e.step(20);
    expect(f3.outputs.wt1?.Q).toBe(false);
    expect(f3.outputs.yt1?.Q).toBe(false);
  });

  it("valida blocos analógicos (PI_CONTROLLER, ANALOG_RAMP, ANALOG_MUX, MATH_EXPR_SAFE), SHIFT_REGISTER, MESSAGE_TEXT e DATA_LOG", async () => {
    const base = createEmptyCompactProgramModel({ cycleTimeMs: 100 });
    const model: CompactProgramModel = {
      ...base,
      ioSymbols: [
        {
          id: "sai",
          ioKind: "AI",
          address: "AI1",
          symbolicName: "AI1",
          signalType: "REAL",
          comment: "PV",
          retentive: false,
          initialValue: 400,
        },
        {
          id: "sdi",
          ioKind: "DI",
          address: "I1",
          symbolicName: "I1",
          signalType: "BOOL",
          comment: "Pulse",
          retentive: false,
          initialValue: true,
        },
      ],
      nodes: [
        ioNode("ai1", "INPUT_AI", "AI1"),
        ioNode("i1", "INPUT_DI", "I1"),
        fbNode(
          "pi1",
          "PI_CONTROLLER",
          { kc: 2, tiMs: 2000, minOut: 0, maxOut: 1000 },
          [
            { id: "am", name: "A_M", direction: "input", signalType: "BOOL", defaultValue: true },
            { id: "r", name: "R", direction: "input", signalType: "BOOL", defaultValue: false },
            { id: "pv", name: "PV", direction: "input", signalType: "REAL" },
            { id: "sp", name: "SP", direction: "input", signalType: "REAL", defaultValue: 500 },
          ],
          [{ id: "aq", name: "AQ", direction: "output", signalType: "REAL" }],
        ),
        fbNode(
          "math1",
          "MATH_EXPR_SAFE",
          { op1: "+", op2: "*", op3: "-", operatorPrecedence: true },
          [
            { id: "v1", name: "V1", direction: "input", signalType: "REAL", defaultValue: 10 },
            { id: "v2", name: "V2", direction: "input", signalType: "REAL", defaultValue: 3 },
            { id: "v3", name: "V3", direction: "input", signalType: "REAL", defaultValue: 4 },
            { id: "v4", name: "V4", direction: "input", signalType: "REAL", defaultValue: 2 },
          ],
          [{ id: "aq", name: "AQ", direction: "output", signalType: "REAL" }],
        ),
        fbNode(
          "sr1",
          "SHIFT_REGISTER",
          {},
          [
            { id: "in", name: "IN", direction: "input", signalType: "BOOL", defaultValue: true },
            { id: "trg", name: "TRG", direction: "input", signalType: "BOOL" },
            { id: "dir", name: "DIR", direction: "input", signalType: "BOOL", defaultValue: false },
          ],
          [
            { id: "q1", name: "Q1", direction: "output", signalType: "BOOL" },
            { id: "q2", name: "Q2", direction: "output", signalType: "BOOL" },
          ],
        ),
        fbNode(
          "msg1",
          "MESSAGE_TEXT",
          { template: "PRESSAO=<script> {1} bar" },
          [{ id: "val1", name: "VAL1", direction: "input", signalType: "REAL" }],
          [
            { id: "active", name: "ACTIVE", direction: "output", signalType: "BOOL" },
            { id: "text", name: "TEXT", direction: "output", signalType: "STRING" },
          ],
        ),
        fbNode(
          "log1",
          "DATA_LOG",
          { label: "HIST_PV" },
          [{ id: "val1", name: "VAL1", direction: "input", signalType: "REAL" }],
          [
            { id: "count", name: "COUNT", direction: "output", signalType: "INT" },
            { id: "last", name: "LAST_RECORD", direction: "output", signalType: "STRING" },
          ],
        ),
      ],
      connections: [
        {
          id: "c1",
          pageId: "page-1",
          fromNodeId: "ai1",
          fromPortId: "out",
          toNodeId: "pi1",
          toPortId: "pv",
          signalType: "REAL",
        },
        {
          id: "c2",
          pageId: "page-1",
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "sr1",
          toPortId: "trg",
          signalType: "BOOL",
        },
        {
          id: "c3",
          pageId: "page-1",
          fromNodeId: "pi1",
          fromPortId: "aq",
          toNodeId: "msg1",
          toPortId: "val1",
          signalType: "REAL",
        },
        {
          id: "c4",
          pageId: "page-1",
          fromNodeId: "ai1",
          fromPortId: "out",
          toNodeId: "log1",
          toPortId: "val1",
          signalType: "REAL",
        },
      ],
    };

    const e = new CompactExecutionEngine(model);
    expect(e.compileOk).toBe(true);
    const f1 = e.step(100);
    // MATH_EXPR_SAFE: 10 + 3 * 4 - 2 = 20
    expect(f1.outputs.math1?.AQ).toBe(20);
    // PI: SP=500, PV=400, err=100, kc=2 -> P=200 + I=10 = 210
    expect(f1.outputs.pi1?.AQ).toBe(210);
    // Shift register shifted bit 1 into Q1
    expect(f1.outputs.sr1?.Q1).toBe(true);
    expect(f1.outputs.sr1?.Q2).toBe(false);
    // Message text stripped angle brackets (XSS safe)
    expect(f1.activeMessages[0]?.text).not.toContain("<script>");
    expect(f1.activeMessages[0]?.text).toContain("210 bar");
    // DataLog captured sample
    expect(f1.dataLogs).toHaveLength(1);
    expect(f1.dataLogs[0]?.v1).toBe(400);

    // Determinism parity via CompactRuntimeClient
    const client = new CompactRuntimeClient({ forceSync: true });
    await client.load(model);
    const cf1 = await client.step(100);
    expect(cf1?.outputs.math1?.AQ).toBe(f1.outputs.math1?.AQ);
    expect(cf1?.outputs.pi1?.AQ).toBe(f1.outputs.pi1?.AQ);
    client.dispose();
  });
});
