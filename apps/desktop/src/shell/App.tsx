// Top-level shell. M1 starts here: this component will eventually host
// Paperclip's React UI (via PaperclipHost from src/paperclip-host/)
// and inject the workspace panels via createPortal into Paperclip's
// named slots. For now (M0 + visual baseline 2026-05-26), it renders the
// 4never AppShell chrome (TopBar + SideRail) around a HUDFrame placeholder
// in the main slot — the placeholder is where Paperclip's portal-host
// React tree will mount in subsequent stories (Story 1.12+).

import { useState } from "react";
import { Badge, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import monogramUrl from "@c4n/ui-tokens/assets/logo/monogram.png";
import { ProjectsView } from "../views/ProjectsView";

type RailItem = "projects" | "personas" | "vault" | "memory" | "settings";

const RAIL_ITEMS: ReadonlyArray<{ id: RailItem; label: string; icon: string }> = [
  { id: "projects", label: "Projects", icon: "▣" },
  { id: "personas", label: "Personas", icon: "◉" },
  { id: "vault", label: "Vault", icon: "◈" },
  { id: "memory", label: "Memory", icon: "⌬" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function TopBar() {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid rgba(255,196,0,0.18)",
        background: "rgba(10,11,20,0.85)",
        backdropFilter: "blur(6px)",
        padding: "0 20px",
        gap: 24,
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Logo lockup */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          src={monogramUrl}
          alt="4never"
          style={{
            height: 30,
            width: "auto",
            filter: "drop-shadow(0 0 10px rgba(255,196,0,0.35))",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 16,
            color: "var(--fn-purple)",
            letterSpacing: "-0.02em",
          }}
        >
          4nco
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-3)",
            letterSpacing: "0.15em",
            marginLeft: 4,
            paddingLeft: 10,
            borderLeft: "1px solid var(--border-neutral)",
          }}
        >
          CONSOLE v0.0
        </span>
      </div>

      {/* Center strip — BMAD PROTOCOL status. STANDBY (cyan, not the success-green
          variant) reflects that no BMAD workflow is actively running yet; the strip
          becomes ACTIVE once a project is open and a persona spawn has happened.
          Honest chrome rather than misleading "always active" status. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          gap: 16,
          alignItems: "center",
        }}
      >
        <StatusDot color="var(--fn-cyan)" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-2)",
            letterSpacing: "0.08em",
          }}
        >
          BMAD PROTOCOL · STANDBY
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          {now}
        </span>
      </div>

      {/* Right meta: pre-release indicator (the brief locks 2 fixed personas
          but neither is spawned yet at this milestone). */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Badge color="muted">PRE-RELEASE</Badge>
      </div>

      {/* Gold accent line under the bar */}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -1,
          height: 1,
          background: "linear-gradient(90deg, transparent, var(--fn-gold), transparent)",
        }}
      />
    </div>
  );
}

function SideRail({
  active,
  onNavigate,
}: {
  active: RailItem;
  onNavigate: (id: RailItem) => void;
}) {
  return (
    <nav
      style={{
        width: 64,
        flexShrink: 0,
        background: "rgba(10,11,20,0.65)",
        borderRight: "1px solid var(--border-neutral)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 4,
      }}
    >
      {RAIL_ITEMS.map((it) => (
        <button
          key={it.id}
          className="side-rail-btn"
          data-active={active === it.id ? "true" : "false"}
          onClick={() => onNavigate(it.id)}
          title={it.label}
          type="button"
        >
          <span>{it.icon}</span>
          <span className="label">{it.label.toUpperCase()}</span>
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div
        style={{
          width: 28,
          height: 28,
          border: "1px solid var(--border-gold-soft)",
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          color: "var(--fn-gold)",
          fontSize: 12,
        }}
      >
        ?
      </div>
    </nav>
  );
}

/**
 * MainSlot — where Paperclip's portal-host React tree will mount.
 * For Story 1.12+ this will:
 *   1. Boot the Paperclip React UI inside this <main>
 *   2. Resolve Paperclip's named portal slots (D-13)
 *   3. Inject workspace panels (BMad Builder, bus channel view, approvals,
 *      multi-terminal) via createPortal
 *
 * Until then, we render a clearly labeled placeholder so the visual
 * baseline looks like the design system while the actual host is plumbed.
 */
/** Per-rail-item placeholder copy for the rail items that aren't wired up
 *  to a real view yet. `projects` has its own implementation in
 *  views/ProjectsView (Story 1.12). The rest will land on their own stories. */
type PlaceholderRailItem = Exclude<RailItem, "projects">;

const SLOT_COPY: Record<
  PlaceholderRailItem,
  { eyebrow: string; titlePrefix: string; titleAccent: string; body: string; comingIn: string }
> = {
  personas: {
    eyebrow: "Personas · 2 fixed",
    titlePrefix: "",
    titleAccent: "Personas",
    body: "The Dev persona (Claude Code) and Frontend Designer (Antigravity CLI) are the two ship-time personas. Every other persona is dynamic via the BMad Builder.",
    comingIn: "Story 2.x — BMad Builder + dynamic persona panel",
  },
  vault: {
    eyebrow: "Vault · ~/.4nevercompanyos",
    titlePrefix: "",
    titleAccent: "Vault",
    body: "Persona definitions, BMAD artifacts, per-project logs, skills, and memory live in the vault directory configured in the first-run wizard.",
    comingIn: "Story 1.x — Vault browser + reveal-in-Obsidian",
  },
  memory: {
    eyebrow: "Memory",
    titlePrefix: "",
    titleAccent: "Memory",
    body: "Vault-backed memory layer. The Hermes Agent (sibling tool) lives in its own vault; M5 will optionally bridge to Supermemory for cross-project semantic recall.",
    comingIn: "Story 1.16 — Hermes TUI embedded as a pane",
  },
  settings: {
    eyebrow: "Settings",
    titlePrefix: "",
    titleAccent: "Settings",
    body: "Preferences, account credentials, attribution, license panel, and developer flags.",
    comingIn: "Story 1.19 — attribution surfaces + Settings → About",
  },
};

function MainSlot({ active }: { active: RailItem }) {
  if (active === "projects") {
    return <ProjectsView />;
  }
  const copy = SLOT_COPY[active];
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <Eyebrow>{copy.eyebrow}</Eyebrow>
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
            {copy.titlePrefix}
            <span style={{ color: "var(--fn-gold)" }}>{copy.titleAccent}</span>
          </h1>
          <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "4px 0 0", maxWidth: 640 }}>
            {copy.body}
          </p>
        </div>
        <Badge color="warn">PLACEHOLDER</Badge>
      </div>

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
        <div style={{ textAlign: "center", maxWidth: 560 }}>
          <Eyebrow color="cyan">Not yet implemented</Eyebrow>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 24,
              color: "var(--fn-white)",
              letterSpacing: "-0.01em",
              margin: "8px 0",
            }}
          >
            Coming in {copy.comingIn.split(" — ")[0]}
          </div>
          <p
            style={{
              color: "var(--fg-3)",
              fontSize: 13,
              margin: 0,
              fontFamily: "var(--font-mono)",
            }}
          >
            {copy.comingIn}
          </p>
        </div>
      </HUDFrame>
    </main>
  );
}

export function App() {
  const [active, setActive] = useState<RailItem>("projects");
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-0)",
      }}
    >
      <TopBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SideRail active={active} onNavigate={setActive} />
        <MainSlot active={active} />
      </div>
    </div>
  );
}
