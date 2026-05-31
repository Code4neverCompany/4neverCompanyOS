// Workflows view — Epic 4: One-Click BMAD Workflow Execution.
//
// Story 4.1: "Start a BMAD project" entry point — chooser + vault dir + Tauri commands.
// Story 4.2: Wires @c4n/workflow-engine to drive personas through BMAD phases.
//   - Phase state machine: chooser → setup form → active run + phase sidebar
//   - workflow.phase.advanced bus events at each phase boundary
//   - Vault artifact polling for phase completion
//   - Persona spawn via spawn_dynamic_persona at each phase
//
// Persona lifecycle icon legend: ● persistent  ○ ephemeral

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import { workflowEngine } from "@c4n/workflow-engine";

interface WorkflowMetadata {
  id: string;
  name: string;
  description: string;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name: string;
  project_name: string;
  idea: string;
  phase: string;
  status: string;
  vault_dir: string;
  created_at_ms: number;
}

interface ActiveRunDisplay {
  id: string;
  workflow_id: string;
  workflow_name: string;
  project_name: string;
  idea: string;
  current_phase: string;
  phase_index: number;
  status: string;
  vault_dir: string;
  active_personas: string[];
  created_at_ms: number;
  project_id?: string;
}

// ── ViewShell ────────────────────────────────────────────────────────────

function ViewShell({
  eyebrow,
  title,
  titleAccent,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent: string;
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        position: "relative",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 0,
      }}
    >
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 32,
            color: "var(--fn-white)",
            letterSpacing: "-0.02em",
            margin: "6px 0 0",
          }}
        >
          {title} <span style={{ color: "var(--fn-gold)" }}>{titleAccent}</span>
        </h1>
      </div>
      {children}
    </main>
  );
}

// ── Phase status sidebar ───────────────────────────────────────────────

const PHASE_ORDER = ["brief", "plan", "architecture", "solutioning", "implementation", "qa"];
const PHASE_LABELS: Record<string, string> = {
  brief: "Brief",
  plan: "Plan",
  architecture: "Architecture",
  solutioning: "Solutioning",
  implementation: "Implementation",
  qa: "QA",
};

function PhaseStatusSidebar({ currentPhase, status }: { currentPhase: string; status: string }) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <HUDFrame style={{ padding: 18 }}>
      <Eyebrow color="purple" style={{ marginBottom: 14, display: "block" }}>
        Phase Progress
      </Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PHASE_ORDER.map((phase, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const label = PHASE_LABELS[phase] ?? phase;

          return (
            <div key={phase} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: isDone
                    ? "var(--fn-green)"
                    : isCurrent
                      ? "var(--fn-gold)"
                      : "var(--border-neutral)",
                  background: isDone ? "var(--fn-green)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  flexShrink: 0,
                }}
              >
                {isDone ? (
                  <span style={{ color: "#000", fontWeight: 700 }}>✓</span>
                ) : isCurrent ? (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        status === "waiting_for_artifact"
                          ? "var(--fn-cyan)"
                          : status === "paused"
                            ? "var(--fn-gold)"
                            : "var(--fn-purple)",
                      display: "block",
                      animation: status === "waiting_for_artifact" ? "pulse 1.5s infinite" : "none",
                    }}
                  />
                ) : null}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: isDone ? "var(--fn-green)" : isCurrent ? "var(--fn-white)" : "var(--fg-3)",
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </HUDFrame>
  );
}

// ── Resume workflow prompt ─────────────────────────────────────────────

function ResumePrompt({
  run,
  onResume,
  onDismiss,
}: {
  run: ActiveRunDisplay;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const started = new Date(run.created_at_ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <HUDFrame
      style={{
        padding: 28,
        border: "1px solid var(--fn-gold)",
        boxShadow: "0 0 30px rgba(255,200,0,0.1)",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <Eyebrow color="gold">⏸ Paused workflow found</Eyebrow>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 20,
            color: "var(--fn-white)",
            margin: "6px 0 0",
          }}
        >
          Resume "{run.project_name}"?
        </h2>
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--fg-2)",
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: "0 0 8px" }}>
          This workflow was in progress — paused on{" "}
          <strong style={{ color: "var(--fn-white)" }}>{started}</strong>.
        </p>
        <p style={{ margin: 0 }}>
          Workflow: <strong style={{ color: "var(--fn-cyan)" }}>{run.workflow_name}</strong>
          {" · "}
          Phase: <Badge color="muted">{run.current_phase}</Badge>
        </p>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onDismiss}>
          Dismiss
        </Btn>
        <Btn variant="purple" onClick={onResume}>
          Resume workflow →
        </Btn>
      </div>
    </HUDFrame>
  );
}

