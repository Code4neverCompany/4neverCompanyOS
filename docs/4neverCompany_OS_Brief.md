# 4neverCompany OS — Project Brief

**Status:** Draft v0.6 (renamed to "4neverCompany OS")
**Owner:** 4neverCompany
**Date:** May 2026

---

## 1. Executive Summary

4neverCompany OS is a packaged desktop workspace (initially Windows `.exe`, cross-platform to follow) that combines three existing open-source projects into a single coherent, locally-installable product:

- **Paperclip** (paperclipai/paperclip) — the agent-team control plane (companies, projects, goals, budgets, adapters).
- **Hermes Agent** (NousResearch/hermes-agent) — the main orchestrator and conductor; may also wear individual persona "hats" when no dedicated sub-agent is assigned.
- **BMAD Method** (bmad-code-org/BMAD-METHOD) — the default agile, agent-driven development methodology, with **BMad Builder (BMB) featured prominently** as the in-app surface for creating new personas, workflows, and modules on the fly.

The defining architectural commitments in this revision:

- **Two fixed persona agents** spawn the moment a project opens and stay persistent: **Dev** (Claude Code, strong Claude model) and **Frontend Designer** (Antigravity CLI / `agy`, strong Gemini model). These are the always-on backbone.
- **Every other persona is dynamic**: spawned on demand either by Hermes (autonomously, when the workflow calls for it) or by the user (one-click via a featured BMB-powered UI). Each dynamic agent picks a lifecycle — **persistent** (joins the team for the rest of the project) or **ephemeral** (runs one task, returns, disappears).
- **Inter-agent message bus is liberal, not capped.** Personas talk freely peer-to-peer; Hermes watches for *progress*, not chatter, and only intervenes when conversation is happening *without* forward motion on artifacts, code, or stories.
- **Persistent agents live in real attachable terminals**, managed by an embedded Zellij multiplexer that survives desktop-app restarts.

Around that core, the workspace adds an integrated Obsidian vault for local memory, a Supermemory layer for server-side memory, automatic generation and lifecycle management of per-agent configuration files (`agent.md`, `claude.md`, `agy.md`, etc.), and first-class CLI/terminal interop on top of the existing Hermes TUI.

The product is a curated, opinionated **distribution** — not a new orchestrator, not a new methodology — that turns the Paperclip + Hermes + BMAD stack into something a single user can install in one click.

---

## 2. Vision & Positioning

**One-line pitch:** *A desktop workspace where Dev and Designer are always at the table, every other role shows up when the work needs it, and Hermes conducts the whole team in real time.*

**Category:** AIO (all-in-one) desktop workspace for AI-agent-driven work — sitting between developer agent CLIs (Claude Code, Antigravity CLI, MiniMax) and orchestration platforms (Paperclip), with methodology (BMAD), memory, and skills as first-class artifacts.

**Why now / why bundle:**
- Paperclip provides the org/governance/goal layer for an agent "company."
- Hermes Agent provides a powerful CLI/TUI agent with skill auto-creation, subagent spawning, multi-platform gateways, and a `hermes-paperclip-adapter`.
- BMAD provides a proven, artifact-driven methodology that maps cleanly onto Paperclip companies and Hermes skills/subagents.
- Multiple terminal-native coding agents (Claude Code, Antigravity CLI, MiniMax) now exist, each strongest in different domains — the natural unit of work is *one persona = one agent process = one CLI*.
- The remaining friction is **installation, configuration, methodology onboarding, persona-to-agent wiring, and memory integration** — that is the gap this product fills.

**What it is not:**
- Not a fork or replacement of Paperclip, Hermes, or BMAD.
- Not a new model or a new agent runtime.
- Not a cloud-only SaaS — the default install runs entirely on the user's machine.

---

## 3. Core Architecture

### 3.1 Control Plane — Paperclip

Paperclip is the outer shell that defines *what work exists*: companies, projects, goals, roles, budgets, and the agents assigned to them. The workspace ships a preconfigured Paperclip instance with an embedded Postgres + local file storage, a BMAD-shaped default starter company, the `hermes-paperclip-adapter` preinstalled, and adapter plugins for Claude Code, Antigravity CLI, MiniMax, and other sub-agents.

### 3.2 Conductor — Hermes Agent

Hermes is the conductor sitting above the persona agents. Its responsibilities:

- Interpreting user intent and dispatching the right persona for the job.
- Spawning, supervising, and tearing down persona-agent processes (both fixed and dynamic).
- Watching the inter-agent message bus (§3.5) for *progress*, intervening only when conversation is happening without forward motion.
- Curating cross-project memory across Hermes native memory + Obsidian vault + Supermemory.
- Wearing a persona "hat" itself when a role is needed for a single quick task and spinning up a full external agent would be overkill.

