// @c4n/telemetry/aggregator — roll a list of LogEntry items into the
// per-persona metrics the UI panel will display.
//
// Heuristics (documented per the task):
//   - `linesPerMinute` is computed across the time span covered by the
//     entries. A single-entry batch returns 0 (we don't extrapolate).
//   - `promptPatterns` is a bag of `<verb> <noun>` pairs found in the
//     `line` field, ranked by frequency. The regex is intentionally
//     narrow (whitelist of common shell-y verbs) so a noisy log line
//     like "wrote a brand new plan" doesn't pollute the top results
//     with false positives. The full set of supported verbs is in
//     `PROMPT_VERB_REGEX` below — extend it when new CLI commands
//     appear in the persona's vocabulary.
//   - `tokenCostEstimate` is a v0 estimate. We use 1 token ≈ 4 chars of
//     `line` content (the standard English-text approximation). This
//     is *not* authoritative — the Rust supervisor's PTY output goes
//     through terminal escape sequences, ANSI codes, and progress
//     spinners that bloat character counts. Real token accounting needs
//     the upstream tokenizer, which we don't have here. Treat this as
//     a relative signal (persona A costs ~2x persona B) not an
//     absolute cost.

import type { LogEntry } from "./parser.js";

export const PACKAGE_NAME = "@c4n/telemetry/aggregator" as const;

export interface PersonaAggregate {
  personaId: string;
  totalLines: number;
  /** Lines per minute, or 0 when the entries cover a single instant. */
  linesPerMinute: number;
  /** <verb> <noun> pattern counts, most-frequent first. Capped at 10. */
  promptPatterns: Array<{ pattern: string; count: number }>;
  /** v0 estimate: 1 token ≈ 4 chars of line content. */
  tokenCostEstimate: number;
  /** First entry timestamp (ms). */
  firstTs: number;
  /** Last entry timestamp (ms). */
  lastTs: number;
}

export const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4;

/** Top-N patterns to keep in the aggregate. */
const PATTERN_TOP_N = 10;

// Verbs we recognize in "<verb> <noun>" prompt patterns. Listed
// alphabetically; case-insensitive. Keep this list short — the heuristic
// is meant to surface the dominant activity, not classify every line.
const PROMPT_VERB_REGEX: RegExp = new RegExp(
  String.raw`\b(wrote|created|updated|edited|read|loaded|saved|deleted|ran|executed|spawned|started|stopped|paused|resumed|scanned|cataloged|ingested|analyzed|reviewed|published|deployed|fetched|pushed|pulled|merged|rebased|committed|tested|built|formatted|linted|wrote file|read file|wrote tests|ran tests|read vault|wrote plan|analyzed codebase)\b\s+([a-z][a-z0-9_\-]*)`,
  "gi",
);

// ── Aggregation ───────────────────────────────────────────────────────

/**
 * Roll `entries` into a single `PersonaAggregate`. All entries should
 * belong to the same persona; the caller passes the personaId. Entries
 * are not required to be sorted — the aggregator sorts a copy.
 */
export function aggregate(entries: ReadonlyArray<LogEntry>, personaId: string): PersonaAggregate {
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);
  const totalLines = sorted.length;
  let firstTs = 0;
  let lastTs = 0;
  if (totalLines > 0) {
    firstTs = sorted[0]!.ts;
    lastTs = sorted[sorted.length - 1]!.ts;
  }
  const spanMs = Math.max(0, lastTs - firstTs);
  // linesPerMinute: avoid divide-by-zero; treat sub-minute spans as 0
  // rather than exaggerating with an extrapolation.
  const linesPerMinute = spanMs >= 60_000 ? (totalLines * 60_000) / spanMs : 0;

  const patternCounts = new Map<string, number>();
  let totalChars = 0;
  for (const entry of sorted) {
    totalChars += entry.line.length;
    for (const match of entry.line.matchAll(PROMPT_VERB_REGEX)) {
      const verb = match[1]!.toLowerCase();
      const noun = match[2]!.toLowerCase();
      // Skip 1-char nouns ("a", "I") — they're noise, not intent.
      if (noun.length < 2) continue;
      const key = `${verb} ${noun}`;
      patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
    }
  }

  const promptPatterns = [...patternCounts.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
    .slice(0, PATTERN_TOP_N);

  const tokenCostEstimate = Math.ceil(totalChars / TOKEN_ESTIMATE_CHARS_PER_TOKEN);

  return {
    personaId,
    totalLines,
    linesPerMinute,
    promptPatterns,
    tokenCostEstimate,
    firstTs,
    lastTs,
  };
}

/**
 * Group entries by their `personaId` field and aggregate each group.
 * Entries without a `personaId` are placed under the synthetic key
 * `"(unknown)"` so they aren't silently dropped.
 */
export function aggregateByPersona(entries: ReadonlyArray<LogEntry>): PersonaAggregate[] {
  const grouped = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const id = e.personaId ?? "(unknown)";
    let bucket = grouped.get(id);
    if (bucket === undefined) {
      bucket = [];
      grouped.set(id, bucket);
    }
    bucket.push(e);
  }
  const out: PersonaAggregate[] = [];
  for (const [personaId, list] of grouped) {
    out.push(aggregate(list, personaId));
  }
  out.sort((a, b) => a.personaId.localeCompare(b.personaId));
  return out;
}