// ── Approval gate overlay ───────────────────────────────────────────────

function ApprovalGate({
  run,
  onApprove,
  onPause,
}: {
  run: ActiveRunDisplay;
  onApprove: () => void;
  onPause: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [busy, setBusy] = useState(false);

  const pendingPhase = workflowEngine.getPendingApprovalPhase();
  const currentLabel = PHASE_LABELS[pendingPhase?.id ?? run.current_phase] ?? run.current_phase;
  const nextPhaseId =
    PHASE_ORDER[PHASE_ORDER.indexOf(pendingPhase?.id ?? run.current_phase ?? "") + 1];
  const nextLabel = PHASE_LABELS[nextPhaseId] ?? nextPhaseId ?? "Done";

  function handleApprove() {
    setBusy(true);
    onApprove();
  }

  async function handleSubmitFeedback() {
    if (!feedback.trim()) return;
    setBusy(true);
    await workflowEngine.requestChanges(run.id, feedback);
    setBusy(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <HUDFrame
        style={{
          padding: 32,
          maxWidth: 520,
          width: "100%",
          border: "1px solid var(--fn-gold)",
          boxShadow: "0 0 40px rgba(255,200,0,0.15)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <Eyebrow color="gold">⛩ Approval Gate</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 22,
              color: "var(--fn-white)",
              margin: "6px 0 0",
            }}
          >
            {currentLabel} phase complete
          </h2>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fg-2)",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: "0 0 12px" }}>
            The <strong style={{ color: "var(--fn-white)" }}>{currentLabel}</strong> phase has
            produced its artifact. Review the output and choose how to proceed.
          </p>
          {pendingPhase && (
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-neutral)",
                borderRadius: 2,
                padding: "10px 14px",
              }}
            >
              <span style={{ color: "var(--fg-3)", fontSize: 10 }}>EXPECTED ARTIFACT</span>
              <br />
              <span style={{ color: "var(--fn-cyan)" }}>
                {pendingPhase!.artifact.path.replace(/\{project_id\}/g, run.project_id ?? "")}
              </span>
              <br />
              <span style={{ color: "var(--fg-3)", fontSize: 10 }}>DESCRIPTION</span>
              <br />
              {pendingPhase.artifact.description}
            </div>
          )}
          <p style={{ margin: "12px 0 0" }}>
            Next: <strong style={{ color: "var(--fn-purple)" }}>{nextLabel}</strong>
          </p>
        </div>

        {showFeedback && (
          <div style={{ marginBottom: 16 }}>
            <textarea
              placeholder="Describe what changes are needed…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-neutral)",
                borderRadius: 2,
                color: "var(--fg-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                padding: "8px 10px",
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none",
              }}
              autoFocus
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {showFeedback ? (
            <>
              <Btn variant="ghost" onClick={() => setShowFeedback(false)} disabled={busy}>
                Cancel
              </Btn>
              <Btn
                variant="purple"
                onClick={() => {
                  setShowFeedback(false);
                  handleSubmitFeedback();
                }}
                disabled={!feedback.trim() || busy}
              >
                {busy ? "Sending…" : "Submit feedback"}
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={onPause} disabled={busy}>
                Pause workflow
              </Btn>
              <Btn variant="ghost" onClick={() => setShowFeedback(true)} disabled={busy}>
                Request changes
              </Btn>
              <Btn variant="purple" onClick={handleApprove} disabled={busy}>
                {busy ? "Approving…" : "✓ Approve and continue"}
              </Btn>
            </>
          )}
        </div>
      </HUDFrame>
    </div>
  );
}

// ── Active run display ──────────────────────────────────────────────────

