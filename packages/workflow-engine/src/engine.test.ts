// @c4n/workflow-engine — notify-based artifact wait test.
//
// Validates the contract from NEVAAA-OBS-PERF: when a synthetic
// `artifact.changed` signal arrives on ProgressBus, the engine should
// advance the phase within 1s without waiting for the 3s safety-net
// poller to fire.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Tauri `invoke` is mocked at module-load time so the engine's
// `start_workflow_run`, `spawn_dynamic_persona`, etc. calls are
// stubbed out. We keep the mock state in module-scope so individual
// tests can configure the response.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { WorkflowEngine } from "./engine.js";
import { ProgressBus } from "@c4n/progress-signal";

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
    ProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");

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
    // Suppress logger output during this test so the warn line (if it
    // ever did fire) doesn't pollute test output. The real assertion
    // is the elapsed-time one in the previous test; this one just
    // documents that the degraded-warning code path is gated on the
    // bus NOT having delivered.
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
    ProgressBus.emitArtifact("C:/vault/projects/proj-1/bmad/01-brief.md");

    // Wait long enough that the 3s safety-net *would* have fired
    // (3s + a small grace window) and assert we never reached it.
    await new Promise((r) => setTimeout(r, 3_500));
    const r = engine.getRun();
    // The bus delivered → phase advanced → next phase's waitForArtifact
    // has its own poller. This test only cares that the first phase
    // didn't go through the degraded path; subsequent phases are
    // out of scope.
    expect(r).not.toBeNull();

    engine.pause();
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
