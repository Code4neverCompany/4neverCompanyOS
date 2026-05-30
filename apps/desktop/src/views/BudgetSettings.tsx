// BudgetSettings — Story 5.6 (FR-36).
//
// Per-persona token budget settings: set USD limits per persona, view
// accumulated spend, reset counters, unpause after budget exceeded.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Badge, Eyebrow, HUDFrame } from "@c4n/ui-tokens";

interface PersonaBudgetStatus {
  persona_id: string;
  spend_usd: number;
  limit_usd: number;
  pct_used: number;
  paused: boolean;
  over_limit: boolean;
}

interface PersonaBudget {
  id: string;
  label: string;
  defaultLimit: number;
}

const KNOWN_PERSONAS: PersonaBudget[] = [
  { id: "dev", label: "Dev (Claude Code)", defaultLimit: 50 },
  { id: "frontend-designer", label: "Frontend Designer (agy)", defaultLimit: 30 },
  { id: "hermes", label: "Hermes (conductor)", defaultLimit: 0 },
];

export function BudgetSettings() {
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<PersonaBudgetStatus[]>([]);
  const [loading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBudgets();
    loadStatuses();
  }, []);

  async function loadBudgets() {
    try {
      const limits = await invoke<Record<string, number>>("get_persona_budget_limits");
      setBudgets(limits);
    } catch {
      setBudgets({});
    }
  }

  async function loadStatuses() {
    try {
      const s = await invoke<PersonaBudgetStatus[]>("get_persona_budgets");
      setStatuses(s);
    } catch {
      setStatuses([]);
    }
  }

  async function handleSaveLimits() {
    setSaving(true);
    try {
      await invoke("save_persona_budgets", { budgets });
      await loadStatuses();
    } catch (e) {
      console.error("[BudgetSettings] failed to save budgets:", e);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(personaId: string) {
    try {
      await invoke("reset_persona_spend", { personaId });
      await loadStatuses();
    } catch (e) {
      console.error("[BudgetSettings] failed to reset spend:", e);
    }
  }

  async function handleUnpause(personaId: string) {
    try {
      await invoke("unpause_persona_budget", { personaId });
      await loadStatuses();
    } catch (e) {
      console.error("[BudgetSettings] failed to unpause:", e);
    }
  }

  function setLimit(id: string, value: string) {
    const num = parseFloat(value);
    setBudgets((prev) => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  }

  const hasAnyLimit = Object.values(budgets).some((v) => v > 0);

  return (
    <HUDFrame style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Eyebrow color="cyan">Settings</Eyebrow>
        <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
          →
        </span>
        <Eyebrow color="purple">Persona Budgets</Eyebrow>
        {saving && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
            saving…
          </span>
        )}
      </div>

      <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "0 0 16px", maxWidth: 560 }}>
        Set monthly spending limits (USD) per persona. When a persona exceeds its
        limit, it is automatically paused. Budget resets are tracked separately — use
        the reset button to clear spend counters after a billing cycle.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {KNOWN_PERSONAS.map((persona) => {
          const status = statuses.find((s) => s.persona_id === persona.id);
          const limit = budgets[persona.id] ?? persona.defaultLimit;
          return (
            <PersonaBudgetRow
              key={persona.id}
              persona={persona}
              limit={limit}
              status={status ?? null}
              onLimitChange={(v) => setLimit(persona.id, v)}
              onReset={() => handleReset(persona.id)}
              onUnpause={() => handleUnpause(persona.id)}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSaveLimits}
          disabled={saving}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "11px 20px",
            borderRadius: 2,
            cursor: saving ? "not-allowed" : "pointer",
            background: hasAnyLimit ? "var(--fn-purple)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${hasAnyLimit ? "var(--fn-purple)" : "var(--border-neutral)"}`,
            color: "var(--fn-white)",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Saving…" : "Save Limits"}
        </button>
        <button
          onClick={loadStatuses}
          disabled={loading}
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
            opacity: loading ? 0.5 : 1,
          }}
        >
          Refresh Status
        </button>
      </div>
    </HUDFrame>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PersonaBudgetRow({
  persona,
  limit,
  status,
  onLimitChange,
  onReset,
  onUnpause,
}: {
  persona: PersonaBudget;
  limit: number;
  status: PersonaBudgetStatus | null;
  onLimitChange: (v: string) => void;
  onReset: () => void;
  onUnpause: () => void;
}) {
  const overLimit = status?.over_limit ?? false;
  const paused = status?.paused ?? false;
  const pct = status?.pct_used ?? 0;
  const spend = status?.spend_usd ?? 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderRadius: 2,
        border: `1px solid ${overLimit ? "var(--fn-red)" : paused ? "var(--fn-gold)" : "var(--border-neutral)"}`,
        background: overLimit
          ? "rgba(255,50,50,0.05)"
          : paused
          ? "rgba(255,196,0,0.05)"
          : "rgba(255,255,255,0.02)",
        opacity: paused && !overLimit ? 0.8 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--fn-white)",
            }}
          >
            {persona.label}
          </span>
          {overLimit && <Badge color="err">Over limit</Badge>}
          {paused && !overLimit && <Badge color="warn">Paused</Badge>}
          {status && limit > 0 && !paused && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: pct > 80 ? "var(--fn-gold)" : "var(--fg-3)",
              }}
            >
              {pct.toFixed(0)}% used
            </span>
          )}
        </div>

        {status && limit > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: "100%",
                  background: pct > 90 ? "var(--fn-red)" : pct > 75 ? "var(--fn-gold)" : "var(--fn-purple)",
                  transition: "width 300ms",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-3)",
                minWidth: 80,
                textAlign: "right",
              }}
            >
              ${spend.toFixed(2)} / ${limit.toFixed(0)}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-3)",
            }}
          >
            Limit:
          </span>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--fg-3)",
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              type="number"
              value={limit}
              min={0}
              step={5}
              onChange={(e) => onLimitChange(e.target.value)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-neutral)",
                borderRadius: 2,
                padding: "6px 20px 6px 18px",
                color: "var(--fn-white)",
                width: 80,
                outline: "none",
              }}
            />
          </div>
        </div>

        {status && status.spend_usd > 0 && (
          <button
            onClick={onReset}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 2,
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--border-neutral)",
              color: "var(--fg-3)",
            }}
          >
            Reset
          </button>
        )}

        {paused && (
          <button
            onClick={onUnpause}
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "5px 12px",
              borderRadius: 2,
              cursor: "pointer",
              background: "var(--fn-gold)",
              border: "1px solid var(--fn-gold)",
              color: "var(--fn-black)",
            }}
          >
            Resume
          </button>
        )}
      </div>
    </div>
  );
}
