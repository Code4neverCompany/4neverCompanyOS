// @c4n/workflow-engine — BMAD YAML workflow executor (D-12). Reads workflows
// from _bmad/bmm/workflows/, drives phases sequentially with vault artifact
// detection, dispatches dynamic personas via Tauri invoke.
//
// Architecture: D-12
// Implementing stories: M4 Story 4.1-4.4
//
// Story 4.2: Engine core — phase state machine, persona dispatch via
// spawn_dynamic_persona, vault artifact polling, workflow.phase.advanced
// bus events via bus_publish.

import { invoke } from "@tauri-apps/api/core";

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
          description: "Dev and Frontend Designer implement the code skeleton from approved stories.",
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
    const artifactPath = phase.artifact.path
      .replace(/\{project_id\}/g, run.project_id)
      .replace(/\{project_name\}/g, run.project_name);

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

  private async advanceToNextPhase(run: WorkflowRunState, completedPhase: WorkflowPhase): Promise<void> {
    if (!this.currentWorkflow) return;
    const nextIndex = run.phase_index + 1;

    if (nextIndex >= this.currentWorkflow.phases.length) {
      run.status = "done";
      run.current_phase = "";

      await this.postPhaseAdvanced(run, completedPhase.id, "", true);
      await invoke<WorkflowRunState>("advance_workflow_phase", { toPhase: "done" });
      return;
    }

    const nextPhase = this.currentWorkflow.phases[nextIndex];

    await this.postPhaseAdvanced(run, completedPhase.id, nextPhase.id, true);

    const updated = await invoke<WorkflowRunState>("advance_workflow_phase", {
      toPhase: nextPhase.id,
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

    const phaseToAdvance = this.pendingApprovalPhase
      ?? this.currentWorkflow.phases[run.phase_index];

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
  }

  async requestChanges(runId: string, feedback: string): Promise<void> {
    if (!this.currentRun || this.currentRun.id !== runId) return;
    const run = this.currentRun;
    if (!this.currentWorkflow) return;

    const phase = this.pendingApprovalPhase
      ?? this.currentWorkflow.phases[run.phase_index];

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
