// PersonaAuthorForm — Story 3.10: full persona authoring form.
//
// Exposes a form that lets the user define a new custom persona:
//   - Name (required, unique)
//   - Role description (required) — the system-prompt body
//   - Lifecycle: persistent | ephemeral
//   - Vault scope: shared | isolated
//   - Skills multi-select (from list_installed_skills)
//   - Base model override (optional)
//   - Backing CLI (claude / agy / hermes / custom)
//
// On submit, calls `author_persona` which writes AGENTS.md to
// `vault/personas/<slug>/AGENTS.md` and scaffolds the vault dir.
// The caller receives the authored persona info via `onAuthored`.
//
// Pure logic helpers (validate, slugify) are exported for unit tests.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Badge, Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import type { DynamicPersonaInfo } from "./BmbAddAgentPanel";

// ── Types ────────────────────────────────────────────────────────────

export interface InstalledSkill {
  id: string;
  description: string;
}

export interface AuthoredPersonaInfo {
  name: string;
  slug: string;
  backing_cli: string;
  lifecycle: string;
  vault_scope: string;
  role_description: string;
  skills: string[];
  model_override: string;
  agents_md_path: string;
  bus_identity: string;
  vault_dir: string;
}

type BackingCli = "claude" | "agy" | "hermes" | "custom";
type Lifecycle = "persistent" | "ephemeral";
type VaultScope = "shared" | "isolated";

// ── Pure helpers (exported for tests) ───────────────────────────────

/** Slugify a name the same way the Rust backend does. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Validate authoring form fields. Returns first error message, or null if valid. */
export function validateAuthorForm(fields: {
  name: string;
  roleDescription: string;
  cli: BackingCli;
  customBin: string;
  lifecycle: Lifecycle;
  vaultScope: VaultScope;
}): string | null {
  if (!fields.name.trim()) return "Enter a persona name.";
  if (slugifyName(fields.name).length === 0) return "Name must contain at least one alphanumeric character.";
  if (!fields.roleDescription.trim()) return "Enter a role description.";
  if (fields.cli === "custom" && !fields.customBin.trim()) return "Enter a custom binary name.";
  return null;
}

// ── Component ────────────────────────────────────────────────────────

interface PersonaAuthorFormProps {
  /** Called after a successful author_persona save. */
  onAuthored?: (persona: AuthoredPersonaInfo) => void;
}

