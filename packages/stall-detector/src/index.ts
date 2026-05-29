// @c4n/stall-detector — Rolling-window stall detection (Story 2.14-2.17).
//
// Algorithm (D-5):
//   - Track progress signals from @c4n/progress-signal over a rolling window.
//   - If the window elapses with zero signals, a "stall" is declared.
//   - Hermes receives stall-detected events and decides whether to intervene.
//
// Usage:
//   const detector = new StallDetector({ windowMs: 300_000 }); // 5 min
//   detector.start(ProgressBus);
//   // later:
//   detector.stop();

import { ProgressBus, type ProgressSignal } from "@c4n/progress-signal";

export const PACKAGE_NAME = "@c4n/stall-detector" as const;

// ── Types ─────────────────────────────────────────────────────────────

export interface StallDetectorOptions {
  /** Rolling window length in milliseconds. Default: 300_000 (5 min). */
  windowMs?: number;
  /** How often to check whether the window has expired. Default: 10_000 (10 s). */
  pollIntervalMs?: number;
  /** Called when a stall is declared. */
  onStall?: (event: StallEvent) => void;
  /** Called when a stall is cleared (new progress signal received after stall). */
  onResume?: (event: ResumeEvent) => void;
}

export interface StallEvent {
  /** Unix millis when the stall was declared. */
  ts: number;
  /** Duration since last progress signal (ms). */
  silenceDurationMs: number;
  /** The last signal received before the stall (null if no signals ever). */
  lastSignal: ProgressSignal | null;
}

export interface ResumeEvent {
  /** Unix millis when the resume was detected. */
  ts: number;
  /** The signal that cleared the stall. */
  signal: ProgressSignal;
}

// ── StallDetector class ───────────────────────────────────────────────

export class StallDetector {
  private readonly windowMs: number;
  private readonly pollIntervalMs: number;
  private readonly stallCb: ((e: StallEvent) => void) | null;
  private readonly resumeCb: ((e: ResumeEvent) => void) | null;

  private lastSignalTs: number | null = null;
  private lastSignalRecord: ProgressSignal | null = null;
  private stalling = false;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: StallDetectorOptions = {}) {
    this.windowMs = opts.windowMs ?? 300_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 10_000;
    this.stallCb = opts.onStall ?? null;
    this.resumeCb = opts.onResume ?? null;
  }

  /** Start watching for stalls. Can be called with a custom bus for testing. */
  start(bus: typeof ProgressBus = ProgressBus): void {
    if (this.pollHandle !== null) return; // already running

    this.lastSignalTs = Date.now(); // treat start as implicit progress

    this.unsubscribe = bus.subscribe((signal: ProgressSignal) => {
      this.onSignal(signal);
    });

    this.pollHandle = setInterval(() => {
      this.tick();
    }, this.pollIntervalMs);
  }

  /** Stop the detector and release resources. */
  stop(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.stalling = false;
  }

  /** Whether the detector is currently in a stall state. */
  get isStalling(): boolean {
    return this.stalling;
  }

  /** Last signal received (null if none). */
  get lastSignal(): ProgressSignal | null {
    return this.lastSignalRecord;
  }

  /** Milliseconds since the last progress signal (or since start if no signals). */
  get silenceDurationMs(): number {
    const ref = this.lastSignalTs ?? Date.now();
    return Date.now() - ref;
  }

  // ── Internal ───────────────────────────────────────────────────────

  private onSignal(signal: ProgressSignal): void {
    const wasStalling = this.stalling;
    this.lastSignalTs = signal.ts;
    this.lastSignalRecord = signal;
    this.stalling = false;

    if (wasStalling && this.resumeCb) {
      this.resumeCb({ ts: Date.now(), signal });
    }
  }

  private tick(): void {
    const silence = this.silenceDurationMs;
    if (silence >= this.windowMs && !this.stalling) {
      this.stalling = true;
      if (this.stallCb) {
        this.stallCb({
          ts: Date.now(),
          silenceDurationMs: silence,
          lastSignal: this.lastSignalRecord,
        });
      }
    }
  }
}

// ── Module-level singleton for convenience ────────────────────────────
//
// Most callers use this; tests construct their own instance to isolate state.

export const defaultStallDetector = new StallDetector();
