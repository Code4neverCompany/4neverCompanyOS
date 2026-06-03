// Tests for the @c4n/telemetry JSONL consumer and aggregator.
//
// Coverage:
//   ✓ `parseTokenCostLine` extracts the recognized `tokens=N,M cost=$X`
//     pattern from a JSONL envelope line.
//   ✓ `parseTokenCostLine` returns `null` for non-cost lines (regular
//     stdout / stderr) so the consumer can skip them.
//   ✓ `aggregateTokenCosts` reduces a list of events into per-persona
//     totals, sums tokens + cost correctly, and tracks a window.
//   ✓ `TelemetryConsumer` reads `<vault>/personas/<id>/log/<date>.jsonl`
//     files and produces a non-empty aggregate.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aggregateTokenCosts,
  parseTokenCostLine,
  TelemetryConsumer,
  type TokenCostEvent,
} from "./index";

let scratch: string;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "telemetry-test-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("parseTokenCostLine", () => {
  it("extracts tokens and cost from a JSONL envelope line", () => {
    const line = JSON.stringify({
      ts: 1_700_000_000_000,
      level: "info",
      line: "claude response complete tokens=123,456 cost=$0.0123",
    });
    const ev = parseTokenCostLine("dev", line);
    expect(ev).not.toBeNull();
    expect(ev?.input_tokens).toBe(123);
    expect(ev?.output_tokens).toBe(456);
    expect(ev?.cost_usd).toBeCloseTo(0.0123, 4);
    expect(ev?.backing_cli).toBe("claude");
    expect(ev?.persona_id).toBe("dev");
  });

  it("returns null for a non-cost line", () => {
    const line = JSON.stringify({
      ts: 1_700_000_000_001,
      level: "info",
      line: "hello world",
    });
    expect(parseTokenCostLine("dev", line)).toBeNull();
  });

  it("returns null for a malformed JSONL line (graceful fallback)", () => {
    // We don't want the consumer to crash on a single bad line —
    // it should just skip the line and let the rest of the file through.
    expect(parseTokenCostLine("dev", "this is not json")).toBeNull();
    // But if the raw text happens to carry the cost pattern, we should
    // still pick it up (covers pre-envelope log formats).
    const ev = parseTokenCostLine("hermes", "raw cost line tokens=10,20 cost=$0.50");
    expect(ev).not.toBeNull();
    expect(ev?.input_tokens).toBe(10);
    expect(ev?.output_tokens).toBe(20);
  });
});

describe("aggregateTokenCosts", () => {
  it("reduces events into per-persona totals with a window", () => {
    const events: TokenCostEvent[] = [
      {
        persona_id: "dev",
        backing_cli: "claude",
        ts_ms: 100,
        input_tokens: 100,
        output_tokens: 200,
        cost_usd: 0.01,
        raw_line: "",
      },
      {
        persona_id: "dev",
        backing_cli: "claude",
        ts_ms: 200,
        input_tokens: 50,
        output_tokens: 75,
        cost_usd: 0.005,
        raw_line: "",
      },
      {
        persona_id: "frontend-designer",
        backing_cli: "aggy",
        ts_ms: 150,
        input_tokens: 30,
        output_tokens: 40,
        cost_usd: 0.003,
        raw_line: "",
      },
    ];
    const agg = aggregateTokenCosts(events);
    expect(agg).toHaveLength(2);

    const dev = agg.find((a) => a.persona_id === "dev");
    expect(dev?.events).toBe(2);
    expect(dev?.input_tokens).toBe(150);
    expect(dev?.output_tokens).toBe(275);
    expect(dev?.cost_usd).toBeCloseTo(0.015, 4);
    expect(dev?.window_start_ms).toBe(100);
    expect(dev?.window_end_ms).toBe(200);

    const designer = agg.find((a) => a.persona_id === "frontend-designer");
    expect(designer?.events).toBe(1);
    expect(designer?.input_tokens).toBe(30);
  });

  it("returns an empty array for an empty event list", () => {
    expect(aggregateTokenCosts([])).toEqual([]);
  });
});

describe("TelemetryConsumer", () => {
  it("reads a synthesized log directory and produces an aggregate", () => {
    const vault = scratch;
    const devLog = join(vault, "personas", "dev", "log", "2026-05-29.jsonl");
    mkdirSync(join(vault, "personas", "dev", "log"), { recursive: true });
    writeFileSync(
      devLog,
      [
        JSON.stringify({
          ts: 1_700_000_000_000,
          level: "info",
          line: "ready",
        }),
        JSON.stringify({
          ts: 1_700_000_000_001,
          level: "info",
          line: "claude tokens=10,20 cost=$0.01",
        }),
        JSON.stringify({
          ts: 1_700_000_000_002,
          level: "info",
          line: "claude tokens=15,25 cost=$0.02",
        }),
      ].join("\n"),
    );

    const consumer = new TelemetryConsumer(vault);
    const agg = consumer.aggregateForPersonas(["dev"]);
    expect(agg).toHaveLength(1);
    const dev = agg[0];
    expect(dev.persona_id).toBe("dev");
    expect(dev.events).toBe(2);
    expect(dev.input_tokens).toBe(25);
    expect(dev.output_tokens).toBe(45);
    expect(dev.cost_usd).toBeCloseTo(0.03, 4);
  });

  it("skips personas with no log directory (never spawned)", () => {
    const consumer = new TelemetryConsumer(scratch);
    // No log dir for "hermes" — aggregate should be empty, not throw.
    expect(consumer.aggregateForPersonas(["hermes"])).toEqual([]);
  });
});
