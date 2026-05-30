// GithubSettings — Story 5.4 (FR-33).
//
// GitHub sync settings panel: shows sync status, push/pull controls,
// repo initialization, and per-category sync toggles.
// All operations go through Tauri commands (c4n-github-sync Rust crate).

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { tryGet } from "@c4n/credential-storage";
import { Badge, Eyebrow, HUDFrame } from "@c4n/ui-tokens";

const GITHUB_SERVICE = "github";
const GITHUB_ACCOUNT = "pat";

type SyncCategory =
  | "persona-files"
  | "persona-skills"
  | "persona-memory"
  | "persona-meta"
  | "bmad-artifacts"
  | "project-personas"
  | "project-reviews"
  | "project-context"
  | "decision-log";

const DEFAULT_CATEGORIES: Record<SyncCategory, boolean> = {
  "persona-files": true,
  "persona-skills": true,
  "persona-meta": true,
  "bmad-artifacts": true,
  "project-personas": true,
  "project-reviews": true,
  "project-context": true,
  "decision-log": true,
  "persona-memory": false,
};

interface SyncStatus {
  is_repo: boolean;
  remote_configured: boolean;
  ahead: number;
  behind: number;
  current_branch: string | null;
}

interface SyncResult {
  ok: boolean;
  pushed: number;
  errors: string[];
}

interface CategoryDef {
  id: SyncCategory;
  label: string;
  description: string;
  vaultTier: "project" | "persona" | "never";
}

const CATEGORIES: CategoryDef[] = [
  { id: "persona-files", label: "Persona definitions", description: "persona.md for each persona", vaultTier: "persona" },
  { id: "persona-skills", label: "Persona skills", description: "Skills markdown files", vaultTier: "persona" },
  { id: "persona-memory", label: "Persona memory notes", description: "Notes and observations in persona memory dirs", vaultTier: "persona" },
  { id: "persona-meta", label: "Persona metadata", description: ".persona-meta.json for re-spawning", vaultTier: "persona" },
  { id: "bmad-artifacts", label: "BMAD artifacts", description: "All files under projects/*/bmad/", vaultTier: "project" },
  { id: "project-personas", label: "Project personas", description: "Project-specific persona overlays", vaultTier: "project" },
  { id: "project-reviews", label: "Review outputs", description: "Ephemeral agent review outputs", vaultTier: "project" },
  { id: "project-context", label: "Project context", description: ".project-context.md", vaultTier: "project" },
  { id: "decision-log", label: "Decision log", description: ".decision-log.md across all projects", vaultTier: "project" },
];

