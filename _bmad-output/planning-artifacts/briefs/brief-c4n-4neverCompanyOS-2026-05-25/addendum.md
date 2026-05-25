---
title: 4neverCompany OS — Brief Addendum
status: draft
created: 2026-05-25
updated: 2026-05-25
companion_to: brief.md
source: docs/4neverCompany_OS_Brief.md (v0.6)
source_companion: docs/4neverCompany_OS_Build_Plan.md (v0.1)
---

# Addendum

This addendum preserves the depth that does not fit in a 1–2 page BMAD brief but is essential for the PM, Architect, and SM personas downstream. All content is drawn from the source brief (`docs/4neverCompany_OS_Brief.md` v0.6) and the build plan (`docs/4neverCompany_OS_Build_Plan.md` v0.1). Strategic decisions are not modified; this is reformatted and indexed depth.

Sections roughly track the source brief's structure so the Architect persona can cross-reference quickly.

---

## A. Core Architecture (from source §3)

### A.1 Control Plane — Paperclip

Paperclip is the outer shell defining what work exists: companies, projects, goals, roles, budgets, and the agents assigned. The workspace ships a preconfigured Paperclip instance with:
- Embedded Postgres + local file storage.
- A BMAD-shaped default starter company.
- The `hermes-paperclip-adapter` preinstalled.
- Adapter plugins for Claude Code, Antigravity CLI, MiniMax, and other sub-agents.

### A.2 Conductor — Hermes Agent

Hermes is the conductor sitting above the persona agents. Responsibilities:

- Interpret user intent and dispatch the right persona.
- Spawn, supervise, and tear down persona-agent processes (fixed and dynamic).
- Watch the inter-agent message bus for *progress*, intervening only when conversation is happening without forward motion.
- Curate cross-project memory across Hermes native memory + Obsidian vault + Supermemory.
- Wear a persona "hat" itself when a role is needed for a single quick task and spinning up a full external agent would be overkill.

> "Hermes is the conductor, not a chokepoint. The bus is open." — source §3.2

### A.3 Persona Agents — Two Fixed, Everything Else Dynamic

**Fixed personas (always-on from project start):**

| Persona | Backing CLI | Default Model | Rationale |
|---|---|---|---|
| **Dev** | Claude Code | Claude Opus 4.6 (Thinking) | Almost every project needs continuous engineering presence. |
| **Frontend Designer** | Antigravity CLI (`agy`) | Gemini 3.1 Pro (High) | UX/visual work runs in parallel with engineering; benefits from a different model family. |

Both spawn the instant a project opens, get their own attached terminal in the embedded Zellij multiplex, get their own scoped memory directory in the Obsidian vault, and persist across desktop-app restarts.

**Dynamic personas (everything else):**

Analyst, PM, Architect, SM, QA, Security Reviewer, Research, Data — and any custom persona the user invents — are spawned on demand. Two trigger paths:

- **Hermes-initiated:** Hermes detects the work needs a role and proposes spawning it; user can approve, override, or veto.
- **User-initiated:** A featured BMad Builder panel in the desktop UI offers a one-click "Add Agent" surface — pick a BMAD persona (or define a new one), pick a backing CLI/model, pick a lifecycle.

**Lifecycle choice at spawn time:**

- **Persistent** — full membership: own terminal, own vault directory, own bus identity, survives until project closes or user dismisses. Used when the role will recur.
- **Ephemeral** — one-shot: runs a single task, returns its output as an artifact, exits. No terminal allocation, no bus identity beyond the task. Used for narrow, bounded jobs.

All assignments are configurable per workspace and per project, from the desktop UI or the `hermes` CLI.

### A.4 Default Methodology — BMAD (with BMB Featured)

