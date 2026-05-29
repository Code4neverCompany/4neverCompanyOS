// Story 2.10 (NEVAAA-30) — pure helpers for the channel-view panel.
//
// DOM- and Tauri-free so they're unit-testable without a browser: the
// ChannelsView component and the busChannelStore both consume these. The
// store handles the live subscription + buffering; this module owns the
// pure transforms (preview, timestamp formatting, filtering).

import type { BusEnvelope } from "@c4n/core";

/**
 * Cap on the number of envelopes the feed retains in memory. The store
 * keeps a rolling window of the most recent events so a long-running
 * session can't grow the buffer unbounded.
 */
export const MAX_FEED_EVENTS = 500;

/** Default truncation length for the inline payload preview. */
export const PAYLOAD_PREVIEW_MAX = 80;

/** Active feed filter. `null` on a field means "no filter for this field". */
export interface ChannelFilter {
  /** Restrict to a single source agent id, or null for all. */
  agent: string | null;
  /** Restrict to a single bus event type, or null for all. */
  type: string | null;
}

/** The empty filter — everything passes. */
export const EMPTY_FILTER: ChannelFilter = { agent: null, type: null };

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Truncate to `max` chars, appending an ellipsis when clipped. */
export function truncate(text: string, max = PAYLOAD_PREVIEW_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Build a compact one-line preview of an envelope's payload — a
 * whitespace-collapsed `key=value` summary, truncated to `max` chars.
 * Returns an empty string for an empty/absent payload.
 */
export function payloadPreview(envelope: BusEnvelope, max = PAYLOAD_PREVIEW_MAX): string {
  const payload = (envelope as { payload?: unknown }).payload;
  let text: string;
  if (payload && typeof payload === "object") {
    text = Object.entries(payload as Record<string, unknown>)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(" ");
  } else {
    text = formatValue(payload);
  }
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/**
 * Format a Unix-millisecond timestamp as a local `HH:MM:SS.mmm` clock
 * string. Stable, fixed-width shape for the monospace feed column.
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

/** True when an envelope passes the given filter (both fields are AND-ed). */
export function eventMatchesFilter(envelope: BusEnvelope, filter: ChannelFilter): boolean {
  if (filter.agent && envelope.source !== filter.agent) return false;
  if (filter.type && envelope.type !== filter.type) return false;
  return true;
}

/**
 * Distinct source agent ids seen in the feed, sorted alphabetically — the
 * option set for the agent filter dropdown.
 */
export function collectAgents(envelopes: ReadonlyArray<BusEnvelope>): string[] {
  return [...new Set(envelopes.map((e) => e.source))].sort();
}

/**
 * Append `item` to the feed, trimming the oldest entries so the result
 * never exceeds `max`. Pure: returns a new array, never mutates the input.
 */
export function appendCapped<T>(items: ReadonlyArray<T>, item: T, max = MAX_FEED_EVENTS): T[] {
  const next = [...items, item];
  if (next.length > max) next.splice(0, next.length - max);
  return next;
}
