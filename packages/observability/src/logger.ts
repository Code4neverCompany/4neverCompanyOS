// @c4n/observability — structured logger factory + lightweight span tracer.
//
// Logger design choice (deliberate, see task constraint):
//   We use the built-in `console` with a tiny JSON-line formatter instead of
//   pulling in pino. Reasons:
//     1. Zero runtime deps → safe to import from any package, including the
//        tauri-free test environment (constraint: must not import
//        @tauri-apps/api).
//     2. The desktop sidecar already routes stdout/stderr to its own log
//        sink — we just need a stable, machine-parseable shape (one JSON
//        object per line) so downstream tools can ingest our output.
//     3. Pino is great, but its biggest wins (worker-thread transport,
//        redaction plugins) aren't on the critical path for v0.
//
// The shape matches the Rust side's `tracing` JSON output as closely as
// possible so a log aggregator that already knows how to parse Rust
// `tracing-subscriber` JSON can consume the TS lines without changes.

import { Span } from "./tracing.js";

export const PACKAGE_NAME = "@c4n/observability" as const;

// ── Types ──────────────────────────────────────────────────────────────

/** Severity levels we emit. Strings match `tracing-subscriber`'s default. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** Optional caller-supplied structured fields. Keys must be JSON-safe. */
  [key: string]: unknown;
}

export interface LogRecord {
  /** Unix millis. */
  ts: number;
  level: LogLevel;
  /** Owning package or component (e.g. "@c4n/desktop"). */
  target: string;
  /** Free-form log message. */
  msg: string;
  /** Optional structured fields. */
  fields?: LogFields;
  /** Active span id, if any. Lets log lines be tied back to a span. */
  span?: string;
}

export interface Logger {
  readonly name: string;
  trace(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** True when a span is currently active for this logger. */
  hasOpenSpan(): boolean;
  /** Returns the active span id, or `null` if none. */
  currentSpanId(): string | null;
}

// ── Sink ───────────────────────────────────────────────────────────────

/** Where log records are written. Override for tests. */
export type LogSink = (record: LogRecord) => void;

let activeSink: LogSink = defaultSink;

/** Replace the process-wide sink. Pass `null` to restore the default. */
export function setLogSink(sink: LogSink | null): void {
  activeSink = sink ?? defaultSink;
}

function defaultSink(record: LogRecord): void {
  const line = JSON.stringify(record);
  // Map levels to console.* so devtools colors and log-level filtering
  // continue to work. Anything at warn+ goes to stderr so the desktop
  // sidecar's "errors only" tail keeps working.
  switch (record.level) {
    case "error":
      console.error(line);
      return;
    case "warn":
      console.warn(line);
      return;
    default:
      console.log(line);
  }
}

// ── Span context (module-scoped) ───────────────────────────────────────

const OPEN_SPANS = new Map<string, Span>();

function registerSpan(span: Span): void {
  OPEN_SPANS.set(span.id, span);
}

function unregisterSpan(span: Span): void {
  OPEN_SPANS.delete(span.id);
}

function currentSpanForLogger(loggerName: string): Span | null {
  // Pick the most recently opened span for this logger if there are
  // nested ones. Map iteration order is insertion order in V8, so the
  // last-inserted match is the innermost.
  let match: Span | null = null;
  for (const span of OPEN_SPANS.values()) {
    if (span.target === loggerName) match = span;
  }
  return match;
}

// ── Logger factory ─────────────────────────────────────────────────────

/**
 * Create a logger that auto-prefixes every record with the supplied `name`.
 * The name is meant to be the package or component that owns the logger —
 * it shows up as the `target` field in the emitted JSON, mirroring the
 * Rust `tracing` target convention.
 */
export function createLogger(name: string): Logger {
  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    const span = currentSpanForLogger(name);
    const record: LogRecord = {
      ts: Date.now(),
      level,
      target: name,
      msg,
    };
    if (fields !== undefined) record.fields = fields;
    if (span !== null) record.span = span.id;
    activeSink(record);
  }

  return {
    name,
    trace: (msg, fields) => emit("trace", msg, fields),
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    hasOpenSpan: () => currentSpanForLogger(name) !== null,
    currentSpanId: () => currentSpanForLogger(name)?.id ?? null,
  };
}

// Re-exports the internal registry hooks for the tracing module so it
// doesn't have to grow its own state — single source of truth.
export const _internal = {
  registerSpan,
  unregisterSpan,
};
