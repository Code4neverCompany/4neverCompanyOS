// @c4n/telemetry aggregator tests.

import { describe, it, expect } from "vitest";
import { aggregate, aggregateByPersona, TOKEN_ESTIMATE_CHARS_PER_TOKEN } from "./aggregator.js";
import type { LogEntry } from "./parser.js";

function entry(ts: number, line: string, personaId = "hermes"): LogEntry {
  return { ts, level: "info", line, personaId };
}

describe("aggregate", () => {
  it("returns zeros for an empty list", () => {
    const agg = aggregate([], "x");
    expect(agg.totalLines).toBe(0);
    expect(agg.linesPerMinute).toBe(0);
    expect(agg.tokenCostEstimate).toBe(0);
    expect(agg.firstTs).toBe(0);
    expect(agg.lastTs).toBe(0);
    expect(agg.promptPatterns).toEqual([]);
  });

  it("counts lines and stamps first/last timestamps", () => {
    const entries = [entry(100, "wrote file foo"), entry(200, "wrote file bar"), entry(300, "ran tests")];
    const agg = aggregate(entries, "hermes");
    expect(agg.totalLines).toBe(3);
    expect(agg.firstTs).toBe(100);
    expect(agg.lastTs).toBe(300);
  });

  it("computes linesPerMinute across a multi-minute span", () => {
    const entries = [
      entry(0, "a"),
      entry(30_000, "b"), // 30s
      entry(60_000, "c"), // 60s
      entry(90_000, "d"), // 90s
    ];
    const agg = aggregate(entries, "hermes");
    // 4 lines over 90s = (4 * 60_000) / 90_000 = 2.66…
    expect(agg.linesPerMinute).toBeCloseTo(2.667, 2);
  });

  it("returns 0 linesPerMinute for a sub-minute span (no extrapolation)", () => {
    const entries = [entry(0, "a"), entry(5_000, "b")];
    const agg = aggregate(entries, "hermes");
    expect(agg.linesPerMinute).toBe(0);
  });

  it("extracts the top <verb> <noun> patterns by frequency", () => {
    const entries = [
      entry(0, "wrote file a"),
      entry(1, "wrote file b"),
      entry(2, "wrote file c"),
      entry(3, "ran tests"),
      entry(4, "ran tests"),
      entry(5, "read vault"),
    ];
    const agg = aggregate(entries, "hermes");
    expect(agg.promptPatterns[0]).toEqual({ pattern: "wrote file", count: 3 });
    expect(agg.promptPatterns[1]).toEqual({ pattern: "ran tests", count: 2 });
    expect(agg.promptPatterns[2]).toEqual({ pattern: "read vault", count: 1 });
  });

  it("estimates token cost as ceil(chars / 4) and documents the heuristic", () => {
    // 100 chars → 25 tokens. Math.ceil means 101 chars → 26 tokens.
    const entries = [entry(0, "x".repeat(100)), entry(1, "y".repeat(1))];
    const agg = aggregate(entries, "hermes");
    expect(agg.tokenCostEstimate).toBe(Math.ceil(101 / TOKEN_ESTIMATE_CHARS_PER_TOKEN));
  });
});

describe("aggregateByPersona", () => {
  it("groups entries by personaId and aggregates each group", () => {
    const entries = [
      entry(0, "wrote file a", "hermes"),
      entry(1, "wrote file b", "hermes"),
      entry(2, "ran tests", "dev"),
    ];
    const aggs = aggregateByPersona(entries);
    expect(aggs).toHaveLength(2);
    const hermes = aggs.find((a) => a.personaId === "hermes");
    const dev = aggs.find((a) => a.personaId === "dev");
    expect(hermes?.totalLines).toBe(2);
    expect(dev?.totalLines).toBe(1);
  });

  it("places persona-less entries under the (unknown) bucket", () => {
    const entries = [{ ts: 0, level: "info", line: "orphan" }];
    const aggs = aggregateByPersona(entries);
    expect(aggs).toHaveLength(1);
    expect(aggs[0]?.personaId).toBe("(unknown)");
  });
});
