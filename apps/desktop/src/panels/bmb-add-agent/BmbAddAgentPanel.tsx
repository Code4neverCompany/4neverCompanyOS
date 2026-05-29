// BMad Builder — "Add Agent" panel (Story 3.1 MVP + Story 3.10 authoring).
//
// Two tabs:
//
//   "Spawn Agent" (Story 3.1): quick-spawn a dynamic persona by name,
//   CLI, and lifecycle. Calls `spawn_dynamic_persona` — writes a minimal
//   persona file to the project root and opens a Zellij pane.
//
//   "Author Persona" (Story 3.10): full persona authoring form. Writes a
//   rich AGENTS.md to vault/personas/<slug>/ and scaffolds the vault dir.
//   The authored persona appears in the list ready to spawn later.

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import { PersonaAuthorForm, type AuthoredPersonaInfo } from "./PersonaAuthorForm";

export interface DynamicPersonaInfo {
  name: string;
  slug: string;
  backing_cli: string;
  lifecycle: string;
  session_name: string;
  running: boolean;
  /** Stable `agent:<slug>:<uuid>` bus identity (Story 3.3). */
  bus_identity: string;
  /** Absolute path to `<vault>/personas/<slug>/` (Story 3.3). */
  vault_dir: string;
}

type BackingCli = "claude" | "agy" | "hermes" | "custom";
type Lifecycle = "persistent" | "ephemeral";

const CLI_OPTIONS: ReadonlyArray<{ id: BackingCli; label: string; description: string }> = [
  { id: "claude", label: "Claude Code", description: "Anthropic's Claude Code CLI" },
  { id: "agy", label: "Antigravity (agy)", description: "Frontend Design Agent" },
  { id: "hermes", label: "Hermes Agent", description: "Multi-agent orchestrator" },
  { id: "custom", label: "Custom binary", description: "Any CLI on your PATH" },
];

const LIFECYCLE_OPTIONS: ReadonlyArray<{
  id: Lifecycle;
  label: string;
  description: string;
}> = [
  {
    id: "persistent",
    label: "Persistent",
    description: "Session survives app restarts. Terminal stays alive until you kill it.",
  },
  {
    id: "ephemeral",
    label: "Ephemeral",
    description: "Pane closes automatically when the CLI exits. Zero orphans guaranteed.",
  },
];

interface BmbAddAgentPanelProps {
  /** Called with the spawned persona info so the parent can refresh its list. */
  onSpawned?: (persona: DynamicPersonaInfo) => void;
  /** Called when a persona is authored (Story 3.10). */
  onAuthored?: (persona: AuthoredPersonaInfo) => void;
}

// Re-export so callers can import AuthoredPersonaInfo from this entry file.
export type { AuthoredPersonaInfo } from "./PersonaAuthorForm";

type PanelTab = "spawn" | "author";