function ActiveRunCard({ run }: { run: ActiveRunDisplay }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePause() {
    setBusy(true);
    setErr(null);
    try {
      await invoke("pause_workflow_run");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const started = new Date(run.created_at_ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <HUDFrame style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <StatusDot color={run.status === "running" ? "var(--fn-green)" : "var(--fn-gold)"} />
        <Eyebrow color={run.status === "running" ? "cyan" : "gold"}>
          BMAD Workflow · {run.status === "running" ? "Active" : "Paused"}
        </Eyebrow>
        <Badge color={run.status === "running" ? "online" : "muted"}>{run.current_phase}</Badge>
      </div>

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 18,
          color: "var(--fn-white)",
          marginBottom: 4,
        }}
      >
        {run.project_name}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fn-cyan)",
          marginBottom: 12,
        }}
      >
        {run.workflow_name} · started {started}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--fg-2)",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border-neutral)",
          borderRadius: 2,
          marginBottom: 14,
        }}
      >
        <span style={{ color: "var(--fg-3)", fontSize: 10 }}>IDEA</span>
        <br />
        {run.idea}
      </div>

      {err && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "#FF8FA3",
            marginBottom: 10,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {run.status === "running" && (
          <Btn variant="ghost" onClick={handlePause} disabled={busy}>
            {busy ? "Pausing…" : "Pause workflow"}
          </Btn>
        )}
        {run.status === "paused" && (
          <Btn
            variant="purple"
            onClick={async () => {
              setBusy(true);
              try {
                await invoke("resume_workflow_run");
              } catch (e) {
                setErr(String(e));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            {busy ? "Resuming…" : "Resume workflow"}
          </Btn>
        )}
      </div>
    </HUDFrame>
  );
}

// ── Workflow chooser ────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onStart,
}: {
  workflow: WorkflowMetadata;
  onStart: (workflow: WorkflowMetadata) => void;
}) {
  return (
    <HUDFrame style={{ padding: 20 }}>
      <div style={{ marginBottom: 8 }}>
        <Badge color="purple">{workflow.id}</Badge>
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 16,
          color: "var(--fn-white)",
          marginBottom: 8,
        }}
      >
        {workflow.name}
      </div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--fg-2)",
          margin: "0 0 16px",
          lineHeight: 1.6,
        }}
      >
        {workflow.description}
      </p>
      <Btn variant="purple" onClick={() => onStart(workflow)}>
        Start workflow →
      </Btn>
    </HUDFrame>
  );
}

// ── Setup form ─────────────────────────────────────────────────────────

function SetupForm({
  workflowId,
  workflowName,
  onBack,
  onStarted,
}: {
  workflowId: string;
  workflowName: string;
  onBack: () => void;
  onStarted: (run: WorkflowRun) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const run = await invoke<WorkflowRun>("start_workflow_run", {
        workflowId,
        projectName: projectName.trim(),
        idea: idea.trim(),
      });
      onStarted(run);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const valid = projectName.trim().length > 0 && idea.trim().length > 0 && !busy;

  return (
    <HUDFrame style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Eyebrow color="purple">Starting: {workflowName}</Eyebrow>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 18,
            color: "var(--fn-white)",
            margin: "6px 0 0",
          }}
        >
          Configure your project
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={labelStyle}>
          <span style={labelSpanStyle}>Project name *</span>
          <input
            type="text"
            placeholder="e.g. My API Gateway"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </label>

        <label style={labelStyle}>
          <span style={labelSpanStyle}>Initial idea *</span>
          <textarea
            placeholder="Describe the project you want to build…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)" }}
          />
        </label>

        {error && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "#FF8FA3",
              padding: "8px 12px",
              background: "rgba(255,85,119,0.08)",
              border: "1px solid rgba(255,85,119,0.35)",
              borderRadius: 2,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onBack} disabled={busy}>
            Back
          </Btn>
          <Btn variant="purple" onClick={handleStart} disabled={!valid}>
            {busy ? "Starting…" : "Start workflow →"}
          </Btn>
        </div>
      </div>
    </HUDFrame>
  );
}

// ── Main view ─────────────────────────────────────────────────────────

