// Projects view — Story 1.12 acceptance criteria:
//   "When I open or create a project in the desktop shell, within 5
//    seconds a Claude Code process is running inside a Zellij pane …"
//
// This component is the desktop shell's project-open surface. It maps the
// Rust command surface (open_project / current_project / close_active_project
// / spawn_dev_persona / dev_persona_status / zellij_available) to a UI that
// walks the user through:
//
//   1. No project open — primary "Open project" CTA that triggers the
//      Tauri dialog plugin's directory picker.
//   2. Project open, Dev not yet spawned — show project info card + a
//      primary "Spawn Dev persona" CTA.
//   3. Spawning — disabled CTA with progress label.
//   4. Running — green-dot status + session name + a hint that the actual
//      Zellij pane is in its own native terminal window (Story 1.12a
//      scope; embedded-terminal in webview comes in 1.14/1.16).
//   5. Zellij missing — install instructions + retry button.
//
// Status polls every 3s while a project is open so external `zellij kill`
// or session-crash is reflected without requiring user action. The polling
// is best-effort; transient errors don't surface as toast spam (we only
// show the latest error).

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import { PtyTail } from "../lib/PtyTail";

interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  opened_at: number;
}

type DevPersonaStatus =
  | { state: "zellij-missing" }
  | { state: "not-running"; session_name: string }
  | { state: "running"; session_name: string };

const STATUS_POLL_MS = 3000;

