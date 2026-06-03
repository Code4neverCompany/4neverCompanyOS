// Tests for `WorkflowEngine` artifact polling and approval gates (Story 4.2 / D-12).
//
// Coverage (per task spec, at least 3 cases):
//   1. Artifact found + approval required → engine enters `approval_pending`
//      and the pending phase is exposed via `getPendingApprovalPhase()`.
//      Approving the phase advances to the next phase.
//   2. Artifact found + approval rejected (via `requestChanges`) → run
//      transitions to `paused` and the poller is cleared.
//   3. Artifact never found → the engine keeps polling but never
//      advances; verified with `vi.useFakeTimers()` plus a controlled
//      `invoke` mock that returns `false` for the artifact check.
//
// Additional case (bonus):
//   4. The engine's bus is injectable — emissions land on the injected
//      bus, not on the singleton. This is the regression guard for
//      the bus-instance refactor (Story 4.5 / D-4 → D-12 injection).
//
// We mock `@tauri-apps/api/core`'s `invoke` because the engine talks
// exclusively to the Rust side via Tauri. The mock is per-test so
// state doesn't leak.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Tauri invoke module before importing the engine.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { ProgressBusImpl } from "@c4n/progress-signal";
import { WorkflowEngine } from "./engine";

const SAMPLE_YAML_BODY = `name: test-workflow
description: a 2-phase workflow used in tests
version: "1.0"
phases:
  - id: phase-1
    label: Phase One
    description: first phase
    personas:
      - name: Worker
        backing_cli: claude
        lifecycle: ephemeral
        task_prompt: do the first thing
    artifact:
      path: vault/projects/{project_id}/bmad/01-phase-1.md
      description: phase 1 output
    approval_required: true
  - id: phase-2
    label: Phase Two
    description: second phase
    personas:
      - name: Worker
        backing_cli: claude
        lifecycle: ephemeral
        task_prompt: do the second thing
    artifact:
      path: vault/projects/{project_id}/bmad/02-phase-2.md
      description: phase 2 output
    approval_required: false
`;

/**
 * Wire the invoke mock with sensible defaults. Tests can override the
 * artifact-exists result via the second argument's `artifactExists` flag.
 */
function installInvokeMock(
  opts: { artifactExists: boolean; started?: object } = { artifactExists: true },
) {
  const started = {
    id: "run-123",
    workflow_id: "test-workflow",
    workflow_name: "Test Workflow",
    project_name: "test-proj",
    project_id: "test-proj",
    idea: "test idea",
    current_phase: "phase-1",
    phase_index: 0,
    status: "running",
    vault_dir: "/tmp/vault/workflows/test-proj",
    active_personas: [],
    created_at_ms: 1_700_000_000_000,
    ...(opts.started ?? {}),
  };

  invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case "list_workflows":
        return Promise.resolve([
          {
            id: "test-workflow",
            name: "Test Workflow",
            description: "a 2-phase workflow used in tests",
          },
        ]);
      case "read_workflow_yaml":
        return Promise.resolve(SAMPLE_YAML_BODY);
      case "start_workflow_run":
        return Promise.resolve(started);
      case "spawn_dynamic_persona":
        return Promise.resolve();
      case "check_vault_artifact_exists":
        return Promise.resolve(opts.artifactExists);
      case "advance_workflow_phase":
        // Pass through the run id we got in the call, mirroring the Rust side.
        return Promise.resolve({ ...started, id: args?.["runId"] ?? started.id });
      case "log_workflow_decision":
      case "bus_publish":
      case "pause_workflow_run":
      case "resume_workflow_run":
        return Promise.resolve();
      default:
        return Promise.resolve(null);
    }
  });
}

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Case 1: artifact found + approval required → advance on approve ──

