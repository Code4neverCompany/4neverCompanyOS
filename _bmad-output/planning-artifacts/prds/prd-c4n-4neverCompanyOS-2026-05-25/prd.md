---
title: 4neverCompany OS — PRD
status: final
created: 2026-05-25
updated: 2026-05-25
project: c4n-4neverCompanyOS
source_brief: docs/4neverCompany_OS_Brief.md (v0.6, authoritative on strategic content)
analyst_workspace: _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/ (status: approved-tier1)
build_plan: docs/4neverCompany_OS_Build_Plan.md (v0.1, source of truth for M0–M5 phasing)
author_role: PM (John)
working_mode: Fast path
rubric_review: review-rubric.md (run 2026-05-25, all findings applied)
---

# PRD: 4neverCompany OS

## 0. Document Purpose

This PRD translates the approved Analyst brief and source brief v0.6 into stable, globally numbered functional requirements (FR-1..FR-N) that downstream UX, Architecture, and Epics/Stories artifacts will reference. Strategic decisions (two fixed personas, dynamic-lifecycle model, BMAD as default methodology, liberal bus with progress-based stall detection, Tauri-preferred stack) are **locked** per the HANDOFF and are not re-litigated here. Tier 2–4 open questions from the brief remain deferred and surface again under § 8 Open Questions where they affect FR specificity.

This PRD is structured as: Vision → Target User (with JTBD + non-users + user journeys) → Glossary (single-source vocabulary downstream artifacts must use verbatim) → Features (eleven groups, FRs nested) → Non-Goals → MVP Scope → Success Metrics → Open Questions → Assumptions Index → cross-cutting NFRs → Constraints & Guardrails → Integration & Dependencies → Why Now → Platform → Release Plan (FRs mapped to M0–M5).

## 1. Vision

4neverCompany OS is a packaged Windows desktop binary — cross-platform later — that bundles Paperclip (agent-team control plane), Hermes Agent (orchestrator), BMAD Method (methodology), embedded Zellij (terminal multiplexer), and Obsidian (local vault) into a single one-click install. Two fixed persona agents — **Dev** on Claude Code and **Frontend Designer** on Antigravity CLI — spawn the moment a project opens and persist across restarts. Every other persona is **dynamic**: spawned on demand by Hermes (with user approval) or by the user (via a featured BMad Builder panel), and each dynamic agent chooses **persistent** (joins the team) or **ephemeral** (one-shot) at spawn time. Agents talk freely on a liberal pub/sub bus; Hermes intervenes only when chatter happens without forward motion on artifacts, code, or stories.

The product is the **integration layer** — installer, first-run wizard, dynamic-spawn UI, message bus, persona-file projection, lifecycle management, vault layout, GitHub sync, Supermemory integration. It is _not_ a new orchestrator, _not_ a new methodology, _not_ a fork of any upstream.

## 2. Target User

### 2.1 Primary Persona

**The solo developer who is also an AI-tooling power user.** They ship side projects on their own, own the whole stack themselves, and already run terminal-native agent CLIs (Claude Code, Antigravity CLI, MiniMax, or similar) as part of their daily flow. They've felt the friction of stitching Paperclip + Hermes + BMAD + Zellij + Obsidian together by hand — installation, configuration, persona-to-agent wiring, memory integration across four moving upstreams — and want a single locally-installable binary that gives them persistent state, vault memory, and a real orchestrator on top of the agent CLIs they already trust. They care strongly about install speed (the M1 ≤10-minute install-to-working-Dev-agent target is concrete to them), about a no-friction `greenfield-fullstack` flow as the day-one win, and about config-as-code so personas, skills, and BMAD artifacts travel with them as version-controlled markdown.

### 2.2 Jobs To Be Done

- **Get to a working AI-agent workspace fast.** Don't ask me to install and wire five upstream projects myself; ship me an opinionated bundle that just works.
- **Start a real project from a vague idea.** "Start a BMAD project" should give me, in one work session, a working code skeleton plus the BMAD artifact set (brief, PRD, architecture, story files, QA reports).
- **Add and dismiss agents at the speed I think.** When I want a Security Reviewer for one PR, that's one click; when I want a permanent Architect, that's one click and a lifecycle choice.
- **Keep my personas, skills, and configs portable.** Treat them as version-controlled markdown so I can move machines, share, and roll back.
- **Don't burn tokens while I'm not looking.** Idling persistent agents should be cheap.
- **Don't interrupt productive deep dives.** When my agents are chatting and shipping, leave them alone. When they're chatting and stalling, intervene.

### 2.3 Non-Users (v1)

- **Teams of 4+ engineers needing real-time multi-user collaboration.** v1 ships single-user with GitHub sync as the only multi-machine story. [NON-GOAL for v1]
- **Mobile-first or browser-first users.** Desktop binary only.
- **Users who want a SaaS / hosted offering.** Out of scope; local-first by design.
- **Marketplace / community-module browsers.** Personas and BMAD modules are version-controlled-markdown-first; a community marketplace is post-v1.
- **Small-team technical leads and methodology-curious practitioners.** Not precluded — the product works for them — but they are **not** the primary persona the v1 PRD optimizes for. Revisit in v2. [Per Tier 1 decision in approved brief]

### 2.4 Key User Journeys

UJs are written in the source brief §6 (Primary User Workflows). Captured here in UJ-N form. Source verbatim where the source narrative exists; structured for FR cross-reference.

- **UJ-1. First-run from install to working Dev agent.**
  - **Persona + context:** Solo developer downloads `.exe`, runs installer on a fresh Windows 10/11 machine.
  - **Entry state:** No prior install, no agent CLIs configured.
  - **Path:** (1) Run installer → bundled components provisioned. (2) First-run wizard collects model API keys (Anthropic minimum), Google OAuth for Antigravity, Anthropic auth for Claude Code, optional Supermemory + GitHub. (3) Wizard lets user set the Obsidian vault location. (4) User creates a project; Dev persona (Claude Code) spawns into a Zellij pane.
  - **Climax:** A `claude.md` baseline is written to the project root and a real, attachable terminal pane shows the Dev agent running.
  - **Resolution:** User can type into the Dev pane and get work back. Total elapsed time: under 10 minutes per M1 exit criterion.
  - **Edge case:** OAuth flow fails for Claude Code or Antigravity — wizard surfaces a clean error and lets the user retry without restarting.
  - **Realizes:** FR-1, FR-2, FR-3, FR-4, FR-22.

