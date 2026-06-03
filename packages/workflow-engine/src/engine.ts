// @c4n/workflow-engine — BMAD YAML workflow executor (D-12). Reads workflows
// from _bmad/bmm/workflows/, drives phases sequentially with vault artifact
// detection, dispatches dynamic personas via Tauri invoke.
//
// Architecture: D-12
// Implementing stories: M4 Story 4.1-4.6
//
// Story 4.1 (this commit): workflow bodies are no longer hardcoded — the
// engine reads the YAML at runtime via the `read_workflow_yaml` Tauri
// command, parses it with `js-yaml`, and validates against the Zod
// schema in `@c4n/core`. The `loadWorkflow()` method is the single
// entry point; `loader.ts` owns the parse + validate + convert logic.
//
// Story 4.2: Engine core — phase state machine, persona dispatch via
// spawn_dynamic_persona, vault artifact polling, workflow.phase.advanced
// bus events via bus_publish.
//
// Story 4.5: Emits `defaultProgressBus.emitStoryState()` on phase start and phase
// approval to feed the stall detector's rolling window. The bus is
// injectable for tests (see `new WorkflowEngine({ bus })`).
//
// Story 4.6: brownfield workflow — ingest → analyze → refactor-plan phases.

import { invoke } from "@tauri-apps/api/core";
import { defaultProgressBus, type ProgressBusImpl } from "@c4n/progress-signal";
import { loadWorkflowFromYaml } from "./loader";

export interface WorkflowPhasePersona {
  name: string;
  backing_cli: "claude" | "aggy";
  lifecycle: "persistent" | "ephemeral";
  task_prompt: string;
  /** BMAD phase label injected into the persona's context (e.g. "Brief", "Plan"). */
  bmad_phase: string;
  /**
   * BMAD skill IDs to register for this phase. Each ID maps to a skill path under
   * `<project>/_bmad/bmm/<path>/SKILL.md` or `<project>/.claude/skills/`. These are
   * symlinked (persistent) or copied (ephemeral) into the persona's vault area so
   * the spawned CLI can access them at startup.
   */
  phase_skills: string[];
}

export interface WorkflowPhase {
  id: string;
  label: string;
  description: string;
  personas: WorkflowPhasePersona[];
  artifact: {
    path: string;
    description: string;
  };
  approval_required: boolean;
  /** BMAA-17: when true, creates a Paperclip board approval on phase completion. */
  governance_gate?: boolean;
}

export interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
  phases: WorkflowPhase[];
}

export interface WorkflowRunState {
  id: string;
  workflow_id: string;
  workflow_name: string;
  project_id: string;
  project_name: string;
  idea: string;
  current_phase: string;
  phase_index: number;
  status: "idle" | "running" | "waiting_for_artifact" | "approval_pending" | "paused" | "done";
  vault_dir: string;
  active_personas: string[];
  created_at_ms: number;
}

export interface PhaseAdvancedPayload {
  run_id: string;
  workflow_id: string;
  from_phase: string;
  to_phase: string;
  approved: boolean;
}

/**
 * Resolves a vault-relative artifact path (e.g. `vault/projects/<id>/bmad/01-brief.md`)
 * to an absolute path given a workflow-run vault_dir (which is `<vault>/workflows/<slug>`).
 * Strips the `workflows/<slug>` suffix so artifacts land at the canonical
 * `vault/projects/<id>/bmad/` location per the vault-layout spec (Story 5.1).
 */
