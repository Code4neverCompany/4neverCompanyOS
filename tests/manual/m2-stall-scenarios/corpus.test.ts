// M2 stall-detection validation corpus (Story 2.17 — SM-4 exit criterion).
//
// Executable, deterministic encoding of the 10 scenarios documented in
// ./README.md. Each scenario drives a StallDetector with fake timers so the
// whole corpus runs in-process (no Zellij/Tauri) and reproduces the same
// outcome on every run.
//
// This file lives under tests/manual/ and is NOT part of the default `pnpm test`
// include set. Run it on demand from the repo root:
//
//   pnpm --filter @c4n/stall-detector exec vitest run \
//     --root . tests/manual/m2-stall-scenarios/corpus.test.ts
//
// Mapping to the corpus README:
//   S1  cold-start-total-silence ............. INTERVENE
//   S2  spawn-burst-then-silence ............. INTERVENE
//   S3  chatter-without-progress ............. INTERVENE
//   S4  persona-crash-mid-task ............... INTERVENE
//   S5  exact-window-boundary ............... INTERVENE
//   S6  steady-artifact-stream .............. DO NOT INTERVENE
//   S7  productive-multi-kind-exchange ...... DO NOT INTERVENE
//   S8  signal-just-before-expiry ........... DO NOT INTERVENE
//   S9  slow-but-steady-near-threshold ...... DO NOT INTERVENE
//   S10 resume-after-stall ................. INTERVENE then RESUME

import { describe, it, expect, vi, afterEach } from "vitest";
import { StallDetector } from "../../../packages/stall-detector/src/index.js";
import { ProgressBus } from "../../../packages/progress-signal/src/index.js";

// Scaled clock: 5 s window / 0.5 s poll. Fake timers make this instantaneous
// while preserving the same >= window boundary behaviour as the 5-min default.
const WINDOW = 5_000;
const POLL = 500;

afterEach(() => {
  vi.useRealTimers();
});

describe("M2 stall-detection corpus (Story 2.17)", () => {
  // ── Should INTERVENE ────────────────────────────────────────────────

  it("S1 cold-start-total-silence → intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // Persona spawns, then produces nothing for longer than the window.
    vi.advanceTimersByTime(WINDOW + POLL);

    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();
    expect(onStall.mock.calls[0][0].lastSignal).toBeNull();
    det.stop();
  });

  it("S2 spawn-burst-then-silence → intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // A burst of early progress (scaffolding files), then it goes quiet.
    ProgressBus.emitArtifact("/vault/personas/dev/log/a.jsonl");
    ProgressBus.emitArtifact("/vault/personas/dev/log/b.jsonl");
    ProgressBus.emitArtifact("/vault/personas/dev/log/c.jsonl");

    vi.advanceTimersByTime(WINDOW + POLL);

    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();
    // Stall event carries the last real signal seen before the silence.
    expect(onStall.mock.calls[0][0].lastSignal?.path).toBe("/vault/personas/dev/log/c.jsonl");
    det.stop();
  });

  it("S3 chatter-without-progress → intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // The persona is emitting terminal chatter the whole time, but chatter is
    // NOT a progress signal — only artifact/code/story changes are. So the bus
    // stays silent and the detector must intervene. This is the core SM-4 case.
    vi.advanceTimersByTime(WINDOW + POLL);

    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();
    det.stop();
  });

  it("S4 persona-crash-mid-task → intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // Work in progress, then the process dies → no further signals ever.
    ProgressBus.emitCode("/project/src/feature.ts");
    vi.advanceTimersByTime(WINDOW * 0.4);
    ProgressBus.emitCode("/project/src/feature.ts");

    // Crash: silence from here on.
    vi.advanceTimersByTime(WINDOW + POLL);

    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();
    expect(onStall.mock.calls[0][0].lastSignal?.kind).toBe("code.changed");
    det.stop();
  });

  it("S5 exact-window-boundary → intervene (>= is inclusive)", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    ProgressBus.emitArtifact("/vault/personas/dev/log/boundary.jsonl");

    // Silence reaches exactly the window length; tick uses `silence >= windowMs`,
    // so the boundary itself counts as a stall (documents threshold inclusivity).
    vi.advanceTimersByTime(WINDOW);

    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();
    det.stop();
  });

  // ── Should NOT INTERVENE ────────────────────────────────────────────

  it("S6 steady-artifact-stream → no intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // Healthy persona writes an artifact well within each window, across a span
    // far longer than a single window.
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(WINDOW * 0.4);
      ProgressBus.emitArtifact(`/vault/personas/dev/log/step-${i}.jsonl`);
    }

    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("S7 productive-multi-kind-exchange → no intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // All three signal kinds keep the window alive (artifact, code, story.state).
    const emitters = [
      () => ProgressBus.emitArtifact("/vault/notes.md"),
      () => ProgressBus.emitCode("/project/src/index.ts"),
      () => ProgressBus.emit({ kind: "story.state", path: "2-17-corpus", ts: Date.now() }),
    ];
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(WINDOW * 0.5);
      emitters[i % emitters.length]!();
    }

    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("S8 signal-just-before-expiry → no intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // A signal lands just before the window would expire, resetting it. Total
    // elapsed time exceeds one window, but no individual gap does.
    vi.advanceTimersByTime(WINDOW - POLL);
    ProgressBus.emitArtifact("/vault/just-in-time.md");
    vi.advanceTimersByTime(WINDOW - POLL);

    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  it("S9 slow-but-steady-near-threshold → no intervene", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall });
    det.start(ProgressBus);

    // Each gap is 90% of the window — slow, but still genuine progress. This is
    // the near-threshold case that drives tuning (OQ-E / OQ-H).
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(WINDOW * 0.9);
      ProgressBus.emitArtifact(`/vault/slow-${i}.md`);
    }

    expect(onStall).not.toHaveBeenCalled();
    expect(det.isStalling).toBe(false);
    det.stop();
  });

  // ── Lifecycle: INTERVENE then RESUME ────────────────────────────────

  it("S10 resume-after-stall → intervene then resume clears it", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const onResume = vi.fn();
    const det = new StallDetector({ windowMs: WINDOW, pollIntervalMs: POLL, onStall, onResume });
    det.start(ProgressBus);

    // Stall first…
    vi.advanceTimersByTime(WINDOW + POLL);
    expect(det.isStalling).toBe(true);
    expect(onStall).toHaveBeenCalledOnce();

    // …then the persona comes back to life → resume fires, stall clears.
    ProgressBus.emitArtifact("/vault/personas/dev/log/recovered.jsonl");
    expect(det.isStalling).toBe(false);
    expect(onResume).toHaveBeenCalledOnce();
    det.stop();
  });
});
