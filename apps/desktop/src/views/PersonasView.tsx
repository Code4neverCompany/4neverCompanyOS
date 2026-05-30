// Personas view — Story 2.3 acceptance criteria:
//   "Frontend Designer persona spawnable from AppShell. Agent can read
//    recent Obsidian vault entries at spawn time and write notes back."
//
// This view surfaces the two fixed personas (Dev and Frontend Designer)
// in one panel so the user can manage both from a single rail item.
// Dev status comes from the same `dev_persona_status` command used by
// ProjectsView; Designer status comes from the new `designer_persona_status`
// command added in Story 2.3.
//
// Vault context: the panel shows how many vault entries will be injected
// into `agy.md` at spawn time (`vault_context_summary`). A "Write note"
// inline form lets the user log a note back to the vault inbox directly
// from the UI without leaving the desktop app.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import {
  BmbAddAgentPanel,
  type BmbAddAgentPanelDefaultValues,
  type DynamicPersonaInfo,
  type AuthoredPersonaInfo,
} from "../panels/bmb-add-agent/BmbAddAgentPanel";
import {
  SpawnApprovalTray,
  type SpawnProposalRecord,
} from "../panels/spawn-approval/SpawnApprovalTray";

interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  opened_at: number;
}

type PersonaState =
  | { state: "zellij-missing" }
  | { state: "not-running"; session_name: string }
  | { state: "running"; session_name: string };

interface VaultContextSummary {
  entry_count: number;
  titles: string[];
  total_chars: number;
}

// Story 3.5: best-effort out-of-scope write summary, read from
// `vault/personas/<persona-id>/out-of-scope-writes.log` via the
// `persona_scope_violations` command.
interface ScopeViolationSummary {
  persona_id: string;
  count: number;
  latest_path: string | null;
  latest_ts: string | null;
}

// Story 3.4: drift state for a persistent dynamic persona (FR-21).
// Polled from `get_persona_drift_state` on the same cadence as scope
// violations. `status` is "clean" | "drifted" | "dismissed".
interface PersonaDriftReport {
  persona_id: string;
  status: "clean" | "drifted" | "dismissed";
  field_count: number;
  fields: Array<{ relative_path: string; detected_at: string }>;
  first_detected_at: string | null;
}

const STATUS_POLL_MS = 3000;

// Fixed-persona IDs as used by the supervisor (and thus the vault scope
// log dir name). Must match the persona-id argv passed in
// spawn_dev_persona / spawn_designer_persona.
const DEV_PERSONA_ID = "dev";
const DESIGNER_PERSONA_ID = "frontend-designer";

// Story 3.5: surfacing the scope-violation badge is configurable — the
// underlying log is always written, but the user can hide the pane badge.
// Persisted in localStorage so the preference survives restarts.
const SCOPE_BADGE_PREF_KEY = "c4n.scopeBadges.enabled";