- **UJ-2. Starting a BMAD `greenfield-fullstack` project.**
  - **Persona + context:** Solo dev, post-install, has a new project idea.
  - **Entry state:** Workspace open, no project yet.
  - **Path:** (1) Click "Start a BMAD project," pick `greenfield-fullstack`. (2) Both fixed personas (Dev + Frontend Designer) spawn into their Zellij panes immediately. (3) Hermes wears the Analyst hat (or proposes spawning an Analyst dynamic persona) to lead the brief. (4) After brief approval, Hermes proposes PM → Architect → SM as each phase warrants, with user picking persistent vs. ephemeral lifecycle for each. (5) Once stories exist, Dev and Frontend Designer pick them up in parallel; QA spawns at story-review state.
  - **Climax:** End of session: working code skeleton plus complete BMAD artifact set (brief, PRD, architecture, story files, QA reports) on disk.
  - **Resolution:** All artifacts live in vault, version-controlled. User can resume next day with same personas spawning back into the same panes.
  - **Realizes:** FR-4, FR-5 (fixed personas spawn at workflow start); FR-7, FR-8, FR-9 (dynamic personas spawn at each workflow phase via BMB panel or Hermes proposal); FR-12, FR-13 (Hermes proposes Analyst/PM/Architect/SM/QA at the right phases with user approval); FR-15 (cross-persona chatter on the bus); FR-22 (each persistent persona in its own Zellij pane); FR-25, FR-26, FR-27 (workflow execution); FR-30 (BMAD artifacts land in vault).

- **UJ-3. Free-form (non-BMAD) project.**
  - **Persona + context:** Solo dev wants to ship something quick; doesn't want to run a full BMAD workflow.
  - **Entry state:** Workspace open.
  - **Path:** (1) User states a goal to Hermes. (2) Fixed personas (Dev + Frontend Designer) spawn anyway — always-on backbone. (3) Hermes scaffolds the project, dispatches work directly to Dev and Frontend Designer, spawns additional personas dynamically as the work demands.
  - **Climax:** Code lands without the user invoking a BMAD workflow.
  - **Resolution:** Same workspace, same vault layout; user can opt back into a BMAD workflow at any point.
  - **Realizes:** FR-4, FR-5 (fixed personas always-on backbone); FR-12, FR-13 (Hermes proposes additional personas as the work demands, with user approval); FR-22, FR-23 (Zellij panes for each persistent persona, attach/detach without killing).

- **UJ-4. Hermes proposes a Security Reviewer (ephemeral).**
  - **Persona + context:** Solo dev is working a story that touches auth.
  - **Entry state:** Project active, multiple personas running.
  - **Path:** (1) Hermes detects the change touches auth and posts to the bus: "I'd like to spawn a Security Reviewer (ephemeral) for this story. Approve?" (2) User clicks approve. (3) Ephemeral Security Reviewer spawns, runs its review against the story, posts a review artifact to the vault, and exits.
  - **Climax:** A review artifact appears in the vault and Hermes summarizes it on the bus.
  - **Resolution:** Ephemeral persona cleaned up — no orphan process, no lingering vault dir.
  - **Realizes:** FR-12, FR-13, FR-10 (ephemeral lifecycle cleanup).

- **UJ-5. User opens "Add Agent" panel for an Architect (persistent).**
  - **Persona + context:** Solo dev wants an Architect to stay on the team for the rest of the project.
  - **Entry state:** Project active.
  - **Path:** (1) User opens BMad Builder "Add Agent" panel. (2) Picks "Architect" from the BMAD persona library. (3) Picks Claude Code as backing CLI. (4) Picks **persistent** lifecycle. (5) Architect spawns into a new Zellij pane and joins the bus.
  - **Climax:** A new attached pane is visible; Architect posts its first message to the bus.
  - **Resolution:** Architect persists for the rest of the project unless dismissed.
  - **Realizes:** FR-7, FR-8, FR-9.

- **UJ-6. User defines a custom persona via BMB.**
  - **Persona + context:** Solo dev needs a "Customer Support Triage" persona that doesn't exist in BMAD.
  - **Entry state:** BMad Builder panel open.
  - **Path:** (1) User defines the persona (name, role, backing CLI, model, tools, personality). (2) Spawns it. (3) Optionally saves it as a reusable BMAD module that other projects can install via `bmad-method install --source ...`.
  - **Climax:** The custom persona runs and is available across the user's other projects.
  - **Resolution:** The custom persona file lives in the vault as markdown; portable.
  - **Realizes:** FR-11.

- **UJ-7. Multi-machine continuity via GitHub.**
  - **Persona + context:** Solo dev has two machines (desktop, laptop) and wants to pick up the project on the other one.
  - **Entry state:** Project active on machine A.
  - **Path:** (1) User commits configs, BMAD artifacts, skills, personas to GitHub from machine A. (2) On machine B, installs the workspace. (3) Pulls the repo. (4) Opens the project. Fixed personas spawn; persistent dynamic personas can be respawned on demand.
  - **Climax:** Project resumes on machine B with full continuity.
  - **Resolution:** User can flip between machines without losing state.
  - **Realizes:** FR-33, FR-34. [Per M5.]

## 3. Glossary

Downstream workflows and readers must use these terms exactly. FRs, UJs, and SMs use Glossary terms verbatim; introducing a synonym anywhere in the PRD is a discipline violation.

- **Persona** — A defined role bound to a backing CLI and model (e.g., "Dev" bound to Claude Code with Claude Opus 4.6 Thinking). Stored as a markdown file in the Obsidian vault.
- **Fixed Persona** — One of the two personas that spawn on every project open and persist for the project's life: **Dev** (Claude Code) and **Frontend Designer** (Antigravity CLI). Never spawned dynamically.
- **Dynamic Persona** — Any persona other than the two fixed personas. Spawned on demand by Hermes or by the user.
- **Lifecycle** — Each dynamic persona chooses one of two at spawn time:
  - **Persistent** — Agent joins the team, owns its own Zellij pane and vault directory, has a bus identity, survives until the project closes or the user dismisses it.
  - **Ephemeral** — Agent runs one task, returns its output as an artifact, and exits. No terminal allocation, no bus identity beyond the task.
- **Hermes** — The conductor / orchestrator agent. Watches the bus, interprets user intent, spawns/supervises/tears down persona processes, curates cross-project memory.
- **Paperclip** — The control plane that defines what work exists (companies, projects, goals, roles, budgets). Provides the embedded event system the message bus runs on.
- **BMAD** — The bundled default methodology. Ships as preinstalled persona library, YAML workflows (e.g., `greenfield-fullstack`, `brownfield`), and artifact templates.
- **BMad Builder (BMB)** — The featured top-level UI surface for creating new personas and (post-v1) workflows and modules. The "Add Agent" panel is the v1 surface.
- **Message Bus** — The pub/sub channel agents talk on. Liberal — no per-message cap. Carries peer-to-peer agent messages and broadcasts.
- **Progress Signal** — A signal Hermes watches that indicates forward motion: an artifact in the vault changing, code being written/modified in the project directory, or a story transitioning state (open → in-progress → review → done).
- **Stall** — A configurable window (default: a few minutes) of bus activity without any progress signals firing. Triggers Hermes intervention.
- **Zellij Pane** — A terminal pane managed by the embedded Zellij multiplexer. Each fixed and persistent dynamic persona owns one.
- **Vault** — The Obsidian-managed local memory directory. Holds BMAD artifacts, persona files, per-persona memory, and project context.
- **Workflow** — A BMAD YAML orchestration recipe (e.g., `greenfield-fullstack`, `brownfield`) that defines a sequence of phases, each spawning the right personas and producing the right artifacts.
- **Tool Config** — The CLI-specific config file (`claude.md`, `agy.md`, generic `agent.md`) auto-generated from a persona file and kept bidirectionally synced.

