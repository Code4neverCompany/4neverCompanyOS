// Story 2.8 — bus envelope schema guardrails.
//
// Proves the canonical wire format round-trips losslessly and that the
// runtime validator rejects malformed frames, so the relay (Story 2.9)
// and every other consumer can trust `parseBusEnvelope`.

import { describe, expect, it } from "vitest";
import {
  BUS_EVENT_TYPES,
  BUS_SCHEMA_VERSION,
  BusEnvelopeSchema,
  busEnvelopeJsonSchema,
  parseBusEnvelope,
  serializeBusEnvelope,
  type BusEnvelope,
} from "./envelope";

const sample = {
  progressSignal: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "11111111-1111-4111-8111-111111111111",
    source: "dev",
    ts: 1_700_000_000_000,
    type: "progress.signal",
    payload: { kind: "artifact.changed", path: "/vault/notes/x.md" },
  },
  agentLifecycleSpawn: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "22222222-2222-4222-8222-222222222222",
    source: "frontend-designer",
    ts: 1_700_000_000_001,
    type: "agent.lifecycle",
    payload: { phase: "spawned", lifecycle: "ephemeral", cli: "claude-code" },
  },
  agentLifecycleExit: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "33333333-3333-4333-8333-333333333333",
    source: "frontend-designer",
    ts: 1_700_000_000_002,
    type: "agent.lifecycle",
    payload: { phase: "exited", exitCode: 0 },
  },
  agentMessage: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "44444444-4444-4444-8444-444444444444",
    source: "dev",
    ts: 1_700_000_000_003,
    type: "agent.message",
    payload: { channel: "stdout", text: "build complete" },
  },
  stallDetected: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "55555555-5555-4555-8555-555555555555",
    source: "hermes",
    ts: 1_700_000_000_004,
    type: "stall.detected",
    payload: { silenceDurationMs: 300_000, lastSignalTs: 1_699_999_700_000 },
  },
  stallResumed: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "66666666-6666-4666-8666-666666666666",
    source: "hermes",
    ts: 1_700_000_000_005,
    type: "stall.resumed",
    payload: { signalKind: "code.changed" },
  },
  // Story 3.7 (NEVAAA-33): Hermes-initiated spawn proposal
  spawnProposal: {
    schemaVersion: BUS_SCHEMA_VERSION,
    id: "77777777-7777-4777-8777-777777777777",
    source: "hermes",
    ts: 1_700_000_000_006,
    type: "spawn_proposal",
    payload: {
      name: "Security Reviewer",
      persona_type: "claude-code",
      task_description: "Review the OAuth PR for security issues",
      lifecycle: "ephemeral",
      budget_estimate: 5,
    },
  },
} satisfies Record<string, BusEnvelope>;

describe("bus envelope round-trip serialization", () => {
  for (const [name, env] of Object.entries(sample)) {
    it(`round-trips ${name} losslessly`, () => {
      const wire = serializeBusEnvelope(env);
      const back = parseBusEnvelope(wire);
      expect(back).toEqual(env);
    });
  }

  it("preserves the discriminated payload type through a round-trip", () => {
    const back = parseBusEnvelope(serializeBusEnvelope(sample.progressSignal));
    // narrows on `type` — payload is the progress-signal shape
    if (back.type === "progress.signal") {
      expect(back.payload.kind).toBe("artifact.changed");
      expect(back.payload.path).toBe("/vault/notes/x.md");
    } else {
      throw new Error("discriminator lost on round-trip");
    }
  });
});

describe("bus envelope validation", () => {
  it("accepts every declared event type", () => {
    const seen = new Set(Object.values(sample).map((e) => e.type));
    for (const t of BUS_EVENT_TYPES) {
      expect(seen.has(t), `no sample envelope for ${t}`).toBe(true);
    }
  });

  it("rejects an unknown event type", () => {
    const bad = { ...sample.agentMessage, type: "totally.unknown" };
    expect(() => BusEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects a mismatched schemaVersion", () => {
    const bad = { ...sample.agentMessage, schemaVersion: 999 };
    expect(() => BusEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects a payload that doesn't match its type", () => {
    const bad = { ...sample.progressSignal, payload: { channel: "stdout", text: "x" } };
    expect(() => BusEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects an invalid progress-signal kind", () => {
    const bad = { ...sample.progressSignal, payload: { kind: "nope", path: "/x" } };
    expect(() => BusEnvelopeSchema.parse(bad)).toThrow();
  });

  it("rejects a missing required field", () => {
    const { source: _omit, ...bad } = sample.agentMessage;
    void _omit;
    expect(() => BusEnvelopeSchema.parse(bad)).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => parseBusEnvelope("{ not json")).toThrow();
  });
});

describe("JSON Schema export (non-TS consumers — relay crate, registries)", () => {
  it("produces an object schema generated from the Zod source of truth", () => {
    const schema = busEnvelopeJsonSchema();
    expect(schema).toBeTypeOf("object");
    // serializes cleanly (consumed as JSON by the Rust relay)
    expect(() => JSON.stringify(schema)).not.toThrow();
    // discriminated union surfaces as a multi-branch schema
    const serialized = JSON.stringify(schema);
    for (const t of BUS_EVENT_TYPES) {
      expect(serialized, `JSON Schema missing ${t}`).toContain(t);
    }
  });
});
