// SupermemorySettings — Story 5.2 (FR-31).
//
// Opt-in category toggles for Supermemory cross-project semantic memory.
// Each toggle controls whether vault content in that category is indexed
// to the Supermemory cloud service.
//
// Categories (from docs/memory-precedence.md):
//   decisions             — default ON  — Tier 2 (project vault)
//   architecture          — default ON  — Tier 2 (project vault)
//   code-review-notes     — default OFF — Tier 1 (persona memory)
//   personal-notes        — default OFF — Tier 1 (persona memory)
//   secrets              — NEVER      — never indexed

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { tryGet } from "@c4n/credential-storage";
import { SUPERMEMORY_SERVICE, SUPERMEMORY_ACCOUNT } from "@c4n/supermemory-client";
import { Badge, Eyebrow, HUDFrame } from "@c4n/ui-tokens";

interface Category {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  locked: boolean;
  vaultTier: "project" | "persona" | "never";
}

const CATEGORIES: Category[] = [
  {
    id: "decisions",
    label: "Decisions",
    description: "Project decisions logged to .decision-log.md in each project vault.",
    defaultEnabled: true,
    locked: false,
    vaultTier: "project",
  },
  {
    id: "architecture",
    label: "Architecture artifacts",
    description: "Architecture docs, system designs, and ADR files in project vaults.",
    defaultEnabled: true,
    locked: false,
    vaultTier: "project",
  },
  {
    id: "code-review-notes",
    label: "Code-review notes",
    description: "Persona-level code review notes and feedback in persona memory dirs.",
    defaultEnabled: false,
    locked: false,
    vaultTier: "persona",
  },
  {
    id: "personal-notes",
    label: "Personal notes",
    description: "Personal notes and observations scoped to each persona's memory dir.",
    defaultEnabled: false,
    locked: false,
    vaultTier: "persona",
  },
  {
    id: "secrets",
    label: "Secrets",
    description: "Credentials, keys, and sensitive data — never leaves this machine.",
    defaultEnabled: false,
    locked: true,
    vaultTier: "never",
  },
];

export function SupermemorySettings() {
  const [categories, setCategories] = useState<Record<string, boolean>>({});
  const [apiKeyStatus, setApiKeyStatus] = useState<"checking" | "configured" | "missing">(
    "checking",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<Record<string, boolean>>("get_supermemory_categories")
      .then((cats) => {
        const merged: Record<string, boolean> = {};
        for (const cat of CATEGORIES) {
          merged[cat.id] = cats[cat.id] ?? cat.defaultEnabled;
        }
        setCategories(merged);
      })
      .catch(() => {
        const defaults: Record<string, boolean> = {};
        for (const cat of CATEGORIES) {
          defaults[cat.id] = cat.defaultEnabled;
        }
        setCategories(defaults);
      });

    tryGet(SUPERMEMORY_SERVICE, SUPERMEMORY_ACCOUNT)
      .then((key: string | null) => setApiKeyStatus(key ? "configured" : "missing"))
      .catch(() => setApiKeyStatus("missing"));
  }, []);

  async function toggleCategory(id: string) {
    if (CATEGORIES.find((c) => c.id === id)?.locked) return;
    const next = { ...categories, [id]: !categories[id] };
    setCategories(next);
    setSaving(true);
    try {
      await invoke("save_supermemory_categories", { categories: next });
    } catch (e) {
      console.error("[SupermemorySettings] failed to save categories:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <HUDFrame style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Eyebrow color="cyan">Memory</Eyebrow>
        <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          →
        </span>
        <Eyebrow color="purple">Supermemory</Eyebrow>
        {saving && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
            saving…
          </span>
        )}
      </div>

      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "0 0 16px", maxWidth: 560 }}>
        Supermemory is a cross-project semantic memory layer. Choose which categories to index —
        only opted-in content is sent to the Supermemory cloud. Credentials are stored in your OS
        keychain.
      </p>

      <ApiKeyStatus status={apiKeyStatus} />

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
          Categories
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {CATEGORIES.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              enabled={!!(categories[cat.id] ?? cat.defaultEnabled)}
              onToggle={() => toggleCategory(cat.id)}
              disabled={apiKeyStatus !== "configured"}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid var(--border-neutral)",
          fontSize: 11,
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Category paths: <span style={{ color: "var(--fn-cyan)" }}>project vault</span> ={" "}
        vault/projects/&lt;id&gt;/bmad/ ·{" "}
        <span style={{ color: "var(--fn-cyan)" }}>persona memory</span> ={" "}
        vault/personas/&lt;id&gt;/memory/ · <span style={{ color: "var(--fn-red)" }}>never</span> =
        not indexed
      </div>
    </HUDFrame>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
        marginBottom: 4,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
        API key:
      </span>
      {status === "checking" && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          checking…
        </span>
      )}
      {status === "configured" && (
        <>
          <Badge color="online">Configured</Badge>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>Stored in OS keychain</span>
        </>
      )}
      {status === "missing" && (
        <>
          <Badge color="warn">Not configured</Badge>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>
            Add your Supermemory API key in the first-run wizard to enable cloud indexing
          </span>
        </>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  enabled,
  onToggle,
  disabled,
}: {
  category: Category;
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const locked = category.locked;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 2,
        background: locked ? "rgba(255,255,255,0.01)" : "transparent",
        opacity: disabled && !locked ? 0.5 : 1,
        cursor: locked ? "not-allowed" : "pointer",
        transition: "opacity 200ms",
      }}
      onClick={!locked && !disabled ? onToggle : undefined}
    >
      <ToggleSwitch on={enabled} locked={locked} disabled={disabled || locked} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              color: locked ? "var(--fg-3)" : "var(--fn-white)",
            }}
          >
            {category.label}
          </span>
          {locked && <Badge color="muted">Never</Badge>}
          {!locked && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color:
                  category.vaultTier === "project"
                    ? "var(--fn-cyan)"
                    : category.vaultTier === "persona"
                      ? "var(--fn-purple)"
                      : "var(--fn-red)",
              }}
            >
              {category.vaultTier === "project"
                ? "project vault"
                : category.vaultTier === "persona"
                  ? "persona memory"
                  : "never"}
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>{category.description}</p>
      </div>
    </div>
  );
}

function ToggleSwitch({
  on,
  locked,
  disabled,
}: {
  on: boolean;
  locked: boolean;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: locked
          ? "var(--border-neutral)"
          : on
            ? "var(--fn-purple)"
            : "rgba(255,255,255,0.08)",
        border: `1px solid ${locked ? "var(--border-neutral)" : on ? "var(--fn-purple)" : "var(--border-neutral)"}`,
        position: "relative",
        cursor: locked ? "not-allowed" : disabled ? "not-allowed" : "pointer",
        transition: "background 200ms, border-color 200ms",
        flexShrink: 0,
        marginTop: 2,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          background: locked ? "var(--fg-3)" : "var(--fn-white)",
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