function resolveVaultArtifactPath(vaultDir: string, relativePath: string): string {
  const normalized = vaultDir.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const workflowsIdx = parts.findIndex((p) => p === "workflows");
  if (workflowsIdx !== -1) {
    parts.splice(workflowsIdx);
  }
  const vaultRoot = parts.join("/");
  const cleanRelative = relativePath.replace(/^vault\//, "");
  return `${vaultRoot}/${cleanRelative}`;
}

export class WorkflowEngine {
  private currentRun: WorkflowRunState | null = null;
  private vaultPoller: ReturnType<typeof setInterval> | null = null;
  private currentWorkflow: WorkflowMetadata | null = null;
  private pendingApprovalPhase: WorkflowPhase | null = null;
  /**
   * Progress bus used for `emitStoryState` signals. Defaults to the
   * package-level singleton for production; tests can construct an
   * engine with `new WorkflowEngine({ bus: myBus })` to inject a
   * fresh instance and assert that emissions land only on it.
   */
  private bus: ProgressBusImpl = defaultProgressBus;

  constructor(opts?: { bus?: ProgressBusImpl }) {
    if (opts?.bus) {
      this.bus = opts.bus;
    }
  }

  async listWorkflows(): Promise<Array<{ id: string; name: string; description: string }>> {
    return invoke<Array<{ id: string; name: string; description: string }>>("list_workflows");
  }

  /**
   * Read a workflow's full phase list from disk. Pulls the catalog
   * metadata (id/name/description) from the existing `list_workflows`
   * command, then reads the YAML body via the new `read_workflow_yaml`
   * command, parses it through `js-yaml`, and validates against the
   * Zod schema in `@c4n/core`. Throws `WorkflowLoadError` on any
   * failure mode (empty body, syntax error, schema violation). The
   * returned object merges catalog metadata with the parsed phases.
   */
  async loadWorkflow(workflowId: string): Promise<WorkflowMetadata> {
    const yamlBody = await invoke<string>("read_workflow_yaml", { workflowId });
    const loaded = loadWorkflowFromYaml(yamlBody);

    const meta = await this.listWorkflows();
    const entry = meta.find((m) => m.id === workflowId);

    return {
      id: workflowId,
      // Prefer the YAML's own name/description when present — users may
      // edit the YAML to retitle a workflow without touching Rust. Fall
      // back to the catalog's metadata for unknown fields.
      name: loaded.workflow.name ?? entry?.name ?? workflowId,
      description: loaded.workflow.description ?? entry?.description ?? "",
      phases: loaded.phases,
    };
  }

  async startRun(
    workflowId: string,
    projectName: string,
    projectId: string,
    vaultDir: string,
    idea: string,
  ): Promise<WorkflowRunState> {
    const workflow = await this.loadWorkflow(workflowId);
    this.currentWorkflow = workflow;
    const firstPhase = workflow.phases[0];

    const started = await invoke<WorkflowRunState>("start_workflow_run", {
      workflowId,
      projectName,
      idea,
    });

    const run: WorkflowRunState = {
      id: started.id,
      workflow_id: workflowId,
      workflow_name: workflow.name,
      project_id: projectId,
      project_name: projectName,
      idea,
      current_phase: firstPhase?.id ?? "",
      phase_index: 0,
      status: "running",
      vault_dir: vaultDir,
      active_personas: [],
      created_at_ms: started.created_at_ms,
    };

    this.currentRun = run;
    await this.executePhase(run, firstPhase);
    return run;
  }

  private async executePhase(run: WorkflowRunState, phase: WorkflowPhase): Promise<void> {
    run.status = "running";
    run.active_personas = [];

    this.bus.emitStoryState(run.workflow_id);

    for (const persona of phase.personas) {
      try {
        const resolvedTask = persona.task_prompt
          .replace(/\{project_id\}/g, run.project_id)
          .replace(/\{project_name\}/g, run.project_name);

        await invoke("spawn_dynamic_persona", {
          name: persona.name,
          backingCli: persona.backing_cli,
          lifecycle: persona.lifecycle,
          taskPrompt: resolvedTask,
          phaseSkills: persona.phase_skills,
        });

        run.active_personas.push(persona.name);
      } catch (e) {
        console.error(`[workflow-engine] failed to spawn persona ${persona.name}:`, e);
      }
    }

    run.status = "waiting_for_artifact";
    await this.waitForArtifact(run, phase);
  }

  private async waitForArtifact(run: WorkflowRunState, phase: WorkflowPhase): Promise<void> {
    const rawPath = phase.artifact.path
      .replace(/\{project_id\}/g, run.project_id)
      .replace(/\{project_name\}/g, run.project_name);
    const artifactPath = resolveVaultArtifactPath(run.vault_dir, rawPath);

    return new Promise((resolve) => {
      const poll = async () => {
        if (run.status === "paused" || run.status === "idle" || run.status === "done") {
          return;
        }

        const found = await invoke<boolean>("check_vault_artifact_exists", {
          path: artifactPath,
        });

        if (found) {
          this.clearPoller();

          if (phase.approval_required) {
            run.status = "approval_pending";
            this.pendingApprovalPhase = phase;

            if (phase.governance_gate) {
              resolve();
              this.waitForPaperclipApproval(run, phase, artifactPath).catch(console.error);
              return;
            }

            resolve();
            return;
          }

          await this.advanceToNextPhase(run, phase);
          resolve();
        }
      };

      this.vaultPoller = setInterval(poll, 3000);
      poll();
    });
  }

  /**
   * BMAA-17: After a phase artifact is found and governance_gate is enabled,
   * create a Paperclip approval request and poll until the board approves or
   * rejects. On approval, advances the state machine. On rejection, pauses the
   * workflow with rollback notification.
   */
  private async waitForPaperclipApproval(
    run: WorkflowRunState,
    phase: WorkflowPhase,
    artifactPath: string,
  ): Promise<void> {
    try {
      const approvalId = await invoke<string>("create_paperclip_approval", {
        runId: run.id,
        phaseId: phase.id,
        phaseLabel: phase.label,
        projectName: run.project_name,
        workflowId: run.workflow_id,
        artifactPath,
      });

      this.pollPaperclipApproval(approvalId, run, phase).catch(console.error);
    } catch (e) {
      const error = e as string;
      if (error === "governance_gate_bypass_enabled") {
        console.info("[workflow-engine] governance_gate_bypass enabled — auto-advancing phase");
        await this.approvePhase(run.id);
      } else {
        console.error("[workflow-engine] failed to create Paperclip approval:", e);
      }
    }
  }

  private async pollPaperclipApproval(
    approvalId: string,
    run: WorkflowRunState,
    _phase: WorkflowPhase,
  ): Promise<void> {
    const pollInterval = 10_000;

    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        if (run.status !== "approval_pending") {
          clearInterval(timer);
          resolve();
          return;
        }

        try {
          const status = await invoke<{ status: string; feedback?: string }>(
            "get_paperclip_approval_status",
            { approvalId },
          );

          if (status.status === "approved") {
            clearInterval(timer);
            await this.approvePhase(run.id);
            resolve();
            return;
          }

          if (status.status === "rejected") {
            clearInterval(timer);
            await this.requestChanges(run.id, status.feedback ?? "Approval rejected by board");
            resolve();
            return;
          }
        } catch (e) {
          console.error("[workflow-engine] error polling Paperclip approval status:", e);
        }
      }, pollInterval);
    });
  }

  private async advanceToNextPhase(
    run: WorkflowRunState,
    completedPhase: WorkflowPhase,
  ): Promise<void> {
    if (!this.currentWorkflow) return;
    const nextIndex = run.phase_index + 1;

    if (nextIndex >= this.currentWorkflow.phases.length) {
      run.status = "done";
      run.current_phase = "";

      await this.postPhaseAdvanced(run, completedPhase.id, "", true);
      await invoke<WorkflowRunState>("advance_workflow_phase", {
        toPhase: "done",
        toPhaseIndex: nextIndex,
        activePersonas: [],
      });
      return;
    }

    const nextPhase = this.currentWorkflow.phases[nextIndex];

    await this.postPhaseAdvanced(run, completedPhase.id, nextPhase.id, true);

    const updated = await invoke<WorkflowRunState>("advance_workflow_phase", {
      toPhase: nextPhase.id,
      toPhaseIndex: nextIndex,
      activePersonas: run.active_personas,
    });

    run.phase_index = nextIndex;
    run.current_phase = nextPhase.id;
    run.id = updated.id;

    await this.executePhase(run, nextPhase);
  }

  private async postPhaseAdvanced(
    run: WorkflowRunState,
    fromPhase: string,
    toPhase: string,
    approved: boolean,
  ): Promise<void> {
    const payload: PhaseAdvancedPayload = {
      run_id: run.id,
      workflow_id: run.workflow_id,
      from_phase: fromPhase,
      to_phase: toPhase,
      approved,
    };

    try {
      await invoke("bus_publish", {
        eventType: "workflow.phase.advanced",
        payload,
      });
    } catch (e) {
      console.error("[workflow-engine] failed to post workflow.phase.advanced:", e);
    }
  }

  async approvePhase(runId: string): Promise<void> {
    if (!this.currentRun || this.currentRun.id !== runId) return;
    const run = this.currentRun;
    if (!this.currentWorkflow) return;

    const phaseToAdvance =
      this.pendingApprovalPhase ?? this.currentWorkflow.phases[run.phase_index];

    this.pendingApprovalPhase = null;

    try {
      await invoke("log_workflow_decision", {
        runId: run.id,
        projectId: run.project_id,
        phase: phaseToAdvance.id,
        decision: "approved",
        feedback: "",
      });
    } catch (e) {
      console.error("[workflow-engine] failed to log decision:", e);
    }

    await this.advanceToNextPhase(run, phaseToAdvance);
    this.bus.emitStoryState(run.workflow_id);
  }

  async requestChanges(runId: string, feedback: string): Promise<void> {
    if (!this.currentRun || this.currentRun.id !== runId) return;
    const run = this.currentRun;
    if (!this.currentWorkflow) return;

    const phase = this.pendingApprovalPhase ?? this.currentWorkflow.phases[run.phase_index];

    this.pendingApprovalPhase = null;
    run.status = "paused";
    this.clearPoller();

    try {
      await invoke("log_workflow_decision", {
        runId: run.id,
        projectId: run.project_id,
        phase: phase.id,
        decision: "changes_requested",
        feedback,
      });
    } catch (e) {
      console.error("[workflow-engine] failed to log decision:", e);
    }

    invoke("pause_workflow_run").catch(console.error);
  }

  getPendingApprovalPhase(): WorkflowPhase | null {
    return this.pendingApprovalPhase;
  }

  pause(): void {
    if (!this.currentRun) return;
    this.currentRun.status = "paused";
    this.clearPoller();
    invoke("pause_workflow_run").catch(console.error);
  }

  async resume(): Promise<void> {
    if (!this.currentRun || this.currentRun.status !== "paused") return;
    const run = this.currentRun;
    const workflow = await this.loadWorkflow(run.workflow_id);
    this.currentWorkflow = workflow;
    const currentPhase = workflow.phases[run.phase_index];

    run.status = "running";
    await invoke("resume_workflow_run").catch(console.error);
    await this.executePhase(run, currentPhase);
  }

  getRun(): WorkflowRunState | null {
    return this.currentRun;
  }

  getCurrentPhase(): WorkflowPhase | null {
    if (!this.currentWorkflow || !this.currentRun) return null;
    return this.currentWorkflow.phases[this.currentRun.phase_index] ?? null;
  }

  private clearPoller(): void {
    if (this.vaultPoller !== null) {
      clearInterval(this.vaultPoller);
      this.vaultPoller = null;
    }
  }

  dispose(): void {
    this.clearPoller();
    this.currentRun = null;
    this.currentWorkflow = null;
  }
}

export const workflowEngine = new WorkflowEngine();