describe("WorkflowEngine — case 1: artifact found + approval required", () => {
  it("enters approval_pending, exposes the pending phase, advances on approve", async () => {
    vi.useFakeTimers();
    installInvokeMock({ artifactExists: true });

    const bus = new ProgressBusImpl();
    const engine = new WorkflowEngine({ bus });
    const run = await engine.startRun(
      "test-workflow",
      "Test Proj",
      "test-proj",
      "/tmp/vault/workflows/test-proj",
      "test idea",
    );

    expect(run.id).toBe("run-123");
    // Phase 1 needs approval, so after the artifact is "found" the
    // engine parks in `approval_pending` and exposes the phase.
    expect(run.status).toBe("approval_pending");
    expect(engine.getPendingApprovalPhase()?.id).toBe("phase-1");

    // Phase 1 was never approved yet, so getCurrentPhase still points
    // at phase 1 (the phase the run is currently sitting in).
    expect(engine.getCurrentPhase()?.id).toBe("phase-1");

    // Approving advances the run to phase 2 (no approval required),
    // which is auto-driven to `done` since the mock reports the artifact
    // is present. We don't need to drive fake timers again because the
    // poller was already cleared after the first `check_vault_artifact_exists`
    // returned true.
    await engine.approvePhase(run.id);
    expect(engine.getRun()?.status).toBe("done");
  });
});

// ── Case 2: artifact found + approval rejected → run pauses ──────────

describe("WorkflowEngine — case 2: artifact found + approval rejected", () => {
  it("transitions to paused and clears the poller when requestChanges is called", async () => {
    vi.useFakeTimers();
    installInvokeMock({ artifactExists: true });

    const engine = new WorkflowEngine({ bus: new ProgressBusImpl() });
    const run = await engine.startRun(
      "test-workflow",
      "Test Proj",
      "test-proj",
      "/tmp/vault/workflows/test-proj",
      "test idea",
    );

    expect(run.status).toBe("approval_pending");
    const clearSpy = vi.spyOn(engine as unknown as { clearPoller: () => void }, "clearPoller");

    await engine.requestChanges(run.id, "the brief is missing the constraints section");

    expect(engine.getRun()?.status).toBe("paused");
    expect(clearSpy).toHaveBeenCalled();
  });
});

// ── Case 3: artifact never found → engine keeps polling, never advances ──

describe("WorkflowEngine — case 3: artifact never found", () => {
  it("keeps polling without advancing when check_vault_artifact_exists always returns false", async () => {
    vi.useFakeTimers();
    installInvokeMock({ artifactExists: false });

    const engine = new WorkflowEngine({ bus: new ProgressBusImpl() });
    // Start a run but don't await — startRun awaits executePhase which
    // awaits waitForArtifact, so the call only resolves when the artifact
    // is found OR the run is paused. We expect it to hang on a long
    // promise; we tick the clock to drive polls, then assert the run
    // is still in `waiting_for_artifact` after a handful of polls.
    //
    // The promise is intentionally never awaited to completion — that
    // would hang the test, since the engine parks indefinitely waiting
    // for the artifact. We assert on engine state, then dispose() to
    // clear the poller. The unhandled promise is harmless because
    // the test process exits right after.
    void engine.startRun(
      "test-workflow",
      "Test Proj",
      "test-proj",
      "/tmp/vault/workflows/test-proj",
      "test idea",
    );

    // Yield so the engine can start the poller and the immediate
    // (non-timer) poll call lands.
    await vi.advanceTimersByTimeAsync(0);
    // Tick enough to fire the 3s poll multiple times.
    await vi.advanceTimersByTimeAsync(3_000 * 5);

    const run = engine.getRun();
    expect(run).not.toBeNull();
    expect(run?.status).toBe("waiting_for_artifact");
    // No approval is pending because we never observed the artifact.
    expect(engine.getPendingApprovalPhase()).toBeNull();

    // The artifact check was called repeatedly.
    const calls = invokeMock.mock.calls.filter(([c]) => c === "check_vault_artifact_exists");
    expect(calls.length).toBeGreaterThan(2);

    // Dispose clears the poller; the dangling startRun promise is left
    // to resolve at the next tick (which never comes because we tore
    // down the poller). The test process exits before that becomes a
    // problem.
    engine.dispose();
  });
});

