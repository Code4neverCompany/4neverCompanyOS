// @c4n/observability/tracing — minimal named-span helper.
//
// Why a hand-rolled span tracer instead of @opentelemetry/api?
//   - We don't need distributed context propagation across services yet
//     (the desktop is a single Tauri process; the relay is a sidecar).
//   - We don't need to ship spans to an OTel collector right now — the
//     telemetry package rolls spans up into log-derived aggregates.
//   - A 60-line implementation is cheaper to audit than 50 transitive
//     deps, and matches the simplicity of the existing `console.*` story.
//
// Span shape (mirrors the Rust side's `tracing::Span` fields):
//   {
//     id, name, target, fields,
//     startTs,        // unix millis
//     endTs?: number  // set by end()
//   }
//
// Usage:
//   const span = startSpan("spawn-persona", { persona: "dev" });
//   logger.info("starting spawn");
//   span.end(); // records duration in fields.durMs
//
// A logger carrying `currentSpanId()` can attach the span id to every log
// line, so the aggregator in @c4n/telemetry can tie log lines to spans.

import { _internal } from "./logger.js";

export const PACKAGE_NAME = "@c4n/observability/tracing" as const;

// ── Types ──────────────────────────────────────────────────────────────

export interface SpanFields {
  [key: string]: unknown;
}

export interface Span {
  readonly id: string;
  readonly name: string;
  /** Owning package / component (e.g. "@c4n/desktop"). */
  readonly target: string;
  /** Mutable: enriched as the span runs. `durMs` is filled in on `end()`. */
  fields: SpanFields;
  /** Unix millis when startSpan was called. */
  readonly startTs: number;
  /** Unix millis when end() was called. `null` while open. */
  endTs: number | null;
  /** Mark the span ended and stamp its duration. */
  end(extraFields?: SpanFields): void;
  /** Mark the span as failed; duration is still recorded. */
  fail(extraFields?: SpanFields): void;
  /** True until end() / fail() has been called. */
  readonly open: boolean;
}

interface StartSpanOptions {
  /** Optional fields to stamp on the span at creation. */
  fields?: SpanFields;
  /** Optional caller-supplied id. Defaults to a random one. */
  id?: string;
}

// ── Span id generator ─────────────────────────────────────────────────

let spanCounter = 0;

function generateSpanId(): string {
  spanCounter += 1;
  // Cheap, monotonic, unique-enough. We don't need RFC-4122 — this id is
  // never persisted to disk and never crosses a network boundary.
  return `span-${Date.now().toString(36)}-${spanCounter.toString(36)}`;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Open a named span for `target`. Returns the span; call `end()` (or
 * `fail()`) when the work is done. Spans are scoped to the running
 * process — there is no cross-process propagation in v0.
 */
export function startSpan(
  name: string,
  targetOrOptions?: string | StartSpanOptions,
  maybeOptions?: StartSpanOptions,
): Span {
  // Tolerate both (name, target) and (name, options) call shapes so the
  // API doesn't break when the caller doesn't care about the target.
  let target: string;
  let options: StartSpanOptions;
  if (typeof targetOrOptions === "string" || targetOrOptions === undefined) {
    target = targetOrOptions ?? "global";
    options = maybeOptions ?? {};
  } else {
    target = "global";
    options = targetOrOptions;
  }

  const id = options.id ?? generateSpanId();
  const fields: SpanFields = { ...(options.fields ?? {}) };

  let ended = false;
  const span: Span = {
    id,
    name,
    target,
    fields,
    startTs: Date.now(),
    endTs: null,
    get open() {
      return !ended;
    },
    end(extra?: SpanFields) {
      if (ended) return;
      ended = true;
      if (extra) Object.assign(span.fields, extra);
      span.fields["durMs"] = Date.now() - span.startTs;
      span.endTs = Date.now();
      _internal.unregisterSpan(span);
    },
    fail(extra?: SpanFields) {
      if (ended) return;
      ended = true;
      if (extra) Object.assign(span.fields, extra);
      span.fields["durMs"] = Date.now() - span.startTs;
      span.fields["failed"] = true;
      span.endTs = Date.now();
      _internal.unregisterSpan(span);
    },
  };

  _internal.registerSpan(span);
  return span;
}
