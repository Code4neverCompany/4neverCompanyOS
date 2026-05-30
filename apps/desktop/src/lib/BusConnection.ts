// Story 2.11 (NEVAAA-31) — bus relay connection-state subscription.
//
// Companion to BusSubscription (Story 2.9). Where BusSubscription streams the
// envelopes themselves, this streams the *connection state* of the relay's
// Paperclip SSE supervision loop: connecting → connected → reconnecting (with
// an attempt count + backoff delay) and back. The Story 2.10 channel panel
// uses it to show a "reconnecting…" status bar with the attempt count while
// Paperclip is restarting, then resume the live feed once connected.
//
// Backed by the Rust `bus_connection_subscribe` / `bus_connection_unsubscribe`
// commands (apps/desktop/src-tauri/src/ipc/mod.rs). The current state is
// delivered immediately on subscribe, then every transition.
//
// Like BusSubscription / PtyTail this is an imperative non-React class so it
// survives StrictMode double-mounts. Always call dispose() on unmount.

import { invoke, Channel } from "@tauri-apps/api/core";

/** Live connection state of the bus relay's Paperclip SSE supervision loop. */
export type BusConnectionState =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "reconnecting"; attempt: number; delayMs: number };

/** Callback fired with the current state and on every transition. */
export type BusConnectionHandler = (state: BusConnectionState) => void;

export interface BusConnectionOptions {
  /** Called with the current state immediately, then on each transition. */
  onState: BusConnectionHandler;
}

/**
 * A live subscription to the relay's connection state.
 *
 * ```ts
 * const conn = new BusConnection({ onState: (s) => setStatus(s) });
 * await conn.start();
 * // …later, on unmount…
 * await conn.dispose();
 * ```
 */
export class BusConnection {
  private readonly onState: BusConnectionHandler;

  private channel: Channel<BusConnectionState> | null = null;
  private subscriptionId: string | null = null;
  private started = false;
  private disposed = false;

  constructor(opts: BusConnectionOptions) {
    this.onState = opts.onState;
  }

  /**
   * Open the subscription. Idempotent: subsequent calls are no-ops once
   * started (or after dispose).
   */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;

    this.channel = new Channel<BusConnectionState>();
    this.channel.onmessage = (state) => {
      if (!this.disposed) this.onState(state);
    };

    this.subscriptionId = await invoke<string>("bus_connection_subscribe", {
      onState: this.channel,
    });
  }

  /**
   * Stop the subscription and release the backend stream task. Safe to call
   * multiple times.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.subscriptionId) {
      try {
        await invoke("bus_connection_unsubscribe", {
          subscriptionId: this.subscriptionId,
        });
      } catch {
        // Backend already torn down (app exiting) — non-fatal.
      }
    }
    this.subscriptionId = null;
    this.channel = null;
  }
}