Hermes is the conductor, not a chokepoint. The bus is open.

### 3.3 Persona Agents — Two Fixed, Everything Else Dynamic

This is the central architectural model.

**Fixed personas (always-on from project start):**

| Persona | Backing CLI | Default Model | Why fixed |
|---|---|---|---|
| **Dev** | **Claude Code** | **Claude Opus 4.6 (Thinking)** | Almost every project needs continuous engineering presence |
| **Frontend Designer** | **Antigravity CLI (`agy`)** | **Gemini 3.1 Pro (High)** | UX/visual work runs in parallel with engineering; benefits from a different model family |

Both spawn the instant a project opens, get their own attached terminal in the embedded Zellij multiplex, get their own scoped memory directory in the Obsidian vault, and persist across desktop-app restarts.

**Dynamic personas (everything else):**

Analyst, PM, Architect, SM, QA, Security Reviewer, Research, Data — and any custom persona the user invents — are spawned on demand. Two trigger paths:

- **Hermes-initiated.** Hermes detects the work needs a role and proposes spawning it: "We're entering the story-writing phase; spinning up the SM persona." The user can approve, override, or veto.
- **User-initiated.** A featured BMad Builder (BMB) panel in the desktop UI offers a one-click "Add Agent" surface — pick a BMAD persona (or define a new one), pick a backing CLI/model, pick a lifecycle, and the agent joins the team.

Each dynamic agent picks one of two lifecycles at spawn time:

