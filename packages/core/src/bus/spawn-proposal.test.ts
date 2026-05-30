// Story 3.7 (NEVAAA-33) — Hermes-initiated spawn proposal unit tests.
//
// AC coverage:
//   ✓ Valid spawn_proposal envelope accepted (Zod parse succeeds)
//   ✓ Invalid proposal rejected with error (Zod throws — the "error event"
//     in pure-TS context; the Rust receive_spawn_proposal command returns
//     Err(String) which the bus relay will surface as a rejection event)
//     - Missing required payload fields
//     - Invalid persona_type (not in BACKING_CLIS)
//     - Invalid lifecycle
//     - budget_estimate exceeds SPAWN_PROPOSAL_BUDGET_MAX_USD
//   ✓ Bus event schema matches packages/core envelope format (discriminated
//     union, schemaVersion, envelopeBase fields all validated)
//
// Architecture: D-3

import { describe, expect, it } from "vitest";
import {
  BUS_SCHEMA_VERSION,
  SPAWN_PROPOSAL_BUDGET_MAX_USD,
  SpawnProposalEnvelopeSchema,
  type SpawnProposalEnvelope,
} from "./envelope";

// ── Helpers ───────────────────────────────────────────────────────────

/** Build a minimal valid spawn_proposal envelope. Spread overrides to test errors. */
function valid(overrides: Record<string, unknown> = {}): unknown {
  return {
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
    },
    ...overrides,
  };
}

function validPayload(payloadOverrides: Record<string, unknown>): unknown {
  return valid({
    payload: {
      name: "Security Reviewer",
      persona_type: "claude-code",
      task_description: "Review the OAuth PR for security issues",
      lifecycle: "ephemeral",
      ...payloadOverrides,
    },
  });
}

// ── Happy path ────────────────────────────────────────────────────────

describe("spawn_proposal — valid proposals accepted", () => {
  it("accepts a minimal valid proposal (no budget_estimate)", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(valid());
    expect(result.success).toBe(true);
    if (result.success) {
      const env: SpawnProposalEnvelope = result.data;
      expect(env.type).toBe("spawn_proposal");
      expect(env.payload.name).toBe("Security Reviewer");
      expect(env.payload.persona_type).toBe("claude-code");
      expect(env.payload.lifecycle).toBe("ephemeral");
      expect(env.payload.budget_estimate).toBeUndefined();
    }
  });

  it("accepts a proposal with budget_estimate at the limit", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(
      validPayload({ budget_estimate: SPAWN_PROPOSAL_BUDGET_MAX_USD }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a proposal with budget_estimate below the limit", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ budget_estimate: 9.99 }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.budget_estimate).toBe(9.99);
    }
  });

  it("accepts all valid persona_types (BACKING_CLIS)", () => {
    for (const pt of ["claude-code", "agy", "agent"] as const) {
      const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ persona_type: pt }));
      expect(result.success, `persona_type "${pt}" should be valid`).toBe(true);
    }
  });

  it("accepts persistent lifecycle", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ lifecycle: "persistent" }));
    expect(result.success).toBe(true);
  });

  it("round-trips through JSON serialisation", () => {
    const env = SpawnProposalEnvelopeSchema.parse(valid());
    const back = SpawnProposalEnvelopeSchema.parse(JSON.parse(JSON.stringify(env)));
    expect(back).toEqual(env);
  });
});

// ── Envelope-level errors ─────────────────────────────────────────────

describe("spawn_proposal — invalid envelope rejected (error event)", () => {
  it("rejects when schemaVersion is wrong", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(valid({ schemaVersion: 99 }));
    expect(result.success).toBe(false);
  });

  it("rejects when id is missing", () => {
    const env = valid() as Record<string, unknown>;
    delete env["id"];
    const result = SpawnProposalEnvelopeSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it("rejects when source is empty", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(valid({ source: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects when ts is not an integer", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(valid({ ts: 1.5 }));
    expect(result.success).toBe(false);
  });

  it("rejects when type is not 'spawn_proposal'", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(valid({ type: "agent.message" }));
    expect(result.success).toBe(false);
  });
});

// ── Payload required-field errors ─────────────────────────────────────

describe("spawn_proposal — invalid payload rejected", () => {
  it("rejects when payload.name is empty", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects when payload.task_description is missing", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(
      validPayload({ task_description: undefined }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects when payload.lifecycle is missing", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ lifecycle: undefined }));
    expect(result.success).toBe(false);
  });
});

// ── Enum validation errors ─────────────────────────────────────────────

describe("spawn_proposal — enum validation errors", () => {
  it("rejects an unknown persona_type", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(
      validPayload({ persona_type: "gemini-pro" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.toString();
      expect(msg).toContain("persona_type");
    }
  });

  it("rejects an unknown lifecycle value", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ lifecycle: "transient" }));
    expect(result.success).toBe(false);
  });
});

// ── Budget limit errors ───────────────────────────────────────────────

describe("spawn_proposal — budget limit enforcement", () => {
  it("rejects budget_estimate above the USD limit", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(
      validPayload({ budget_estimate: SPAWN_PROPOSAL_BUDGET_MAX_USD + 0.01 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.toString();
      expect(msg.toLowerCase()).toMatch(/budget_estimate|max|exceed/i);
    }
  });

  it("rejects negative budget_estimate", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ budget_estimate: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric budget_estimate", () => {
    const result = SpawnProposalEnvelopeSchema.safeParse(validPayload({ budget_estimate: "ten" }));
    expect(result.success).toBe(false);
  });
});
