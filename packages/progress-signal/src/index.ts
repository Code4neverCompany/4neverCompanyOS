// @c4n/progress-signal — Progress-signal producers for the stall-detector.
//
// Three signal types (Story 2.12-2.13, M4 Story 4.5):
//   artifact.changed  — a file inside the vault directory changed
//   code.changed      — a file inside the project code directory changed
//   story.state       — a BMAD story transitioned state (M4)
//
// Architecture: D-4 (progress-signal sits between file-system events and
// the stall-detector's rolling window). In production the Rust side
// (crates/platform-fs) emits Tauri events; the desktop app bridges those
// events into ProgressBus in its initialization code.
//
// This package contains only the bus abstraction and signal types.
// The Tauri bridge lives in the app layer (apps/desktop) where the
// @tauri-apps/api dependency is available.

export const PACKAGE_NAME = "@c4n/progress-signal" as const;

// ── Signal types ──────────────────────────────────────────────────────

export type SignalKind = "artifact.changed" | "code.changed" | "story.state";

export interface ProgressSignal {
  kind: SignalKind;
  /** Absolute path that changed (for artifact/code), or story slug (for story.state). */
  path: string;
  /** Unix millis. */
  ts: number;
}

// ── ProgressBus ───────────────────────────────────────────────────────
//
// Lightweight in-process event bus. Callers subscribe and the bus
// dispatches to all listeners on emit.
//
// In the desktop app, a Tauri event listener calls `ProgressBus.emit()`
// whenever the Rust side fires a "progress-signal" event.
// In test environments, inject signals directly with `ProgressBus.emit()`.

type SignalCallback = (signal: ProgressSignal) => void;

class ProgressBusImpl {
  private listeners = new Set<SignalCallback>();

  /** Register a callback. Returns an unsubscribe function. */
  subscribe(cb: SignalCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Emit a progress signal to all registered listeners. */
  emit(signal: ProgressSignal): void {
    for (const cb of this.listeners) {
      try {
        cb(signal);
      } catch {
        // listeners must not crash the bus
      }
    }
  }

  /** Convenience: emit an artifact.changed signal. */
  emitArtifact(path: string): void {
    this.emit({ kind: "artifact.changed", path, ts: Date.now() });
  }

  /** Convenience: emit a code.changed signal. */
  emitCode(path: string): void {
    this.emit({ kind: "code.changed", path, ts: Date.now() });
  }
}

export const ProgressBus = new ProgressBusImpl();
