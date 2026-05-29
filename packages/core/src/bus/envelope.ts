// Canonical bus message envelope schemas (Story 2.8).
//
// Every message that crosses the bus — Paperclip events normalized by the
// relay crate, progress signals, persona lifecycle transitions, stall
// declarations, agent terminal/chat output — travels as a `BusEnvelope`.
// This is the single wire format shared by every consumer:
//   - the desktop UI (over the WebSocket relay, Story 2.9)
//   - the relay crate (crates/bus-relay) via the exported JSON Schema
//   - the CLI / bus-client (@c4n/bus-client)
//
// Design (D-3): the envelope is a discriminated union on `type`. Common
// fields (schemaVersion, id, source, ts) repeat in every variant so a
// single `BusEnvelopeSchema.parse()` both narrows the payload and validates
// the wrapper. Event-specific data lives in `payload`.

import { z } from "zod";
import { BACKING_CLIS, LIFECYCLES, PROGRESS_SIGNALS } from "../glossary";

/**
 * Wire-format version. Bump only on a breaking envelope change; consumers
 * pin this literal so an older/newer relay is rejected loudly rather than
 * silently mis-parsed. Lives in every envelope as `schemaVersion`.
 */
export const BUS_SCHEMA_VERSION = 1 as const;

/**
 * Maximum budget estimate (USD) Hermes may include in a spawn_proposal.
 * Proposals above this threshold are rejected so over-budget requests go
 * through the board-approval gate (Story 3.7 / NEVAAA-33).
 */
export const SPAWN_PROPOSAL_BUDGET_MAX_USD = 50 as const;

/** The event types that can appear on the bus — the discriminator values. */
export const BUS_EVENT_TYPES = [
  "progress.signal",
  "agent.lifecycle",
  "agent.message",
  "stall.detected",
  "stall.resumed",
  // Story 3.7 (NEVAAA-33): Hermes-initiated spawn proposal
  "spawn_proposal",
] as const;
export type BusEventType = (typeof BUS_EVENT_TYPES)[number];

// ── Common envelope fields ────────────────────────────────────────────
//
// Spread into every variant. Kept as a plain object (not a base z.object)
// so z.discriminatedUnion can see each variant's literal `type` directly.

const envelopeBase = {
  /** Wire-format version — pinned literal, see BUS_SCHEMA_VERSION. */
  schemaVersion: z.literal(BUS_SCHEMA_VERSION),
  /** Unique message id (UUID v4 from the producer). */
  id: z.string().min(1),
  /** Source agent id — which persona/relay emitted this message. */
  source: z.string().min(1),
  /** Producer timestamp, Unix milliseconds. */
  ts: z.number().int().nonnegative(),
};

// ── Per-event payload envelopes ───────────────────────────────────────

/** A progress signal observed for the stall detector (D-4). */
export const ProgressSignalEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("progress.signal"),
  payload: z.object({
    /** Progress-signal kind — see glossary PROGRESS_SIGNALS. */
    kind: z.enum(PROGRESS_SIGNALS),
    /** Absolute path that changed, or story slug for story.state.changed. */
    path: z.string().min(1),
  }),
});

/** A persona spawned or exited (Story 3.3 / 3.6). */
export const AgentLifecycleEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("agent.lifecycle"),
  payload: z.object({
    phase: z.enum(["spawned", "exited"]),
    /** persistent | ephemeral — present on spawn. */
    lifecycle: z.enum(LIFECYCLES).optional(),
    /** Backing CLI the persona runs on — present on spawn. */
    cli: z.enum(BACKING_CLIS).optional(),
    /** Process exit code — present on exit. */
    exitCode: z.number().int().optional(),
  }),
});

/** Terminal / chat output from an agent. */
export const AgentMessageEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("agent.message"),
  payload: z.object({
    channel: z.enum(["stdout", "stderr", "chat"]),
    text: z.string(),
  }),
});

/** The stall detector declared a stall (D-5). */
export const StallDetectedEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("stall.detected"),
  payload: z.object({
    /** Silence since the last progress signal, milliseconds. */
    silenceDurationMs: z.number().int().nonnegative(),
    /** Timestamp of the last progress signal before the stall (null if none). */
    lastSignalTs: z.number().int().nonnegative().nullable(),
  }),
});

