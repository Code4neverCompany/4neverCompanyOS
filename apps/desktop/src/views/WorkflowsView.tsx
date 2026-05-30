// Workflows view — Story 4.1 (Epic 4: One-Click BMAD Workflow Execution).
//
// "Start a BMAD project" entry point. Lists available workflows,
// lets the user pick one, then starts a run that creates a vault
// project directory and records the run in the desktop shell state.
//
// Substantive phase execution (Story 4.2) wires the workflow-engine
// package to drive personas through each BMAD phase. This view
// owns the chooser UI and active-run display for Story 4-1 only.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";

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

// ── Active run display ──────────────────────────────────────────────────

function ActiveRunCard({ run }: { run: WorkflowRun }) {
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
        <Badge color={run.status === "running" ? "online" : "muted"}>{run.phase}</Badge>
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
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowMetadata | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    invoke<WorkflowMetadata[]>("list_workflows")
      .then(setWorkflows)
      .catch((e) => setLoadError(String(e)));

    invoke<WorkflowRun | null>("get_workflow_run")
      .then((r) => setActiveRun(r))
      .catch(() => {});
  }, []);

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
    return (
      <ViewShell eyebrow="Workflows" title="BMAD" titleAccent="Engine">
        <ActiveRunCard run={activeRun} />
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-3)",
            marginTop: 8,
          }}
        >
          Phase execution (Story 4-2) drives personas through each BMAD stage. Vault:{" "}
          <code style={{ color: "var(--fn-cyan)" }}>{activeRun.vault_dir}</code>
        </p>
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
          onStarted={(run) => {
            setActiveRun(run);
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