## 4. Features

Each subsection is a coherent feature: behavioral description, FRs nested, optional feature-specific notes. FRs are globally numbered (FR-1..FR-N) and stable across feature reorganizations.

### 4.1 Installer & First-Run Wizard

**Description.** A single bundled installer provisions every component the workspace needs. The first-run wizard collects credentials and locations; on completion the user can immediately create a project. Realizes UJ-1.

#### FR-1: Single-installer provisioning

The installer can provision all bundled runtime components in one run on a clean Windows 10/11 machine: Node.js 20+, pnpm 9.15+, Python (for Hermes), embedded Postgres, Zellij binary, Antigravity CLI, Claude Code CLI, Paperclip + Hermes + BMAD packages, and the Obsidian vault scaffolding. [ASSUMPTION: macOS and Linux installers add the platform-specific equivalents in M5; binaries differ but the FR shape is the same.]

**Consequences (testable):**

- A clean install completes without manual intervention beyond the explicit wizard prompts (model API keys, OAuth flows for Claude Code and Antigravity, Obsidian vault location, optional Supermemory key, optional GitHub credentials) — no other system dialogs, terminal prompts, or installer choices.
- Total install-plus-wizard wall-clock time ≤ 10 minutes on a representative reference Windows 10/11 machine (per M1 exit criterion).
- Failed component installs surface a clean error and offer a retry of just that component.

#### FR-2: First-run wizard credential collection

The wizard sequentially collects: (a) model API keys (Anthropic required; others optional), (b) Anthropic OAuth for Claude Code, (c) Google OAuth for Antigravity CLI [added M2 when Frontend Designer ships], (d) optional Supermemory API key, (e) optional GitHub credentials for sync.

**Consequences (testable):**

- All credentials are stored using each CLI's own permission model (Anthropic via Claude Code, Google via Antigravity) — workspace does not invent its own credential store. [NOTE FOR PM: Architect must confirm credential storage exactly mirrors each upstream's pattern; brief §9 flags trust & permissions.]
- OAuth retry on failure does not lose prior step's state.
- Missing optional credentials do not block project creation; only the keys required for the personas the user will spawn block.

#### FR-3: Obsidian vault location selection

The wizard lets the user choose the on-disk location of the Obsidian vault. A default is offered.

**Consequences (testable):**

- Vault location is persisted; all subsequent workspace operations resolve `{vault}` to this location.
- A vault at the chosen location is scaffolded with the documented directory layout (see OQ-N).

### 4.2 Fixed Persona Spawning

**Description.** On project open, exactly two personas — Dev and Frontend Designer — spawn into their own Zellij panes and persist across desktop-app restarts. They are not selectable, removable, or duplicable in v1. Realizes UJ-1 climax, UJ-2 step 2, UJ-3 step 2.

#### FR-4: Dev persona spawn

When a project is opened, a Dev persona spawns: backing CLI is Claude Code, default model is Claude Opus 4.6 (Thinking), persona file `dev.md` is loaded from the BMAD library and projected to `claude.md` at the project root.

**Consequences (testable):**

- A Claude Code process is running and visible in a Zellij pane within **5 seconds** of project open. [ASSUMPTION: AS-2 — initial UX target; Architect may revise downward in M2 baselining.]
- `claude.md` exists at project root and reflects the Dev persona file.

#### FR-5: Frontend Designer persona spawn

When a project is opened, a Frontend Designer persona spawns: backing CLI is Antigravity CLI (`agy`), default model is Gemini 3.1 Pro (High), persona file `frontend-designer.md` is loaded from the BMAD library and projected to `agy.md` at the project root. [Lands at M2.]

**Consequences (testable):**

- An `agy` process is running and visible in a Zellij pane within **5 seconds** of project open. [ASSUMPTION: AS-2 — same UX target as FR-4.]
- `agy.md` exists at project root and reflects the Frontend Designer persona file.

#### FR-6: Fixed personas survive desktop-app restart

When the desktop app closes and reopens, both fixed personas re-attach to their existing Zellij sessions without spawning duplicates.

**Consequences (testable):**