- **Persistent** — full membership: own terminal, own vault directory, own identity on the message bus, survives until the project closes or the user dismisses it. Used when the role will recur (e.g., once you have an Architect, you'll need them again).
- **Ephemeral** — one-shot: runs a single task to completion, returns its output as an artifact, and exits. No terminal allocation, no bus identity beyond the task. Used for narrow, bounded jobs (e.g., "summarize this PRD," "review this one PR for security issues").

All assignments (which model behind which persona, default lifecycle, etc.) are configurable per workspace and per project, from the desktop UI or the `hermes` CLI.

### 3.4 Default Methodology — BMAD (with BMB Featured)

BMAD ships as the bundled default methodology and the primary day-1 experience.

- **Preinstalled personas.** The standard BMAD persona library (Analyst, PM, Architect, SM, Dev, QA, UX, plus others from BMM) is preinstalled. Dev and Frontend Designer are pre-bound to Claude Code and Antigravity CLI respectively (per §3.3); the rest are ready to be spawned dynamically.
- **Persona files as source of truth.** BMAD persona markdown files are imported into the Obsidian vault. When a persona is bound to a specific CLI, the workspace projects the persona file into the corresponding tool-specific config (`claude.md`, `agy.md`, etc.) automatically and keeps them in sync.
- **Workflows as orchestration recipes.** BMAD YAML workflows (e.g., `greenfield-fullstack`, `brownfield`) are exposed as one-click Paperclip workflows. Hermes runs them step-by-step, spawning dynamic personas at the right phase and handing off through the message bus and vault artifacts.
- **Artifact storage.** PRDs, architecture docs, story files, QA reports live in the Obsidian vault under a documented project layout, versioned in Git, optionally indexed into Supermemory.
- **BMad Builder is a featured v1 UI surface.** Because the architecture relies on dynamic on-the-fly persona creation, BMB is not hidden behind a "power user" toggle — it's a top-level panel: "Add Agent," "Create Workflow," "Build Module." Personas a user invents become reusable BMAD modules that can be installed elsewhere with `npx bmad-method install --source ...`.

BMAD is the default, not the only option. Users who prefer a different methodology can disable it.

### 3.5 Inter-Agent Communication

Agents communicate through two complementary channels:

- **Durable artifact handoff (file-based).** The primary BMAD loop runs through markdown artifacts in the Obsidian vault — PRDs, architecture docs, story files. This is the *async, persistent* lane: a Dev agent finishes Story 07, writes its result, and a QA agent picks it up later. Artifacts are the source of truth and survive every restart.
- **Live message bus (chat-based, liberal).** A pub/sub bus (backed by Paperclip's event system) lets agents talk to each other in real time, peer-to-peer, with no per-message cap. Any agent can post; any agent (or the user) can subscribe. The bus is intentionally expansive — productive collaboration sometimes looks like a lot of chatter.

**Progress-based stall detection (not a turn budget).** Instead of capping messages, Hermes watches for *forward motion*:

- Are artifacts in the vault changing? (PRDs updated, story files closing, architecture revisions committed.)
- Is code being written or modified? (File changes in the project directory.)
- Are stories transitioning state? (open → in-progress → review → done.)

If chatter is happening *without* progress on those signals for a configurable window (default: a few minutes of bus activity with no artifact/code/status change), Hermes intervenes — summarizing the disagreement, asking the user to arbitrate, or proposing a concrete next step. If progress is happening, the bus stays out of the way no matter how many messages fly.

The user is a first-class participant: read every channel, post anywhere, pause/redirect any persona at any time.

### 3.6 Agent Generation & Configuration

Three creation modes:

- **From BMAD library.** Pick a built-in persona (Analyst, PM, etc.); the workspace assigns a default CLI/model, applies the chosen lifecycle (persistent or ephemeral), and spawns it.
- **Manual via BMB.** Define a new persona (name, role, backing CLI, model, tools, personality) through the featured BMB panel; optionally save it as a reusable module.
- **Automatic.** Hermes detects a recurring need and proposes a new persistent agent or promotes a frequently-spawned ephemeral one into a persistent persona.

For each spawned agent, the workspace writes the appropriate config file (`claude.md`, `agy.md`, `agent.md`) into the project root and keeps it synced with the canonical persona file in the vault.

### 3.7 Memory Layer

- **Per-persona local memory.** Each persistent persona agent has its own scoped notes/skills directory in the vault.
- **Project memory — Obsidian vault.** Shared across personas within a project: BMAD artifacts, decisions, project context.
- **Cross-project memory — Supermemory.** Embeddings and semantic recall across all projects, opt-in per content.
- **Hermes native memory.** FTS5 session search + agent-curated memory sits underneath as the runtime memory layer.

The workspace defines sync policy and conflict resolution across these tiers; local-only toggles for privacy-sensitive content.

### 3.8 Skills & Personality

Hermes (autonomous skill creation) and BMAD (structured personas) both treat skills/personas as plain markdown. The workspace surfaces all of them in the Obsidian vault for read, edit, version-control, GitHub mirroring, and cross-machine sharing.

### 3.9 Terminal / CLI Interop

CLI is a first-class surface. The full Hermes TUI is embedded. The embedded **Zellij multiplexer** owns all persistent persona-agent sessions and is attachable from the desktop UI — every persistent agent has a real terminal pane you can watch and type into. `hermes`, `paperclipai`, `bmad-method`, `agy`, and `claude` CLIs are all on the system path. Output is structured (JSON streams where supported). All workspace actions remain scriptable headlessly.

---

## 4. Key Features (MVP Scope)

The MVP focuses on packaging and integration. Core features: a single Windows installer that provisions Paperclip + Hermes + BMAD + Zellij + dependencies; a first-run wizard that configures model providers, the Obsidian vault location, the BMAD module set, and optional Supermemory and GitHub accounts; preinstalled adapters for Claude Code and Antigravity CLI with their OAuth flows surfaced cleanly; **two fixed persona agents (Dev + Frontend Designer) spawned per project from day one**; **a featured BMad Builder "Add Agent" panel** for dynamic on-the-fly persona creation, with explicit persistent/ephemeral lifecycle choice; the inter-agent message bus with a viewable channel per project and progress-based stall detection; auto-generation and bidirectional sync of `claude.md` / `agy.md` / `agent.md` files; a "Start a BMAD project" flow that runs `greenfield-fullstack` end-to-end as the day-1 experience, spawning dynamic personas at the right phases; an embedded multi-terminal view (Zellij-powered) showing each persistent agent's session; and GitHub integration for backing up agent configs, BMAD artifacts, skills, and personalities.

---

## 5. Technical Stack

- **Desktop shell:** Tauri preferred; Electron as fallback.
- **Bundled runtime:** Node.js 20+ and pnpm 9.15+ (Paperclip + BMAD), Python (Hermes), Go binaries (`agy`, Zellij).
- **Bundled services:** Embedded Postgres for Paperclip; Hermes local stores in `~/.hermes`; BMAD via `npx bmad-method install`; Antigravity CLI from official installer; Claude Code via standard channel.
- **Process orchestration:** **Embedded Zellij** as the persistent-session multiplexer. Each fixed and persistent-dynamic persona gets its own Zellij pane; the desktop UI attaches/detaches without killing the underlying processes.
- **Message bus:** Pub/sub over Paperclip's existing event system, extended with progress-signal subscribers for stall detection; WebSocket relay to the desktop UI.
- **Local memory:** Obsidian (managed vault).
- **Server memory:** Supermemory API.
- **VCS:** GitHub for syncing configs, BMAD artifacts, skills, personalities.

---

## 6. Primary User Workflows

**First-run.** User installs the `.exe`; the installer provisions Paperclip + Hermes + BMAD + Zellij + Postgres + Antigravity CLI + Claude Code + the Obsidian vault; first-run wizard collects model API keys, Google OAuth for Antigravity, Anthropic auth for Claude Code, and optional Supermemory/GitHub.

**Starting a BMAD project.** User picks "Start a BMAD project," chooses `greenfield-fullstack`, and the workspace immediately spawns the two fixed personas (Dev and Frontend Designer) in their Zellij panes. Hermes wears the Analyst hat (or spawns a dedicated Analyst dynamic agent if the user prefers) to lead the brief; once the brief is approved, Hermes proposes spawning PM, then Architect, then SM — each dynamic, each with the user picking persistent or ephemeral. Once story files exist, Dev and Frontend Designer pick them up in parallel; QA spawns when stories enter review state. The bus carries cross-persona chatter throughout, and Hermes only intervenes when the progress signal flatlines.

**Free-form project.** User states a goal to Hermes without invoking a BMAD workflow; the two fixed personas spawn anyway (always-on backbone); Hermes scaffolds the project, dispatches work to Dev and Frontend Designer directly, and spawns additional personas dynamically as the work demands.

**Dynamic spawn — Hermes-initiated.** Mid-project, Hermes posts to the bus: "This change touches auth — I'd like to spawn a Security Reviewer (ephemeral) for this story. Approve?" User clicks approve; the ephemeral agent runs, posts its review, and disappears.

**Dynamic spawn — user-initiated.** User opens the BMB "Add Agent" panel, picks "Architect" from the BMAD library, chooses Claude Code as backing CLI, chooses persistent lifecycle. The Architect agent spawns into its own Zellij pane and joins the bus.

**Custom persona via BMB.** User wants a "Customer Support Triage" agent that doesn't exist in BMAD. From the BMB panel they define it (persona file, role, model, tools), spawn it, and optionally save it as a reusable BMAD module.

**Team / multi-machine.** Configs, artifacts, skills, personas committed to GitHub; another machine installs the workspace, pulls the repo, and resumes work — same fixed personas spawn, same dynamic personas can be respawned on demand.

---

## 7. Differentiators

- **Two roles always present, every other role on demand.** Mirrors how real teams actually work.
- **One persona = one persistent process = one Zellij terminal.** Real, attachable, durable — not stateless prompt invocations.
- **Right model behind each role.** Claude Code for Dev, Antigravity CLI/Gemini for Frontend, whatever fits for everything else.
- **Dynamic spawning is a featured UI primitive.** BMad Builder isn't buried — adding an agent is one click.
- **Liberal peer-to-peer bus with progress-based stall detection.** Chatter is fine if work is happening.
- **Methodology, not just tooling.** BMAD ships as the default day-1 experience.
- **Config-as-code.** Persona files, BMAD artifacts, skills — all version-controlled markdown.
- **Local-first memory with optional cloud.** Obsidian is source of truth; Supermemory is opt-in.
- **Single desktop binary.** No browser tabs, no docker-compose, no separate dashboard.

---

## 8. Out of Scope (for v1)

Mobile clients, multi-user real-time collaboration with presence, a marketplace for community-published agents/skills/BMAD modules, and a hosted SaaS tier are deferred. v1 ships as a single-user desktop product with GitHub-based sync as the only collaboration story. Building a custom orchestrator and authoring a competing methodology are explicitly out of scope.

---

## 9. Risks & Open Questions

- **Gemini CLI deprecation.** Gemini CLI sunsets June 18, 2026 for individual Pro/Ultra users; the workspace standardizes on Antigravity CLI (`agy`) from day one.
- **Upstream churn (× 4).** Paperclip, Hermes, BMAD, and Antigravity (still in public preview, RCE issue reported May 2026) all move fast. Pin versions; have an upgrade story.
- **Process orchestration complexity.** Persistent per-persona agents managed by embedded Zellij is the riskiest engineering surface — crash recovery, log capture, resource limits, model-API quota interplay. Spike this early.
- **Progress-detection heuristic tuning.** The signal set (artifact changes, code changes, story-state transitions) needs careful calibration — too sensitive and Hermes interrupts productive deep-dive conversations; too lax and agents loop unnoticed. Default window and signals are configurable.
- **Cost control.** Persistent agents idling shouldn't burn tokens, but active multi-persona workflows can rack up spend fast. Per-persona budget gates plus a project-level kill switch.
- **Licensing & redistribution.** Paperclip is MIT; Hermes, BMAD, Antigravity CLI, Claude Code, and Zellij each have their own terms. License review per component. Antigravity CLI specifically requires Google OAuth — first-run wizard handles this explicitly.
- **Memory-tier conflicts.** Four sources of truth (Hermes native, per-persona vault dirs, project vault, Supermemory). Explicit precedence spec required.
- **Trust & permissions.** Multiple persistent agents with shell access and network reach is a real attack surface. Sandboxing model leans on each CLI's own permission model where possible.