- **Preinstalled personas.** Standard BMAD persona library (Analyst, PM, Architect, SM, Dev, QA, UX, plus others from BMM) preinstalled. Dev and Frontend Designer pre-bound to Claude Code and Antigravity CLI; the rest are ready to be spawned dynamically.
- **Persona files as source of truth.** BMAD persona markdown files imported into the Obsidian vault. Bind-to-CLI projects the persona file into the corresponding tool-specific config (`claude.md`, `agy.md`, etc.) automatically; sync is bidirectional.
- **Workflows as orchestration recipes.** BMAD YAML workflows (e.g., `greenfield-fullstack`, `brownfield`) are exposed as one-click Paperclip workflows. Hermes runs them step-by-step, spawning dynamic personas at the right phase, handing off through bus and vault artifacts.
- **Artifact storage.** PRDs, architecture docs, story files, QA reports live in the Obsidian vault under a documented project layout, versioned in Git, optionally indexed into Supermemory.
- **BMad Builder is a featured v1 UI surface** — not hidden behind a power-user toggle. Top-level panel: "Add Agent," "Create Workflow," "Build Module." User-invented personas become reusable BMAD modules.

BMAD is the default, not the only option. Users can disable it.

### A.5 Inter-Agent Communication

Two complementary channels:

- **Durable artifact handoff (file-based).** The primary BMAD loop runs through markdown artifacts in the Obsidian vault — PRDs, architecture docs, story files. Async, persistent lane. Source of truth that survives every restart.
- **Live message bus (chat-based, liberal).** Pub/sub bus backed by Paperclip's event system. Peer-to-peer, no per-message cap. Intentionally expansive — productive collaboration sometimes looks like a lot of chatter.

**Progress-based stall detection (not a turn budget):**

Hermes watches for forward motion signals:
- Artifacts in the vault changing (PRDs updated, story files closing, architecture revisions committed).
- Code being written or modified (file changes in the project directory).
- Stories transitioning state (open → in-progress → review → done).

If chatter is happening *without* progress for a configurable window (default: a few minutes of bus activity with no artifact/code/status change), Hermes intervenes — summarizing the disagreement, asking the user to arbitrate, or proposing a concrete next step. If progress is happening, the bus stays out of the way no matter how many messages fly.

The user is a first-class participant: read every channel, post anywhere, pause/redirect any persona at any time.

### A.6 Agent Generation & Configuration

Three creation modes:

- **From BMAD library** — pick a built-in persona; workspace assigns default CLI/model, applies chosen lifecycle, spawns.
- **Manual via BMB** — define a new persona (name, role, backing CLI, model, tools, personality); optionally save as a reusable module.
- **Automatic** — Hermes detects a recurring need and proposes a new persistent agent, or promotes a frequently-spawned ephemeral one into a persistent persona.

For each spawned agent, the workspace writes the appropriate config file (`claude.md`, `agy.md`, `agent.md`) into the project root and keeps it synced with the canonical persona file in the vault.

### A.7 Memory Layer

- **Per-persona local memory** — each persistent persona has its own scoped notes/skills directory in the vault.
- **Project memory (Obsidian vault)** — shared across personas within a project: BMAD artifacts, decisions, project context.
- **Cross-project memory (Supermemory)** — embeddings and semantic recall across all projects, opt-in per content.
- **Hermes native memory** — FTS5 session search + agent-curated memory sits underneath as the runtime memory layer.

The workspace defines sync policy and conflict resolution across these tiers; local-only toggles for privacy-sensitive content.

### A.8 Skills & Personality

Hermes (autonomous skill creation) and BMAD (structured personas) both treat skills/personas as plain markdown. The workspace surfaces all of them in the Obsidian vault for read, edit, version-control, GitHub mirroring, and cross-machine sharing.

### A.9 Terminal / CLI Interop

CLI is a first-class surface:
- Full Hermes TUI embedded.
- Embedded Zellij multiplexer owns all persistent persona-agent sessions, attachable from the desktop UI — every persistent agent has a real terminal pane you can watch and type into.
- `hermes`, `paperclipai`, `bmad-method`, `agy`, and `claude` CLIs all on the system path.
- Output structured (JSON streams where supported).
- All workspace actions remain scriptable headlessly.

---

## B. Technical Stack (from source §5)