export function PersonaAuthorForm({ onAuthored }: PersonaAuthorFormProps) {
  const [name, setName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [cli, setCli] = useState<BackingCli>("claude");
  const [customBin, setCustomBin] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("persistent");
  const [vaultScope, setVaultScope] = useState<VaultScope>("shared");
  const [modelOverride, setModelOverride] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<InstalledSkill[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAuthored, setLastAuthored] = useState<AuthoredPersonaInfo | null>(null);

  // Load skill list once on mount.
  useEffect(() => {
    invoke<InstalledSkill[]>("list_installed_skills")
      .then(setAvailableSkills)
      .catch(() => {}); // non-fatal — user can still author without skills
  }, []);

  const effectiveCli = cli === "custom" ? customBin.trim() : cli;

  function toggleSkill(id: string) {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    const validationError = validateAuthorForm({
      name,
      roleDescription,
      cli,
      customBin,
      lifecycle,
      vaultScope,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const persona = await invoke<AuthoredPersonaInfo>("author_persona", {
        name: name.trim(),
        roleDescription: roleDescription.trim(),
        lifecycle,
        backingCli: effectiveCli,
        skills: selectedSkills,
        vaultScope,
        modelOverride: modelOverride.trim(),
      });
      setLastAuthored(persona);
      onAuthored?.(persona);
      // Reset form.
      setName("");
      setRoleDescription("");
      setCli("claude");
      setCustomBin("");
      setLifecycle("persistent");
      setVaultScope("shared");
      setModelOverride("");
      setSelectedSkills([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const slug = name.trim() ? slugifyName(name.trim()) : "";
  const isValid =
    !saving &&
    name.trim().length > 0 &&
    roleDescription.trim().length > 0 &&
    slug.length > 0 &&
    (cli !== "custom" || customBin.trim().length > 0);

  return (
    <HUDFrame style={{ padding: 22 }}>
      <div style={{ marginBottom: 16 }}>
        <Eyebrow color="purple">BMad Builder · Author Persona</Eyebrow>
        <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "4px 0 0", maxWidth: 580 }}>
          Define a reusable persona. Its{" "}
          <code style={{ fontFamily: "var(--font-mono)", color: "var(--fn-cyan)" }}>AGENTS.md</code>{" "}
          is written to the vault and it appears in the persona list, ready to spawn.
        </p>
      </div>

      {lastAuthored && (
        <AuthoredConfirmation persona={lastAuthored} onDismiss={() => setLastAuthored(null)} />
      )}
      {error && <ErrorLine text={error} onDismiss={() => setError(null)} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Name + slug preview */}
        <AuthorField label="Persona name *">
          <input
            type="text"
            placeholder='e.g. "Security Auditor" or "DB Architect"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            autoFocus
          />
          {slug && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", marginTop: 3 }}>
              slug: <span style={{ color: "var(--fn-cyan)" }}>{slug}</span>
            </div>
          )}
        </AuthorField>

        {/* Role description */}
        <AuthorField label="Role description *">
          <textarea
            placeholder="Describe this persona's responsibilities, scope, and working style…"
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)" }}
          />
        </AuthorField>

        {/* Lifecycle */}
        <AuthorField label="Lifecycle">
          <div style={{ display: "flex", gap: 6 }}>
            {(["persistent", "ephemeral"] as Lifecycle[]).map((lc) => (
              <button
                key={lc}
                type="button"
                onClick={() => setLifecycle(lc)}
                style={{ ...chipStyle, ...(lifecycle === lc ? chipActiveStyle : {}), flex: 1 }}
              >
                <div style={{ fontWeight: 600 }}>{lc.charAt(0).toUpperCase() + lc.slice(1)}</div>
                <div style={{ fontSize: 10, color: lifecycle === lc ? "rgba(255,196,0,0.7)" : "var(--fg-3)", fontWeight: 400, marginTop: 2 }}>
                  {lc === "persistent"
                    ? "Survives restarts — session stays alive."
                    : "One-shot — exits when task is done."}
                </div>
              </button>
            ))}
          </div>
        </AuthorField>

        {/* Vault scope */}
        <AuthorField label="Vault scope">
          <div style={{ display: "flex", gap: 6 }}>
            {(["shared", "isolated"] as VaultScope[]).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setVaultScope(sc)}
                style={{ ...chipStyle, ...(vaultScope === sc ? chipActiveStyle : {}), flex: 1 }}
              >
                <div style={{ fontWeight: 600 }}>{sc.charAt(0).toUpperCase() + sc.slice(1)}</div>
                <div style={{ fontSize: 10, color: vaultScope === sc ? "rgba(255,196,0,0.7)" : "var(--fg-3)", fontWeight: 400, marginTop: 2 }}>
                  {sc === "shared"
                    ? "Full vault read access (default)."
                    : "Scoped to personas/<slug>/ only."}
                </div>
              </button>
            ))}
          </div>
        </AuthorField>

        {/* Backing CLI */}
        <AuthorField label="Backing CLI">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { id: "claude", label: "Claude Code" },
                { id: "agy", label: "Antigravity" },
                { id: "hermes", label: "Hermes" },
                { id: "custom", label: "Custom" },
              ] as { id: BackingCli; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCli(opt.id)}
                style={{ ...chipStyle, ...(cli === opt.id ? chipActiveStyle : {}) }}
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
        </AuthorField>

        {/* Skills multi-select */}
        <AuthorField label={`Skills (${selectedSkills.length} selected)`}>
          {availableSkills.length === 0 ? (
            <p style={{ color: "var(--fg-3)", fontSize: 12, margin: 0, fontFamily: "var(--font-mono)" }}>
              Loading skill list…
            </p>
          ) : (
            <SkillPicker
              skills={availableSkills}
              selected={selectedSkills}
              onToggle={toggleSkill}
            />
          )}
        </AuthorField>

        {/* Base model override */}
        <AuthorField label="Base model override (optional)">
          <input
            type="text"
            placeholder='Leave blank for CLI default — e.g. "claude-opus-4-6"'
            value={modelOverride}
            onChange={(e) => setModelOverride(e.target.value)}
            style={inputStyle}
          />
        </AuthorField>

        {/* Save button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="purple" onClick={handleSave} disabled={!isValid}>
            {saving ? "Saving…" : "Save Persona →"}
          </Btn>
        </div>
      </div>
    </HUDFrame>
  );
}

// ── SkillPicker ───────────────────────────────────────────────────────

function SkillPicker({
  skills,
  selected,
  onToggle,
}: {
  skills: InstalledSkill[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const visible = filter.trim()
    ? skills.filter(
        (s) =>
          s.id.includes(filter.toLowerCase()) ||
          s.description.toLowerCase().includes(filter.toLowerCase()),
      )
    : skills;

  return (
    <div>
      <input
        type="text"
        placeholder="Filter skills…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      <div
        style={{
          maxHeight: 180,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          paddingRight: 4,
        }}
      >
        {visible.map((skill) => {
          const checked = selected.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => onToggle(skill.id)}
              style={{
                ...chipStyle,
                ...(checked ? skillCheckedStyle : {}),
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: `1px solid ${checked ? "var(--fn-gold)" : "var(--fg-3)"}`,
                  borderRadius: 2,
                  background: checked ? "rgba(255,196,0,0.15)" : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: "var(--fn-gold)",
                }}
              >
                {checked ? "✓" : ""}
              </span>
              <span>
                <span style={{ fontWeight: 600 }}>{skill.id}</span>
                <span style={{ color: "var(--fg-3)", fontSize: 10, marginLeft: 8 }}>
                  {skill.description.split(" — ")[1] ?? ""}
                </span>
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p style={{ color: "var(--fg-3)", fontSize: 11, margin: 0, fontFamily: "var(--font-mono)" }}>
            No skills match "{filter}"
          </p>
        )}
      </div>
      {selected.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {selected.map((id) => (
            <Badge key={id} color="gold" style={{ cursor: "pointer" }} onClick={() => onToggle(id)}>
              {id} ✕
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function AuthorField({ label, children }: { label: string; children: React.ReactNode }) {
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

function AuthoredConfirmation({
  persona,
  onDismiss,
}: {
  persona: AuthoredPersonaInfo;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        background: "rgba(176,0,255,0.06)",
        border: "1px solid rgba(176,0,255,0.3)",
        borderRadius: 2,
        padding: "10px 14px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--fn-white)" }}>
          {persona.name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fn-cyan)", marginTop: 2 }}>
          {persona.agents_md_path}
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge color="purple">{persona.lifecycle}</Badge>
          <Badge color="muted">{persona.vault_scope}</Badge>
        </div>
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
        style={{ background: "none", border: "none", color: "#FF8FA3", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, padding: "2px 6px" }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

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

const skillCheckedStyle: React.CSSProperties = {
  background: "rgba(255,196,0,0.04)",
  border: "1px solid rgba(255,196,0,0.25)",
};