- A "close app → reopen app" cycle does not leave orphan processes.
- Re-attached panes show **≥ the last 1000 lines** of scrollback (subject to the underlying Zellij session's scrollback limit).

### 4.3 Dynamic Persona Spawning via BMad Builder

**Description.** A featured top-level UI panel — "Add Agent" — exposes the BMAD persona library and the user's custom personas. The user picks a persona, a backing CLI/model, and a lifecycle. The agent spawns. [Lands at M3.] Realizes UJ-5, UJ-6.

#### FR-7: BMB "Add Agent" panel exposes the BMAD persona library

The panel shows all installed BMAD personas (Analyst, PM, Architect, SM, QA, UX, Security Reviewer, plus any installed via `bmad-method install --source ...`) plus the user's custom personas.

**Consequences (testable):**

- After `bmad-method install` adds a new module, that module's personas appear in the panel without app restart. [NOTE FOR PM: confirm hot-load vs. reload requirement with Architect.]

#### FR-8: Lifecycle selection at spawn time

For each dynamic persona spawn, the user picks **persistent** or **ephemeral** before the spawn completes.

**Consequences (testable):**

- Spawn UI does not allow proceeding without a lifecycle choice.
- The choice is recorded in the persona's runtime metadata and is visible in the channels / agents view.

#### FR-9: Persistent dynamic agents get terminal + vault directory

A persistent dynamic agent gets the same scaffolding as a fixed persona: a Zellij pane, a scoped vault directory, a bus identity, restart-survival.

**Consequences (testable):**

- After spawning a persistent Architect, app close + reopen reattaches the Architect pane.
- The Architect's vault directory exists and is gitignored / committed per the GitHub sync policy (FR-33).

#### FR-10: Ephemeral agents run one task and exit cleanly

An ephemeral persona runs to task completion, writes its output to the vault as an artifact, posts a final message to the bus, and exits. No process or vault residue.

**Consequences (testable):**

- After 100 spawn/exit cycles, zero orphan processes remain (per M3 exit criterion).
- Ephemeral agents do not appear in the persistent-agents UI after exit.

#### FR-11: Custom persona authoring and reuse

A user can define a custom persona (name, role, backing CLI, model, tools, personality) via the BMB panel, spawn it immediately, and optionally save it as a reusable BMAD module under their vault.

**Consequences (testable):**

- A saved custom persona can be installed and used in a different project via the standard `bmad-method install --source <path>` flow.
- Custom personas are markdown files — readable, git-diffable.

### 4.4 Hermes-Initiated Persona Spawning

**Description.** Hermes detects when the work needs a role and proposes spawning it. The user retains approval / override / veto. [Lands at M3, refined in M4 once workflows are running.] Realizes UJ-4.

#### FR-12: Hermes proposes persona spawns with rationale

When Hermes detects a need (e.g., "this change touches auth, recommend a Security Reviewer"), it posts a proposal to the bus and surfaces an approval prompt in the UI containing the proposed persona, suggested lifecycle, and a one-sentence rationale.

**Consequences (testable):**

- Proposal includes persona name, backing CLI, suggested lifecycle, and rationale text.
- User can approve, override (change CLI / lifecycle / persona), or veto.

#### FR-13: User approval is required before spawn

A Hermes proposal does not spawn until the user approves (or the user has set a per-project auto-approve policy for specific persona types). [NOTE FOR PM: auto-approve policy is M3-or-later; specify in M3 detail design.]

**Consequences (testable):**

- An unapproved proposal expires after a configurable **per-proposal** window (system-wide default: 24 hours) without spawning.

#### FR-14: Promotion path — ephemeral → persistent

When the same persona type has been spawned ephemerally 3+ times in a project, Hermes prompts the user to promote it to a persistent persona or save it as a reusable custom module.

**Consequences (testable):**

- After 3 ephemeral spawns of the same persona type, the promotion prompt appears.
- "Promote to persistent" spawns the persona with persistent lifecycle and reuses its accumulated context (vault dir from the most recent spawn).

### 4.5 Inter-Agent Message Bus & Progress-Based Stall Detection

**Description.** A pub/sub bus running on top of Paperclip's event system carries peer-to-peer agent messages with no per-message cap. The bus is visible in a per-project UI channel view. Hermes watches for forward-motion signals — artifact changes, code changes, story-state transitions — and intervenes only when chatter happens without progress. [Bus + initial detection at M2; story-state transitions added at M4.]

#### FR-15: Pub/sub bus carries peer-to-peer agent messages

Any agent can post to the bus; any agent (or the user) can subscribe.

**Consequences (testable):**

- Posting from agent A is visible to agent B within N ms. [ASSUMPTION: N ≤ 500ms — Architect to confirm.]
- No per-message rate limit; no enforced turn cap.

#### FR-16: Bus state survives Paperclip restart

Bus messages persist; restarting Paperclip does not lose the last N messages in any channel.

**Consequences (testable):**

- After Paperclip restart, the last 1000 messages per channel are still queryable. [ASSUMPTION: 1000 is the retention default — Architect / source review to confirm.]

#### FR-17: UI channel view per project

The desktop UI shows the bus channel for the current project in real time. User can read, filter, and post messages.

**Consequences (testable):**

- New messages from agents render in the UI within **200 ms** of bus delivery. [ASSUMPTION: AS-6 — initial UX target for "feels live"; Architect may revise.]
- User posts are tagged as user-origin and are visible to all subscribed agents.

#### FR-18: Progress-based stall detection

Hermes watches for these progress signals: artifact changes in the vault, file changes in the project directory, story-state transitions [story-state signal added at M4]. When the configurable stall window passes with bus activity and no progress signals, Hermes intervenes.

**Consequences (testable):**

- Default stall window is configurable (initial default: a few minutes per source brief). [ASSUMPTION: specific default value (e.g., 5 minutes) is a tunable; M2 stress-tests find the right initial default.]
- Hermes intervention takes one of: summarize disagreement, prompt user to arbitrate, propose a concrete next step.
- Productive multi-message exchanges (chatter with concurrent progress signals firing) do NOT trigger intervention.
- Stall detection validated against a corpus of ≥10 manual test scenarios per M2 exit criterion.

#### FR-19: User can pause / redirect any persona at any time

User is a first-class bus participant. They can pause any agent, post a redirect, or dismiss a persona.

**Consequences (testable):**

- "Pause persona" stops that agent's outbound bus posts and CLI work within **2 seconds**. [ASSUMPTION: AS-7 — initial UX target so the user knows they got control back; Architect may revise.]
- "Redirect" posts a user message to the bus and the persona resumes from there.

### 4.6 Persona-File-to-Tool-Config Sync

**Description.** Persona files (canonical, in the Obsidian vault) are projected into CLI-specific tool configs (`claude.md`, `agy.md`, generic `agent.md`) at the project root. Edits flow both directions. [Lands progressively across M1 (claude.md), M2 (agy.md), M3 (full BMB-driven generation).]

#### FR-20: Persona file → tool config projection

When a persona is bound to a backing CLI, the workspace projects the persona file into the CLI-specific config and keeps the projection synced.

**Consequences (testable):**

- Each spawned persona has a corresponding tool config at the expected location.
- A change to the persona file in the vault propagates to the tool config within **30 seconds**. [ASSUMPTION: AS-8 — file-watch loop target, not real-time; Architect may revise.]

#### FR-21: Tool config → persona file backflow

If a user edits a tool config directly (e.g., they edit `claude.md` in their editor), the edits flow back into the canonical persona file in the vault.

**Consequences (testable):**

- Edits to a tool config are reflected in the vault persona file within **30 seconds**. [ASSUMPTION: AS-8 — same file-watch loop target as FR-20.]
- Conflict resolution rules are documented and applied. [NOTE FOR PM: conflict rules are an open question — see § 8 OQ-A.]

### 4.7 Embedded Multi-Terminal View (Zellij-Powered)

**Description.** Every persistent persona (fixed and dynamic) runs in a Zellij pane. The desktop UI attaches/detaches from panes without killing underlying processes. The full Hermes TUI is embedded. [Lands progressively across M1 (one pane) → M2 (two panes) → M3 (N panes).]

#### FR-22: One Zellij pane per persistent persona

Each persistent persona owns exactly one Zellij pane. The pane is the agent's interactive surface.

**Consequences (testable):**

- N persistent personas → N panes visible in the UI.
- A pane is attachable from the UI and disconnectable without killing the agent process.

#### FR-23: Attach/detach without killing processes

Closing the desktop app does not kill the agent processes inside Zellij; reopening reattaches.

**Consequences (testable):**

- Force-quit of the desktop app leaves the Zellij sessions running.
- Reopen reattaches to the existing Zellij session and the agents resume.

#### FR-24: Hermes TUI embedded

The full Hermes TUI is available inside the workspace as one of the panes (or a dedicated UI surface).

**Consequences (testable):**

- All Hermes TUI commands work from inside the workspace identically to running `hermes` standalone.

### 4.8 BMAD Workflow Execution

**Description.** A "Start a BMAD project" entry point in the UI runs BMAD YAML workflows end-to-end with user-approval gates at each phase handoff. `greenfield-fullstack` is the headline; `brownfield` is the second supported workflow. [Lands at M4.] Realizes UJ-2.

#### FR-25: "Start a BMAD project" entry point

The main UI exposes a "Start a BMAD project" action. User picks a workflow; the workspace begins executing it.

**Consequences (testable):**

- At least two workflows are available: `greenfield-fullstack` and `brownfield`.
- Starting a workflow records the workflow run in Paperclip and the vault.

#### FR-26: Workflow phases spawn personas at the right moments

The workflow engine reads BMAD YAML and spawns dynamic personas at each phase (Analyst → PM → Architect → SM → Dev/QA), with user approval gates between handoffs.

**Consequences (testable):**

- Approval gates surface in the UI; the default action is "approve and continue" with one keystroke.
- Spawned personas appear in panes and on the bus.

#### FR-27: Workflow can pause, app close, reopen, resume

A Workflow in progress can be paused, the app closed, and the Workflow resumed cleanly from where it left off.

**Consequences (testable):**

- A "pause Workflow" action is available at any phase boundary.
- After app reopen, the Workflow shows its current phase and "resume" continues from there.

#### FR-28: `brownfield` workflow supported

`brownfield` runs on an existing repo and produces a refactor plan.

**Consequences (testable):**

- A `brownfield` run on at least one real test repo (per M4 exit criterion) produces a plan artifact.

### 4.9 Memory Tiers

**Description.** Four memory tiers with documented precedence: per-persona vault dirs, project-wide Obsidian vault, opt-in Supermemory cross-project, and Hermes native FTS5 session memory. [Memory tiering lands at M5; per-persona scoping starts at M1 in primitive form.]

#### FR-29: Per-persona scoped vault directory

Each persistent persona owns a scoped subdirectory inside the project's vault for notes and skills.

**Consequences (testable):**

- The Dev persona writes to `vault/personas/dev/` (or equivalent); the Frontend Designer writes to its own dir.
- Writes outside the scoped dir or the shared project area are **detected and logged**; enforcement is best-effort per each backing CLI's permission model (not a hard sandbox). [NOTE FOR PM: hard-enforcement is a future story; Architect to characterize what each CLI's permission model actually prevents.]
- Per-persona vault directory layout follows OQ-N spec.