- **Desktop shell:** Tauri preferred; Electron as fallback. *[M0 decision per build plan]*
- **Bundled runtime:** Node.js 20+ and pnpm 9.15+ (Paperclip + BMAD), Python (Hermes), Go binaries (`agy`, Zellij).
- **Bundled services:** Embedded Postgres for Paperclip; Hermes local stores in `~/.hermes`; BMAD via `npx bmad-method install`; Antigravity CLI from official installer; Claude Code via standard channel.
- **Process orchestration:** Embedded Zellij as the persistent-session multiplexer. Each fixed and persistent-dynamic persona gets its own Zellij pane; the desktop UI attaches/detaches without killing underlying processes.
- **Message bus:** Pub/sub over Paperclip's existing event system, extended with progress-signal subscribers for stall detection; WebSocket relay to the desktop UI.
- **Local memory:** Obsidian (managed vault).
- **Server memory:** Supermemory API.
- **VCS:** GitHub for syncing configs, BMAD artifacts, skills, personalities.

---

## C. Primary User Workflows (from source §6)

**C.1 First-run.** User installs `.exe`; installer provisions Paperclip + Hermes + BMAD + Zellij + Postgres + Antigravity CLI + Claude Code + the Obsidian vault; first-run wizard collects model API keys, Google OAuth for Antigravity, Anthropic auth for Claude Code, and optional Supermemory/GitHub.

**C.2 Starting a BMAD project.** User picks "Start a BMAD project," chooses `greenfield-fullstack`, and the workspace immediately spawns the two fixed personas (Dev and Frontend Designer) in their Zellij panes. Hermes wears the Analyst hat (or spawns a dedicated Analyst dynamic agent if the user prefers) to lead the brief; once the brief is approved, Hermes proposes spawning PM, then Architect, then SM — each dynamic, each with the user picking persistent or ephemeral. Once story files exist, Dev and Frontend Designer pick them up in parallel; QA spawns when stories enter review state. The bus carries cross-persona chatter throughout, and Hermes only intervenes when the progress signal flatlines.

**C.3 Free-form project.** User states a goal to Hermes without invoking a BMAD workflow; the two fixed personas spawn anyway (always-on backbone); Hermes scaffolds the project, dispatches work to Dev and Frontend Designer directly, and spawns additional personas dynamically as the work demands.

**C.4 Dynamic spawn — Hermes-initiated.** Mid-project, Hermes posts to the bus: "This change touches auth — I'd like to spawn a Security Reviewer (ephemeral) for this story. Approve?" User clicks approve; the ephemeral agent runs, posts its review, and disappears.

**C.5 Dynamic spawn — user-initiated.** User opens the BMB "Add Agent" panel, picks "Architect" from the BMAD library, chooses Claude Code as backing CLI, chooses persistent lifecycle. The Architect agent spawns into its own Zellij pane and joins the bus.

**C.6 Custom persona via BMB.** User wants a "Customer Support Triage" agent that does not exist in BMAD. From the BMB panel they define it (persona file, role, model, tools), spawn it, and optionally save it as a reusable BMAD module.

**C.7 Team / multi-machine.** Configs, artifacts, skills, personas committed to GitHub; another machine installs the workspace, pulls the repo, and resumes work — same fixed personas spawn, same dynamic personas can be respawned on demand.

---

## D. Phased Build Plan Summary (from build plan)

| Milestone | Goal | Duration | Headline deliverable |
|---|---|---|---|
| **M0 — Pre-Work** | Lock decisions and license audit | 1–2 weeks | Decision log, pinned version manifest, LICENSES.md, CI baseline |
| **M1 — Walking Skeleton** | Bundle installable; one real persistent CLI agent in a managed terminal | 6–8 weeks | Windows `.exe` installer; Dev/Claude Code in a Zellij pane after wizard |
| **M2 — Second Agent + Bus** | Two agents simultaneously communicating via real pub/sub bus + progress-detection heuristic | 4–6 weeks | Dev + Frontend Designer in panes; bus visible in UI; stall detection working |
| **M3 — Dynamic Spawning + BMB Minimal** | Any persona spawnable on demand, persistent or ephemeral, by Hermes or user | 6–8 weeks | "Add Agent" panel; 5+ persona types working; ephemeral cleanup; custom personas |
| **M4 — Full BMAD Workflow** | One-click `greenfield-fullstack` end-to-end | 4–6 weeks | Greenfield run produces working skeleton + all BMAD artifacts in one session |
| **M5 — Memory, Collab, Polish** | Cross-machine continuity; Supermemory; Win/Mac/Linux installers; hardening | 4–6 weeks | Three installers; round-trip test; public-beta-ready build |