export function WorkflowsView() {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[] | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRunDisplay | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowMetadata | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    invoke<WorkflowMetadata[]>("list_workflows")
      .then(setWorkflows)
      .catch((e) => setLoadError(String(e)));

    invoke<WorkflowRun | null>("get_workflow_run")
      .then((r) => {
        if (r) {
          const engRun = workflowEngine.getRun();
          setActiveRun({
            id: r.id,
            workflow_id: r.workflow_id,
            workflow_name: r.workflow_name,
            project_name: r.project_name,
            idea: r.idea,
            current_phase: engRun?.current_phase ?? r.phase,
            phase_index: engRun?.phase_index ?? 0,
            status: engRun?.status ?? r.status,
            vault_dir: r.vault_dir,
            active_personas: engRun?.active_personas ?? [],
            created_at_ms: r.created_at_ms,
          });
        } else {
          setActiveRun(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeRun) return;
    const id = setInterval(async () => {
      try {
        const engRun = workflowEngine.getRun();
        if (engRun) {
          setActiveRun({
            id: engRun.id,
            workflow_id: engRun.workflow_id,
            workflow_name: engRun.workflow_name,
            project_name: engRun.project_name,
            idea: engRun.idea,
            current_phase: engRun.current_phase,
            phase_index: engRun.phase_index,
            status: engRun.status,
            vault_dir: engRun.vault_dir,
            active_personas: engRun.active_personas,
            created_at_ms: engRun.created_at_ms,
          });
        }
        const rustRun = await invoke<WorkflowRun | null>("get_workflow_run");
        if (!rustRun) {
          setActiveRun(null);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [activeRun]);

  if (loadError) {
    return (
      <ViewShell eyebrow="Workflows" title="BMAD" titleAccent="Engine">
        <HUDFrame style={{ padding: 22 }}>
          <p style={{ fontFamily: "var(--font-mono)", color: "#FF8FA3", fontSize: 13 }}>
            {loadError}
          </p>
        </HUDFrame>
      </ViewShell>
    );
  }

  if (activeRun) {
    const displayRun = activeRun as ActiveRunDisplay;
    return (
      <ViewShell eyebrow="Workflows" title="BMAD" titleAccent="Engine">
        {displayRun.status === "paused" && !workflowEngine.getRun() && (
          <ResumePrompt
            run={displayRun}
            onResume={async () => {
              const vaultDir = displayRun.vault_dir;
              const projectId =
                displayRun.project_id ?? vaultDir.split(/[/\\]/).pop() ?? displayRun.project_name;
              await workflowEngine.startRun(
                displayRun.workflow_id,
                displayRun.project_name,
                projectId,
                vaultDir,
                displayRun.idea,
              );
            }}
            onDismiss={async () => {
              await invoke("dismiss_workflow_run");
              setActiveRun(null);
            }}
          />
        )}
        {displayRun.status === "approval_pending" && (
          <ApprovalGate
            run={displayRun}
            onApprove={() => workflowEngine.approvePhase(displayRun.id)}
            onPause={() => workflowEngine.pause()}
          />
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <ActiveRunCard run={displayRun} />
            {displayRun.active_personas.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--fg-3)",
                    alignSelf: "center",
                  }}
                >
                  Active personas:
                </span>
                {displayRun.active_personas.map((p) => (
                  <Badge key={p} color="purple">
                    {p}
                  </Badge>
                ))}
              </div>
            )}
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fg-3)",
                marginTop: 12,
              }}
            >
              Vault: <code style={{ color: "var(--fn-cyan)" }}>{displayRun.vault_dir}</code>
            </p>
          </div>
          <PhaseStatusSidebar currentPhase={displayRun.current_phase} status={displayRun.status} />
        </div>
      </ViewShell>
    );
  }

  if (selectedWorkflow) {
    return (
      <ViewShell eyebrow="Workflows" title="BMAD" titleAccent="Engine">
        <SetupForm
          workflowId={selectedWorkflow.id}
          workflowName={selectedWorkflow.name}
          onBack={() => setSelectedWorkflow(null)}
          onStarted={async (run) => {
            const vaultDir = run.vault_dir;
            const projectId = vaultDir.split(/[/\\]/).pop() ?? run.project_name;
            workflowEngine.startRun(
              run.workflow_id,
              run.project_name,
              projectId,
              vaultDir,
              run.idea,
            );
            setActiveRun({
              id: run.id,
              workflow_id: run.workflow_id,
              workflow_name: run.workflow_name,
              project_name: run.project_name,
              idea: run.idea,
              current_phase: run.phase,
              phase_index: 0,
              status: run.status,
              vault_dir: run.vault_dir,
              active_personas: [],
              created_at_ms: run.created_at_ms,
              project_id: projectId,
            });
            setSelectedWorkflow(null);
          }}
        />
      </ViewShell>
    );
  }

  return (
    <ViewShell eyebrow="Workflows" title="BMAD" titleAccent="Engine">
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--fg-2)",
          marginBottom: 8,
        }}
      >
        Choose a workflow to start. Each workflow drives a team of personas through a structured
        method, producing artifacts in your vault.
      </div>

      {!workflows ? (
        <HUDFrame style={{ padding: 22 }}>
          <p style={{ fontFamily: "var(--font-mono)", color: "var(--fg-3)", fontSize: 12 }}>
            Loading workflows…
          </p>
        </HUDFrame>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {workflows.map((w) => (
            <WorkflowCard key={w.id} workflow={w} onStart={(wf) => setSelectedWorkflow(wf)} />
          ))}
        </div>
      )}
    </ViewShell>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelSpanStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--fg-3)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border-neutral)",
  borderRadius: 2,
  color: "var(--fg-1)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "8px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
