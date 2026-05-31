// @c4n/workflow-engine — BMAD YAML workflow executor (D-12). Reads workflows
// from _bmad/bmm/workflows/, drives phases sequentially with vault artifact
// detection, dispatches dynamic personas via Tauri invoke.
//
// Architecture: D-12
// Implementing stories: M4 Story 4.1-4.6
//
// Story 4.2: Engine core — phase state machine, persona dispatch via
// spawn_dynamic_persona, vault artifact polling, workflow.phase.advanced
// bus events via bus_publish.
//
// Story 4.5: Emits ProgressBus.emitStoryState() on phase start and phase
// approval to feed the stall detector's rolling window.
//
// Story 4.6: brownfield workflow — ingest → analyze → refactor-plan phases.

import { invoke } from "@tauri-apps/api/core";
import { ProgressBus } from "@c4n/progress-signal";

export interface WorkflowPhasePersona {
  name: string;
  backing_cli: "claude" | "aggy";
  lifecycle: "persistent" | "ephemeral";
  task_prompt: string;
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

  async listWorkflows(): Promise<Array<{ id: string; name: string; description: string }>> {
    return invoke<Array<{ id: string; name: string; description: string }>>("list_workflows");
  }

  async loadWorkflow(workflowId: string): Promise<WorkflowMetadata> {
    const phases = await this.loadWorkflowPhases(workflowId);
    const meta = await this.listWorkflows();
    const entry = meta.find((m) => m.id === workflowId);
    return {
      id: workflowId,
      name: entry?.name ?? workflowId,
      description: entry?.description ?? "",
      phases,
    };
  }

  private async loadWorkflowPhases(workflowId: string): Promise<WorkflowPhase[]> {
    const PHASES: Record<string, WorkflowPhase[]> = {
      "greenfield-fullstack": [
        {
          id: "brief",
          label: "Brief",
          description: "Analyst interrogates the idea and produces a project brief.",
          personas: [
            {
              name: "Analyst",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the Analyst persona. Your job is to take a vague project idea and produce a structured project brief. Ask probing questions to clarify scope, users, constraints, and success criteria. Output the brief to vault/projects/{project_id}/bmad/01-brief.md",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/01-brief.md",
            description: "Project brief (markdown)",
          },
          approval_required: true,
        },
        {
          id: "plan",
          label: "Plan",
          description: "PM transforms the brief into a full PRD and story backlog.",
          personas: [
            {
              name: "PM",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the PM persona. Read the brief at vault/projects/{project_id}/bmad/01-brief.md and produce a full PRD at vault/projects/{project_id}/bmad/02-prd.md. Then create user stories at vault/projects/{project_id}/bmad/stories/ directory.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/02-prd.md",
            description: "Product Requirements Document (PRD)",
          },
          approval_required: true,
        },
        {
          id: "architecture",
          label: "Architecture",
          description: "Architect designs the system structure and key technical decisions.",
          personas: [
            {
              name: "Architect",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the Architect persona. Read the brief and PRD and produce an architecture document at vault/projects/{project_id}/bmad/03-architecture.md. Cover: system overview, data model, API surface, technology choices, directory structure, and non-functional requirements.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/03-architecture.md",
            description: "Architecture decision document",
          },
          approval_required: true,
        },
        {
          id: "solutioning",
          label: "Solutioning",
          description: "SM refines stories and plans implementation approach.",
          personas: [
            {
              name: "SM",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the SM (Solution Manager) persona. Review the stories in vault/projects/{project_id}/bmad/stories/ and the architecture. Add acceptance criteria, estimate effort, and flag dependencies. Output to vault/projects/{project_id}/bmad/04-solutioning.md",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/04-solutioning.md",
            description: "Solutioning summary with refined stories",
          },
          approval_required: true,
        },
        {
          id: "implementation",
          label: "Implementation",
          description:
            "Dev and Frontend Designer implement the code skeleton from approved stories.",
          personas: [
            {
              name: "Dev",
              backing_cli: "claude",
              lifecycle: "persistent",
              task_prompt:
                "You are the Dev persona. Pick up stories from vault/projects/{project_id}/bmad/stories/ and implement them. Write actual code following the architecture. Commit each story's implementation.",
            },
            {
              name: "Frontend Designer",
              backing_cli: "aggy",
              lifecycle: "persistent",
              task_prompt:
                "You are the Frontend Designer persona. Work on UI components and styling based on the stories. Follow the architecture at vault/projects/{project_id}/bmad/03-architecture.md",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/05-implementation.md",
            description: "Implementation status summary",
          },
          approval_required: true,
        },
        {
          id: "qa",
          label: "QA",
          description: "QA persona reviews implementation and produces test reports.",
          personas: [
            {
              name: "QA",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the QA persona. Review the implementation against the stories. Check acceptance criteria, write test cases, and report results at vault/projects/{project_id}/bmad/qa-report.md",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/qa-report.md",
            description: "QA report with test results",
          },
          approval_required: true,
        },
      ],
      brownfield: [
        {
          id: "ingest",
          label: "Ingest",
          description: "Scan and catalog the existing codebase structure.",
          personas: [
            {
              name: "Analyst",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the Analyst persona. Your job is to ingest an existing codebase. Scan the repository at the provided project path, catalog its structure (languages, frameworks, key files, directory layout), and produce a summary at vault/projects/{project_id}/bmad/01-ingest.md. Be thorough — identify the tech stack, entry points, and overall architecture.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/01-ingest.md",
            description: "Codebase ingest summary",
          },
          approval_required: true,
        },
        {
          id: "analyze",
          label: "Analyze",
          description: "Analyze the codebase for issues, tech debt, and improvement opportunities.",
          personas: [
            {
              name: "Architect",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the Architect persona. Read the ingest summary at vault/projects/{project_id}/bmad/01-ingest.md, then perform a deep analysis of the codebase. Identify: (1) architectural problems, (2) tech debt, (3) security concerns, (4) performance bottlenecks, (5) missing tests, (6) code smells. Output your analysis to vault/projects/{project_id}/bmad/02-analyze.md.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/02-analyze.md",
            description: "Codebase analysis report",
          },
          approval_required: true,
        },
        {
          id: "refactor-plan",
          label: "Refactor Plan",
          description: "Produce a prioritized refactor plan based on the analysis.",
          personas: [
            {
              name: "PM",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt:
                "You are the PM persona. Read the analysis at vault/projects/{project_id}/bmad/02-analyze.md and the ingest summary at vault/projects/{project_id}/bmad/01-ingest.md. Produce a prioritized refactor plan at vault/projects/{project_id}/bmad/03-refactor-plan.md. For each refactoring item: describe the problem, the recommended fix, estimated effort (XS/S/M/L/XL), and expected impact. Prioritize by risk and value.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/03-refactor-plan.md",
            description: "Refactor plan with prioritized recommendations",
          },
          approval_required: false,
        },
      ],
    };

    return PHASES[workflowId] ?? [];
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

    ProgressBus.emitStoryState(run.workflow_id);

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
    ProgressBus.emitStoryState(run.workflow_id);
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
