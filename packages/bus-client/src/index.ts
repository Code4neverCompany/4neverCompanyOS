// @c4n/bus-client — TypeScript client for the message bus (D-3). Producers
// post; subscribers receive bus envelopes from the relay over WebSocket.
//
// Architecture: D-3
// Implementing stories: M2 Story 2.7-2.10
//
// This commit ships the M0 type re-exports so downstream packages can
// already import the canonical bus-envelope types from `@c4n/bus-client`
// without taking a direct dependency on `@c4n/core`. The actual Tauri
// `invoke` wrappers and the WebSocket subscriber land in M2 Story 2.7-2.10
// (see plan_5a5e6526 / sprint backlog).

import type {
  AgentLifecycleEnvelope,
  AgentMessageEnvelope,
  BusEnvelope,
  ProgressSignalEnvelope,
  SpawnProposalEnvelope,
  StallDetectedEnvelope,
  StallResumedEnvelope,
  WorkflowPhaseAdvancedEnvelope,
} from "@c4n/core";

export const PACKAGE_NAME = "@c4n/bus-client" as const;

// ── Re-exported types ─────────────────────────────────────────────────
//
// Type-only re-exports. The runtime values (schema, parser, serializer)
// continue to live in `@c4n/core` — this package is a stable façade so
// downstream code can depend on `@c4n/bus-client` without touching core
// when core's shape evolves.

export type {
  AgentLifecycleEnvelope,
  AgentMessageEnvelope,
  BusEnvelope,
  ProgressSignalEnvelope,
  SpawnProposalEnvelope,
  StallDetectedEnvelope,
  StallResumedEnvelope,
  WorkflowPhaseAdvancedEnvelope,
};

/**
 * The bus event type discriminator. Re-exported as a runtime const so
 * downstream packages can iterate the available event types without
 * depending on `@c4n/core` directly.
 */
export const BUS_EVENT_TYPES = [
  "progress.signal",
  "agent.lifecycle",
  "agent.message",
  "stall.detected",
  "stall.resumed",
  "spawn_proposal",
  "workflow.phase.advanced",
] as const;
export type BusEventType = (typeof BUS_EVENT_TYPES)[number];