function loadScopeBadgePref(): boolean {
  try {
    return window.localStorage.getItem(SCOPE_BADGE_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveScopeBadgePref(enabled: boolean) {
  try {
    window.localStorage.setItem(SCOPE_BADGE_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // localStorage unavailable — preference just won't persist.
  }
}

// Poll the best-effort out-of-scope write log for one persona. Returns a
// summary or null until the first read completes. `enabled` gates both the
// polling and the surfacing, so disabling the badge stops the IPC chatter.
function useScopeViolations(
  personaId: string | null,
  enabled: boolean,
): ScopeViolationSummary | null {
  const [summary, setSummary] = useState<ScopeViolationSummary | null>(null);

  useEffect(() => {
    if (!enabled || !personaId) {
      setSummary(null);
      return;
    }
    let alive = true;
    const poll = () => {
      invoke<ScopeViolationSummary>("persona_scope_violations", { personaId })
        .then((s) => alive && setSummary(s))
        .catch(() => {}); // log read failure is non-fatal for the badge
    };
    poll();
    const id = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [personaId, enabled]);

  return summary;
}

// Story 3.4: poll drift state for a persistent dynamic persona (FR-21).
// Returns null until the first read completes. `slug` is null for
// ephemerals (they have no vault dir) or when polling is not needed.
function useDriftState(slug: string | null): PersonaDriftReport | null {
  const [report, setReport] = useState<PersonaDriftReport | null>(null);

  useEffect(() => {
    if (!slug) {
      setReport(null);
      return;
    }
    let alive = true;
    const poll = () => {
      invoke<PersonaDriftReport>("get_persona_drift_state", { slug })
        .then((r) => alive && setReport(r))
        .catch(() => {}); // non-fatal for the badge
    };
    poll();
    const id = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [slug]);

  return report;
}

export function PersonasView() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [devStatus, setDevStatus] = useState<PersonaState | null>(null);
  const [designerStatus, setDesignerStatus] = useState<PersonaState | null>(null);
  const [vaultSummary, setVaultSummary] = useState<VaultContextSummary | null>(null);
  const [busyDev, setBusyDev] = useState(false);
  const [busyDesigner, setBusyDesigner] = useState<null | "spawning" | "killing">(null);
  const [dynamicPersonas, setDynamicPersonas] = useState<DynamicPersonaInfo[]>([]);
  const [authoredPersonas, setAuthoredPersonas] = useState<AuthoredPersonaInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [writeNoteOpen, setWriteNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteWriting, setNoteWriting] = useState(false);
  const [noteConfirm, setNoteConfirm] = useState<string | null>(null);
  // Story 3.5: configurable surfacing of the scope-violation pane badge.
  const [scopeBadgesEnabled, setScopeBadgesEnabled] = useState(loadScopeBadgePref);
  // Story 3.8: pre-fill values for the spawn form when user clicks Modify on a proposal.
  const [spawnDefaultValues, setSpawnDefaultValues] = useState<
    BmbAddAgentPanelDefaultValues | undefined
  >();

  function toggleScopeBadges() {
    setScopeBadgesEnabled((v) => {
      const next = !v;
      saveScopeBadgePref(next);
      return next;
    });
  }

  useEffect(() => {
    invoke<ProjectInfo | null>("current_project")
      .then(setProject)
      .catch((e) => setError(`Could not read active project: ${String(e)}`))
      .finally(() => setBootstrapped(true));

    // Load vault summary (independent of project).
    invoke<VaultContextSummary>("vault_context_summary")
      .then(setVaultSummary)
      .catch(() => {}); // vault may not be configured yet — silent

    // Load authored personas (Story 3.10).
    invoke<AuthoredPersonaInfo[]>("list_authored_personas")
      .then(setAuthoredPersonas)
      .catch(() => {}); // vault may not be configured yet — silent
  }, []);

  useEffect(() => {
    if (!project) {
      setDevStatus(null);
      setDesignerStatus(null);
      return;
    }
    let alive = true;
    const poll = () => {
      invoke<PersonaState>("dev_persona_status", { projectId: project.id })
        .then((s) => alive && setDevStatus(s))
        .catch(() => {});
      invoke<PersonaState>("designer_persona_status", { projectId: project.id })
        .then((s) => alive && setDesignerStatus(s))
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [project]);

  async function refreshVault() {
    try {
      const s = await invoke<VaultContextSummary>("vault_context_summary");
      setVaultSummary(s);
    } catch {
      // silent
    }
  }

  async function spawnDesigner() {
    if (!project) return;
    setError(null);
    setBusyDesigner("spawning");
    try {
      const s = await invoke<PersonaState>("spawn_designer_persona", { projectId: project.id });
      setDesignerStatus(s);
      // Refresh vault summary after spawn so entry count reflects what was injected.
      await refreshVault();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyDesigner(null);
    }
  }

  async function killDesigner() {
    if (!project) return;
    setError(null);
    setBusyDesigner("killing");
    try {
      await invoke<void>("kill_designer_persona", { projectId: project.id });
      setDesignerStatus({
        state: "not-running",
        session_name:
          designerStatus?.state !== "zellij-missing" ? (designerStatus?.session_name ?? "") : "",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyDesigner(null);
    }
  }

  async function submitNote() {
    if (!noteTitle.trim()) return;
    setNoteWriting(true);
    try {
      const path = await invoke<string>("write_vault_note", {
        title: noteTitle.trim(),
        body: noteBody.trim(),
      });
      setNoteConfirm(`Written → ${path}`);
      setNoteTitle("");
      setNoteBody("");
      setTimeout(() => {
        setNoteConfirm(null);
        setWriteNoteOpen(false);
      }, 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setNoteWriting(false);
    }
  }

  if (!bootstrapped) {
    return (
      <ViewShell eyebrow="Personas" title="The Two" titleAccent="Personas">
        <HUDFrame style={{ padding: 32, display: "grid", placeItems: "center" }}>
          <Eyebrow color="muted">Reading workspace state…</Eyebrow>
        </HUDFrame>
      </ViewShell>
    );
  }

  const eyebrowText = project ? `Personas · ${project.name}` : "Personas · 2 fixed";

  function handleModifyProposal(proposal: SpawnProposalRecord) {
    setSpawnDefaultValues({
      name: proposal.name,
      backingCli: proposal.persona_type,
      lifecycle: proposal.lifecycle as "persistent" | "ephemeral",
      taskPrompt: proposal.task_description,
    });
  }

  return (
    <ViewShell eyebrow={eyebrowText} title="The Two" titleAccent="Personas">
      {error && <ErrorAlert text={error} onDismiss={() => setError(null)} />}

      {/* Vault context status bar */}
      <VaultContextBar summary={vaultSummary} onRefresh={refreshVault} />

      {/* Story 3.8: Hermes spawn proposal approval tray */}
      <SpawnApprovalTray
        onModify={handleModifyProposal}
        onSpawned={(p) => setDynamicPersonas((prev) => [p, ...prev])}
      />

      {!project && <NoProjectState />}

      {project && (
        <>
          {/* Scope-violation surfacing toggle (Story 3.5) */}
          <ScopeBadgeToggle enabled={scopeBadgesEnabled} onToggle={toggleScopeBadges} />

          {/* Dev persona — read-only mirror of ProjectsView status */}
          <DevStatusPanel
            status={devStatus}
            busy={busyDev}
            setBusy={setBusyDev}
            project={project}
            scopeBadgesEnabled={scopeBadgesEnabled}
          />

          {/* Frontend Designer persona */}
          <DesignerPanel
            status={designerStatus}
            busy={busyDesigner}
            project={project}
            scopeBadgesEnabled={scopeBadgesEnabled}
            onSpawn={spawnDesigner}
            onKill={killDesigner}
            onRefresh={() => {
              if (!project) return;
              invoke<PersonaState>("designer_persona_status", { projectId: project.id })
                .then(setDesignerStatus)
                .catch(() => {});
            }}
          />

          {/* Vault write-back panel */}
          <VaultWritePanel
            open={writeNoteOpen}
            onToggle={() => setWriteNoteOpen((v) => !v)}
            title={noteTitle}
            body={noteBody}
            onTitleChange={setNoteTitle}
            onBodyChange={setNoteBody}
            onSubmit={submitNote}
            writing={noteWriting}
            confirm={noteConfirm}
          />

          {/* BMad Builder — Add Agent / Author Persona panel (Stories 3.1 + 3.10) */}
          <BmbAddAgentPanel
            onSpawned={(p) => setDynamicPersonas((prev) => [p, ...prev])}
            onAuthored={(p) =>
              setAuthoredPersonas((prev) => [p, ...prev.filter((a) => a.slug !== p.slug)])
            }
            {...(spawnDefaultValues ? { defaultValues: spawnDefaultValues } : {})}
          />

          {/* Authored persona list (Story 3.10) */}
          {authoredPersonas.length > 0 && (
            <AuthoredPersonaList
              personas={authoredPersonas}
              project={project}
              onSpawned={(p) => setDynamicPersonas((prev) => [p, ...prev])}
            />
          )}

          {/* Dynamic persona list */}
          {dynamicPersonas.length > 0 && (
            <DynamicPersonaList
              personas={dynamicPersonas}
              scopeBadgesEnabled={scopeBadgesEnabled}
              onKill={(sessionName) =>
                setDynamicPersonas((prev) => prev.filter((p) => p.session_name !== sessionName))
              }
            />
          )}
        </>
      )}
    </ViewShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// Story 3.5 — scope-violation pane badge

// Non-blocking badge surfaced on a persona's pane when the best-effort
// vault scope monitor has logged writes outside the persona's scope.
// FR-29: observability only — this never blocks the write, it just makes
// the violation visible. Renders nothing when there are no violations.
function ScopeViolationBadge({ summary }: { summary: ScopeViolationSummary | null }) {
  if (!summary || summary.count === 0) return null;
  const title = summary.latest_path
    ? `${summary.count} out-of-scope write${summary.count === 1 ? "" : "s"} — latest: ${summary.latest_path}${
        summary.latest_ts ? ` @ ${summary.latest_ts}` : ""
      }`
    : `${summary.count} out-of-scope write${summary.count === 1 ? "" : "s"}`;
  return (
    <span title={title} style={{ display: "inline-flex" }}>
      <Badge color="warn">⚠ {summary.count} out-of-scope</Badge>
    </span>
  );
}

// Story 3.4: drift badge shown on a persona card when vault runtime state
// has changed but the canonical definition file hasn't been updated (FR-21).
// The badge is dismissible — clicking Dismiss calls `dismiss_persona_drift`,
// suppressing it until the next new vault change.
function DriftBadge({
  report,
  onDismiss,
}: {
  report: PersonaDriftReport | null;
  onDismiss?: () => void;
}) {
  if (!report || report.status !== "drifted") return null;
  const title =
    report.field_count === 1
      ? `1 vault file changed since last definition update: ${report.fields[0]?.relative_path}`
      : `${report.field_count} vault files changed since last definition update`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span title={title} style={{ display: "inline-flex" }}>
        <Badge color="warn">⟳ {report.field_count} drift</Badge>
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss drift badge until next vault change"
          style={{
            background: "none",
            border: "none",
            color: "var(--fg-3)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "1px 4px",
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

// Configurable surfacing control for the scope-violation badge. The vault
// scope log is always written by the supervisor; this only toggles whether
// the pane badge is shown.
function ScopeBadgeToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <HUDFrame style={{ padding: "10px 18px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Eyebrow color="cyan">Scope monitor</Eyebrow>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
            best-effort out-of-scope write log (FR-29) · badges {enabled ? "on" : "off"}
          </span>
        </div>
        <Btn variant="ghost" onClick={onToggle}>
          {enabled ? "Hide badges" : "Show badges"}
        </Btn>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

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

function VaultContextBar({
  summary,
  onRefresh,
}: {
  summary: VaultContextSummary | null;
  onRefresh: () => void;
}) {
  return (
    <HUDFrame style={{ padding: "12px 18px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Eyebrow color="cyan">Vault context</Eyebrow>
          {summary === null ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
              loading…
            </span>
          ) : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)" }}>
              {summary.entry_count === 0
                ? "no entries"
                : `${summary.entry_count} entr${summary.entry_count === 1 ? "y" : "ies"} · ${Math.round(summary.total_chars / 1000)}k chars`}
            </span>
          )}
          {summary && summary.entry_count > 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-3)",
                maxWidth: 340,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {summary.titles.slice(0, 3).join(", ")}
              {summary.titles.length > 3 ? ", …" : ""}
            </span>
          )}
        </div>
        <Btn variant="ghost" onClick={onRefresh}>
          Refresh
        </Btn>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function NoProjectState() {
  return (
    <HUDFrame
      style={{
        flex: 1,
        minHeight: 280,
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
          Personas run per project
        </div>
        <p style={{ color: "var(--fg-3)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Open a project from the Projects rail first. Both personas (Dev and Frontend Designer)
          spawn into their own Zellij sessions scoped to the active project.
        </p>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────
// Dev persona read-only status panel (full spawn lives in ProjectsView)

function DevStatusPanel({
  status,
  busy: _busy,
  setBusy: _setBusy,
  project: _project,
  scopeBadgesEnabled,
}: {
  status: PersonaState | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  project: ProjectInfo;
  scopeBadgesEnabled: boolean;
}) {
  // Only poll the scope log while the persona is actually running.
  const running = status?.state === "running";
  const scope = useScopeViolations(running ? DEV_PERSONA_ID : null, scopeBadgesEnabled);
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
          <Eyebrow>Dev persona · Claude Code</Eyebrow>
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
          <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
            {status?.state === "running" ? (
              <>
                <StatusDot color="#6BFF8C" />{" "}
                <span
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fn-cyan)" }}
                >
                  {status.session_name}
                </span>
                {" — use the Projects rail to manage the Dev persona."}
              </>
            ) : (
              <>
                Manage from the <strong>Projects</strong> rail.
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ScopeViolationBadge summary={scope} />
          <Badge color={status?.state === "running" ? "online" : "muted"}>
            {status?.state === "running" ? "RUNNING" : "OFFLINE"}
          </Badge>
        </div>
      </div>
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────

function DesignerPanel({
  status,
  busy,
  project,
  scopeBadgesEnabled,
  onSpawn,
  onKill,
  onRefresh,
}: {
  status: PersonaState | null;
  busy: null | "spawning" | "killing";
  project: ProjectInfo;
  scopeBadgesEnabled: boolean;
  onSpawn: () => void;
  onKill: () => void;
  onRefresh: () => void;
}) {
  const running = status?.state === "running";
  const scope = useScopeViolations(running ? DESIGNER_PERSONA_ID : null, scopeBadgesEnabled);
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
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eyebrow color="cyan">Frontend Designer · Antigravity CLI</Eyebrow>
            <ScopeViolationBadge summary={scope} />
          </div>
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
          <DesignerStatusBody status={status} project={project} />
        </div>
        <DesignerActions
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

function DesignerStatusBody({
  status,
  project,
}: {
  status: PersonaState | null;
  project: ProjectInfo;
}) {
  if (status === null) {
    return <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0 }}>Polling Zellij…</p>;
  }
  if (status.state === "zellij-missing") {
    return (
      <div>
        <p style={{ color: "var(--fg-2)", fontSize: 13, margin: "0 0 8px", maxWidth: 560 }}>
          Zellij isn&apos;t on your PATH. The Frontend Designer runs inside a Zellij pane so its
          session survives desktop-app restarts.
        </p>
        <p
          style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, fontFamily: "var(--font-mono)" }}
        >
          Install: <code style={{ color: "var(--fn-cyan)" }}>winget install zellij-org.zellij</code>
        </p>
      </div>
    );
  }
  if (status.state === "not-running") {
    return (
      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: 0, maxWidth: 540 }}>
        Spawn to start Antigravity CLI in pane{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          {status.session_name}
        </code>
        . Vault context is injected into{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>agy.md</code> at spawn.
      </p>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <StatusDot color="#6BFF8C" />
        <Badge color="online">attached</Badge>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fn-cyan)" }}>
          {status.session_name}
        </span>
      </div>
      <p style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, maxWidth: 560 }}>
        Antigravity CLI is running for{" "}
        <span style={{ color: "var(--fn-white)" }}>{project.name}</span>. Attach from any terminal
        with{" "}
        <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
          zellij attach {status.session_name}
        </code>
        .
      </p>
    </div>
  );
}

function DesignerActions({
  status,
  busy,
  onSpawn,
  onKill,
  onRefresh,
}: {
  status: PersonaState | null;
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
        {busy === "spawning" ? "Spawning…" : "Spawn Designer →"}
      </Btn>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Btn variant="ghost" onClick={onRefresh}>
        Refresh
      </Btn>
      <Btn variant="secondary" onClick={onKill} disabled={busy === "killing"}>
        {busy === "killing" ? "Stopping…" : "Stop Designer"}
      </Btn>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Vault write-back panel

function VaultWritePanel({
  open,
  onToggle,
  title,
  body,
  onTitleChange,
  onBodyChange,
  onSubmit,
  writing,
  confirm,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  body: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: () => void;
  writing: boolean;
  confirm: string | null;
}) {
  return (
    <HUDFrame style={{ padding: 22 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <div>
          <Eyebrow>Vault inbox</Eyebrow>
          <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "4px 0 0" }}>
            Write a note to the Obsidian vault inbox. The note lands at{" "}
            <code style={{ fontFamily: "var(--font-mono)", color: "var(--fn-cyan)" }}>
              vault/inbox/
            </code>
            .
          </p>
        </div>
        <Btn variant={open ? "secondary" : "ghost"} onClick={onToggle}>
          {open ? "Cancel" : "Write note →"}
        </Btn>
      </div>

      {open && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            placeholder="Note title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Note content (Markdown)"
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Btn variant="primary" onClick={onSubmit} disabled={writing || !title.trim()}>
              {writing ? "Writing…" : "Write to vault"}
            </Btn>
            {confirm && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "#6BFF8C",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {confirm}
              </span>
            )}
          </div>
        </div>
      )}
    </HUDFrame>
  );
}

// ────────────────────────────────────────────────────────────────────
// Story 3.10 — Authored persona list

function AuthoredPersonaList({
  personas,
  project,
  onSpawned,
}: {
  personas: AuthoredPersonaInfo[];
  project: ProjectInfo;
  onSpawned: (p: DynamicPersonaInfo) => void;
}) {
  return (
    <HUDFrame style={{ padding: 22 }}>
      <div style={{ marginBottom: 14 }}>
        <Eyebrow color="purple">Authored personas · {personas.length}</Eyebrow>
        <p style={{ color: "var(--fg-3)", fontSize: 12, margin: "4px 0 0" }}>
          These personas have a full{" "}
          <code style={{ fontFamily: "var(--font-mono)", color: "var(--fn-cyan)" }}>AGENTS.md</code>{" "}
          in the vault. Click Spawn to run them.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {personas.map((p) => (
          <AuthoredPersonaRow key={p.slug} persona={p} project={project} onSpawned={onSpawned} />
        ))}
      </div>
    </HUDFrame>
  );
}

function AuthoredPersonaRow({
  persona,
  project,
  onSpawned,
}: {
  persona: AuthoredPersonaInfo;
  project: ProjectInfo;
  onSpawned: (p: DynamicPersonaInfo) => void;
}) {
  const [spawning, setSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  async function handleSpawn() {
    setSpawnError(null);
    setSpawning(true);
    try {
      const spawned = await invoke<DynamicPersonaInfo>("spawn_dynamic_persona", {
        name: persona.name,
        backingCli: persona.backing_cli,
        lifecycle: persona.lifecycle,
        taskPrompt: null,
      });
      onSpawned(spawned);
    } catch (e) {
      setSpawnError(String(e));
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        background: "rgba(176,0,255,0.03)",
        border: "1px solid rgba(176,0,255,0.2)",
        borderRadius: 2,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--fn-white)",
          }}
        >
          {persona.name}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            marginTop: 2,
          }}
        >
          {persona.backing_cli} · {persona.vault_scope} scope
          {persona.skills.length > 0 &&
            ` · ${persona.skills.length} skill${persona.skills.length === 1 ? "" : "s"}`}
        </div>
        {persona.role_description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              marginTop: 4,
              maxWidth: 440,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {persona.role_description}
          </div>
        )}
        {spawnError && (
          <div
            style={{ fontSize: 10, color: "#FF8FA3", fontFamily: "var(--font-mono)", marginTop: 4 }}
          >
            {spawnError}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Badge color="purple">{persona.lifecycle}</Badge>
        <Btn variant="secondary" onClick={handleSpawn} disabled={spawning || !project}>
          {spawning ? "Spawning…" : "Spawn →"}
        </Btn>
      </div>
    </div>
  );
}

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

// ────────────────────────────────────────────────────────────────────
// Dynamic persona list (Story 3.1)

function DynamicPersonaList({
  personas,
  scopeBadgesEnabled,
  onKill,
}: {
  personas: DynamicPersonaInfo[];
  scopeBadgesEnabled: boolean;
  onKill: (sessionName: string) => void;
}) {
  return (
    <HUDFrame style={{ padding: 22 }}>
      <Eyebrow>Dynamic agents · {personas.length} active</Eyebrow>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {personas.map((p) => (
          <DynamicPersonaRow
            key={p.session_name}
            persona={p}
            scopeBadgesEnabled={scopeBadgesEnabled}
            onKill={onKill}
          />
        ))}
      </div>
    </HUDFrame>
  );
}

function DynamicPersonaRow({
  persona,
  scopeBadgesEnabled,
  onKill,
}: {
  persona: DynamicPersonaInfo;
  scopeBadgesEnabled: boolean;
  onKill: (sessionName: string) => void;
}) {
  const [killing, setKilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A persistent dynamic persona's scope-log dir is named by its slug.
  // Ephemerals have no persona vault dir, so the log read returns count 0.
  const scope = useScopeViolations(persona.running ? persona.slug : null, scopeBadgesEnabled);
  // Story 3.4: drift detection — only poll for persistent personas with a vault dir.
  const isPersistent = persona.lifecycle === "persistent" && !!persona.vault_dir;
  const driftReport = useDriftState(isPersistent && persona.running ? persona.slug : null);

  async function handleDismissDrift() {
    try {
      await invoke("dismiss_persona_drift", { slug: persona.slug });
    } catch {
      // badge will refresh on next poll
    }
  }

  async function handleKill() {
    setKilling(true);
    setError(null);
    try {
      await invoke("kill_dynamic_persona", { sessionName: persona.session_name });
      onKill(persona.session_name);
    } catch (e) {
      setError(String(e));
      setKilling(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 12px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border-neutral)",
        borderRadius: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <StatusDot color={persona.running ? "#6BFF8C" : "var(--fg-3)"} />
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--fn-white)",
            }}
          >
            {persona.name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
            {persona.session_name} · {persona.backing_cli}
          </div>
          {error && (
            <div
              style={{
                fontSize: 10,
                color: "#FF8FA3",
                fontFamily: "var(--font-mono)",
                marginTop: 2,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ScopeViolationBadge summary={scope} />
        <DriftBadge report={driftReport} onDismiss={handleDismissDrift} />
        <Badge color={persona.lifecycle === "persistent" ? "muted" : "warn"}>
          {persona.lifecycle}
        </Badge>
        <Btn variant="ghost" onClick={handleKill} disabled={killing}>
          {killing ? "Stopping…" : "Stop"}
        </Btn>
      </div>
    </div>
  );
}
