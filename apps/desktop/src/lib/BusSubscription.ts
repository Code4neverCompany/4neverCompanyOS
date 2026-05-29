// Story 2.9 (NEVAAA-29) — bus relay → desktop UI subscription.
//
// Bridges the Rust bus relay (Story 2.7) to the webview. The Rust
// `bus_subscribe` command (apps/desktop/src-tauri/src/ipc/mod.rs) opens a
// per-subscription drain task that pushes every relayed envelope — already
// mapped to the canonical `@c4n/core` `BusEnvelope` wire shape (Story 2.8) —
// through a Tauri Channel. `bus_unsubscribe` tears that task down by id.
//
// Architecture: D-3 (bus over IPC). The Story 2.10 channel-view panel
// consumes this class.
//
// React + StrictMode: like PtyTail, this is an imperative non-React class so
// it survives StrictMode double-mounts. Always call dispose() on unmount so
// the backend drain task stops promptly.

import { invoke, Channel } from "@tauri-apps/api/core";
import { BusEnvelopeSchema, type BusEnvelope } from "@c4n/core";

/** Callback fired for every envelope received from the bus. */
export type BusEnvelopeHandler = (envelope: BusEnvelope) => void;

export interface BusSubscriptionOptions {
  /**
   * Called for each envelope. When `validate` is true (the default) the
   * envelope has already passed `BusEnvelopeSchema.parse`, so its `payload`
   * is narrowed by `type`.
   */
  onEvent: BusEnvelopeHandler;
  /**
   * Called when an inbound frame fails canonical-schema validation. Defaults
   * to a console warning. Only used when `validate` is true.
   */
  onInvalid?: (raw: unknown, error: unknown) => void;
  /**
   * Validate each frame against the `@c4n/core` `BusEnvelopeSchema` before
   * dispatching. Defaults to true so consumers get a typed, narrowed
   * envelope and malformed frames are surfaced rather than silently passed
   * through. Set false to accept raw frames (e.g. forward-compat event types
   * the current schema doesn't yet know).
   */
  validate?: boolean;
}

/**
 * A live subscription to the message bus.
 *
 * ```ts
 * const sub = new BusSubscription({ onEvent: (e) => console.log(e.type) });
 * await sub.start();
 * // …later, on unmount…
 * await sub.dispose();
 * ```
 *
 * The connection survives window minimize/restore: the backend drain task
 * runs independently of window state and the relay buffers envelopes, so no
 * messages are dropped while the window is hidden.
 */
export class BusSubscription {
  private readonly onEvent: BusEnvelopeHandler;
  private readonly onInvalid: (raw: unknown, error: unknown) => void;
  private readonly validate: boolean;

  private channel: Channel<unknown> | null = null;
  private subscriptionId: string | null = null;
  private started = false;
  private disposed = false;

  constructor(opts: BusSubscriptionOptions) {
    this.onEvent = opts.onEvent;
    this.validate = opts.validate ?? true;
    this.onInvalid =
      opts.onInvalid ??
      ((raw, error) =>
        console.warn("[BusSubscription] dropped invalid bus envelope", error, raw));
  }

  /**
   * Open the subscription. Idempotent: subsequent calls are no-ops once
   * started (or after dispose).
   */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;

    this.channel = new Channel<unknown>();
    this.channel.onmessage = (raw) => this.dispatch(raw);

    // Returns the subscription id we hand back to bus_unsubscribe on teardown.
    this.subscriptionId = await invoke<string>("bus_subscribe", {
      onEvent: this.channel,
    });
  }

  private dispatch(raw: unknown): void {
    if (this.disposed) return;
    if (!this.validate) {
      this.onEvent(raw as BusEnvelope);
      return;
    }
    const result = BusEnvelopeSchema.safeParse(raw);
    if (result.success) {
      this.onEvent(result.data);
    } else {
      this.onInvalid(raw, result.error);
    }
  }

  /**
   * Stop the subscription and release the backend drain task. Safe to call
   * multiple times.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.subscriptionId) {
      try {
        await invoke("bus_unsubscribe", { subscriptionId: this.subscriptionId });
      } catch {
        // Backend already torn down (app exiting) — non-fatal.
      }
    }
    this.subscriptionId = null;
    this.channel = null;
  }
}