export function GithubSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [categories, setCategories] = useState<Record<SyncCategory, boolean>>(
    DEFAULT_CATEGORIES,
  );
  const [apiKeyStatus, setApiKeyStatus] = useState<"checking" | "configured" | "missing">(
    "checking",
  );
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [initRepoName, setInitRepoName] = useState("4nevercompanyos-vault");
  const [initPrivate, setInitPrivate] = useState(true);
  const [initLoading, setInitLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SyncStatus>("github_sync_status")
      .then(setStatus)
      .catch(() => setStatus(null));

    tryGet(GITHUB_SERVICE, GITHUB_ACCOUNT)
      .then((key) => setApiKeyStatus(key ? "configured" : "missing"))
      .catch(() => setApiKeyStatus("missing"));
  }, []);

  async function handlePush() {
    setLoading(true);
    setLastResult(null);
    try {
      const result = await invoke<SyncResult>("github_sync_push", {
        categories,
      });
      setLastResult(result);
      if (result.ok) {
        const s = await invoke<SyncStatus>("github_sync_status");
        setStatus(s);
      }
    } catch (e) {
      setLastResult({ ok: false, pushed: 0, errors: [String(e)] });
    } finally {
      setLoading(false);
    }
  }

  async function handlePull() {
    setLoading(true);
    setLastResult(null);
    try {
      const result = await invoke<SyncResult>("github_sync_pull");
      setLastResult(result);
      if (result.ok) {
        const s = await invoke<SyncStatus>("github_sync_status");
        setStatus(s);
      }
    } catch (e) {
      setLastResult({ ok: false, pushed: 0, errors: [String(e)] });
    } finally {
      setLoading(false);
    }
  }

  async function handleInit() {
    setInitLoading(true);
    setInitError(null);
    try {
      await invoke<[string, string]>("github_sync_init", {
        repoName: initRepoName,
        isPrivate: initPrivate,
      });
      const s = await invoke<SyncStatus>("github_sync_status");
      setStatus(s);
    } catch (e) {
      setInitError(String(e));
    } finally {
      setInitLoading(false);
    }
  }

  async function toggleCategory(id: SyncCategory) {
    const next = { ...categories, [id]: !categories[id] };
    setCategories(next);
  }

  return (
    <HUDFrame style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Eyebrow color="cyan">Memory</Eyebrow>
        <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          →
        </span>
        <Eyebrow color="purple">GitHub Sync</Eyebrow>
      </div>

      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "0 0 16px", maxWidth: 560 }}>
        Sync your vault to a personal GitHub repo for cross-machine continuity
        and team collaboration. Credentials are stored in your OS keychain.
      </p>

      <ApiKeyStatus status={apiKeyStatus} />

      <SyncStatusPanel status={status} />

      {status?.is_repo && status?.remote_configured && (
        <>
          <div style={{ display: "flex", gap: 10, margin: "14px 0" }}>
            <button
              className="hud-btn-primary"
              onClick={handlePush}
              disabled={loading || apiKeyStatus !== "configured"}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "11px 20px",
                borderRadius: 2,
                cursor: loading ? "not-allowed" : "pointer",
                background: "var(--fn-purple)",
                border: "1px solid var(--fn-purple)",
                color: "var(--fn-white)",
                opacity: loading || apiKeyStatus !== "configured" ? 0.5 : 1,
              }}
            >
              {loading ? "Pushing…" : "Push to GitHub"}
            </button>
            <button
              onClick={handlePull}
              disabled={loading || apiKeyStatus !== "configured"}
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "11px 20px",
                borderRadius: 2,
                cursor: loading ? "not-allowed" : "pointer",
                background: "transparent",
                border: "1px solid var(--border-neutral)",
                color: "var(--fn-cyan)",
                opacity: loading || apiKeyStatus !== "configured" ? 0.5 : 1,
              }}
            >
              {loading ? "Pulling…" : "Pull from GitHub"}
            </button>
          </div>

          {lastResult && (
            <ResultPanel result={lastResult} />
          )}

          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fn-gold)",
                marginBottom: 10,
              }}
            >
              Sync Categories
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {CATEGORIES.map((cat) => (
                <CategoryToggleRow
                  key={cat.id}
                  category={cat}
                  enabled={categories[cat.id]}
                  onToggle={() => toggleCategory(cat.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {!status?.is_repo && (
        <InitRepoPanel
          repoName={initRepoName}
          onRepoNameChange={setInitRepoName}
          isPrivate={initPrivate}
          onPrivateChange={setInitPrivate}
          onInit={handleInit}
          loading={initLoading}
          error={initError}
          disabled={apiKeyStatus !== "configured"}
        />
      )}
    </HUDFrame>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ApiKeyStatus({ status }: { status: "checking" | "configured" | "missing" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        border: "1px solid var(--border-neutral)",
        borderRadius: 2,
        marginBottom: 14,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
        GitHub PAT:
      </span>
      {status === "checking" && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          checking…
        </span>
      )}
      {status === "configured" && (
        <>
          <Badge color="online">Configured</Badge>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
            Stored in OS keychain
          </span>
        </>
      )}
      {status === "missing" && (
        <>
          <Badge color="warn">Not configured</Badge>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
            Add your GitHub PAT in the first-run wizard to enable sync
          </span>
        </>
      )}
    </div>
  );
}

function SyncStatusPanel({ status }: { status: SyncStatus | null }) {
  if (!status) {
    return (
      <div
        style={{
          padding: "10px 14px",
          border: "1px solid var(--border-neutral)",
          borderRadius: 2,
          marginBottom: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
        }}
      >
        Checking sync status…
      </div>
    );
  }

  if (!status.is_repo) {
    return (
      <div
        style={{
          padding: "10px 14px",
          border: "1px solid var(--border-neutral)",
          borderRadius: 2,
          marginBottom: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
        }}
      >
        Vault is not a git repository. Initialize a repo below to enable sync.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        border: "1px solid var(--border-neutral)",
        borderRadius: 2,
        marginBottom: 14,
        background: "rgba(255,255,255,0.02)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      <Badge color={status.remote_configured ? "online" : "warn"}>
        {status.remote_configured ? "Remote configured" : "No remote"}
      </Badge>
      {status.current_branch && (
        <span style={{ color: "var(--fn-cyan)" }}>
          branch: {status.current_branch}
        </span>
      )}
      {status.ahead > 0 && (
        <span style={{ color: "var(--fn-gold)" }}>▲ {status.ahead} ahead</span>
      )}
      {status.behind > 0 && (
        <span style={{ color: "var(--fn-purple)" }}>▼ {status.behind} behind</span>
      )}
      {status.ahead === 0 && status.behind === 0 && status.remote_configured && (
        <span style={{ color: "var(--fg-3)" }}>up to date</span>
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: SyncResult }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        border: `1px solid ${result.ok ? "var(--fn-purple)" : "var(--fn-red)"}`,
        borderRadius: 2,
        marginBottom: 14,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: result.ok ? "var(--fn-purple)" : "var(--fn-red)",
        }}
      >
        {result.ok
          ? `Pushed ${result.pushed} file${result.pushed !== 1 ? "s" : ""} successfully`
          : "Sync failed"}
      </span>
      {result.errors.length > 0 && (
        <div style={{ marginTop: 6, color: "var(--fn-red)", fontSize: 11 }}>
          {result.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryToggleRow({
  category,
  enabled,
  onToggle,
}: {
  category: CategoryDef;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 2,
        cursor: "pointer",
        transition: "opacity 200ms",
      }}
      onClick={onToggle}
    >
      <ToggleSwitch on={enabled} />
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12,
              color: "var(--fn-white)",
            }}
          >
            {category.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color:
                category.vaultTier === "project"
                  ? "var(--fn-cyan)"
                  : "var(--fn-purple)",
            }}
          >
            {category.vaultTier}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--fg-3)" }}>
          {category.description}
        </p>
      </div>
    </div>
  );
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <div
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: on ? "var(--fn-purple)" : "rgba(255,255,255,0.08)",
        border: `1px solid ${on ? "var(--fn-purple)" : "var(--border-neutral)"}`,
        position: "relative",
        flexShrink: 0,
        transition: "background 200ms",
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          background: "var(--fn-white)",
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          transition: "left 200ms cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

function InitRepoPanel({
  repoName,
  onRepoNameChange,
  isPrivate,
  onPrivateChange,
  onInit,
  loading,
  error,
  disabled,
}: {
  repoName: string;
  onRepoNameChange: (v: string) => void;
  isPrivate: boolean;
  onPrivateChange: (v: boolean) => void;
  onInit: () => void;
  loading: boolean;
  error: string | null;
  disabled: boolean;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--fn-gold)",
          marginBottom: 10,
        }}
      >
        Initialize GitHub Repository
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={repoName}
            onChange={(e) => onRepoNameChange(e.target.value)}
            disabled={disabled || loading}
            placeholder="repo-name"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border-neutral)",
              borderRadius: 2,
              padding: "8px 12px",
              color: "var(--fn-white)",
              flex: 1,
              outline: "none",
            }}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: disabled || loading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: isPrivate ? "var(--fn-cyan)" : "var(--fg-3)",
              opacity: disabled || loading ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => onPrivateChange(e.target.checked)}
              disabled={disabled || loading}
            />
            Private
          </label>
          <button
            onClick={onInit}
            disabled={disabled || loading || !repoName}
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "8px 20px",
              borderRadius: 2,
              cursor: disabled || loading || !repoName ? "not-allowed" : "pointer",
              background: "var(--fn-purple)",
              border: "1px solid var(--fn-purple)",
              color: "var(--fn-white)",
              opacity: disabled || loading || !repoName ? 0.5 : 1,
            }}
          >
            {loading ? "Creating…" : "Create Repo"}
          </button>
        </div>
        {error && (
          <div style={{ color: "var(--fn-red)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