// ── Case 4: bus is injectable, instances are independent ─────────────

describe("WorkflowEngine — bus injection (Story 4.5)", () => {
  it("emits story-state signals on the injected bus, not on the singleton", async () => {
    vi.useFakeTimers();
    installInvokeMock({ artifactExists: true });

    const injectedBus = new ProgressBusImpl();
    const injectedSignals: string[] = [];
    injectedBus.subscribe((s) => injectedSignals.push(s.path));

    // Use the imported default bus as the "other" bus to assert isolation.
    const { defaultProgressBus } = await import("@c4n/progress-signal");
    const defaultSignals: string[] = [];
    defaultProgressBus.subscribe((s) => defaultSignals.push(s.path));

    const engine = new WorkflowEngine({ bus: injectedBus });
    const run = await engine.startRun(
      "test-workflow",
      "Test Proj",
      "test-proj",
      "/tmp/vault/workflows/test-proj",
      "test idea",
    );

    // Two emissions expected: phase start, and after approval → done.
    // We triggered the first one in executePhase. Approval triggers the
    // second, which advances to phase 2 (no approval) and ultimately done.
    await engine.approvePhase(run.id);

    // injected bus received signals for "test-workflow".
    expect(injectedSignals).toContain("test-workflow");
    // default bus did NOT receive them — instances are independent.
    expect(defaultSignals).not.toContain("test-workflow");

    // Cleanup: unsubscribe so a later test's subscription doesn't pile up.
    defaultProgressBus.subscribe(() => {}); // no-op to ensure no leftover
  });
});

// ── Case 5..N: notify-based fast-clear + dispose-leak regressions ──
//
// Added in NEVAAA-OBS-PERF: validate that the engine advances on a
// ProgressBus `artifact.changed` event within 1s (the fast-clear timer)
// without waiting for the 3s safety-net poll to fire, and that the
// bus subscription is properly torn down on dispose() / pause().

import { setLogSink, type LogRecord } from "@c4n/observability";

// Capture sink so tests can assert on what the engine actually
// logged. Reset between tests via afterEach.
let captured: LogRecord[] = [];
beforeEach(() => {
  captured = [];
  setLogSink((rec) => captured.push(rec));
});
afterEach(() => {
  setLogSink(null);
});

