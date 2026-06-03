// @c4n/telemetry — Per-persona token-cost telemetry. Parses each CLI's
// structured output (Claude Code, agy, Hermes) and persists token counts
// to workspace SQLite.
//
// Architecture: D-11
// Implementing stories: M2 Story 2.16; budgets M5 Story 5.6
//
// This commit ships the JSONL consumer foundation: it reads the
// per-persona log files written by the persona supervisor
// (`<vault>/personas/<id>/log/<date>.jsonl`) and aggregates token-cost
// rows into per-persona totals. The actual token-cost parsing
// (recognizing "input_tokens=N" / "output_tokens=M" / "cost_usd=X"
// patterns in CLI output) lands in the M2 Story 2.16 follow-up —
// for now the consumer reads every JSONL line and counts only the
// rows that already carry a recognized cost line shape.
//
// The aggregator is pure and dependency-free so it can be unit-tested
// with a string fixture and reused for budget enforcement (Story 5.6).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PACKAGE_NAME = "@c4n/telemetry" as const;

/** Wire-format version for token-cost events. Bumped only on a
 * breaking schema change. */
export const TELEMETRY_SCHEMA_VERSION = 1 as const;

/** One parsed token-cost event extracted from a single JSONL log line. */
export interface TokenCostEvent {
  /** Source persona slug, e.g. "dev", "hermes", "frontend-designer". */
  persona_id: string;
  /** Backing CLI the persona was running on, e.g. "claude" or "aggy". */
  backing_cli: string;
  /** Wall-clock timestamp the event was logged, Unix millis. */
  ts_ms: number;
  /** Input tokens consumed by the call. */
  input_tokens: number;
  /** Output tokens produced by the call. */
  output_tokens: number;
  /** Cost in USD reported by the CLI. */
  cost_usd: number;
  /** Original line text — preserved so callers can audit or re-parse. */
  raw_line: string;
}

/** Per-persona token-cost aggregate. */
export interface TokenCostAggregate {
  persona_id: string;
  /** Number of cost events that contributed to this aggregate. */
  events: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  /** Earliest + latest event timestamps (Unix millis). */
  window_start_ms: number | null;
  window_end_ms: number | null;
}

/**
 * Heuristic pattern for a "token cost" line written by Claude Code,
 * agy, or Hermes. We don't try to be exhaustive here — the M2
 * story-2.16 follow-up will wire the official patterns per CLI. For
 * now we match the loose shape `tokens=N,M cost=$X` which covers
 * the proof-of-concept CLIs used during development.
 */
const COST_LINE_PATTERN = /tokens\s*=\s*(\d+)\s*,\s*(\d+)[^\n]*?cost\s*=\s*\$?\s*([\d.]+)/i;

/**
 * Parse a single JSONL log line into a `TokenCostEvent`, or return
 * `null` if the line does not carry token-cost information. The
 * function is pure (no I/O) so it's straightforward to test.
 */
export function parseTokenCostLine(persona_id: string, jsonlLine: string): TokenCostEvent | null {
  // JSONL line shape: {"ts":<n>,"level":"info","line":"<text>"}
  // We don't strictly validate the envelope — we use a try/catch around
  // JSON.parse and fall back to scanning the raw line for cost markers.
  let ts_ms = 0;
  let text = jsonlLine;
  try {
    const obj: unknown = JSON.parse(jsonlLine);
    if (obj && typeof obj === "object" && "line" in obj) {
      const inner = (obj as { line?: unknown }).line;
      if (typeof inner === "string") text = inner;
    }
    if (obj && typeof obj === "object" && "ts" in obj) {
      const t = (obj as { ts?: unknown }).ts;
      if (typeof t === "number" && Number.isFinite(t)) ts_ms = t;
    }
  } catch {
    // line wasn't JSON — treat the whole string as text to scan.
  }

  const match = COST_LINE_PATTERN.exec(text);
  if (!match) return null;
  const input = Number(match[1]);
  const output = Number(match[2]);
  const cost = Number(match[3]);
  if (!Number.isFinite(input) || !Number.isFinite(output) || !Number.isFinite(cost)) {
    return null;
  }

  return {
    persona_id,
    backing_cli: detectBackingCli(text),
    ts_ms,
    input_tokens: input,
    output_tokens: output,
    cost_usd: cost,
    raw_line: jsonlLine,
  };
}

