// Memory view — Story 1.16 acceptance criteria:
//   "Hermes' TUI is visible alongside the Dev pane in the desktop UI"
//
// This is the Hermes-side counterpart to ProjectsView. Layout mirrors
// the ProjectsView Dev panel for visual consistency:
//
//   1. No project open — gentle empty state pointing the user back to
//      Projects (Hermes is per-project, so it needs a project context).
//   2. Project open, Hermes not yet spawned — status panel + "Spawn
//      Hermes" CTA. Mirror of the DevPersonaPanel "not-running" state.
//   3. Spawning — disabled CTA with progress label.
//   4. Running — green-dot status badge + embedded xterm.js terminal
//      that tails `<vault>/personas/hermes/log/<date>.pty.raw`. (1.16c
//      ships display-only; input via `zellij attach` until 1.16d adds
//      bidirectional `.pty.in` plumbing.)
//   5. Zellij missing — same install hint as ProjectsView.
//
// The terminal lives in a HUDFrame so it integrates visually with the
// rest of the 4never shell. A PtyTail instance is created when the
// running state mounts and disposed on unmount; React's StrictMode
// double-mount is handled by the Rust-side dedupe in `tail_persona_pty`.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import { PtyTail } from "../lib/PtyTail";

interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  opened_at: number;
}

type HermesStatusValue =
  | { state: "zellij-missing" }
  | { state: "not-running"; session_name: string }
  | { state: "running"; session_name: string };

const STATUS_POLL_MS = 3000;