export function ProjectsView() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [status, setStatus] = useState<DevPersonaStatus | null>(null);
  const [busy, setBusy] = useState<null | "opening" | "spawning" | "closing">(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Load the active project on mount.
  useEffect(() => {
    invoke<ProjectInfo | null>("current_project")
      .then(setProject)
      .catch((e) => setError(`Could not read active project: ${String(e)}`))
      .finally(() => setBootstrapped(true));
  }, []);

  // Poll Dev persona status whenever a project is open.
  useEffect(() => {
    if (!project) {
      setStatus(null);
      return;
    }
    let alive = true;
    const refresh = () => {
      invoke<DevPersonaStatus>("dev_persona_status", { projectId: project.id })
        .then((s) => alive && setStatus(s))
        .catch((e) => alive && setError(`Status poll failed: ${String(e)}`));
    };
    refresh();
    const interval = window.setInterval(refresh, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [project]);

  async function pickAndOpen() {
    setError(null);
    setBusy("opening");
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Open project folder",
      });
      if (typeof picked === "string") {
        const info = await invoke<ProjectInfo>("open_project", { path: picked });
        setProject(info);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function spawnDev() {
    if (!project) return;
    setError(null);
    setBusy("spawning");
    try {
      const result = await invoke<DevPersonaStatus>("spawn_dev_persona", {
        projectId: project.id,
      });
      setStatus(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function closeProject() {
    setError(null);
    setBusy("closing");
    try {
      await invoke<void>("close_active_project");
      setProject(null);
      setStatus(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!bootstrapped) {
    return (
      <ViewShell eyebrow="Projects" title="The Orchestration" titleAccent="Grid">
        <HUDFrame style={{ padding: 32, display: "grid", placeItems: "center" }}>
          <Eyebrow color="muted">Reading workspace state…</Eyebrow>
        </HUDFrame>
      </ViewShell>
    );
  }

  const eyebrowText = project ? `Projects · ${project.name}` : "Projects · 0 open";

  return (
    <ViewShell eyebrow={eyebrowText} title="The Orchestration" titleAccent="Grid">
      {error && <ErrorAlert text={error} onDismiss={() => setError(null)} />}

      {!project && <EmptyState onOpen={pickAndOpen} opening={busy === "opening"} />}

      {project && (
        <>
          <ProjectCard project={project} onClose={closeProject} closing={busy === "closing"} />
          <DevPersonaPanel
            status={status}
            spawning={busy === "spawning"}
            onSpawn={spawnDev}
            onRefresh={() => {
              if (!project) return;
              invoke<DevPersonaStatus>("dev_persona_status", { projectId: project.id })
                .then(setStatus)
                .catch((e) => setError(`Status poll failed: ${String(e)}`));
            }}
          />
          {/* Story 1.16c: embedded xterm.js terminal that tails the
              supervisor's PTY tap file for the Dev persona. Mounts only
              when Dev is running; `key={project.id}` forces a remount
              on project switch so stale state doesn't leak. */}
          {status?.state === "running" && <DevTerminalEmbed key={project.id} />}
        </>
      )}
    </ViewShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// View shell — matches the header pattern App.tsx's MainSlot uses for
// the other rail items so swapping in/out of this view feels seamless.

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

function EmptyState({ onOpen, opening }: { onOpen: () => void; opening: boolean }) {
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
          Open a folder to start
        </div>
        <p
          style={{
            color: "var(--fg-3)",
            fontSize: 13,
            lineHeight: 1.5,
            margin: "0 0 22px",
          }}
        >
          Pick any directory — your code, a new working folder, a checked-out repo. The Dev persona
          (Claude Code) spawns into a Zellij pane scoped to that folder.
        </p>
        <Btn variant="primary" onClick={onOpen} disabled={opening}>
          {opening ? "Picking…" : "Open project →"}
        </Btn>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onClose,
  closing,
}: {
  project: ProjectInfo;
  onClose: () => void;
  closing: boolean;
}) {
  const openedAt = new Date(project.opened_at * 1000);
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
        <div style={{ minWidth: 0 }}>
          <Eyebrow>Active project</Eyebrow>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 24,
              color: "var(--fn-white)",
              letterSpacing: "-0.01em",
              margin: "6px 0 4px",
            }}
          >
            {project.name}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--fn-cyan)",
              wordBreak: "break-all",
            }}
          >
            {project.path}
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-3)",
            }}
          >
            <span>
              ID <span style={{ color: "var(--fn-cyan)" }}>{project.id}</span>
            </span>
            <span>
              Opened{" "}
              <span style={{ color: "var(--fn-cyan)" }}>
                {openedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          </div>
        </div>
        <Btn variant="ghost" onClick={onClose} disabled={closing}>
          {closing ? "Closing…" : "Close project"}
        </Btn>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function DevPersonaPanel({
  status,
  spawning,
  onSpawn,
  onRefresh,
}: {
  status: DevPersonaStatus | null;
  spawning: boolean;
  onSpawn: () => void;
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
          <Eyebrow color="cyan">Dev persona · Claude Code</Eyebrow>
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
        <DevPersonaActions
          status={status}
          spawning={spawning}
          onSpawn={onSpawn}
          onRefresh={onRefresh}
        />
      </div>
    </HUDFrame>
  );
}

function StatusBody({ status }: { status: DevPersonaStatus | null }) {
  if (status === null) {
    return (
      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
        Polling Zellij for the dev session…
      </p>
    );
  }
  if (status.state === "zellij-missing") {
    return (
      <div>
        <p style={{ color: "var(--fg-2)", fontSize: 13, margin: "0 0 8px", maxWidth: 560 }}>
          Zellij isn&apos;t on your PATH. The Dev persona runs inside a Zellij pane so we can
          re-attach across desktop-app restarts.
        </p>
        <p
          style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, fontFamily: "var(--font-mono)" }}
        >
          Install:&nbsp;
          <code style={{ color: "var(--fn-cyan)" }}>winget install zellij-org.zellij</code> · or
          v0.44.3+ from{" "}
          <a
            href="https://github.com/zellij-org/zellij/releases"
            style={{ color: "var(--fn-cyan)" }}
          >
            github.com/zellij-org/zellij
          </a>
        </p>
      </div>
    );
  }
  if (status.state === "not-running") {
    return (
      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
        Spawn to start Claude Code in a new pane scoped to the active project. Session name will be{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          {status.session_name}
        </code>
        .
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
        Claude Code is running in a Zellij session. The embedded terminal below is bidirectional —
        type directly into it. The session is still reachable in your own terminal with{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          zellij attach {status.session_name}
        </code>{" "}
        for parallel observation.
      </p>
    </div>
  );
}

function DevPersonaActions({
  status,
  spawning,
  onSpawn,
  onRefresh,
}: {
  status: DevPersonaStatus | null;
  spawning: boolean;
  onSpawn: () => void;
  onRefresh: () => void;
}) {
  if (status === null) {
    return null;
  }
  if (status.state === "zellij-missing") {
    return (
      <Btn variant="secondary" onClick={onRefresh}>
        Re-check
      </Btn>
    );
  }
  if (status.state === "not-running") {
    return (
      <Btn variant="primary" onClick={onSpawn} disabled={spawning}>
        {spawning ? "Spawning…" : "Spawn Dev persona →"}
      </Btn>
    );
  }
  // running
  return (
    <Btn variant="ghost" onClick={onRefresh}>
      Refresh
    </Btn>
  );
}

// ────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────
// Story 1.16c — embedded xterm.js terminal that tails the supervisor's
// `.pty.raw` for the Dev persona. Mounted by the parent when Dev's
// status is "running"; the PtyTail instance is created in mount-effect
// and disposed on unmount.

function DevTerminalEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<PtyTail | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const tail = new PtyTail({ personaId: "dev" });
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
        Dev · live tap
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