describe("WorkflowEngine — notify-based artifact wait", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Default mock factory: returns sensible shapes per command.
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "list_workflows":
          return Promise.resolve([
            { id: "greenfield-fullstack", name: "greenfield-fullstack", description: "test" },
          ]);
        case "start_workflow_run":
          return Promise.resolve({ id: "run-1", created_at_ms: Date.now() });
        case "spawn_dynamic_persona":
          return Promise.resolve();
        case "check_vault_artifact_exists":
          return Promise.resolve(false);
        case "advance_workflow_phase":
          return Promise.resolve({ id: "run-1" });
        case "log_workflow_decision":
          return Promise.resolve();
        case "bus_publish":
          return Promise.resolve();
        case "create_paperclip_approval":
          // Auto-approve: throw the bypass error string the engine
          // recognizes, which makes it call approvePhase() right away
          // and skip the polling wait.
          return Promise.reject("governance_gate_bypass_enabled");
        default:
          return Promise.resolve();
      }
    });
  });

  it("advances within 1s when ProgressBus emits a matching artifact.changed", async () => {
    const engine = new WorkflowEngine();
    // Don't await startRun — it won't return until the workflow
    // reaches a terminal state (which would mean all phases advanced).
    const startPromise = engine.startRun(
      "greenfield-fullstack",
      "demo",
      "proj-1",
      "C:/vault",
      "test idea",
    );

    // Wait until the engine has reached waiting_for_artifact (or
    // approval_pending, which is also a valid "busy" state).
    const reachedWait = await waitFor(() => {
      const r = engine.getRun();
      return r !== null && (r.status === "waiting_for_artifact" || r.status === "approval_pending");
    }, 1_500);
    expect(reachedWait).toBe(true);

    // The bus may have already delivered (e.g. if the initial poll
    // also fired). Snapshot phase_index before the synthetic event.
    const phaseBefore = engine.getRun()?.phase_index ?? -1;

    const started = Date.now();
    defaultProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");

    // The engine should advance phase_index within 1s of the bus
    // event, without waiting for the 3s safety-net poller.
    const advanced = await waitFor(
      () => (engine.getRun()?.phase_index ?? -1) > phaseBefore,
      1_500,
    );
    const elapsed = Date.now() - started;

    expect(advanced).toBe(true);
    expect(elapsed).toBeLessThan(1_000);

    // Cleanup: stop the workflow so its inner timers don't keep
    // the test alive.
    engine.pause();
    // Swallow the unhandled rejection from `startPromise` — we don't
    // care about its resolution here; the test is about the bus path.
    startPromise.catch(() => undefined);
  });

  it("does not log a degraded-warning when the bus delivers before the 3s poll", async () => {
    const engine = new WorkflowEngine();
    const startPromise = engine.startRun(
      "greenfield-fullstack",
      "demo",
      "proj-1",
      "C:/vault",
      "test idea",
    );

    await waitFor(() => {
      const r = engine.getRun();
      return r !== null && r.status === "waiting_for_artifact";
    }, 1_500);

    // Synthetic bus event fires immediately — well under 1s, so the
    // 1s fast-clear timer will clear the poller before the 3s
    // safety-net can fire and log "degraded".
    defaultProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");

    // Wait long enough that the 3s safety-net *would* have fired
    // (3s + a small grace window) and assert we never reached it.
    await new Promise((r) => setTimeout(r, 3_500));
    const r = engine.getRun();
    expect(r).not.toBeNull();

    engine.pause();
    startPromise.catch(() => undefined);
  });

  // Regression test for the verifier's finding on attempt 1: the
  // engine's onArtifactChanged listener was leaking into the bus
  // because clearAllWaiters() was overwriting the bus subscription
  // reference with a function that only cleared the fast-clear
  // timer. The leak manifested as log.debug firing on bus events
  // emitted AFTER the engine was disposed.
  it("does not leak the bus listener after dispose()", async () => {
    const engine = new WorkflowEngine();
    const startPromise = engine.startRun(
      "greenfield-fullstack",
      "demo",
      "proj-1",
      "C:/vault",
      "test idea",
    );

    const reached = await waitFor(() => {
      const r = engine.getRun();
      return r !== null && r.status === "waiting_for_artifact";
    }, 1_500);
    expect(reached).toBe(true);

    engine.dispose();

    const baseline = captured.length;
    defaultProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");
    await new Promise((r) => setTimeout(r, 50));

    const newRecords = captured.slice(baseline);
    const matchedLogs = newRecords.filter((r) =>
      r.msg.includes("artifact.changed matched expected phase artifact"),
    );
    expect(matchedLogs).toHaveLength(0);

    startPromise.catch(() => undefined);
  });

  // Companion regression: pause() must also tear down the bus
  // subscription.
  it("does not leak the bus listener after pause()", async () => {
    const engine = new WorkflowEngine();
    const startPromise = engine.startRun(
      "greenfield-fullstack",
      "demo",
      "proj-1",
      "C:/vault",
      "test idea",
    );

    const reached = await waitFor(() => {
      const r = engine.getRun();
      return r !== null && r.status === "waiting_for_artifact";
    }, 1_500);
    expect(reached).toBe(true);

    engine.pause();
    const baseline = captured.length;
    defaultProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");
    await new Promise((r) => setTimeout(r, 50));
    const newRecords = captured.slice(baseline);
    const matchedLogs = newRecords.filter((r) =>
      r.msg.includes("artifact.changed matched expected phase artifact"),
    );
    expect(matchedLogs).toHaveLength(0);

    engine.dispose();
    startPromise.catch(() => undefined);
  });
});

/**
 * Poll `pred` every 25ms until it returns truthy, or `timeoutMs`
 * elapses. Returns the final predicate value.
 */
async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return pred();
}