/** A stall cleared because a new progress signal arrived (D-5). */
export const StallResumedEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("stall.resumed"),
  payload: z.object({
    /** The progress-signal kind that cleared the stall. */
    signalKind: z.enum(PROGRESS_SIGNALS),
  }),
});

/**
 * Hermes proposes spawning a new dynamic persona (Story 3.7 / NEVAAA-33).
 *
 * Validation rules applied here (also enforced on the Rust side in
 * `apps/desktop/src-tauri/src/commands/mod.rs`):
 *   - `name` / `task_description` — non-empty strings.
 *   - `persona_type` — must be a member of BACKING_CLIS.
 *   - `lifecycle` — must be "persistent" or "ephemeral".
 *   - `budget_estimate` — when present, must not exceed SPAWN_PROPOSAL_BUDGET_MAX_USD.
 *
 * The desktop app stores accepted proposals in `PendingProposalsStore`; the
 * user approval UI (Story 3.8 / NEVAAA-34) reads that state.
 */
export const SpawnProposalEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("spawn_proposal"),
  payload: z.object({
    /** Human-readable persona name (e.g. "Security Reviewer"). */
    name: z.string().min(1),
    /** Backing CLI type — must be a member of BACKING_CLIS (glossary). */
    persona_type: z.enum(BACKING_CLIS),
    /** Short description of the task the persona should perform. */
    task_description: z.string().min(1),
    /** Whether the persona exits when the task completes. */
    lifecycle: z.enum(LIFECYCLES),
    /**
     * Optional cost estimate in USD. Rejected when above
     * SPAWN_PROPOSAL_BUDGET_MAX_USD so over-budget proposals require
     * explicit board approval rather than silent acceptance.
     * Omit when cost is unknown (treated as 0 for limit purposes).
     */
    budget_estimate: z
      .number()
      .nonnegative()
      .max(
        SPAWN_PROPOSAL_BUDGET_MAX_USD,
        `budget_estimate must not exceed ${SPAWN_PROPOSAL_BUDGET_MAX_USD} USD`,
      )
      .optional(),
  }),
});

// ── The discriminated union ───────────────────────────────────────────

/**
 * Canonical bus envelope. Runtime validator for the relay and every other
 * consumer — `BusEnvelopeSchema.parse(json)` narrows `payload` by `type`.
 */
export const BusEnvelopeSchema = z.discriminatedUnion("type", [
  ProgressSignalEnvelopeSchema,
  AgentLifecycleEnvelopeSchema,
  AgentMessageEnvelopeSchema,
  StallDetectedEnvelopeSchema,
  StallResumedEnvelopeSchema,
  SpawnProposalEnvelopeSchema,
]);

/** Inferred TypeScript type for any bus envelope. */
export type BusEnvelope = z.infer<typeof BusEnvelopeSchema>;

export type ProgressSignalEnvelope = z.infer<typeof ProgressSignalEnvelopeSchema>;
export type AgentLifecycleEnvelope = z.infer<typeof AgentLifecycleEnvelopeSchema>;
export type AgentMessageEnvelope = z.infer<typeof AgentMessageEnvelopeSchema>;
export type StallDetectedEnvelope = z.infer<typeof StallDetectedEnvelopeSchema>;
export type StallResumedEnvelope = z.infer<typeof StallResumedEnvelopeSchema>;
export type SpawnProposalEnvelope = z.infer<typeof SpawnProposalEnvelopeSchema>;

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Parse + validate an untrusted JSON string into a typed envelope.
 * Throws ZodError on malformed input. Used by the WebSocket relay and
 * bus-client on every inbound frame.
 */
export function parseBusEnvelope(json: string): BusEnvelope {
  return BusEnvelopeSchema.parse(JSON.parse(json));
}

/** Serialize an envelope to its canonical JSON wire string. */
export function serializeBusEnvelope(envelope: BusEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * JSON Schema for the bus envelope, for non-TypeScript consumers (the Rust
 * relay crate, schema registries, docs). Generated from the Zod source of
 * truth so it can never drift from the runtime validator.
 */
export function busEnvelopeJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(BusEnvelopeSchema);
}
