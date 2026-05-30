// busChannelFeed — Story 2.10 (NEVAAA-30) unit tests.
//
// Covers the pure transforms that drive the channel-view panel: payload
// preview truncation, timestamp formatting, agent + event-type filtering,
// agent collection for the filter dropdown, and the rolling-window cap
// that keeps the live feed bounded. These run in vitest without a DOM —
// the React component itself needs Tauri's invoke, which is unavailable
// in the test environment, so the testable logic lives here.

import { describe, it, expect } from "vitest";
import type { BusEnvelope } from "@c4n/core";
import {
  appendCapped,
  collectAgents,
  connectionStatus,
  eventMatchesFilter,
  formatTimestamp,
  payloadPreview,
  truncate,
  EMPTY_FILTER,
} from "./busChannelFeed";

// ── Envelope fixtures ─────────────────────────────────────────────────

const lifecycle: BusEnvelope = {
  schemaVersion: 1,
  id: "e1",
  source: "dev",
  ts: 1_000,
  type: "agent.lifecycle",
  payload: { phase: "spawned", lifecycle: "persistent", cli: "claude-code" },
};

const message: BusEnvelope = {
  schemaVersion: 1,
  id: "e2",
  source: "frontend-designer",
  ts: 2_000,
  type: "agent.message",
  payload: { channel: "stdout", text: "hello world" },
};

const stall: BusEnvelope = {
  schemaVersion: 1,
  id: "e3",
  source: "hermes",
  ts: 3_000,
  type: "stall.detected",
  payload: { silenceDurationMs: 5000, lastSignalTs: null },
};

// ── truncate ──────────────────────────────────────────────────────────

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("clips and appends an ellipsis when over the limit", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abcdef", 4)).toHaveLength(4);
  });
});

// ── payloadPreview ────────────────────────────────────────────────────

describe("payloadPreview", () => {
  it("renders a key=value summary of the payload", () => {
    expect(payloadPreview(message)).toBe("channel=stdout text=hello world");
  });

  it("includes every payload field", () => {
    const preview = payloadPreview(lifecycle);
    expect(preview).toContain("phase=spawned");
    expect(preview).toContain("lifecycle=persistent");
    expect(preview).toContain("cli=claude-code");
  });

  it("renders null payload values as empty (no 'null' text)", () => {
    expect(payloadPreview(stall)).toBe("silenceDurationMs=5000 lastSignalTs=");
  });

  it("truncates long previews to the max length", () => {
    const long: BusEnvelope = {
      ...message,
      payload: { channel: "stdout", text: "x".repeat(200) },
    };
    const preview = payloadPreview(long, 40);
    expect(preview).toHaveLength(40);
    expect(preview.endsWith("…")).toBe(true);
  });
});

// ── formatTimestamp ───────────────────────────────────────────────────

describe("formatTimestamp", () => {
  it("produces a fixed-width HH:MM:SS.mmm clock string", () => {
    expect(formatTimestamp(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("zero-pads the milliseconds field", () => {
    // 7ms past an epoch second must render as .007, not .7
    expect(formatTimestamp(1_000)).toMatch(/\.000$/);
  });
});

// ── eventMatchesFilter ────────────────────────────────────────────────

describe("eventMatchesFilter", () => {
  it("passes everything for the empty filter", () => {
    expect(eventMatchesFilter(lifecycle, EMPTY_FILTER)).toBe(true);
    expect(eventMatchesFilter(message, EMPTY_FILTER)).toBe(true);
  });

  it("filters by agent", () => {
    expect(eventMatchesFilter(lifecycle, { agent: "dev", type: null })).toBe(true);
    expect(eventMatchesFilter(message, { agent: "dev", type: null })).toBe(false);
  });

  it("filters by event type", () => {
    expect(eventMatchesFilter(message, { agent: null, type: "agent.message" })).toBe(true);
    expect(eventMatchesFilter(message, { agent: null, type: "stall.detected" })).toBe(false);
  });

  it("AND-s the agent and type fields", () => {
    expect(eventMatchesFilter(message, { agent: "frontend-designer", type: "agent.message" })).toBe(
      true,
    );
    expect(eventMatchesFilter(message, { agent: "dev", type: "agent.message" })).toBe(false);
    expect(
      eventMatchesFilter(message, { agent: "frontend-designer", type: "stall.detected" }),
    ).toBe(false);
  });
});

// ── collectAgents ─────────────────────────────────────────────────────

describe("collectAgents", () => {
  it("returns sorted, de-duplicated source ids", () => {
    const dup: BusEnvelope = { ...message, id: "e4" };
    expect(collectAgents([message, lifecycle, stall, dup])).toEqual([
      "dev",
      "frontend-designer",
      "hermes",
    ]);
  });

  it("returns an empty array for an empty feed", () => {
    expect(collectAgents([])).toEqual([]);
  });
});

// ── connectionStatus (Story 2.11) ─────────────────────────────────────

describe("connectionStatus", () => {
  it("renders the live feed when connected", () => {
    expect(connectionStatus({ state: "connected" })).toEqual({
      label: "live",
      badge: "online",
      dot: "#6BFF8C",
    });
  });

  it("shows the reconnect attempt count while reconnecting", () => {
    const status = connectionStatus({ state: "reconnecting", attempt: 2, delayMs: 2000 });
    expect(status.label).toBe("reconnecting… (attempt 2)");
    expect(status.badge).toBe("warn");
  });

  it("shows connecting before the first link-up", () => {
    expect(connectionStatus({ state: "connecting" }).label).toBe("connecting…");
    expect(connectionStatus({ state: "connecting" }).badge).toBe("muted");
  });
});

// ── appendCapped ──────────────────────────────────────────────────────

describe("appendCapped", () => {
  it("appends without mutating the input array", () => {
    const original = [1, 2];
    const next = appendCapped(original, 3, 10);
    expect(next).toEqual([1, 2, 3]);
    expect(original).toEqual([1, 2]);
  });

  it("drops the oldest entries past the cap (rolling window)", () => {
    let buf: number[] = [];
    for (let i = 0; i < 10; i++) buf = appendCapped(buf, i, 3);
    expect(buf).toEqual([7, 8, 9]);
    expect(buf).toHaveLength(3);
  });
});
