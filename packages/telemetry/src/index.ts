// @c4n/telemetry — Per-persona token-cost telemetry. Parses each CLI's structured output (Claude Code, agy, Hermes) and persists token counts to workspace SQLite.
//
// Architecture: D-11
// Implementing stories: M2 Story 2.16; budgets M5 Story 5.6
//
// M0 scaffolding; substantive implementation lands in the stories above.

import { createLogger } from "@c4n/observability";

export const PACKAGE_NAME = "@c4n/telemetry" as const;

export { parseJsonl, type LogEntry, type ParseResult, type ParseError } from "./parser.js";
export {
  aggregate,
  aggregateByPersona,
  TOKEN_ESTIMATE_CHARS_PER_TOKEN,
  type PersonaAggregate,
} from "./aggregator.js";
export {
  startTelemetryConsumer,
  stopTelemetryConsumer,
  latestAggregate,
  type StartConsumerOptions,
  type WatcherFactory,
} from "./consumer.js";

/** Convenience re-export of the package-level logger. */
export const log = createLogger("@c4n/telemetry");
