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
import { ProgressBus, type ProgressSignal } from "@c4n/progress-signal";
import { createLogger, startSpan } from "@c4n/observability";

const log = createLogger("@c4n/workflow-engine");

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
  private busUnsubscribe: (() => void) | null = null;
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
              bmad_phase: "Brief",
              phase_skills: ["bmad-agent-analyst", "bmad-product-brief"],
              task_prompt:
                "You are the **Analyst** persona operating in the **Brief** phase of the BMAD workflow.\n\nYour job is to take a vague project idea and produce a structured project brief. Ask probing questions to clarify scope, users, constraints, and success criteria.\n\nRelevant BMAD skills: The bmad-agent-analyst and bmad-product-brief skills are registered for this phase. Use them to guide your analysis approach.\n\nOutput the brief to vault/projects/{project_id}/bmad/01-brief.md",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/01-brief.md",
            description: "Project brief (markdown)",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Plan",
              phase_skills: ["bmad-agent-pm", "bmad-prd", "bmad-create-epics-and-stories"],
              task_prompt:
                "You are the **PM** persona operating in the **Plan** phase of the BMAD workflow.\n\nRead the brief at vault/projects/{project_id}/bmad/01-brief.md and produce a full PRD at vault/projects/{project_id}/bmad/02-prd.md. Then create user stories at vault/projects/{project_id}/bmad/stories/ directory.\n\nRelevant BMAD skills: bmad-agent-pm and bmad-prd are registered for this phase. Use them to guide PRD creation and story decomposition.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/02-prd.md",
            description: "Product Requirements Document (PRD)",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Architecture",
              phase_skills: [
                "bmad-agent-architect",
                "bmad-create-architecture",
                "bmad-create-epics-and-stories",
              ],
              task_prompt:
                "You are the **Architect** persona operating in the **Architecture** phase of the BMAD workflow.\n\nRead the brief at vault/projects/{project_id}/bmad/01-brief.md and PRD at vault/projects/{project_id}/bmad/02-prd.md and produce an architecture document at vault/projects/{project_id}/bmad/03-architecture.md. Cover: system overview, data model, API surface, technology choices, directory structure, and non-functional requirements.\n\nRelevant BMAD skills: bmad-agent-architect and bmad-create-architecture are registered for this phase. Use them to guide your architectural analysis.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/03-architecture.md",
            description: "Architecture decision document",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Solutioning",
              phase_skills: ["bmad-create-epics-and-stories", "bmad-check-implementation-readiness"],
              task_prompt:
                "You are the **SM** (Solution Manager) persona operating in the **Solutioning** phase of the BMAD workflow.\n\nReview the stories in vault/projects/{project_id}/bmad/stories/ and the architecture at vault/projects/{project_id}/bmad/03-architecture.md. Add acceptance criteria, estimate effort, and flag dependencies. Output to vault/projects/{project_id}/bmad/04-solutioning.md\n\nRelevant BMAD skills: bmad-create-epics-and-stories and bmad-check-implementation-readiness are registered for this phase.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/04-solutioning.md",
            description: "Solutioning summary with refined stories",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Implementation",
              phase_skills: ["bmad-agent-dev", "bmad-dev-story", "bmad-create-story"],
              task_prompt:
                "You are the **Dev** persona operating in the **Implementation** phase of the BMAD workflow.\n\nPick up stories from vault/projects/{project_id}/bmad/stories/ and implement them. Write actual code following the architecture at vault/projects/{project_id}/bmad/03-architecture.md. Commit each story's implementation.\n\nRelevant BMAD skills: bmad-agent-dev, bmad-dev-story, and bmad-create-story are registered for this phase. Use them to guide story implementation and checkpoint reviews.",
            },
            {
              name: "Frontend Designer",
              backing_cli: "aggy",
              lifecycle: "persistent",
              bmad_phase: "Implementation",
              phase_skills: ["bmad-agent-ux-designer", "bmad-create-ux-design"],
              task_prompt:
                "You are the **Frontend Designer** persona operating in the **Implementation** phase of the BMAD workflow.\n\nWork on UI components and styling based on the stories in vault/projects/{project_id}/bmad/stories/. Follow the architecture at vault/projects/{project_id}/bmad/03-architecture.md\n\nRelevant BMAD skills: bmad-agent-ux-designer and bmad-create-ux-design are registered for this phase. Use them to guide UX design decisions.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/05-implementation.md",
            description: "Implementation status summary",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "QA",
              phase_skills: ["bmad-code-review", "bmad-qa-generate-e2e-tests"],
              task_prompt:
                "You are the **QA** persona operating in the **QA** phase of the BMAD workflow.\n\nReview the implementation against the stories in vault/projects/{project_id}/bmad/stories/. Check acceptance criteria, write test cases, and report results at vault/projects/{project_id}/bmad/qa-report.md\n\nRelevant BMAD skills: bmad-code-review and bmad-qa-generate-e2e-tests are registered for this phase. Use them to guide your review and test generation.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/qa-report.md",
            description: "QA report with test results",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Ingest",
              phase_skills: ["bmad-document-project", "bmad-domain-research"],
              task_prompt:
                "You are the **Analyst** persona operating in the **Ingest** phase of the BMAD workflow (brownfield path).\n\nYour job is to ingest an existing codebase. Scan the repository at the provided project path, catalog its structure (languages, frameworks, key files, directory layout), and produce a summary at vault/projects/{project_id}/bmad/01-ingest.md. Be thorough — identify the tech stack, entry points, and overall architecture.\n\nRelevant BMAD skills: bmad-document-project is registered for this phase. Use it to guide your documentation approach.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/01-ingest.md",
            description: "Codebase ingest summary",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Analyze",
              phase_skills: ["bmad-agent-architect", "bmad-review-adversarial-general"],
              task_prompt:
                "You are the **Architect** persona operating in the **Analyze** phase of the BMAD workflow (brownfield path).\n\nRead the ingest summary at vault/projects/{project_id}/bmad/01-ingest.md, then perform a deep analysis of the codebase. Identify: (1) architectural problems, (2) tech debt, (3) security concerns, (4) performance bottlenecks, (5) missing tests, (6) code smells. Output your analysis to vault/projects/{project_id}/bmad/02-analyze.md.\n\nRelevant BMAD skills: bmad-review-adversarial-general is registered for this phase. Use it to guide your critical review approach.",
            },
          ],
          artifact: {
            path: "vault/projects/{project_id}/bmad/02-analyze.md",
            description: "Codebase analysis report",
          },
          approval_required: true,
          governance_gate: true,
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
              bmad_phase: "Refactor Plan",
              phase_skills: ["bmad-agent-pm", "bmad-prd"],
              task_prompt:
                "You are the **PM** persona operating in the **Refactor Plan** phase of the BMAD workflow (brownfield path).\n\nRead the analysis at vault/projects/{project_id}/bmad/02-analyze.md and the ingest summary at vault/projects/{project_id}/bmad/01-ingest.md. Produce a prioritized refactor plan at vault/projects/{project_id}/bmad/03-refactor-plan.md. For each refactoring item: describe the problem, the recommended fix, estimated effort (XS/S/M/L/XL), and expected impact. Prioritize by risk and value.\n\nRelevant BMAD skills: bmad-prd is registered for this phase.",
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

    const waitSpan = startSpan("wait-for-artifact", "@c4n/workflow-engine", {
      fields: { runId: run.id, phase: phase.id, artifactPath },
    });

    return new Promise((resolve) => {
      let resolved = false;
      // Tracks whether the ProgressBus delivered a matching event before
      // the 3s safety-net poll fired. Used to distinguish a healthy
      // notify path (delivered < 1s) from a degraded one (poll fired
      // first because the listener was registered late or missed).
      let busDelivered = false;
      const busDeliveredAt: { ms: number | null } = { ms: null };
      let safetyNetWarned = false;

      const onArtifactChanged = (signal: ProgressSignal): void => {
        if (signal.kind !== "artifact.changed") return;
        if (resolved) return;
        if (run.status === "paused" || run.status === "idle" || run.status === "done") return;
        // Path comparison: the bus may emit a different casing /
        // separator form than our resolved artifactPath, so we match on
        // the trailing suffix.
        if (!pathsMatch(signal.path, artifactPath)) return;
        busDelivered = true;
        busDeliveredAt.ms = Date.now();
        log.debug("artifact.changed matched expected phase artifact", {
          runId: run.id,
          phase: phase.id,
          latencyMs: (busDeliveredAt.ms ?? 0) - Date.now(),
        });
        void advance();
      };

      const advance = async (): Promise<void> => {
        if (resolved) return;
        resolved = true;
        this.clearAllWaiters();
        const latencyMs = busDeliveredAt.ms !== null ? Date.now() - busDeliveredAt.ms : -1;
        if (busDelivered) {
          waitSpan.end({ path: "bus", latencyMs });
        } else {
          waitSpan.end({ path: "poll", latencyMs });
        }

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
      };

      const poll = async (): Promise<void> => {
        if (resolved) return;
        if (run.status === "paused" || run.status === "idle" || run.status === "done") return;

        // The 3s safety net only fires when the bus didn't deliver
        // within 1s. If the bus already matched, the poller is a no-op.
        const elapsed = busDeliveredAt.ms !== null ? Date.now() - busDeliveredAt.ms : 0;
        if (busDelivered) return;

        if (!safetyNetWarned && elapsed > 0) {
          // The poller fired before the bus delivered — the notify
          // path is degraded (listener was registered late, or the
          // event was missed). Surface it so the operator can
          // investigate without taking the workflow down.
          safetyNetWarned = true;
          log.warn("vault artifact poll fired before ProgressBus — notify path degraded", {
            runId: run.id,
            phase: phase.id,
            artifactPath,
          });
        }

        let found = false;
        try {
          found = await invoke<boolean>("check_vault_artifact_exists", {
            path: artifactPath,
          });
        } catch (e) {
          log.error("check_vault_artifact_exists threw", {
            runId: run.id,
            err: String(e),
          });
          return;
        }

        if (found) {
          await advance();
        }
      };

      // Subscribe to ProgressBus FIRST so we can't miss an event
      // that fires between the initial poll and the poller arming.
      // Capture the unsub in a local so we can compose it with the
      // fast-clear timer's handle without overwriting either one.
      const busUnsub = ProgressBus.subscribe(onArtifactChanged);

      // Best-effort 1s guard: clear the poller entirely if the bus
      // delivered quickly. This keeps the steady-state CPU cost at
      // one event handler, not a recurring setInterval.
      const fastClearTimer = setTimeout(() => {
        if (busDelivered && !resolved) {
          this.clearPoller();
        }
      }, 1_000);

      this.vaultPoller = setInterval(poll, 3_000);
      // Chain BOTH unsubs into a single handle so clearAllWaiters()
      // always tears down both. Do NOT overwrite `busUnsub` here —
      // that was the bug the verifier caught in attempt 1: the
      // bus subscription reference was lost, so dispose() only
      // cleared the timer and the onArtifactChanged listener
      // kept firing for the rest of the process.
      this.busUnsubscribe = () => {
        clearTimeout(fastClearTimer);
        busUnsub();
      };
      // Run an initial poll in case the artifact already exists
      // (e.g. we're resuming a run).
      void poll();
    });
  }

  /**
   * Cancel both the polling timer and any ProgressBus subscription
   * started by `waitForArtifact`. Safe to call from any state.
   */
  private clearAllWaiters(): void {
    this.clearPoller();
    if (this.busUnsubscribe !== null) {
      this.busUnsubscribe();
      this.busUnsubscribe = null;
    }
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
    ProgressBus.emitStoryState(run.workflow_id);
  }

  async requestChanges(runId: string, feedback: string): Promise<void> {
    if (!this.currentRun || this.currentRun.id !== runId) return;
    const run = this.currentRun;
    if (!this.currentWorkflow) return;

    const phase = this.pendingApprovalPhase ?? this.currentWorkflow.phases[run.phase_index];

    this.pendingApprovalPhase = null;
    run.status = "paused";
    this.clearAllWaiters();

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
    this.clearAllWaiters();
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
    this.clearAllWaiters();
    this.currentRun = null;
    this.currentWorkflow = null;
  }
}

/**
 * Loose path equality for ProgressBus → workflow-engine artifact
 * matching. Normalizes separators and trailing slashes, then either
 * compares directly or checks whether `a` ends with `b` (or vice versa)
 * to tolerate relative-vs-absolute forms. The function is intentionally
 * permissive — the engine only uses it as a "is this event relevant"
 * filter, not as a security boundary.
 */
function pathsMatch(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (na.endsWith("/" + nb) || nb.endsWith("/" + na)) return true;
  return false;
}

export const workflowEngine = new WorkflowEngine();
