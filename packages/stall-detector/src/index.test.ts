// Stall-detector unit tests (Story 2.14 acceptance criteria verification).
//
// Tests use the module-level ProgressBus and fake timers so they run
// fully in-process without Zellij/Tauri.

import { describe, it, expect, vi, afterEach } from "vitest";
import { StallDetector } from "./index.js";
import { ProgressBus } from "@c4n/progress-signal";

afterEach(() => {
  vi.useRealTimers();
});

// ── Rolling window tests ──────────────────────────────────────────────

describe("StallDetector", () => {
  it("starts without stalling", () => {
    const det = new StallDetector({ windowMs: 1000, pollIntervalMs: 50 });
    det.start();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("declares stall after windowMs with no signals", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: 500, pollIntervalMs: 100, onStall });
    det.start(ProgressBus);

    vi.advanceTimersByTime(600);

    expect(onStall).toHaveBeenCalledOnce();
    expect(det.isStalling).toBe(true);
    det.stop();
  });

  it("clears stall when a signal arrives after stall", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const onResume = vi.fn();
    const det = new StallDetector({ windowMs: 500, pollIntervalMs: 100, onStall, onResume });
    det.start(ProgressBus);

    vi.advanceTimersByTime(600);
    expect(det.isStalling).toBe(true);

    ProgressBus.emitArtifact("/vault/personas/dev/log/2026-05-29.jsonl");
    expect(det.isStalling).toBe(false);
    expect(onResume).toHaveBeenCalledOnce();
    det.stop();
  });

  it("does not stall while signals keep arriving", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: 500, pollIntervalMs: 100, onStall });
    det.start(ProgressBus);

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(200);
      ProgressBus.emitArtifact("/vault/test.md");
    }

    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("stop() prevents further stall callbacks", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: 200, pollIntervalMs: 50, onStall });
    det.start(ProgressBus);
    det.stop();

    vi.advanceTimersByTime(500);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("silenceDurationMs increases over time", () => {
    vi.useFakeTimers();
    const det = new StallDetector({ windowMs: 10_000, pollIntervalMs: 1_000 });
    det.start(ProgressBus);

    vi.advanceTimersByTime(3_000);
    expect(det.silenceDurationMs).toBeGreaterThanOrEqual(3_000);
    det.stop();
  });
});

// ── Smoke test: signal → stall-detect integration ────────────────────
//
// Validates Story 2.14 acceptance criterion:
// "Hermes stall-detector receives progress signals from spawned personas."
//
// In production: persona supervisor writes log → platform-fs watcher fires →
// Tauri event → ProgressBus.emit() → StallDetector.onSignal().
// This test verifies the ProgressBus → StallDetector segment.

describe("spawn-to-stall smoke (unit boundary)", () => {
  it("artifact signal from persona suppresses stall within window", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();

    const det = new StallDetector({ windowMs: 1_000, pollIntervalMs: 200, onStall });
    det.start(ProgressBus);

    vi.advanceTimersByTime(500);
    // Simulate persona supervisor emitting an artifact.changed signal.
    ProgressBus.emitArtifact("/vault/personas/dev/log/2026-05-29.jsonl");

    vi.advanceTimersByTime(500); // still within window from last signal
    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("stall fires after full window of silence post-spawn", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();

    const det = new StallDetector({ windowMs: 500, pollIntervalMs: 100, onStall });
    det.start(ProgressBus);

    // One initial signal (persona spawned → artifact written).
    ProgressBus.emitArtifact("/vault/personas/dev/log/2026-05-29.jsonl");

    // Then silence for longer than the window.
    vi.advanceTimersByTime(600);

    expect(onStall).toHaveBeenCalledOnce();
    const event = onStall.mock.calls[0][0];
    expect(event.lastSignal?.path).toBe("/vault/personas/dev/log/2026-05-29.jsonl");
    det.stop();
  });
});