**Total estimate:** ~24–32 weeks (≈6–7 months) for a usable v1, assuming 2–3 engineers. Solo work roughly doubles.

### M0 — Pre-Work Decisions

The decisions to lock before any code is written:

- Desktop shell: Tauri vs. Electron (one-day Tauri spike to decide).
- Upstream version pinning: Paperclip, Hermes, BMAD, Antigravity CLI, Zellij — each pinned with rationale and update cadence.
- Repository structure: monorepo (pnpm workspaces) vs. multi-repo. Monorepo recommended unless team already split across repos.
- License audit: verify bundling, redistribution, attribution, commercial-use terms for every bundled component. Output: LICENSES.md.
- Brand/attribution policy: "powered by Paperclip / Hermes / BMAD / Antigravity" copy, placement, and contribution-back rules.

**M0 deliverables:** decision log, pinned version manifest, LICENSES.md, repo initialized with chosen structure, CI baseline.

### Cross-Cutting Concerns

- **Testing strategy** — each milestone needs scenario tests proving the milestone-level proof goal; round-trip cross-machine scenario is the M5 headline test.
- **Documentation** — user-facing docs lag features by one milestone (M2 docs in M3, etc.); install-flow docs needed at M1.
- **Security review** — formal review between M3 and M4. Focus: agent sandboxing, OAuth token storage, message bus authorization, vault permissions, Supermemory data handling.
- **Cost monitoring** — token-cost telemetry wired by M2; per-persona quotas in M5; telemetry needs to exist earlier than the gates.
- **Upstream sync rhythm** — reserve ~10% of each milestone's capacity for rebasing on upstream updates.
- **Contribution-back policy** — general-purpose adapters/plugins/personas/BMAD modules offered upstream; reduces long-term maintenance burden.

---

## E. Risks & Open Questions (from source §9)

Plan-level risks ranked by potential schedule impact (build plan):

1. **Upstream churn across four moving projects** (Paperclip, Hermes, BMAD, Antigravity). Mitigation: tight version pinning, scheduled upstream-sync time, contribution-back.
2. **Installer bundling complexity** — five+ runtime dependencies × three target platforms is the largest source of engineering tax. Mitigation: invest early (M1), do not defer to M5.
3. **Process orchestration edge cases** — Zellij + multiple PTYs + dynamic spawn/exit + restart recovery is hard. Mitigation: dedicated stress testing in M3 exit criteria.
4. **Cost runaway with persistent multi-agent workflows** — bus is liberal by design. Mitigation: telemetry from M2, soft quotas before M5 hard quotas.

Brief-level risks (source §9):

- **Gemini CLI deprecation** (June 18, 2026 for individual Pro/Ultra). Workspace standardizes on Antigravity CLI (`agy`) from day one.
- **Antigravity CLI in public preview** with RCE issue reported May 2026 — verify state at start of M2.
- **Progress-detection heuristic tuning** — too sensitive interrupts productive deep dives, too lax lets agents loop unnoticed. Default window and signals configurable; budget for one tuning iteration.
- **Cost control** — persistent agents idling should not burn tokens; per-persona budget gates plus project-level kill switch.
- **Licensing & redistribution** — Paperclip MIT; Hermes, BMAD, Antigravity, Claude Code, Zellij each have their own terms. License review per component.
- **Memory-tier conflicts** — four sources of truth (Hermes native, per-persona vault dirs, project vault, Supermemory). Explicit precedence spec required.
- **Trust & permissions** — multiple persistent agents with shell access + network reach is a real attack surface. Sandboxing leans on each CLI's own permission model where possible.

---

## F. Follow-up Artifacts the Source Materials Defer

The build plan lists these as natural follow-up artifacts, each small enough to live alongside the brief:

- **First-run wizard mini-spec** — referenced in M1, not detailed. Worth a one-pager after M0 decisions land.
- **Progress-signal taxonomy** — referenced in M2 and M4, not catalogued. Worth its own design doc inside M2.
- **Bus protocol schema** — referenced in M2, not specified. Should be one of the first M2 deliverables before any code.
- **Vault directory layout** — referenced in M1 and M4, not laid out. Should be drafted in M1 since it shapes everything downstream.
- **Marketing / positioning / website work** — out of scope for the build plan; track separately.

---

*End of addendum.*
