// @c4n/telemetry/parser — read JSONL log files written by the Rust
// persona-supervisor (see crates/persona-supervisor/src/lib.rs:139).
//
// On-disk shape (one JSON object per line):
//   {"ts": <u128 ms>, "level": "info", "line": "..."}
//
// Parsing is line-oriented and strict: malformed lines are reported via
// the `errors` field rather than thrown, so a single bad line doesn't
// poison an entire day's aggregate. Callers can decide whether to log
// and continue or surface the errors upstream.

export const PACKAGE_NAME = "@c4n/telemetry/parser" as const;

// ── Public types ──────────────────────────────────────────────────────

/** One log line as written by the Rust supervisor. */
export interface LogEntry {
  /** Unix milliseconds. May be a number or numeric string from JSON. */
  ts: number;
  /** Severity — always "info" today since PTY merges stdout + stderr. */
  level: string;
  /** The log line content (free text). */
  line: string;
  /** Persona id this entry belongs to. Injected by the consumer from
   *  the on-disk path; not present in the raw JSONL. */
  personaId?: string;
  /** File the entry came from. Injected by the consumer. */
  sourceFile?: string;
}

export interface ParseError {
  /** 1-based line number in the file. */
  lineNumber: number;
  /** Raw line content (truncated for safety). */
  raw: string;
  message: string;
}

export interface ParseResult {
  entries: LogEntry[];
  errors: ParseError[];
}

// ── Pure parser (sync, no I/O) ────────────────────────────────────────

/** Default cap on raw line length kept in error records. */
const MAX_RAW_ERROR_BYTES = 256;

/**
 * Parse the textual contents of a JSONL file. Empty lines are skipped
 * silently. Malformed lines are collected into `errors` and the parser
 * keeps going. The `personaId` / `sourceFile` fields are not populated
 * here — the consumer does that once it knows the file's path.
 */
export function parseJsonl(text: string): ParseResult {
  const entries: LogEntry[] = [];
  const errors: ParseError[] = [];

  // Split on \n; tolerate \r\n and a trailing newline. We don't use
  // String.split("\n") + filter for memory reasons: large JSONL files
  // are common (multi-day runs) and we want O(n) iteration without a
  // // big intermediate array.
  let start = 0;
  let lineNumber = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text.charCodeAt(i) === 10 /* \n */) {
      lineNumber += 1;
      // Strip a trailing \r so CRLF files parse cleanly.
      const end = i > 0 && text.charCodeAt(i - 1) === 13 ? i - 1 : i;
      if (end > start) {
        const raw = text.slice(start, end);
        if (raw.trim().length > 0) {
          try {
            const obj = JSON.parse(raw) as Record<string, unknown>;
            const entry = coerceLogEntry(obj);
            if (entry !== null) {
              entries.push(entry);
            } else {
              errors.push({
                lineNumber,
                raw: truncate(raw, MAX_RAW_ERROR_BYTES),
                message: "missing required fields (ts, level, line)",
              });
            }
          } catch (e) {
            errors.push({
              lineNumber,
              raw: truncate(raw, MAX_RAW_ERROR_BYTES),
              message: (e as Error).message,
            });
          }
        }
      }
      start = i + 1;
    }
  }

  return { entries, errors };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function coerceLogEntry(obj: Record<string, unknown>): LogEntry | null {
  const ts = obj["ts"];
  const level = obj["level"];
  const line = obj["line"];
  if (typeof line !== "string") return null;
  if (typeof level !== "string") return null;

  // ts may come in as a JSON number (u128 → number fits in JS double
  // for any reasonable timestamp) or a numeric string. We accept both.
  let tsMs: number;
  if (typeof ts === "number") {
    tsMs = ts;
  } else if (typeof ts === "string" && ts.trim().length > 0) {
    const parsed = Number(ts);
    if (!Number.isFinite(parsed)) return null;
    tsMs = parsed;
  } else {
    return null;
  }
  return { ts: tsMs, level, line };
}