/** Best-effort backing-CLI guess from a log line. Returns "unknown" when
 * the line carries no CLI hint. Used to populate `TokenCostEvent.backing_cli`
 * so the aggregator can split cost by CLI. */
function detectBackingCli(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("claude") || lower.includes("claude-code")) return "claude";
  if (lower.includes("agy") || lower.includes("antigravity")) return "aggy";
  if (lower.includes("hermes")) return "hermes";
  return "unknown";
}

/**
 * Pure aggregator. Reduces a list of events into a per-persona
 * `TokenCostAggregate`. The aggregator is independent of the file
 * system — the consumer (`TelemetryConsumer`) handles I/O and just
 * hands events to this function.
 */
export function aggregateTokenCosts(events: readonly TokenCostEvent[]): TokenCostAggregate[] {
  const byPersona = new Map<string, TokenCostAggregate>();
  for (const ev of events) {
    const cur =
      byPersona.get(ev.persona_id) ??
      ({
        persona_id: ev.persona_id,
        events: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        window_start_ms: null,
        window_end_ms: null,
      } satisfies TokenCostAggregate);
    cur.events += 1;
    cur.input_tokens += ev.input_tokens;
    cur.output_tokens += ev.output_tokens;
    cur.cost_usd += ev.cost_usd;
    if (cur.window_start_ms === null || ev.ts_ms < cur.window_start_ms) {
      cur.window_start_ms = ev.ts_ms;
    }
    if (cur.window_end_ms === null || ev.ts_ms > cur.window_end_ms) {
      cur.window_end_ms = ev.ts_ms;
    }
    byPersona.set(ev.persona_id, cur);
  }
  return [...byPersona.values()].sort((a, b) => a.persona_id.localeCompare(b.persona_id));
}

/**
 * JSONL file consumer. Reads `<vault>/personas/<id>/log/<date>.jsonl`
 * for the persona IDs supplied to the constructor and surfaces the
 * parsed events + per-persona aggregates.
 *
 * The consumer is intentionally minimal — it does no streaming, no
 * globbing, no incremental update. M2 Story 2.16 will add a watcher
 * (Tauri file-watching or `fs.watch`) that re-aggregates on each new
 * line. For now this is the foundation the M5 budget enforcement
 * (Story 5.6) is built on.
 */
export class TelemetryConsumer {
  constructor(private readonly vaultRoot: string) {}

  /** Read every JSONL file under `<vault>/personas/<id>/log/`. The persona
   * IDs are passed explicitly so the consumer does not have to glob the
   * whole `personas/` tree (a vault may have hundreds of historic personas
   * and only a handful are active). */
  readPersonaLogs(personaIds: readonly string[]): TokenCostEvent[] {
    const events: TokenCostEvent[] = [];
    for (const id of personaIds) {
      const logDir = join(this.vaultRoot, "personas", id, "log");
      let files: string[];
      try {
        files = readdirSync(logDir).filter((f) => f.endsWith(".jsonl"));
      } catch {
        // log dir missing — persona has never been spawned, or vault
        // is in a brand-new state. Not an error; just yield no events.
        continue;
      }
      for (const file of files) {
        const body = readFileSync(join(logDir, file), "utf8");
        for (const line of body.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const ev = parseTokenCostLine(id, line);
          if (ev) events.push(ev);
        }
      }
    }
    return events;
  }

  /** Convenience: read + aggregate in one call. Returns one row per persona
   * with token and cost totals. Personas with no cost events in their
   * logs are omitted from the result — callers that want a "zero" row
   * for a missing persona should pre-seed the list themselves. */
  aggregateForPersonas(personaIds: readonly string[]): TokenCostAggregate[] {
    return aggregateTokenCosts(this.readPersonaLogs(personaIds));
  }
}