#### FR-30: Project-wide vault

The shared Obsidian vault is the source of truth for BMAD artifacts, decisions, and project context. All personas in the project can read; writes follow the persona's scope.

**Consequences (testable):**

- BMAD artifacts (brief, PRD, architecture, story files, QA reports) live at documented paths in the vault.
- The vault layout is documented in the spec produced for OQ-N.

#### FR-31: Supermemory integration — opt-in per content category

Supermemory is available as a cross-project semantic memory layer. The user opts in per content category (e.g., "share decisions across projects" yes; "share secrets" no).

**Consequences (testable):**

- A per-category toggle exists in the settings UI.
- Local-only categories never reach Supermemory.

#### FR-32: Memory tier precedence

A documented precedence spec defines what wins when the same fact appears in multiple tiers (Hermes native vs. per-persona vault dir vs. project vault vs. Supermemory).

**Consequences (testable):**

- The precedence spec is documented and shipped with the workspace.
- Conflict resolution behaves per spec on a test corpus. [NOTE FOR PM: specific precedence is an open question — see § 8 OQ-B.]

### 4.10 GitHub Sync

**Description.** Configs, BMAD artifacts, skills, and personalities sync to GitHub. Used for backup and multi-machine continuity. [Lands at M5.] Realizes UJ-7.

#### FR-33: Sync configs and artifacts to GitHub

The workspace can push its project files (configs, BMAD artifacts, skills, persona files) to a GitHub repository.

**Consequences (testable):**

- A "sync to GitHub" action commits and pushes the documented set of files.
- The documented set of synced-vs-local files is in a single policy doc shipped with the workspace.

#### FR-34: Cross-machine continuity

On a second machine, after the workspace is installed and the user pulls the repo, opening the project spawns the same fixed personas and offers to respawn the same persistent dynamic personas.

**Consequences (testable):**

- Round-trip test: project on Windows → push → pull on macOS → open: fixed personas spawn, persistent dynamic personas are listed and can be respawned. (Per M5 exit criterion, extended to Linux as well.)

### 4.11 Cross-Platform Distribution

**Description.** Windows is M1; macOS and Linux land at M5.

#### FR-35: Windows installer (`.exe`)