export function MemoryView() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [status, setStatus] = useState<HermesStatusValue | null>(null);
  const [busy, setBusy] = useState<null | "spawning" | "killing">(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Load active project on mount.
  useEffect(() => {
    invoke<ProjectInfo | null>("current_project")
      .then(setProject)
      .catch((e) => setError(`Could not read active project: ${String(e)}`))
      .finally(() => setBootstrapped(true));
  }, []);

  // Poll Hermes status while a project is open.
  useEffect(() => {
    if (!project) {
      setStatus(null);
      return;
    }
    let alive = true;
    const refresh = () => {
      invoke<HermesStatusValue>("hermes_status", { projectId: project.id })
        .then((s) => alive && setStatus(s))
        .catch((e) => alive && setError(`Hermes status poll failed: ${String(e)}`));
    };
    refresh();
    const interval = window.setInterval(refresh, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [project]);

  async function spawnHermes() {
    if (!project) return;
    setError(null);
    setBusy("spawning");
    try {
      const result = await invoke<HermesStatusValue>("spawn_hermes", {
        projectId: project.id,
      });
      setStatus(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function killHermes() {
    if (!project) return;
    setError(null);
    setBusy("killing");
    try {
      await invoke<void>("kill_hermes", { projectId: project.id });
      // Optimistically flip to not-running; the next poll will confirm.
      setStatus({
        state: "not-running",
        session_name: status?.state !== "zellij-missing" ? (status?.session_name ?? "") : "",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  function refreshStatus() {
    if (!project) return;
    invoke<HermesStatusValue>("hermes_status", { projectId: project.id })
      .then(setStatus)
      .catch((e) => setError(`Hermes status poll failed: ${String(e)}`));
  }

  if (!bootstrapped) {
    return (
      <ViewShell eyebrow="Memory" title="The Hermes" titleAccent="Cortex">
        <HUDFrame style={{ padding: 32, display: "grid", placeItems: "center" }}>
          <Eyebrow color="muted">Reading workspace state…</Eyebrow>
        </HUDFrame>
      </ViewShell>
    );
  }

  const eyebrowText = project ? `Memory · ${project.name}` : "Memory · no project";

  return (
    <ViewShell eyebrow={eyebrowText} title="The Hermes" titleAccent="Cortex">
      {error && <ErrorAlert text={error} onDismiss={() => setError(null)} />}

      {!project && <NoProjectState />}

      {project && (
        <>
          <HermesPanel
            project={project}
            status={status}
            busy={busy}
            onSpawn={spawnHermes}
            onKill={killHermes}
            onRefresh={refreshStatus}
          />
          {status?.state === "running" && <HermesTerminalEmbed key={project.id} />}
        </>
      )}
    </ViewShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// View shell — same shape as ProjectsView so swapping rail items feels
// seamless. (A future refactor may extract this into a shared `views/
// ViewShell` once a third view materializes — Vault in Story 1.x.)
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

// ────────────────────────────────────────────────────────────────────

function NoProjectState() {
  return (
    <HUDFrame
      style={{
        flex: 1,
        minHeight: 320,
        display: "grid",
        placeItems: "center",
        padding: 32,
        position: "relative",
      }}
    >
      <div className="scanline" />
      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <Eyebrow color="cyan">No project open</Eyebrow>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 26,
            color: "var(--fn-white)",
            letterSpacing: "-0.01em",
            margin: "8px 0 14px",
          }}
        >
          Hermes runs per project
        </div>
        <p style={{ color: "var(--fg-3)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Open a project from the Projects rail first. Hermes spawns into its own Zellij session
          scoped to the active project so its memory + decisions stay local to your work context.
        </p>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function HermesPanel({
  project,
  status,
  busy,
  onSpawn,
  onKill,
  onRefresh,
}: {
  project: ProjectInfo;
  status: HermesStatusValue | null;
  busy: null | "spawning" | "killing";
  onSpawn: () => void;
  onKill: () => void;
  onRefresh: () => void;
}) {
  return (
    <HUDFrame style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <Eyebrow color="cyan">Hermes · {project.name}</Eyebrow>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 20,
              color: "var(--fn-white)",
              letterSpacing: "-0.01em",
              margin: "6px 0 4px",
            }}
          >
            {status === null && "Checking…"}
            {status?.state === "zellij-missing" && "Zellij not installed"}
            {status?.state === "not-running" && "Not running"}
            {status?.state === "running" && "Running"}
          </div>
          <StatusBody status={status} />
        </div>
        <HermesActions
          status={status}
          busy={busy}
          onSpawn={onSpawn}
          onKill={onKill}
          onRefresh={onRefresh}
        />
      </div>
    </HUDFrame>
  );
}

function StatusBody({ status }: { status: HermesStatusValue | null }) {
  if (status === null) {
    return (
      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
        Polling Zellij for the Hermes session…
      </p>
    );
  }
  if (status.state === "zellij-missing") {
    return (
      <div>
        <p style={{ color: "var(--fg-2)", fontSize: 13, margin: "0 0 8px", maxWidth: 560 }}>
          Zellij isn&apos;t on your PATH. Hermes spawns through a Zellij session so its memory state
          survives desktop-app restarts (same restart-survival path as the Dev persona).
        </p>
        <p
          style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, fontFamily: "var(--font-mono)" }}
        >
          Install:&nbsp;
          <code style={{ color: "var(--fn-cyan)" }}>winget install zellij-org.zellij</code>
        </p>
      </div>
    );
  }
  if (status.state === "not-running") {
    return (
      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
        Spawn to start Hermes in a Zellij pane named{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          {status.session_name}
        </code>
        . Hermes lives alongside Dev as an independent session — killing one doesn&apos;t affect the
        other.
      </p>
    );
  }
  // running
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <StatusDot color="#6BFF8C" />
        <Badge color="online">attached</Badge>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--fn-cyan)",
          }}
        >
          {status.session_name}
        </span>
      </div>
      <p style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, maxWidth: 560 }}>
        Embedded terminal below is bidirectional — type into it and Hermes sees the keystrokes via
        the supervisor&apos;s PTY. The Zellij session is still reachable from your own terminal with{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          zellij attach {status.session_name}
        </code>{" "}
        for parallel observation.
      </p>
    </div>
  );
}

function HermesActions({
  status,
  busy,
  onSpawn,
  onKill,
  onRefresh,
}: {
  status: HermesStatusValue | null;
  busy: null | "spawning" | "killing";
  onSpawn: () => void;
  onKill: () => void;
  onRefresh: () => void;
}) {
  if (status === null) return null;
  if (status.state === "zellij-missing") {
    return (
      <Btn variant="secondary" onClick={onRefresh}>
        Re-check
      </Btn>
    );
  }
  if (status.state === "not-running") {
    return (
      <Btn variant="primary" onClick={onSpawn} disabled={busy === "spawning"}>
        {busy === "spawning" ? "Spawning…" : "Spawn Hermes →"}
      </Btn>
    );
  }
  // running
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Btn variant="ghost" onClick={onRefresh}>
        Refresh
      </Btn>
      <Btn variant="secondary" onClick={onKill} disabled={busy === "killing"}>
        {busy === "killing" ? "Stopping…" : "Stop Hermes"}
      </Btn>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Embedded xterm.js terminal — created once when the running state
// mounts; disposed on unmount. The `key={project.id}` at the call site
// forces a remount on project switch so stale state from a previous
// project doesn't leak into the new project's view.

function HermesTerminalEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<PtyTail | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const tail = new PtyTail({ personaId: "hermes" });
    tailRef.current = tail;
    void tail.mount(containerRef.current);
    return () => {
      void tail.dispose();
      tailRef.current = null;
    };
  }, []);

  return (
    <HUDFrame
      style={{
        flex: 1,
        minHeight: 320,
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--border-neutral)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <StatusDot color="#6BFF8C" />
        Hermes · live tap
      </div>
      <div ref={containerRef} className="pty-terminal-host" />
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function ErrorAlert({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        padding: "10px 14px",
        borderRadius: 2,
        background: "rgba(255, 85, 119, 0.08)",
        border: "1px solid rgba(255, 85, 119, 0.45)",
        color: "#FF8FA3",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "1px solid rgba(255, 85, 119, 0.45)",
          color: "#FF8FA3",
          padding: "2px 8px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          cursor: "pointer",
          borderRadius: 2,
        }}
      >
        DISMISS ✕
      </button>
    </div>
  );
}