export function BmbAddAgentPanel({ onSpawned, onAuthored }: BmbAddAgentPanelProps) {
  const [tab, setTab] = useState<PanelTab>("spawn");

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: -1 }}>
        <TabButton active={tab === "spawn"} onClick={() => setTab("spawn")}>
          Spawn Agent
        </TabButton>
        <TabButton active={tab === "author"} onClick={() => setTab("author")}>
          Author Persona
        </TabButton>
      </div>
      {tab === "spawn" ? (
        <SpawnPanel onSpawned={onSpawned} />
      ) : (
        <PersonaAuthorForm onAuthored={onAuthored} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "8px 16px",
        border: "1px solid var(--border-neutral)",
        borderBottom: active ? "1px solid var(--bg-panel, #0c0d14)" : "1px solid var(--border-neutral)",
        borderRadius: "2px 2px 0 0",
        background: active ? "rgba(255,255,255,0.04)" : "transparent",
        color: active ? "var(--fn-gold)" : "var(--fg-3)",
        cursor: "pointer",
        transition: "color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// ── Spawn panel (Story 3.1 content, extracted into its own component) ──

interface SpawnPanelProps {
  onSpawned?: (persona: DynamicPersonaInfo) => void;
}

function SpawnPanel({ onSpawned }: SpawnPanelProps) {
  const [name, setName] = useState("");
  const [cli, setCli] = useState<BackingCli>("claude");
  const [customBin, setCustomBin] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("persistent");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSpawned, setLastSpawned] = useState<DynamicPersonaInfo | null>(null);

  const effectiveCli = cli === "custom" ? customBin.trim() : cli;

  async function handleSpawn() {
    if (!name.trim()) {
      setError("Enter a persona name.");
      return;
    }
    if (cli === "custom" && !customBin.trim()) {
      setError("Enter a custom binary name.");
      return;
    }
    if (lifecycle === "ephemeral" && !taskPrompt.trim()) {
      setError("Ephemeral personas need a task prompt — the single task they run, then exit.");
      return;
    }
    setError(null);
    setSpawning(true);
    try {
      const persona = await invoke<DynamicPersonaInfo>("spawn_dynamic_persona", {
        name: name.trim(),
        backingCli: effectiveCli,
        lifecycle,
        taskPrompt: lifecycle === "ephemeral" ? taskPrompt.trim() : null,
      });
      setLastSpawned(persona);
      onSpawned?.(persona);
      // Reset form after successful spawn.
      setName("");
      setCli("claude");
      setCustomBin("");
      setLifecycle("persistent");
      setTaskPrompt("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSpawning(false);
    }
  }

  return (
    <HUDFrame style={{ padding: 22 }}>
      <div style={{ marginBottom: 16 }}>
        <Eyebrow color="cyan">BMad Builder · Add Agent</Eyebrow>
        <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "4px 0 0", maxWidth: 580 }}>
          Spawn a dynamic persona beyond the two fixed agents. Persistent personas survive restarts;
          ephemeral personas exit cleanly when the task is done.
        </p>
      </div>

      {lastSpawned && (
        <SpawnedConfirmation persona={lastSpawned} onDismiss={() => setLastSpawned(null)} />
      )}

      {error && <ErrorLine text={error} onDismiss={() => setError(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Persona name */}
        <Field label="Persona name">
          <input
            type="text"
            placeholder='e.g. "Database Architect" or "QA Engineer"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !spawning && handleSpawn()}
            style={inputStyle}
            autoFocus
          />
        </Field>

        {/* Backing CLI */}
        <Field label="Backing CLI">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CLI_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCli(opt.id)}
                style={{
                  ...chipStyle,
                  ...(cli === opt.id ? chipActiveStyle : {}),
                }}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {cli === "custom" && (
            <input
              type="text"
              placeholder="Binary name on PATH, e.g. gemini or codex"
              value={customBin}
              onChange={(e) => setCustomBin(e.target.value)}
              style={{ ...inputStyle, marginTop: 8 }}
            />
          )}
        </Field>

        {/* Lifecycle */}
        <Field label="Lifecycle">
          <div style={{ display: "flex", gap: 6 }}>
            {LIFECYCLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLifecycle(opt.id)}
                style={{
                  ...chipStyle,
                  ...(lifecycle === opt.id ? chipActiveStyle : {}),
                  flex: 1,
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: lifecycle === opt.id ? "rgba(255,196,0,0.7)" : "var(--fg-3)",
                    marginTop: 2,
                    fontWeight: 400,
                  }}
                >
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </Field>

        {/* Task prompt — ephemerals run a single task then exit cleanly */}
        {lifecycle === "ephemeral" && (
          <Field label="Task prompt">
            <textarea
              placeholder='The single task this agent runs, then exits. e.g. "Review PR #42 for security issues and summarize findings."'
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)" }}
            />
          </Field>
        )}

        {/* Spawn button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <Btn
            variant="primary"
            onClick={handleSpawn}
            disabled={
              spawning ||
              !name.trim() ||
              (cli === "custom" && !customBin.trim()) ||
              (lifecycle === "ephemeral" && !taskPrompt.trim())
            }
          >
            {spawning ? "Spawning…" : "Spawn Agent →"}
          </Btn>
        </div>
      </div>
    </HUDFrame>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SpawnedConfirmation({
  persona,
  onDismiss,
}: {
  persona: DynamicPersonaInfo;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(107, 255, 140, 0.06)",
        border: "1px solid rgba(107, 255, 140, 0.3)",
        borderRadius: 2,
        padding: "10px 14px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <StatusDot color="#6BFF8C" />
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
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fn-cyan)",
            }}
          >
            {persona.session_name}
          </div>
          {persona.bus_identity && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fn-dim, #8a8f98)",
              }}
              title="Bus identity — how this persona posts/subscribes on the message bus"
            >
              {persona.bus_identity}
            </div>
          )}
        </div>
        <Badge color={persona.lifecycle === "persistent" ? "online" : "warn"}>
          {persona.lifecycle.toUpperCase()}
        </Badge>
      </div>
      <Btn variant="ghost" onClick={onDismiss}>
        ✕
      </Btn>
    </div>
  );
}

function ErrorLine({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        padding: "8px 12px",
        borderRadius: 2,
        background: "rgba(255, 85, 119, 0.08)",
        border: "1px solid rgba(255, 85, 119, 0.35)",
        color: "#FF8FA3",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#FF8FA3",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          padding: "2px 6px",
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

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

const chipStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border-neutral)",
  borderRadius: 2,
  color: "var(--fg-2)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "7px 12px",
  cursor: "pointer",
  textAlign: "left",
  transition: "border-color 0.12s, background 0.12s",
};

const chipActiveStyle: React.CSSProperties = {
  background: "rgba(255,196,0,0.08)",
  border: "1px solid rgba(255,196,0,0.45)",
  color: "var(--fn-gold)",
};