Generated by Tauri (per OQ-C resolution; Electron fallback if the M0 Tauri/WebView2 spike surfaces blocking pain hosting Paperclip's React UI).

**Consequences (testable):**

- A clean install on Windows 10 and Windows 11 succeeds.
- Installer size and bundle composition documented.

#### FR-36: macOS installer (`.dmg`)

[Lands at M5.]

**Consequences (testable):**

- A clean install on at least one current macOS version succeeds.

#### FR-37: Linux installer

AppImage and/or distro packages. [Lands at M5.]

**Consequences (testable):**

- A clean install on at least one current Linux distribution succeeds.

## 5. Non-Goals (Explicit)

Per source brief §8 and the Tier 1 persona decision:

- 4neverCompany OS is **not** a new orchestrator. Hermes is the orchestrator; we do not write our own.
- 4neverCompany OS is **not** a new methodology. BMAD is the bundled default; we do not author a competitor.
- 4neverCompany OS is **not** a fork of any upstream. We integrate Paperclip, Hermes, BMAD, Antigravity, Claude Code, Zellij, Obsidian; we do not maintain forks.
- 4neverCompany OS is **not** a SaaS or hosted service. Single-user desktop product. No cloud-only path.
- 4neverCompany OS is **not** multi-user. v1 ships single-user; GitHub sync is the only multi-machine collaboration story. Real-time presence / multi-user editing is post-v1.
- 4neverCompany OS is **not** a marketplace for community personas / skills / BMAD modules in v1. Modules ship as GitHub-installable; a discoverable marketplace is post-v1.
- 4neverCompany OS is **not** mobile or browser. Desktop binary only.
- 4neverCompany OS does **not** add user-facing activation, retention, or value/time-saved metrics to its v1 success bar. The bar is the build-plan engineering exit criteria. (Per Tier 1 decision.)
- 4neverCompany OS is **not** optimized for the small-team-lead or methodology-curious-practitioner persona in v1. Those personas are deferred to v2. (Per Tier 1 decision.)

## 6. MVP Scope

### 6.1 In Scope (mapped to milestones)

- **M1:** Windows `.exe` installer + first-run wizard (Anthropic + vault + Claude Code OAuth); Paperclip + Hermes + BMAD + embedded Zellij + embedded Postgres provisioned; Dev fixed persona spawning into a Zellij pane; `claude.md` projection; documented vault directory layout.
- **M2:** Frontend Designer fixed persona + Antigravity OAuth in wizard; `agy.md` projection; pub/sub message bus with WebSocket relay to the UI; UI channel view; initial progress-based stall detection (artifact + file-change signals); token-cost telemetry baseline.
- **M3:** Featured BMad Builder "Add Agent" panel; full BMAD persona library accessible; persistent and ephemeral lifecycles working end-to-end; Hermes-initiated spawn proposals with user approval; ephemeral-cleanup hardening (no orphan processes after 100 cycles); custom persona authoring; promotion path.
- **M4:** Workflow execution engine; `greenfield-fullstack` end-to-end with user-approval gates; vault artifact layout standardized; story-file state machine; `brownfield` as second workflow; story-state transitions added to stall-detection progress signals.
- **M5:** Supermemory integration (opt-in per category); GitHub sync for configs/artifacts/skills/personas; multi-machine round-trip continuity; per-persona budget gates + project-level kill switch; macOS installer; Linux installer; installer hardening (error recovery, partial-install resume, in-place upgrades); basic documentation site.

### 6.2 Out of Scope for MVP

- **Real-time multi-user collaboration with presence.** Post-v1.
- **Marketplace for community-published personas / skills / BMAD modules.** Post-v1. GitHub-installable modules cover power-user reuse in v1.
- **Hosted SaaS tier.** Post-v1.
- **Mobile clients.** Post-v1.
- **Workflow forking / branching mid-run.** Post-M4; not in v1 if M5 timeline pressures.
- **Custom workflow authoring via BMB.** M5-plus or post-v1 (BMB v1 ships persona creation only).
- **Anything beyond the build-plan exit criteria as a success bar.** No user-facing adoption metrics in v1.

## 7. Success Metrics

Per Tier 1 decision: **v1 success is defined exclusively by the build-plan engineering exit criteria.** No user-facing activation, retention, or value/time-saved metrics. PM is explicitly instructed not to invent additional metrics on top.

**Primary**

- **SM-1 (M1):** Fresh install on a clean Windows 10/11 machine through wizard completion through project creation through working Dev/Claude Code agent in a Zellij pane completes in **under 10 minutes**. Validates FR-1, FR-2, FR-3, FR-4, FR-22, FR-35.
- **SM-2 (M1):** Dev persona persists across desktop-app restart; vault structure is documented and stable. Validates FR-6.
- **SM-3 (M2):** Dev + Frontend Designer coordinate on a small task end-to-end without crashing; bus messages survive Paperclip restart; idling pair stays within the NFR-Performance ceiling (≤ 300 MB / ≤ 500 input tokens per hour per idle agent). Validates FR-5, FR-15, FR-16, NFR-Performance.
- **SM-4 (M2):** Progress-based stall detection validated against ≥10 manual test scenarios (mix of "should intervene" / "should not intervene"). Validates FR-18.
- **SM-5 (M3):** ≥5 distinct persona types spawn successfully (Analyst, PM, Architect, SM, QA minimum); ephemeral cleanup leaves zero orphan processes after 100 spawn/exit cycles; persistent dynamic agents survive restart same as fixed ones; custom personas creatable and reusable across projects. Validates FR-7..FR-11, FR-14.
- **SM-6 (M4):** Clean `greenfield-fullstack` run produces working code skeleton + complete BMAD artifacts (brief, PRD, architecture, story files, QA reports) in **one work session** on **three different test project ideas**; `brownfield` run on ≥1 real test repo; workflow pause/resume works across app restarts. Validates FR-25, FR-26, FR-27, FR-28.
- **SM-7 (M5):** Three working installers (Windows, macOS, Linux) clean-install on ≥1 machine each; round-trip test (Windows → GitHub → macOS → Linux) preserves full state; Supermemory measurably improves Hermes responses on ≥1 defined cross-project retrieval scenario. Validates FR-31, FR-33, FR-34, FR-35, FR-36, FR-37.

**Counter-metrics (do not optimize)**

- **SM-C1:** Bus messages per minute. Do **not** optimize this downward — the bus is liberal by design. If chatter is correlated with progress signals firing, that is success, not noise. Counterbalances SM-4.
- **SM-C2:** Number of Hermes interventions per session. Do **not** optimize this upward — Hermes intervening _more_ is not better. Calibrate the stall window to intervene only when progress signals are flat. Counterbalances SM-4.
- **SM-C3:** Time-to-first-spawn for a dynamic persona. Do **not** optimize this without bound — fast spawn at the cost of poor persona setup is a regression. Counterbalances FR-7.

## 8. Open Questions

These are PRD-level open questions that surface during requirements work. Each lists who can resolve it and when. Tier 2–4 questions inherited from the approved brief are repeated here where they materially affect FR specificity; the brief's decision log remains authoritative on overall workspace context.

1. **OQ-A: Persona-file / tool-config conflict resolution rules.** When the vault persona file and the tool config (e.g., `claude.md`) diverge — what wins? Mentioned in FR-21. **Owner:** Architect (M3). **Revisit:** before M3 start.
2. **OQ-B: Memory-tier precedence specification.** Mentioned in FR-32. The source brief §3.7 says "the workspace defines sync policy and conflict resolution across these tiers" but does not specify. **Owner:** Architect (M5). **Revisit:** a draft precedence rule is needed before M3 if multi-tier memory is exercised when M3 spawns Architect/PM personas reading project context; the full spec lands at M5.
3. **OQ-C: Desktop shell — Tauri vs. Electron. RESOLVED 2026-05-26.** Decision: **Tauri preferred**, with a one-day spike as M0's first task to validate Paperclip's React UI hosts cleanly in Tauri's WebView2. If the spike surfaces significant pain, fall back to Electron. **Owner:** Architect (M0).
4. **OQ-D: Auto-approve policy for Hermes proposals.** Mentioned in FR-13. Per-project auto-approve policy for specific persona types. **Owner:** PM (M3 detail design). **Revisit:** at M3 kickoff.
5. **OQ-E: Stall-detection default window value.** Mentioned in FR-18. Source brief says "a few minutes." M2 stress-tests determine the right default. **Owner:** PM + Architect (M2). **Revisit:** during M2.
6. **OQ-F: Hot-load vs. reload of newly installed BMAD modules.** Mentioned in FR-7. **Owner:** Architect (M3). **Revisit:** at M3 kickoff.
7. **OQ-G: Credential storage uses each CLI's own model.** Mentioned in FR-2. Need explicit Architect confirmation that this is the policy and there is no workspace-level credential store. **Owner:** Architect + security review (between M3 and M4). **Revisit:** at M3.
8. **OQ-H: Stall-window default value and signal weighting.** Related to OQ-E. Specific tunable values. **Owner:** PM + Architect (M2). **Revisit:** during M2.
9. **OQ-N: Vault directory layout spec. RESOLVED 2026-05-26.** Decision: `docs/vault-layout.md` v1.0 produced at M0 close — before any M1 vault-touching story runs. Documents: top-level `<vault>/{personas/, projects/}`, per-persona scope (D-7), persona file as canonical with `claude.md`/`agy.md`/`agent.md` projected via persona-sync (D-6), per-persona log/skills/memory subdirs, conflict-log.md + out-of-scope-writes.log conventions, project-level BMAD artifacts at `projects/<id>/bmad/`, ephemeral-review output at `projects/<id>/reviews/`, workflow-state.json for pause/resume (Story 4.4), default GitHub-sync filter, default Supermemory-index filter. Path constants implemented in `packages/vault-layout/src/index.ts`. **Owner:** Architect (delivered). Re-evaluate at M5 with OQ-B memory precedence finalization.
10. **OQ-I: Repository structure. RESOLVED 2026-05-26.** Decision: **monorepo with pnpm workspaces.** All components — desktop shell, integration glue, adapters, BMAD modules — in a single repo. **Owner:** Architect (M0 deliverable: monorepo scaffolding + CI baseline).
11. **OQ-J: Upstream version pinning policy. RESOLVED 2026-05-26.** Decision: **Architect researches the current stable tag for each upstream at M0 start** (Paperclip, Hermes, BMAD — already at 6.7.1, Antigravity CLI, Zellij), locks them in `package.json` + a pinned-versions doc, and the team rebases on upstream every ~3 months (quarterly cadence) per the build plan's 10% upstream-sync capacity rule. Specific tags are an M0 deliverable. **Owner:** Architect (M0).
12. **OQ-K: License audit. RESOLVED 2026-05-26.** Decision: **Architect produces `LICENSES.md` as an M0 deliverable**, verifying bundling rights, redistribution, attribution, and commercial-use terms for Paperclip (MIT, clear), Hermes, BMAD, Antigravity CLI, Claude Code, and Zellij. Audit completes before any M1 code lands. **Owner:** Architect (M0).
13. **OQ-L: Team size and budget envelope. RESOLVED 2026-05-26.** Decision: **team is 4+ engineers** (build is a personal project with no formal budget cap — pace dictated by engineering exit criteria, not date). Build-plan timeline assumes 2–3 engineers (24–32 weeks); with 4+ engineers some parallelization is feasible (Epic 1 + Epic 5 cross-platform tracks could overlap), but the headline exit criteria remain the bar, not a ship date. Quarterly upstream-sync work (10% per milestone) distributes across the team.
14. **OQ-M: Attribution copy and contribution-back policy. RESOLVED 2026-05-26.** Decision: attribution appears in **all four locations** — Settings → About panel, first-run wizard final screen, app-launch splash screen, **and** `LICENSES.md`. Maximally generous attribution; addresses every bundled upstream's attribution clause without ambiguity. Contribution-back policy: **always offer upstream when general-purpose** — adapters, plugins, personas, or BMAD modules that are not 4neverCompany-OS-specific become PRs to the relevant upstream repo. Reduces long-term maintenance burden and matches build-plan cross-cutting concern.

Tier 2 questions (OQ-C, OQ-I, OQ-J, OQ-K) were resolved on 2026-05-26 — Architect-stage start is now unblocked.

## 9. Assumptions Index

Every `[ASSUMPTION]` from the document, surfaced for explicit confirmation. All AS entries are **initial UX or system targets**; the Architect may revise downward (faster) after M2 telemetry baselines.

- **AS-1:** macOS and Linux installers in M5 add platform-specific binaries but the FR-1 shape is the same on each platform. _(Inferred from build plan M5 scope.)_
- **AS-2:** Fixed-persona spawn latency ≤ 5 seconds on the reference machine (FR-4, FR-5). _(Inferred from "the instant a project opens" in source brief §1; PM-set UX target.)_
- **AS-3:** Bus delivery latency ≤ 500 ms peer-to-peer (FR-15). _(Architect-tunable internal-system target.)_
- **AS-4:** Bus retention: last 1000 messages per channel survive Paperclip restart (FR-16). _(Architect to confirm against Paperclip event-system capacity.)_
- **AS-5:** Stall-window default is "a few minutes" — specific tunable values per OQ-E (FR-18). _(Source brief §3.5 is qualitative; M2 stress-tests determine the right default.)_
- **AS-6:** UI render of new bus messages ≤ 200 ms after bus delivery (FR-17). _(PM-set UX target for "feels live.")_
- **AS-7:** Pause-persona response ≤ 2 seconds (FR-19). _(PM-set UX target so the user knows they got control back.)_
- **AS-8:** Persona-file ↔ tool-config propagation ≤ 30 seconds in either direction (FR-20, FR-21). _(File-watch loop target, not real-time.)_
- **AS-9:** Idle persistent agent ≤ 300 MB resident memory and ≤ 500 input tokens per hour (NFR-Performance). _(Initial ceiling for Architect target; revise after M2 telemetry baseline.)_

## 10. Cross-Cutting NFRs

System-wide non-functional requirements not tied to a single feature.

- **NFR-Performance.** Idling persistent agents are cheap: **≤ 300 MB resident memory per agent at idle** and **≤ 500 input tokens per agent per hour at zero user activity**. [ASSUMPTION: AS-9 — initial target; revise after M2 telemetry baseline.] Validated by SM-3.
- **NFR-Reliability.** Agent processes survive desktop-app crashes (Zellij sessions outlive the app process). Ephemeral agents leave zero orphan processes after exit. Validated by FR-6, FR-10 exit-criterion test.
- **NFR-Security.** Multiple persistent agents have shell + network reach. Sandboxing leans on each backing CLI's own permission model — Claude Code's permissions, Antigravity's permissions, etc. Workspace does not invent a parallel permission model. Formal security review scheduled between M3 and M4 per build plan: agent sandboxing, OAuth token storage, message bus authorization, vault file permissions, Supermemory data handling.
- **NFR-Observability.** Per-persona token-cost telemetry exists by M2 (per build plan cross-cutting concern) and feeds per-persona budget gates by M5. Logs are structured (JSON streams where supported). User can inspect any agent's recent activity from the UI.
- **NFR-Resilience-to-Upstream-Churn.** ~10% of each milestone's capacity is reserved for rebasing on upstream changes to Paperclip, Hermes, BMAD, Antigravity (per build plan cross-cutting concern).
- **NFR-Headless-Scriptability.** All workspace actions remain scriptable from CLI; the desktop UI is the default surface, not the only one. `hermes`, `paperclipai`, `bmad-method`, `agy`, and `claude` are on the system path.

## 11. Constraints & Guardrails

### 11.1 Safety

- **No persona spawn without explicit lifecycle choice.** A spawn that doesn't capture persistent-vs-ephemeral is a bug.
- **No silent cost runaway.** Per-persona budget gates with alerts (M5) plus a project-level kill switch ("stop everything now").
- **No surprises on the bus.** Hermes interventions are explicit user-visible prompts, not silent rewrites of agent state.

### 11.2 Privacy

- **Local-first by default.** Obsidian vault is the source of truth. Supermemory is opt-in per content category (FR-31). GitHub sync is opt-in and uses an explicit synced-vs-local policy doc.
- **Privacy-sensitive content can be marked local-only at the category level.** No automatic upload to Supermemory or push to GitHub for local-only categories.
- **Credentials never leave their owning CLI.** Per FR-2 and NFR-Security — Anthropic creds in Claude Code's store, Google creds in Antigravity's store. No workspace-level credential aggregation.

### 11.3 Cost

- **Bus is liberal; agents are not.** No per-message bus cap, but per-persona token cost is tracked from M2 and gated from M5.
- **Idling cost ceiling.** Per NFR-Performance: a persistent agent at idle does not exceed a documented token-per-hour budget.
- **Project-level kill switch.** A single "stop everything in this project now" action halts all agents and clears their bus subscriptions. Validated as M5 deliverable.

## 12. Integration & Dependencies _(invented section — central to this product)_

This product is integration. Each bundled component is a hard dependency; each carries upstream risk.

| Component                   | Role                                                  | Version pinning policy                                | Upstream risk                                                                                                                                     |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paperclip**               | Control plane + event system the bus runs on          | Pinned tag per Tier 2 OQ-J                            | Active development; integration surface across both the React UI host and the event system                                                        |
| **Hermes Agent**            | Conductor + persona-spawn supervisor + memory curator | Pinned tag per OQ-J                                   | Active development; we rely on `hermes-paperclip-adapter`                                                                                         |
| **BMAD Method**             | Methodology, persona library, workflow YAML           | Pinned tag per OQ-J                                   | Active development; workflow YAML format evolves; M4 risk                                                                                         |
| **Antigravity CLI (`agy`)** | Backing CLI for Frontend Designer                     | Pinned tag per OQ-J                                   | Public preview as of May 2026; RCE issue reported May 2026 — verify state at M2 start; Gemini CLI deprecation 2026-06-18 makes `agy` the standard |
| **Claude Code CLI**         | Backing CLI for Dev                                   | Pinned via Anthropic standard channel                 | Stable but evolving                                                                                                                               |
| **Zellij**                  | Embedded multiplexer for persistent agent panes       | Pinned tag per OQ-J                                   | Stable; weaker PTY handling on Windows historically — M1 risk                                                                                     |
| **Embedded Postgres**       | Paperclip backing store                               | Tied to Paperclip's preferred version                 | Standard                                                                                                                                          |
| **Obsidian**                | Local vault                                           | User-installed; workspace manages the vault directory | Stable                                                                                                                                            |
| **Supermemory**             | Cross-project semantic memory (opt-in)                | API integration                                       | Pricing and rate limits need M5 testing per build plan risk register                                                                              |
| **GitHub**                  | Sync target for configs/artifacts/skills/personas     | Public API                                            | Standard                                                                                                                                          |

**Contribution-back policy.** Adapter, plugin, persona, or BMAD module that's general-purpose should be offered upstream per build plan cross-cutting concern. Specific copy + workflow for this is OQ-M (Tier 4 deferred).

## 13. Why Now

Three signals make the timing load-bearing:

1. **Multiple terminal-native agent CLIs are now stable enough to bundle.** Claude Code, Antigravity CLI, MiniMax — each strongest in different domains. The natural unit of work is _one persona = one agent process = one CLI_. That unit didn't exist 12 months ago.
2. **Gemini CLI deprecation (2026-06-18 for individual Pro/Ultra users).** Forces a standardization decision on Frontend Designer. Antigravity CLI is the inheritor; building around it now is a one-decision migration, not a recurring one.
3. **BMAD has stabilized into a methodology with a real persona library and YAML workflow format** (v6.7.1 as of install). Bundling BMAD as the default methodology is feasible today; it wasn't 12 months ago.

The friction this product removes — installation, configuration, methodology onboarding, persona-to-agent wiring, memory integration across four moving upstreams — is the exact set of problems every individual power user re-solves today. The bundle is the value.

## 14. Platform

- **Windows 10/11** — primary platform, ships at M1.
- **macOS** (current versions) — ships at M5.
- **Linux** (AppImage or distro packages — specific choice deferred) — ships at M5.

No web, mobile, or hosted variants in v1.

## 15. Release Plan _(invented section — FRs mapped to M0–M5 from the build plan)_

This section ties every FR to the milestone delivering it. M0 is pre-work (no FRs delivered; Tier 2 OQs resolved there). The build plan is the source of truth for milestone duration and risk.

| Milestone                            | Duration  | FRs delivered or advanced                                                                                                                               | Open questions resolved                                                                                                  |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **M0 — Pre-Work**                    | 1–2 weeks | (none — pre-work)                                                                                                                                       | OQ-C, OQ-I, OQ-J, OQ-K all resolved 2026-05-26 (Tauri spike + monorepo + version pins + LICENSES.md are M0 deliverables) |
| **M1 — Walking Skeleton**            | 6–8 weeks | FR-1 (Win), FR-2 (Anthropic + vault), FR-3, FR-4, FR-6 (Dev only), FR-20 (claude.md), FR-22 (Dev only), FR-23, FR-24, FR-35                             | OQ-N (vault directory layout spec — before stories are written)                                                          |
| **M2 — Second Agent + Bus**          | 4–6 weeks | FR-2 (+ Antigravity OAuth), FR-5, FR-6 (+ Frontend Designer), FR-15, FR-16, FR-17, FR-18 (initial signals), FR-20 (agy.md), FR-22 (+ Frontend Designer) | OQ-E, OQ-H (stall window tuning); bus protocol schema; progress-signal taxonomy (follow-up artifacts)                    |
| **M3 — Dynamic Spawn + BMB Minimal** | 6–8 weeks | FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-19, FR-21                                                                                       | OQ-A, OQ-D, OQ-F, OQ-G                                                                                                   |
| **M4 — Full BMAD Workflow**          | 4–6 weeks | FR-18 (+ story-state signals), FR-25, FR-26, FR-27, FR-28                                                                                               | (none open at this milestone)                                                                                            |
| **M5 — Memory, Collab, Polish**      | 4–6 weeks | FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-36, FR-37                                                                                                  | OQ-B; OQ-L, OQ-M (if not already resolved by Maurice before launch)                                                      |

**Total estimated duration:** ~24–32 weeks (≈6–7 months) at the build-plan's 2–3-engineer assumption. With Maurice's resolved team size of **4+ engineers** (OQ-L), the timeline may compress through parallelization (notably Epic 1 + Epic 5 cross-platform tracks can overlap), but per the resolved budget envelope (no formal cap; engineering exit criteria are the bar), the headline goal is the criteria not a calendar date.

**Cross-cutting workstreams that run across every milestone** (per build plan): testing scenario tests per milestone; user-facing docs lagging features by one milestone except install-flow at M1; formal security review between M3 and M4; token-cost telemetry wired in by M2 with quotas at M5; ~10% upstream-sync capacity reserved per milestone; contribution-back policy applied throughout.
