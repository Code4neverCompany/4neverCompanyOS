// Story 2.10 (NEVAAA-30) — session-scoped store backing the channel-view
// panel.
//
// A module-level singleton so the live feed, the active filter, and the
// pause state all survive the panel being collapsed/expanded (i.e. the
// ChannelsView unmounting and remounting as the user navigates the side
// rail) within a single app session. The underlying BusSubscription
// (Story 2.9) is opened lazily on first mount and kept alive for the
// session — events keep accumulating into the rolling buffer even while
// the panel isn't visible, so reopening it shows recent traffic.
//
// Exposed as a useSyncExternalStore source: `subscribe` registers a
// listener and `getSnapshot` returns the current immutable state. The
// snapshot reference only changes when state actually changes, so React
// bails out of redundant re-renders.

import { BusSubscription } from "./BusSubscription";
import { BusConnection, type BusConnectionState } from "./BusConnection";
import type { BusEnvelope } from "@c4n/core";
import { appendCapped, EMPTY_FILTER, type ChannelFilter } from "./busChannelFeed";

/** A buffered envelope plus a monotonic sequence id for stable React keys. */
export interface FeedEvent {
  /** Monotonic id assigned on ingest — unique even if two envelopes share an id. */
  seq: number;
  envelope: BusEnvelope;
}

export interface ChannelState {
  events: ReadonlyArray<FeedEvent>;
  paused: boolean;
  filter: ChannelFilter;
  /** Whether the backend subscription has successfully opened. */
  connected: boolean;
  /**
   * Live connection state of the relay's Paperclip SSE link (Story 2.11).
   * Drives the status bar: "reconnecting… (attempt N)" while Paperclip is
   * restarting, then back to the live feed once `connected`.
   */
  connection: BusConnectionState;
}

class BusChannelStore {
  private events: FeedEvent[] = [];
  private paused = false;
  private filter: ChannelFilter = EMPTY_FILTER;
  private connected = false;
  private connection: BusConnectionState = { state: "connecting" };

  private seq = 0;
  private sub: BusSubscription | null = null;
  private conn: BusConnection | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: ChannelState = this.build();

  private build(): ChannelState {
    return {
      events: this.events,
      paused: this.paused,
      filter: this.filter,
      connected: this.connected,
      connection: this.connection,
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ChannelState => this.snapshot;

  /**
   * Open the bus subscription if it isn't already. Idempotent — safe to
   * call from every ChannelsView mount. The subscription is intentionally
   * never disposed: it lives for the app session so the feed survives
   * panel collapse/expand.
   */
  ensureStarted(): void {
    if (this.sub) return;
    this.sub = new BusSubscription({
      onEvent: (envelope) => this.ingest(envelope),
      // Malformed frames are surfaced by BusSubscription's default warning;
      // the panel just skips them rather than rendering garbage.
      onInvalid: () => {},
    });
    void this.sub
      .start()
      .then(() => {
        this.connected = true;
        this.emit();
      })
      .catch(() => {
        this.connected = false;
        this.emit();
      });

    // Story 2.11: track the relay's live Paperclip link so the status bar can
    // show "reconnecting… (attempt N)" during a restart, then resume.
    this.conn = new BusConnection({
      onState: (connection) => {
        this.connection = connection;
        this.emit();
      },
    });
    void this.conn.start().catch(() => {});
  }

  private ingest(envelope: BusEnvelope): void {
    // When paused, the live feed is frozen: drop incoming envelopes rather
    // than buffering them, matching the user's intent to hold the view
    // steady while inspecting.
    if (this.paused) return;
    this.events = appendCapped(this.events, { seq: this.seq++, envelope });
    this.emit();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.emit();
  }

  togglePaused(): void {
    this.setPaused(!this.paused);
  }

  setFilter(filter: ChannelFilter): void {
    this.filter = filter;
    this.emit();
  }

  clear(): void {
    if (this.events.length === 0) return;
    this.events = [];
    this.emit();
  }
}

/** The single session-scoped channel store. */
export const busChannelStore = new BusChannelStore();
