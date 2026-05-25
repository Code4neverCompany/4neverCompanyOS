---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-c4n-4neverCompanyOS-2026-05-25/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/brief.md
  - docs/4neverCompany_OS_Build_Plan.md
project_name: c4n-4neverCompanyOS
user_name: Maurice
date: 2026-05-26
workflowType: epics-and-stories
status: complete
author_role: PM (John) → Epics & Stories workflow
working_mode: Fast path
---

# c4n-4neverCompanyOS — Epic Breakdown

## Overview

This document decomposes the 37 PRD FRs + 6 NFRs + architectural decisions into **5 epics with ~60 user-value-focused stories**. UX-design stage was explicitly skipped for v1 (per Maurice's session decision; product is power-user / internal tool), so there are no UX-DRs to fold in — visual/interaction polish is authored inline during M3/M4 with user review.

Epics are organized around **milestone-aligned user value** (per PRD §15 Release Plan / build plan M0–M5), not technical layers. Each epic delivers an independently demonstrable capability; stories within an epic do not forward-depend on later stories within the same epic.

## Requirements Inventory

### Functional Requirements

(From PRD §4. Full text in `prds/prd-c4n-4neverCompanyOS-2026-05-25/prd.md`.)

```
FR-1: Single-installer provisioning
FR-2: First-run wizard credential collection
FR-3: Obsidian vault location selection
FR-4: Dev persona spawn
FR-5: Frontend Designer persona spawn
FR-6: Fixed personas survive desktop-app restart
FR-7: BMB "Add Agent" panel exposes the BMAD persona library
FR-8: Lifecycle selection at spawn time
FR-9: Persistent dynamic agents get terminal + vault directory
FR-10: Ephemeral agents run one task and exit cleanly
FR-11: Custom persona authoring and reuse
FR-12: Hermes proposes persona spawns with rationale
FR-13: User approval required before spawn
FR-14: Promotion path ephemeral → persistent
FR-15: Pub/sub bus carries peer-to-peer agent messages
FR-16: Bus state survives Paperclip restart
FR-17: UI channel view per project
FR-18: Progress-based stall detection
FR-19: User can pause / redirect any persona
FR-20: Persona file → tool config projection
FR-21: Tool config → persona file backflow
FR-22: One Zellij pane per persistent persona
FR-23: Attach/detach without killing processes
FR-24: Hermes TUI embedded
FR-25: "Start a BMAD project" entry point
FR-26: Workflow phases spawn personas at the right moments
FR-27: Workflow can pause, app close, reopen, resume
FR-28: `brownfield` workflow supported
FR-29: Per-persona scoped vault directory
FR-30: Project-wide vault
FR-31: Supermemory integration — opt-in per content category
FR-32: Memory tier precedence
FR-33: Sync configs and artifacts to GitHub
FR-34: Cross-machine continuity
FR-35: Windows installer (.exe)
FR-36: macOS installer (.dmg)
FR-37: Linux installer
Total FRs: 37
```

### Non-Functional Requirements

```
NFR-Performance: Idle persistent agent ≤ 300 MB resident / ≤ 500 input tokens per hour (AS-9; revise after M2 baseline)
NFR-Reliability: Agents survive desktop-app crashes (Zellij session-resume); ephemerals leave zero orphans after exit
NFR-Security: Sandboxing leans on each backing CLI's own permission model; formal security review M3↔M4
NFR-Observability: Per-persona token-cost telemetry from M2; structured JSON logs; per-persona log file in vault
NFR-Resilience-to-Upstream-Churn: ~10% of each milestone reserved for rebases; quarterly pin cadence
NFR-Headless-Scriptability: All workspace actions scriptable from CLI; CLIs on system path
Total NFRs: 6
```

### Additional Requirements (from Architecture)

```
- M0 starter template: pnpm create tauri-app --template react-ts --manager pnpm 4nevercompany-os → convert to pnpm-workspace per Architecture §6 (D-15, OQ-I)
- M0 deliverable: LICENSES.md verifying bundling rights for Paperclip / Hermes / BMAD / Antigravity / Claude Code / Zellij (OQ-K)
- M0 deliverable: pinned-versions.md with explicit pinned tags for each upstream + quarterly cadence (OQ-J)
- M0 deliverable: One-day Tauri/WebView2 spike validating Paperclip's React UI hosts via portal-slot injection (D-13); DOM-mount fallback documented (G-1)
- M0 deliverable: CI baseline (.github/workflows/ci.yml) — lint + typecheck + test matrix on Windows/macOS/Linux
- M1 deliverable: docs/vault-layout.md (OQ-N) before any M1 story that touches the vault
- M2 deliverable: docs/progress-signal-taxonomy.md + docs/bus-protocol-schema.md (build-plan follow-up artifacts)
- M2 deliverable: re-verify Antigravity CLI public-preview state + RCE fix from May 2026 (G-3) before Frontend Designer ships
- M3 deliverable: docs/memory-precedence.md draft (OQ-B; finalize at M5)
- Cross-cutting: contribution-back policy — adapters / plugins / personas / BMAD modules offered upstream when general-purpose
```

### UX Design Requirements

```
None — UX-design stage explicitly skipped for v1 (Maurice's session decision; product is power-user internal tool; PRD UJ-1..UJ-7 carry user-facing flow; inline UX during M3/M4 with user review is the mitigation).
```

### FR Coverage Map

```
FR-1  → Epic 1 (Foundation & Walking Skeleton): Story 1.1, 1.17
FR-2  → Epic 1: Story 1.8, 1.9. Extended to Antigravity in Epic 2: Story 2.1
FR-3  → Epic 1: Story 1.7
FR-4  → Epic 1: Story 1.12
FR-5  → Epic 2: Story 2.2
FR-6  → Epic 1: Story 1.15 (Dev only). Extended to Frontend Designer in Epic 2: Story 2.5
FR-7  → Epic 3: Story 3.1
FR-8  → Epic 3: Story 3.2
FR-9  → Epic 3: Story 3.3
FR-10 → Epic 3: Story 3.6
FR-11 → Epic 3: Story 3.10
FR-12 → Epic 3: Story 3.7
FR-13 → Epic 3: Story 3.8
FR-14 → Epic 3: Story 3.9
FR-15 → Epic 2: Story 2.7, 2.8
FR-16 → Epic 2: Story 2.11
FR-17 → Epic 2: Story 2.10
FR-18 → Epic 2: Story 2.12, 2.13, 2.14, 2.15 (M2 part). Extended in Epic 4: Story 4.5 (story-state signal)
FR-19 → Epic 2: Story 2.18 (M2 part). Extended in Epic 3: Story 3.11
FR-20 → Epic 1: Story 1.13 (claude.md). Extended in Epic 2: Story 2.3 (agy.md)
FR-21 → Epic 3: Story 3.4
FR-22 → Epic 1: Story 1.11 (Dev only). Extended in Epic 2: Story 2.4 (multi-pane)
FR-23 → Epic 1: Story 1.15 (covered by restart story)
FR-24 → Epic 1: Story 1.16
FR-25 → Epic 4: Story 4.1
FR-26 → Epic 4: Story 4.2, 4.3
FR-27 → Epic 4: Story 4.4
FR-28 → Epic 4: Story 4.6
FR-29 → Epic 3: Story 3.5
FR-30 → Epic 5: Story 5.1
FR-31 → Epic 5: Story 5.2
FR-32 → Epic 5: Story 5.3
FR-33 → Epic 5: Story 5.4
FR-34 → Epic 5: Story 5.5
FR-35 → Epic 1: Story 1.17
FR-36 → Epic 5: Story 5.9
FR-37 → Epic 5: Story 5.10
```

Every FR is covered. Some FRs have a primary story plus extension stories in later epics where the FR's surface broadens (e.g. FR-2 wizard credentials starts with Anthropic + vault in Epic 1, extends with Antigravity OAuth in Epic 2).

## Epic List

### Epic 1: Foundation & Walking Skeleton — install → wizard → working Dev agent ≤ 10 min on Windows

Solo dev downloads a Windows `.exe`, runs the installer, completes the first-run wizard (Anthropic key + vault location + Claude Code OAuth), creates a project, and within 10 minutes is typing into a real Zellij pane with the Dev agent on Claude Code running and ready. M0 monorepo scaffolding, license audit, pinned-versions doc, and CI baseline are foundation stories.
**FRs covered:** FR-1 (Win), FR-2 (Anthropic + vault subset), FR-3, FR-4, FR-6 (Dev only), FR-20 (claude.md), FR-22 (Dev only), FR-23, FR-24, FR-35

### Epic 2: Second Agent + Live Bus + Progress-Based Stall Detection

Frontend Designer joins as the second fixed persona; bus traffic is visible in the desktop UI; Hermes correctly intervenes on stalls and stays out of productive chatter. M2 also produces the bus-protocol schema doc and the progress-signal-taxonomy doc.
**FRs covered:** FR-2 (Antigravity OAuth added), FR-5, FR-6 (Frontend Designer added), FR-15, FR-16, FR-17, FR-18 (initial), FR-19 (subset), FR-20 (agy.md), FR-22 (multi-pane)

### Epic 3: Dynamic Persona Spawning + BMad Builder Add-Agent + Hermes-Initiated Spawn

User clicks "Add Agent," picks any BMAD persona, picks persistent or ephemeral, picks a backing CLI, and the persona spawns. Hermes proposes additional personas mid-project with user approval. Ephemeral agents clean up cleanly (zero orphans after 100 spawn/exit cycles). Custom personas authorable. Promotion path from ephemeral to persistent works. Vault-scoping log live.
**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-19 (extended), FR-21, FR-29

### Epic 4: One-Click BMAD Workflow Execution

"Start a BMAD project" runs `greenfield-fullstack` end-to-end, spawning dynamic personas at each phase with user-approval gates, producing a working code skeleton plus complete BMAD artifact set (brief, PRD, architecture, story files, QA reports) in one work session. `brownfield` runs on at least one real test repo. Story-state transitions become the third progress signal.
**FRs covered:** FR-18 (+story-state signal), FR-25, FR-26, FR-27, FR-28

### Epic 5: Memory, Multi-Machine Continuity, Cross-Platform Distribution

Cross-project memory via opt-in Supermemory; per-persona scoped vault directories with memory-tier precedence; opt-in GitHub sync for configs/artifacts/skills/personas; round-trip cross-machine continuity (Win → GitHub → macOS → Linux); per-persona budget gates with project-level kill switch; macOS `.dmg` and Linux installer; basic docs site.
**FRs covered:** FR-30, FR-31, FR-32, FR-33, FR-34, FR-36, FR-37 (NFR-Performance + NFR-Observability budgets/kill switch land here too)

---

## Epic 1: Foundation & Walking Skeleton

**Goal:** Solo dev installs `.exe`, completes wizard, creates project, and has working Dev/Claude Code agent in a Zellij pane within 10 minutes on a clean Windows 10/11 machine. M0 scaffolding + LICENSES + pinned-versions + CI baseline + vault layout spec laid down as foundation.

### Story 1.1: M0 Tauri/WebView2 + Paperclip portal-slot spike

As a developer on the 4neverCompany OS team,
I want to spike Paperclip's React UI hosting cleanly inside a Tauri WebView2 window with portal-slot injection working,
So that we can commit to Tauri (and the D-13 portal injection pattern) without risk of mid-M1 surprises.

**Acceptance Criteria:**

**Given** a fresh Windows 11 machine with the Rust toolchain and Node 20+ installed
**When** I run `pnpm create tauri-app --template react-ts --manager pnpm tauri-spike` and add a hello-world Paperclip-clone React app inside it
**Then** the Tauri window launches, the React app renders inside WebView2, and a `react-dom/portal` render-into-named-slot pattern works
**And** I produce `docs/spike-report-tauri-webview2.md` capturing: (a) Tauri version verified, (b) WebView2 render result, (c) portal-slot result, (d) go/fallback decision
**And** if portal-slots fail, I document the DOM-mount fallback path with a working PoC

### Story 1.2: M0 Monorepo scaffolding (pnpm workspaces + Tauri starter)

As a developer,
I want the canonical monorepo scaffolded according to Architecture §6,
So that all subsequent stories have a stable place to land code.

**Acceptance Criteria:**

**Given** Story 1.1 has succeeded (Tauri path confirmed)
**When** I run the starter command and convert to pnpm-workspace per Architecture §6
**Then** the repo contains `apps/desktop/`, `apps/wizard/` skeletons, empty `packages/core/`, `packages/bus-client/`, `crates/zellij-adapter/`, `services/` placeholders, `pnpm-workspace.yaml`, `tsconfig.base.json`, `rust-toolchain.toml`
**And** `pnpm install && pnpm build` succeeds locally
**And** the repo follows the Architecture §6 tree exactly (one-to-one directory match)

### Story 1.3: M0 LICENSES.md — license audit and attribution

As Maurice (and the legal/release-comms readiness story),
I want a single `LICENSES.md` at repo root verifying bundling, redistribution, attribution, and commercial-use terms for every bundled component,
So that we cannot be blocked mid-build by a licensing surprise.

**Acceptance Criteria:**

**Given** the list of bundled components (Paperclip, Hermes Agent, BMAD Method, Antigravity CLI, Claude Code, Zellij, embedded Postgres, Obsidian, Supermemory client, Node, pnpm, Tauri, Rust toolchain)
**When** I research each component's license and redistribution terms
**Then** `LICENSES.md` exists at repo root with a row per component listing: license name, source URL, redistribution permitted (yes/no/with-conditions), attribution requirement text, commercial-use permitted (yes/no/with-conditions)
**And** any component that requires special handling has a `[NOTE]` callout with the action item
**And** Maurice has reviewed and approved the audit before any M1 dependency adds new components

### Story 1.4: M0 pinned-versions.md — upstream version pinning

As a developer,
I want a `pinned-versions.md` doc with explicit pinned tags for every external dependency the bundle relies on,
So that quarterly rebases have a known starting point and reproducibility is enforceable.

**Acceptance Criteria:**

**Given** the components named in Story 1.3
**When** I research the current stable tag for each at M0 start
**Then** `docs/pinned-versions.md` exists listing for each component: pinned tag (or version), release date of that tag, source URL, rationale for selecting that tag, smoke-test result (pass/fail/N/A), and the planned quarterly-revisit date
**And** `package.json` workspaces lock npm-managed components to those tags (bmad-method, Tauri CLI, etc.)
**And** Antigravity CLI's tag specifically notes the May 2026 RCE-issue resolution status

### Story 1.5: M0 CI baseline

As a developer,
I want CI running lint + typecheck + test + build on every push,
So that the repo can't drift to broken main.

**Acceptance Criteria:**

**Given** the monorepo from Story 1.2
**When** I push a commit to any branch
**Then** `.github/workflows/ci.yml` runs on Windows + macOS + Linux: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a minimal `pnpm build` (Tauri build is too heavy for CI; build it in `release.yml` instead)
**And** failures block merge to main via branch protection (Maurice configures branch protection out-of-band)
**And** the build matrix uses pinned Node + pnpm + Rust versions from Story 1.4

### Story 1.6: M1 Vault directory layout spec (OQ-N)

As a developer about to write any M1 story that touches the vault,
I want `docs/vault-layout.md` documenting the canonical vault directory structure,
So that all subsequent stories agree on file locations.

**Acceptance Criteria:**

**Given** the requirements from FR-3, FR-29, FR-30 and the per-persona scope decision (D-7)
**When** I draft the spec
**Then** `docs/vault-layout.md` exists, documenting: `vault/personas/{persona-id}/` (per-persona scope), `vault/projects/{project-id}/` (project-wide artifacts), `vault/projects/{project-id}/bmad/` (BMAD artifacts: brief, prd, architecture, stories, qa), `vault/personas/{persona-id}/log/` (per-persona log files), `vault/personas/{persona-id}/skills/` (per-persona skills/memory), and the `conflict-log.md` + `out-of-scope-writes.log` file conventions
**And** Maurice reviews and approves before any M1 vault-touching story starts

### Story 1.7: M1 Obsidian vault location selection in wizard

As a solo dev running the workspace for the first time,
I want to choose where my Obsidian vault lives on disk,
So that I can place it on the drive I prefer and not have a default forced.

**Acceptance Criteria:**

**Given** Story 1.6 vault layout spec is approved and Story 1.2 wizard skeleton exists
**When** I open the first-run wizard
**Then** a step prompts me for vault location with a sensible default (`~/Documents/4neverCompanyOS-Vault`)
**And** I can browse to choose a different location
**And** on confirmation, the vault is scaffolded per `docs/vault-layout.md` with empty `personas/` and `projects/` subdirs
**And** the choice persists in `~/.4nevercompanyos/config.toml`

### Story 1.8: M1 First-run wizard — Anthropic API key collection

As a solo dev in the wizard,
I want the wizard to collect my Anthropic API key (required for Claude Code),
So that Claude Code is authenticated before the Dev persona spawns.

**Acceptance Criteria:**

**Given** the wizard is running (Story 1.7 path)
**When** the Anthropic step is presented
**Then** I can paste or type an API key with masked input
**And** the key is validated by hitting Anthropic's auth endpoint
**And** on success, the key is handed off to Claude Code's standard credential store (D-9; not stored at the workspace level)
**And** on failure, a clean error appears with a retry option and a link to Anthropic's docs

### Story 1.9: M1 First-run wizard — Claude Code OAuth (if applicable)

As a solo dev in the wizard,
I want the wizard to walk me through Claude Code's authentication flow (whether OAuth or API key, whichever Claude Code currently supports),
So that the Dev persona can run unattended on my behalf.

**Acceptance Criteria:**

**Given** the wizard has the Anthropic credentials path from Story 1.8
**When** Claude Code's authentication is needed
**Then** the wizard either (a) hands the API key to Claude Code's credential store directly if API-key auth is what Claude Code supports, or (b) launches Claude Code's OAuth flow in the browser and waits for callback
**And** in either path, `claude` on the system path can authenticate using the captured credentials without re-prompting
**And** failures retry cleanly without losing state from earlier wizard steps

### Story 1.10: M1 Credential storage abstraction package

As a developer building the wizard,
I want a `packages/credential-storage` abstraction over OS keychains (Windows Credential Manager for now),
So that future wizard steps and persona supervisors have a single API for keychain ops.

**Acceptance Criteria:**

**Given** a credential write/read API spec (per D-9)
**When** I implement `packages/credential-storage` with a Windows Credential Manager backend via Rust `keyring` crate exposed through Tauri commands
**Then** the API offers `set(serviceName, account, secret)`, `get(serviceName, account)`, `delete(serviceName, account)` with typed errors
**And** unit tests cover all three operations against a real local Credential Manager
**And** the package exports TypeScript types for downstream packages to import

### Story 1.11: M1 Zellij adapter — single-pane spawn

As a developer building the persona-spawn pipeline,
I want a `crates/zellij-adapter` crate that can create a Zellij session and spawn a child process inside a single pane in that session,
So that the Dev persona has a real, attachable terminal.

**Acceptance Criteria:**

**Given** the pinned Zellij version from Story 1.4 and a target Windows PTY environment
**When** I call `zellij-adapter::spawn_pane(session_name, command, env)`
**Then** a Zellij session named `session_name` is created (or reused if exists), a pane is created in it running `command` with `env`
**And** the function returns a `PaneHandle` exposing methods to detach, reattach, kill, and read scrollback
**And** integration tests verify spawn + detach + reattach on Windows (the known weaker-PTY platform)
**And** if Windows PTY surfaces blocking issues, a `[NOTE FOR PM]` flags it and we revisit at M1 mid-review

### Story 1.12: M1 Dev persona spawn on project open

As a solo dev opening a project for the first time,
I want the Dev persona on Claude Code to spawn automatically into its own Zellij pane,
So that I can immediately start typing into it without manual setup.

**Acceptance Criteria:**

**Given** Story 1.11 (Zellij adapter), Story 1.10 (credential storage), and Story 1.9 (Claude Code auth) all complete
**When** I open or create a project in the desktop shell
**Then** within 5 seconds (AS-2), a Claude Code process is running inside a Zellij pane visible in the multi-terminal view of the desktop UI
**And** the pane has Claude Code's prompt ready for input
**And** the project's vault scaffolding includes `vault/personas/dev/` per Story 1.6 layout

### Story 1.13: M1 claude.md projection from BMAD Dev persona file

As a Dev persona spawning into a project,
I want `claude.md` at the project root populated from BMAD's Dev persona file,
So that Claude Code adopts the right behavior from the first message.

**Acceptance Criteria:**

**Given** BMAD's Dev persona file exists (`_bmad/bmm/agents/dev/*`)
**When** the Dev persona spawns (Story 1.12)
**Then** the workspace writes `<project-root>/claude.md` whose content is derived from BMAD's Dev persona file (resolved through BMAD's customize.toml chain)
**And** the file is overwritten on subsequent project opens (drift detection lives in Epic 3 Story 3.4)
**And** Claude Code reads `claude.md` and behaves according to the Dev persona on first turn

### Story 1.14: M1 Persona supervisor — stdout/stderr capture + per-persona log file

As a developer instrumenting personas for telemetry and debugging,
I want a `crates/persona-supervisor` crate wrapping each spawned process to capture stdout/stderr and stream both to a vault log file,
So that we have a single intervention point for telemetry (Epic 2) and logs are persisted per persona.

**Acceptance Criteria:**

**Given** Story 1.11 (Zellij adapter)
**When** the Dev persona spawns via Story 1.12
**Then** `crates/persona-supervisor` wraps the Claude Code process, captures stdout and stderr line-by-line, and appends each line as a JSON log entry to `vault/personas/dev/log/2026-MM-DD.jsonl` (one file per day per persona)
**And** the log entries include `{ts, level, line}` minimum; level is inferred (`error` / `info`) from stderr-vs-stdout
**And** the supervisor exposes the captured stream to other components via IPC (Epic 2 telemetry will subscribe)

### Story 1.15: M1 Dev persona survives desktop-app restart

As a solo dev who closes the desktop app and reopens it later,
I want the Dev persona to re-attach to its existing Zellij session with scrollback intact,
So that I don't lose context across restarts.

**Acceptance Criteria:**

**Given** a project is open with the Dev persona spawned (Story 1.12)
**When** I close the desktop app, wait 30 seconds, and reopen it on the same project
**Then** no orphan processes remain after close (Zellij session is alive; Claude Code child process is alive inside it)
**And** the Dev pane shows ≥ the last 1000 lines of scrollback (subject to Zellij's session-scrollback limit)
**And** the supervisor reattaches its stdout/stderr capture to the running Claude Code process without restarting it

### Story 1.16: M1 Hermes TUI embedded as a pane

As a solo dev wanting to observe Hermes' decisions and direct it,
I want the Hermes TUI embedded in the multi-terminal view as a Zellij pane,
So that I can scroll/inspect Hermes in the same UI surface as the agents.

**Acceptance Criteria:**

**Given** Story 1.11 (Zellij adapter)
**When** the workspace starts a project
**Then** a Zellij pane labeled "Hermes" runs Hermes' TUI binary
**And** the pane behaves identically to running `hermes` standalone (no commands missing)
**And** Hermes' TUI is visible alongside the Dev pane in the desktop UI

### Story 1.17: M1 Tauri build → Windows .exe with NSIS bundler

As Maurice ready to ship M1 to friends or test machines,
I want the Tauri build produce a working Windows `.exe` installer,
So that a clean Windows machine can install the workspace one-click.

**Acceptance Criteria:**

**Given** the monorepo is M1-feature-complete (Stories 1.1–1.16)
**When** I run `pnpm tauri build` on a Windows build host
**Then** an NSIS-bundled `.exe` is produced in `apps/desktop/src-tauri/target/release/bundle/`
**And** the installer runs on a clean Windows 10/11 machine without admin escalation surprises (or with a single UAC prompt at most)
**And** post-install, the workspace launches and the first-run wizard appears

### Story 1.19: M1 In-product attribution surfaces (per OQ-M resolution)

As a solo dev seeing the workspace for the first time + as Maurice meeting upstream attribution clauses,
I want "Powered by Paperclip / Hermes Agent / BMAD Method / Antigravity / Claude Code / Zellij / Obsidian" to appear in three in-product locations,
So that attribution is comprehensive and license clauses are met without ambiguity.

**Acceptance Criteria:**

**Given** Story 1.3 LICENSES.md exists as the canonical attribution source-of-truth
**When** the wizard reaches its final "You're all set" screen (Story 1.7+1.8+1.9 path)
**Then** the screen displays a "Powered by..." attribution block with the bundled upstreams listed by name, license, and a link to the LICENSES.md content
**And** the desktop shell's app-launch splash screen (visible for ≤ 2 seconds at startup) shows a single-line "Powered by..." credit
**And** a Settings → About panel exists in the desktop UI (basic Settings panel created as part of this story) showing the same attribution list with version of each component (pulled from `docs/pinned-versions.md`) and a link to LICENSES.md
**And** all three surfaces render the same canonical attribution text — single source-of-truth lives in `packages/core/src/attribution.ts`

### Story 1.18: M1 End-to-end scenario test — install → wizard → project → working Dev agent ≤ 10 min

As Maurice validating the M1 exit criterion,
I want a manual scenario test that proves a fresh Windows install → wizard → project → working Dev agent in a pane takes under 10 minutes,
So that the SM-1 success metric is demonstrable.

**Acceptance Criteria:**

**Given** the M1 `.exe` from Story 1.17 and a clean Windows 10 or 11 VM with no prior install
**When** Maurice (or a tester) runs through the full install → wizard → project flow with a stopwatch
**Then** total elapsed time from "double-click .exe" to "typing into a working Dev agent's Zellij pane" is **≤ 10 minutes**
**And** a screen recording of the run is captured in `tests/manual/m1-exit-criterion-recording.mp4` (or similar)
**And** any step that took longer than expected is logged in `tests/manual/m1-exit-criterion-notes.md` with a remediation plan

---

## Epic 2: Second Agent + Live Bus + Stall Detection

**Goal:** Dev and Frontend Designer coordinate on a small task end-to-end via a visible bus; Hermes intervenes only when chatter has no progress.

### Story 2.1: M2 Antigravity OAuth flow in wizard

As a solo dev running the wizard who didn't add Antigravity in M1,
I want the wizard to walk me through Google OAuth for Antigravity CLI,
So that the Frontend Designer can authenticate.

**Acceptance Criteria:**

**Given** Story 1.10 (credential storage) exists
**When** the wizard reaches the Antigravity step (which is now part of the wizard flow starting M2)
**Then** the wizard launches Google OAuth in the system browser
**And** on callback, the credentials are handed off to `agy`'s standard credential store (D-9)
**And** `agy auth status` reports authenticated after the wizard completes
**And** the wizard checks Antigravity's public-preview-and-RCE-fix status from `pinned-versions.md` before proceeding; if the pinned version is known-vulnerable, it surfaces a `[BLOCKED]` message with a link to the upgrade

### Story 2.2: M2 Frontend Designer persona spawn on project open

As a solo dev opening a project,
I want the Frontend Designer persona on Antigravity to spawn automatically alongside Dev,
So that both fixed personas are present without manual setup.

**Acceptance Criteria:**

**Given** Stories 2.1 (Antigravity auth) and 1.11 (Zellij adapter)
**When** I open or create a project in the desktop shell
**Then** within 5 seconds (AS-2), an `agy` process is running inside a Zellij pane labeled "Frontend Designer" alongside the Dev pane
**And** the pane has `agy`'s prompt ready for input
**And** the project's vault scaffolding includes `vault/personas/frontend-designer/` per Story 1.6 layout

### Story 2.3: M2 agy.md projection from BMAD Frontend Designer persona file

As the Frontend Designer persona,
I want `agy.md` at the project root populated from BMAD's Frontend Designer persona file,
So that `agy` adopts the right behavior from the first message.

**Acceptance Criteria:**

**Given** BMAD's Frontend Designer persona file exists
**When** the Frontend Designer spawns (Story 2.2)
**Then** the workspace writes `<project-root>/agy.md` whose content is derived from BMAD's Frontend Designer persona file
**And** the file is overwritten on subsequent project opens (Epic 3 Story 3.4 will add drift detection)

### Story 2.4: M2 Zellij adapter — multi-pane orchestration

As a developer needing both fixed personas + Hermes TUI in panes,
I want `crates/zellij-adapter` to manage N panes per session reliably,
So that adding more personas (M3 dynamic spawn) doesn't require re-implementation.

**Acceptance Criteria:**

**Given** Story 1.11 (single-pane adapter)
**When** I extend the adapter to handle N panes per session
**Then** the adapter can create up to ≥ 10 panes per session, label them by persona ID, and route stdin/stdout/stderr per pane
**And** the multi-terminal view in the desktop UI shows all panes side-by-side or in a tabbed layout (visual choice deferred to UI build inline; not a blocker)
**And** integration tests verify 5+ panes simultaneously across spawn + detach + reattach

### Story 2.5: M2 Both fixed personas survive desktop-app restart

As a solo dev who closes and reopens the app,
I want both Dev and Frontend Designer to reattach to their existing panes,
So that neither is lost on restart.

**Acceptance Criteria:**

**Given** Story 1.15 (Dev restart survival) extended for Frontend Designer
**When** I close the desktop app with both fixed personas running and reopen it
**Then** both panes reattach to their existing Claude Code and `agy` processes; zero orphans
**And** both pane scrollbacks show ≥ the last 1000 lines

### Story 2.6: M2 Bus protocol schema doc

As a developer building bus producers/subscribers,
I want `docs/bus-protocol-schema.md` documenting the message envelope, event-type taxonomy, channel topology, and subscriber registration protocol,
So that all bus participants follow one schema.

**Acceptance Criteria:**

**Given** the brief §3.5 + PRD §4.5 + Architecture D-3 constraints
**When** I draft the schema
**Then** `docs/bus-protocol-schema.md` documents: (a) message envelope `{ v, type, from, ts, id, payload }`, (b) event-type taxonomy (`<domain>.<entity>.<verb>` dotted-lower, past-tense state events vs. `.requested` proposals), (c) channel topology (per-project channel + system channels), (d) subscriber registration, (e) at-least-once delivery + dedup by `id`, (f) bounded queue size + retention policy (default 1000 per channel), (g) schema versioning rules
**And** Maurice reviews and approves before bus implementation starts

### Story 2.7: M2 Bus relay crate — Paperclip events → IPC subscribers

As a developer enabling agents and the UI to subscribe to bus messages,
I want `crates/bus-relay` that subscribes to Paperclip's event system and rebroadcasts to local IPC subscribers,
So that all bus participants share a single source.

**Acceptance Criteria:**

**Given** Story 2.6 (schema doc) + Paperclip's event system running
**When** I implement the relay
**Then** the relay subscribes to Paperclip events, normalizes them into the bus envelope, and broadcasts to all registered IPC subscribers
**And** producers can post to the relay via IPC; relay round-trips through Paperclip events (or direct relay if Paperclip events are the wrong substrate for some types — document the choice)
**And** integration tests cover producer → relay → 2+ subscribers receiving the same message in order

### Story 2.8: M2 Bus message envelope schemas in packages/core

As a TypeScript developer producing or consuming bus messages,
I want Zod schemas in `packages/core/src/schemas/bus.ts` matching the protocol doc,
So that I get compile-time type safety and runtime validation.

**Acceptance Criteria:**

**Given** Story 2.6 (schema doc) is approved
**When** I implement the Zod schemas
**Then** `packages/core/src/schemas/bus.ts` exports a discriminated union typed `BusMessage` covering all event types named in the protocol doc
**And** every consumer in this monorepo imports from `packages/core` (no inline schemas)
**And** unit tests cover each schema's happy path + rejection of malformed messages

### Story 2.9: M2 WebSocket relay for desktop UI

As the desktop UI rendering live bus traffic,
I want the bus relay to expose a local WebSocket the UI connects to,
So that messages reach the UI within 200ms of bus delivery (AS-6).

**Acceptance Criteria:**

**Given** Stories 2.7 and 2.8
**When** I add the WebSocket endpoint to `crates/bus-relay`
**Then** the desktop UI connects to `ws://127.0.0.1:<workspace-port>/bus` on startup
**And** messages from agents are delivered to the UI within **≤ 200ms** of bus arrival (AS-6)
**And** the WebSocket reconnects automatically on temporary disconnect

### Story 2.10: M2 UI channel-view panel showing live bus traffic

As a solo dev watching multiple agents coordinate,
I want a desktop UI panel showing live bus messages per project channel,
So that I can see what every agent is saying in real time.

**Acceptance Criteria:**

**Given** Story 2.9 (WebSocket)
**When** I open a project in the desktop UI
**Then** a "Channel" panel renders the bus stream for that project's channel, scrolling as new messages arrive
**And** each message displays `from`, timestamp, type, and a one-line preview of the payload (expandable to full payload)
**And** user posts to the channel are visually distinguished from agent posts (FR-19 user as first-class participant)

### Story 2.11: M2 Bus state survives Paperclip restart

As the bus, after a Paperclip restart,
I want to retain the last 1000 messages per channel,
So that bus history is not lost.

**Acceptance Criteria:**

**Given** Stories 2.7 + workspace SQLite from Architecture D-10
**When** I implement bounded-queue persistence for the bus
**Then** the last 1000 messages per channel are persisted to workspace SQLite as they arrive
**And** Paperclip restart followed by relay restart replays the last 1000 messages to any subscriber that reconnects
**And** AS-4 (1000-message retention) is met

### Story 2.12: M2 Progress signal — vault-artifact-changed

As Hermes watching for forward motion,
I want a `packages/progress-signal` subscriber that fires `artifact-changed` events when a file in `vault/projects/{project-id}/` changes,
So that vault writes count as progress.

**Acceptance Criteria:**

**Given** Architecture D-4 + `crates/platform-fs` (Rust fs-watcher)
**When** I implement the artifact-changed subscriber
**Then** any create/modify/delete inside `vault/projects/{project-id}/` (recursive) emits an `artifact-changed` event on the bus within 1 second
**And** the event payload includes file path, change type (created/modified/deleted), and timestamp
**And** unit tests cover at least 3 file-system change types

### Story 2.13: M2 Progress signal — project-code-changed

As Hermes watching for forward motion,
I want a `packages/progress-signal` subscriber that fires `code-changed` events when a file in the project's code directory (not the vault) changes,
So that code writes count as progress.

**Acceptance Criteria:**

**Given** Architecture D-4
**When** I implement the code-changed subscriber
**Then** create/modify/delete inside the project's root code directory (excluding `vault/` and `_bmad/`) emits a `code-changed` event within 1 second
**And** event payload includes file path, change type, and timestamp
**And** an ignore list (`.git`, `node_modules`, build outputs) is respected

### Story 2.14: M2 Stall detector — rolling-window algorithm

As Hermes deciding when to intervene,
I want `packages/stall-detector` running a rolling-window algorithm on bus traffic vs. progress signals,
So that I intervene only when there is chatter without progress.

**Acceptance Criteria:**

**Given** Stories 2.12 + 2.13
**When** I implement the rolling-window detector per Architecture D-5
**Then** the detector maintains a configurable window (default 300s — AS-5) counting (a) bus messages and (b) progress-signal events
**And** when `bus-messages-in-window > N && progress-signal-fires == 0` for a sustained sub-window, a `stall-detected` event is emitted on the bus
**And** the threshold `N` is configurable per project; M2 default chosen empirically during Story 2.17
**And** unit tests cover both intervention-firing and no-intervention-with-progress paths

### Story 2.15: M2 Hermes intervention UI prompt

As a solo dev when Hermes intervenes,
I want a clear UI prompt offering me three options (summarize disagreement / arbitrate / propose next step),
So that I can resolve the stall quickly.

**Acceptance Criteria:**

**Given** Story 2.14 (stall detected)
**When** Hermes posts a stall-intervention proposal to the bus
**Then** a non-modal prompt appears in the desktop UI showing: stalled-agents list, last few bus messages, three options ("Summarize" / "Arbitrate" / "Propose next step"), and "Dismiss"
**And** my choice posts a response on the bus that resolves the stall
**And** if I do nothing, the prompt remains until I dismiss it (no auto-action)

### Story 2.16: M2 Telemetry tap — token-count parser per CLI

As the team monitoring costs,
I want `packages/telemetry` parsing each CLI's structured output for per-agent token counts,
So that cost telemetry is in place before M5's budget gates land.

**Acceptance Criteria:**

**Given** Architecture D-11 + the persona supervisor from Story 1.14
**When** I implement parsers for Claude Code and `agy` output streams
**Then** every token-usage event from either CLI is captured, normalized into a workspace event, and persisted to workspace SQLite (D-10)
**And** the captured rows include `{persona_id, ts, input_tokens, output_tokens, model, cost_est_usd}`
**And** a CLI dump (`pnpm telemetry dump --persona dev`) produces a human-readable report
**And** Maurice can verify a known prompt produces expected token counts via the dump

### Story 2.17: M2 Stall-detection — 10-scenario validation corpus

As Maurice validating the M2 exit criterion SM-4,
I want a corpus of ≥ 10 manual test scenarios (mix of "should intervene" + "should not intervene") with expected outcomes,
So that the stall detector's behavior is demonstrably correct on a known set.

**Acceptance Criteria:**

**Given** Stories 2.12 + 2.13 + 2.14 + 2.15
**When** I author the corpus in `tests/manual/m2-stall-scenarios/`
**Then** ≥ 10 scenarios exist, each documenting: setup (what to do), expected detector behavior (intervene or not), why
**And** running each scenario manually produces the expected outcome ≥ 80% of the time on first pass; failures inform threshold tuning (open question OQ-E / OQ-H)
**And** the tuned threshold is recorded in `docs/progress-signal-taxonomy.md` (next story)

### Story 2.18: M2 progress-signal-taxonomy doc + initial pause/redirect action

As a documenter of signal semantics + as Maurice wanting to pause an agent mid-flow,
I want `docs/progress-signal-taxonomy.md` documenting all current and planned signals + a "pause persona" UI action invoking persona-supervisor,
So that the signal vocabulary is shared and pause exists in primitive form.

**Acceptance Criteria:**

**Given** Stories 2.12 + 2.13 + 2.14 + persona-supervisor from Story 1.14
**When** I draft the doc and add the pause action
**Then** `docs/progress-signal-taxonomy.md` documents: list of current signals (artifact-changed, code-changed), planned future signals (story-state-changed in M4), weighting rationale, and the tuned M2 thresholds from Story 2.17
**And** a "pause persona" button per pane in the desktop UI invokes a persona-supervisor IPC call that stops outbound bus posts and CLI input within **≤ 2 seconds** (AS-7)
**And** a "resume persona" complement re-enables both

---

## Epic 3: Dynamic Persona Spawning + BMad Builder + Hermes-Initiated Spawn

**Goal:** Any BMAD persona spawnable on demand, lifecycle persistent or ephemeral, by Hermes or user. ≥ 5 persona types working. Ephemerals leave zero orphans after 100 spawn/exit cycles. Custom personas creatable via BMB. Vault scoping log live.

### Story 3.1: M3 BMad Builder "Add Agent" panel

As a solo dev wanting to add a persona on demand,
I want a featured "Add Agent" UI panel exposing the BMAD persona library + my custom personas,
So that adding a new agent is one click.

**Acceptance Criteria:**

**Given** Architecture D-13 + persona library at `_bmad/bmm/agents/`
**When** I open the Add Agent panel
**Then** I see a list of installed BMAD personas (Analyst, PM, Architect, SM, QA, UX Designer, Tech Writer, Builder, etc.) plus any custom personas from `_bmad/custom/`
**And** picking one opens a configuration row with: persona name (locked), backing CLI dropdown (Claude Code / `agy` / others if registered), model dropdown, lifecycle selector (persistent / ephemeral), "Spawn" button
**And** newly installed BMAD modules appear without app restart (OQ-F resolved here — if a restart is required, document it as a known limitation and surface a "reload library" button)

### Story 3.2: M3 Lifecycle selection — persistent vs ephemeral spawn

As a solo dev about to spawn a dynamic persona,
I want to explicitly pick persistent or ephemeral before the spawn,
So that lifecycle is an intentional choice.

**Acceptance Criteria:**

**Given** Story 3.1
**When** I click "Spawn" without selecting a lifecycle
**Then** the spawn is blocked with a clear error ("Pick persistent or ephemeral")
**And** when I pick one, the spawn proceeds with the chosen lifecycle recorded in the persona's runtime metadata
**And** the multi-terminal view (for persistent) or the bus channel view (for ephemeral) shows the spawned agent with its lifecycle badge

### Story 3.3: M3 Persistent dynamic agent — terminal pane + vault dir + bus identity

As a persistent dynamic agent (e.g., Architect),
I want my own Zellij pane, my own vault dir, and my own bus identity,
So that I'm a full first-class team member.

**Acceptance Criteria:**

**Given** Stories 3.1 + 3.2 + Zellij adapter from Story 2.4
**When** I spawn a persistent Architect persona
**Then** a new Zellij pane appears in the multi-terminal view labeled "Architect"
**And** `vault/personas/architect/` exists with the per-persona log + skills subdirs per Story 1.6 layout
**And** the persona has a unique bus identity (`agent:architect:<uuid>`) and can post/subscribe per the bus protocol

### Story 3.4: M3 Persona-sync (FR-21 backflow + drift detection)

As a developer who edits a tool config directly (e.g., `claude.md` in my editor),
I want the edit to flow back into the canonical persona file in the vault,
So that the canonical source-of-truth is preserved.

**Acceptance Criteria:**

**Given** `packages/persona-sync` (vault → tool-config projection from Story 1.13 + Story 2.3) + Architecture D-6 (last-writer-wins + per-persona conflict log)
**When** I edit `<project-root>/claude.md` directly and save
**Then** within **≤ 30 seconds** (AS-8), the canonical Dev persona file in the vault is updated
**And** if both the vault file and the tool config change simultaneously (within 1000ms debounce), the most-recently-saved wins and the loser is appended to `vault/personas/<persona>/conflict-log.md` with timestamp + the lost content
**And** unit tests cover both directions plus the conflict case

### Story 3.5: M3 Per-persona vault scoping (best-effort write log)

As the workspace tracking persona-scope discipline,
I want `crates/vault-scoping` to log writes outside a persona's scoped dir,
So that scope violations are observable even though enforcement is best-effort.

**Acceptance Criteria:**

**Given** Architecture D-7 + `crates/platform-fs` watcher
**When** a persona attempts to write outside `vault/personas/<persona-id>/` or outside the shared `vault/projects/<project-id>/`
**Then** the write is **not blocked** (per FR-29 best-effort policy)
**And** a log entry is appended to `vault/personas/<persona-id>/out-of-scope-writes.log` with `{ts, attempted_path, write_type}`
**And** the desktop UI surfaces a (configurable) badge on the pane when scope violations occur

### Story 3.6: M3 Ephemeral persona lifecycle — spawn → task → exit cleanly

As a solo dev spawning an ephemeral persona (e.g., Security Reviewer for one PR),
I want it to run its single task, post its output, and exit with zero residue,
So that ephemerals can't leak processes or vault clutter.

**Acceptance Criteria:**

**Given** Stories 3.1 + 3.2 + persona-supervisor + zellij-adapter
**When** I spawn an ephemeral Security Reviewer with a task prompt
**Then** the agent runs to task completion, posts its output as an artifact in `vault/projects/<project-id>/reviews/`, posts a final "task complete" bus message, and exits
**And** after exit: zero orphan processes, no vault directory created for the ephemeral, no bus identity retained
**And** an automated test runs 100 spawn/exit cycles and verifies zero orphan processes (SM-5 cycle test)

### Story 3.7: M3 Hermes-initiated spawn proposal

As Hermes detecting that the work needs a role,
I want to post a spawn proposal to the bus and surface an approval prompt in the UI,
So that the user can act on a one-click choice.

**Acceptance Criteria:**

**Given** Architecture D-3 (bus) + D-2 (spawn) + UI prompt pattern from Story 2.15
**When** Hermes detects a trigger (e.g., a code change touches `auth/`)
**Then** Hermes posts a `persona.spawn.requested` bus message with `{persona_type, suggested_lifecycle, rationale}` (per FR-12)
**And** the desktop UI surfaces an approval prompt showing the proposal text + "Approve / Override / Veto" actions
**And** the proposal expires after a configurable per-proposal window (default: 24 hours) if no action; expiration is logged

### Story 3.8: M3 User approval required before spawn

As a solo dev,
I want any Hermes-initiated spawn to require my explicit approval (no auto-spawning in v1),
So that I retain control.

**Acceptance Criteria:**

**Given** Story 3.7 + decision policy (per FR-13)
**When** Hermes posts a spawn proposal
**Then** no spawn happens until I approve in the UI (or until a per-project auto-approve policy is configured — OQ-D, deferred)
**And** "Override" lets me change CLI / lifecycle / persona type before approving
**And** "Veto" dismisses the proposal and posts a `persona.spawn.vetoed` bus message

### Story 3.9: M3 Promotion path — ephemeral → persistent after 3 spawns

As Hermes noticing a recurring role,
I want to prompt the user to promote a frequently-spawned ephemeral persona type to persistent,
So that the user doesn't have to re-spawn the same role repeatedly.

**Acceptance Criteria:**

**Given** workflow-engine spawn counter (introduced here in Epic 3, used in Epic 4)
**When** the same persona type has been spawned ephemerally ≥ 3 times in one project
**Then** a "Promote to persistent?" prompt appears in the UI with the option to also save the persona as a reusable custom module
**And** if I promote, the persona spawns with persistent lifecycle and reuses the most recent ephemeral's accumulated context (vault dir if any)
**And** if I save as a custom module, the persona file is written to `_bmad/custom/<custom-id>/persona.md`

### Story 3.10: M3 Custom persona authoring via BMad Builder

As a solo dev wanting a "Customer Support Triage" persona that doesn't exist in BMAD,
I want to define a custom persona (name, role, backing CLI, model, tools, personality) via the BMB panel,
So that I can spawn it like any built-in persona.

**Acceptance Criteria:**

**Given** Story 3.1 (BMB panel) + persona-sync (Story 3.4)
**When** I open BMad Builder's "Create Persona" flow
**Then** I can fill in: persona ID (slug), display name, role description, default backing CLI, default model, tools list, personality prompt
**And** on save, a persona file is written to `_bmad/custom/<persona-id>/persona.md` following BMAD's persona-file convention
**And** the new persona appears in the Add Agent panel immediately (no app restart)
**And** the persona can be spawned and exits cleanly (validate via Story 3.6 path)

### Story 3.11: M3 Pause/redirect any persona (extension of Story 2.18)

As a solo dev wanting fine control over any spawned persona,
I want pause + redirect actions on every persona's pane (fixed and dynamic),
So that I can stop or steer at any moment.

**Acceptance Criteria:**

**Given** Story 2.18 (pause for fixed) + persona-supervisor
**When** I click "Pause" on any persona pane in the desktop UI
**Then** the persona-supervisor stops outbound bus posts and CLI input within **≤ 2 seconds** (AS-7)
**And** "Redirect" lets me post a user message to the bus and the persona resumes from there
**And** "Dismiss" terminates the persona (for persistent dynamics — fixed personas can't be dismissed) with zero orphans

---

## Epic 4: One-Click BMAD Workflow Execution

**Goal:** "Start a BMAD project" runs `greenfield-fullstack` end-to-end, producing a working code skeleton + complete BMAD artifacts in one session on 3+ test project ideas. `brownfield` runs on ≥ 1 real test repo. Story-state transitions become the third progress signal.

### Story 4.1: M4 "Start a BMAD project" entry point

As a solo dev,
I want a top-level UI action "Start a BMAD project" that lists available workflows and lets me pick one,
So that I can kick off the headline day-one flow without manual setup.

**Acceptance Criteria:**

**Given** BMAD workflows installed at `_bmad/bmm/workflows/`
**When** I click "Start a BMAD project"
**Then** a chooser appears listing available workflows (at minimum: `greenfield-fullstack`, `brownfield`)
**And** picking one opens a workflow-run setup with: project name, initial idea (free text), workflow-specific options
**And** starting the workflow records the run in workspace SQLite + creates a Paperclip project + creates a vault project directory

### Story 4.2: M4 Workflow engine — phase execution + persona dispatch

As the engine running a workflow,
I want to read the BMAD YAML, execute each phase in order, and spawn the right dynamic personas at each phase,
So that the user flow per UJ-2 actually works end-to-end.

**Acceptance Criteria:**

**Given** Story 4.1 + Epic 3 dynamic spawn primitives
**When** a workflow starts (e.g., `greenfield-fullstack`)
**Then** the engine parses the YAML, walks phases, and at each phase: spawns or activates the required dynamic personas (Analyst → PM → Architect → SM → Dev/QA), surfaces a user-approval gate, waits for artifacts in vault before advancing
**And** every phase boundary posts a `workflow.phase.advanced` bus message
**And** the user can see current phase + which personas are involved in a workflow-status sidebar

### Story 4.3: M4 Workflow approval gates UI

As a solo dev approving each handoff,
I want a clear approval gate per phase with "Approve / Request changes / Pause" actions,
So that the user-in-the-loop pattern is one-keystroke fast.

**Acceptance Criteria:**

**Given** Story 4.2
**When** the engine reaches a phase boundary
**Then** an approval prompt appears with: the current phase output (artifact preview), the proposed next phase, three actions ("Approve and continue" — default-keystroke, "Request changes" — opens dialog, "Pause workflow")
**And** "Approve and continue" advances the workflow immediately on Enter / single click
**And** the gate's choice is logged to `vault/projects/<project-id>/bmad/.workflow-decisions.md`

### Story 4.4: M4 Workflow pause / resume across app restart

As a solo dev who pauses a workflow and reopens the app the next day,
I want to resume the workflow from where I left off,
So that long-running workflows survive natural work rhythms.

**Acceptance Criteria:**

**Given** Story 4.2 + workspace SQLite for run state (D-10)
**When** I pause an active workflow (via the gate UI) and close the app
**Then** the workflow's current phase + persona states + decision log are persisted in workspace SQLite
**And** on reopen, a "Resume workflow?" prompt appears in the UI for that project
**And** clicking resume re-spawns the right personas (per their lifecycle) and reopens the gate UI on the paused phase

### Story 4.5: M4 Progress signal — story-state-changed (third progress signal)

As Hermes watching for forward motion now that workflows write story files,
I want a `story-state-changed` progress signal firing when a story transitions (open → in-progress → review → done),
So that workflow progress counts as forward motion alongside artifact / code changes.

**Acceptance Criteria:**

**Given** workflow-engine writing story files + stall detector from Story 2.14
**When** a story file's frontmatter `status` field changes
**Then** a `story.state.changed` bus message fires within 1 second
**And** the stall detector's weighted-signal aggregation includes this signal in its window
**And** an updated `docs/progress-signal-taxonomy.md` documents the new signal + revised weights

### Story 4.6: M4 brownfield workflow support

As a solo dev with an existing test repo,
I want `brownfield` to ingest it and produce a refactor plan,
So that the workflow engine is demonstrably not single-workflow-only.

**Acceptance Criteria:**

**Given** Story 4.2 (engine) + the `brownfield` YAML
**When** I start `brownfield` on a real test repo
**Then** the engine runs the brownfield phases (ingest → analyze → propose refactor plan)
**And** a refactor plan artifact lands in `vault/projects/<project-id>/bmad/refactor-plan.md`
**And** this is repeated against ≥ 1 real test repo (e.g., a small-medium open-source project Maurice picks) and the result is acceptable

### Story 4.7: M4 End-to-end scenario test — greenfield-fullstack in one session × 3 project ideas

As Maurice validating the M4 exit criterion SM-6,
I want to run `greenfield-fullstack` from a fresh project on three different project ideas in a single work session each,
So that the SM-6 success metric is demonstrable.

**Acceptance Criteria:**

**Given** Stories 4.1–4.6 complete
**When** Maurice runs the full flow 3 times on 3 different test ideas (e.g., "a task-tracking CLI", "a recipe-sharing web app", "a Slack-style chat client")
**Then** each run produces, within a single work session: a working code skeleton (Tauri-app or whatever skeleton applies, not necessarily polished) + complete BMAD artifact set (brief, PRD, architecture, story files, QA reports)
**And** all 3 runs land in `tests/manual/m4-greenfield-runs/`
**And** any run that exceeds one session has a notes file documenting what slowed it down + remediation

---

## Epic 5: Memory, Multi-Machine Continuity, Cross-Platform Distribution

**Goal:** Cross-project memory via opt-in Supermemory; opt-in GitHub sync; round-trip cross-machine continuity (Win → GitHub → macOS → Linux); per-persona budget gates with project-level kill switch; macOS and Linux installers; basic docs site.

### Story 5.1: M5 Project-wide vault formalized

As a developer ensuring vault-tier behavior is correct,
I want `vault/projects/<project-id>/` to be the canonical home for BMAD artifacts + project context,
So that reads/writes from any persona converge on a single project source-of-truth.

**Acceptance Criteria:**

**Given** Story 1.6 layout spec + persona-sync from Epic 3
**When** any persona writes a BMAD artifact (brief, PRD, architecture, etc.) via the workflow engine
**Then** the artifact lands at the canonical path inside `vault/projects/<project-id>/bmad/`
**And** any persona can read the same path; reads are not gated by persona identity (Architecture D-7 best-effort scoping applies only to writes outside scope)

### Story 5.2: M5 Supermemory integration — opt-in per content category

As a solo dev wanting cross-project semantic memory,
I want Supermemory available as an opt-in source, configurable per content category (decisions vs secrets vs personal notes),
So that I can pick what gets indexed.

**Acceptance Criteria:**

**Given** `packages/supermemory-client` skeleton
**When** I open Settings → Memory in the desktop UI
**Then** I see a list of content categories with toggles (default OFF for all): "Decisions", "Architecture artifacts", "Code-review notes", and so on (Maurice approves the exact list)
**And** turning on a category indexes the relevant vault paths to Supermemory; turning off purges those indexed items
**And** credentials for Supermemory live in OS keychain via `packages/credential-storage`

### Story 5.3: M5 Memory tier precedence — docs/memory-precedence.md finalized + read resolver

As a persona reading memory,
I want a documented and implemented precedence rule (persona dir → project vault → Hermes native → Supermemory),
So that reads are deterministic across tiers.

**Acceptance Criteria:**

**Given** Architecture D-8 + `docs/memory-precedence.md` (M3 draft + this story finalizes)
**When** a persona performs a memory read
**Then** the resolver searches tiers in the documented order and returns the first hit
**And** unit tests cover all four tiers with conflicting entries verifying the precedence order
**And** `docs/memory-precedence.md` is updated with the finalized spec

### Story 5.4: M5 GitHub sync — push configs/artifacts/skills/personas

As a solo dev wanting backup or multi-machine work,
I want to push configs, BMAD artifacts, skills, and personalities to GitHub,
So that I have a portable, version-controlled source-of-truth.

**Acceptance Criteria:**

**Given** `packages/github-sync` + credentials in keychain (Story 5.2 pattern)
**When** I configure a GitHub repo for a project and click "Sync"
**Then** the documented synced-set (`docs/sync-policy.md` — produced here too) is committed and pushed to GitHub
**And** the synced-set explicitly excludes local-only categories (per FR-31 model)
**And** the documented synced-set covers: persona files, BMAD artifacts (brief, prd, architecture, stories, qa), custom personas, project settings — but not credentials, not workspace SQLite, not non-opted-in Supermemory content

### Story 5.5: M5 Cross-machine continuity — pull on second machine and resume

As a solo dev with two machines,
I want to install the workspace on a second machine, pull a project's repo, open the project, and have fixed personas spawn + persistent dynamics offered for respawn,
So that round-trip continuity works.

**Acceptance Criteria:**

**Given** Story 5.4 push from machine A + workspace installed on machine B
**When** I clone the repo on machine B and open the project
**Then** fixed personas (Dev + Frontend Designer) spawn automatically per Epics 1+2
**And** a "Persistent dynamic personas from machine A" list appears with respawn buttons per persona
**And** end-to-end round-trip test: Maurice runs `Win → push → pull on Mac → open` AND `Mac → push → pull on Linux → open`, recording results in `tests/manual/m5-round-trip-runs/`

### Story 5.6: M5 Per-persona token budgets

As Maurice managing costs,
I want a per-persona token budget gate that alerts at 80% and auto-pauses the persona at 100%,
So that runaway costs are bounded.

**Acceptance Criteria:**

**Given** telemetry from Story 2.16 + persona-supervisor pause from Story 2.18
**When** I set a per-persona budget (e.g., 100k input tokens per day) in Settings
**Then** the workspace tracks per-persona consumption against the budget in workspace SQLite
**And** at 80% an alert appears in the UI ("Dev: 80k/100k tokens consumed today")
**And** at 100% the persona is auto-paused with a clear UI banner; only Maurice can re-enable it

### Story 5.7: M5 Project-level kill switch

As Maurice when something is going wrong,
I want a "Stop everything in this project now" action,
So that I can halt all agents in one click.

**Acceptance Criteria:**

**Given** persona-supervisor pause for all spawned personas
**When** I click "Stop everything" in the project's settings panel
**Then** every spawned persona in the project is paused; all bus subscriptions for the project are dropped; the workflow engine pauses any active workflow
**And** the UI confirms with a banner: "All personas paused in <project>. Click here to resume."
**And** "Resume" restores everything to its prior state per persona

### Story 5.8: M5 Basic docs site

As a solo dev or potential user finding the workspace,
I want a basic docs site explaining install + first-run + common tasks,
So that the public beta has the doc surface a power-user expects.

**Acceptance Criteria:**

**Given** install flow + first-run flow exist (Epics 1+2)
**When** I build the docs
**Then** a static-site generator (Maurice picks; default is whatever is simplest with current tooling) produces `dist/docs/` with: install guide (Win + Mac + Linux), first-run wizard walkthrough, starting a BMAD project (UJ-2), adding a dynamic persona (UJ-5), creating a custom persona (UJ-6), multi-machine setup (UJ-7), troubleshooting common errors
**And** the site is deployed to a stable URL (Maurice picks; e.g., GitHub Pages on the project's repo)
**And** every milestone's user-visible deliverable has at least one doc page (lagging by one milestone per build plan)

### Story 5.9: M5 macOS installer (.dmg)

As Maurice ready to ship to Mac users,
I want the Tauri build produce a working `.dmg` installer,
So that a clean macOS machine can install the workspace.

**Acceptance Criteria:**

**Given** the monorepo M5-feature-complete + Tauri's macOS bundler
**When** I run `pnpm tauri build` on a macOS build host (or CI matrix runner)
**Then** a `.dmg` is produced in `apps/desktop/src-tauri/target/release/bundle/`
**And** it installs on a clean current macOS without surprises (or with the standard "open from unidentified developer" path, properly notarized once Apple Developer ID is in place — `[NOTE FOR PM]`: signing keys are a side artifact, not a story-blocker)
**And** post-install, the workspace launches and the first-run wizard appears

### Story 5.10: M5 Linux installer (AppImage)

As Maurice ready to ship to Linux users,
I want the Tauri build produce a working AppImage installer,
So that a clean Linux distribution can install the workspace.

**Acceptance Criteria:**

**Given** the monorepo M5-feature-complete + Tauri's Linux bundler
**When** I run `pnpm tauri build` on a Linux build host (or CI matrix runner)
**Then** an AppImage is produced in `apps/desktop/src-tauri/target/release/bundle/`
**And** it runs on at least one current major distribution (Ubuntu 22.04 LTS or 24.04 LTS) without missing system dependencies
**And** post-install, the workspace launches and the first-run wizard appears

---

## Final Validation

### FR Coverage Validation

Every PRD FR (FR-1 through FR-37) maps to at least one story in the FR Coverage Map above. **Zero uncovered FRs.** Stories that extend a primary FR coverage are explicitly numbered as "(extended)" in the map.

### Architecture Implementation Validation

**Starter template setup:** Yes — Architecture specifies `pnpm create tauri-app --template react-ts --manager pnpm 4nevercompany-os`. **Epic 1 Story 1.2** is the canonical "Set up initial project from starter template" story (Story 1.1 is the validating spike that precedes it per architecture D-13/G-1).

**Database/Entity creation:** Workspace SQLite (Architecture D-10) is added in Epic 2 Story 2.11 (for bus retention) and extended in Epic 4 Story 4.4 (for workflow state) and Epic 5 Story 5.6 (for telemetry rollups). Paperclip's embedded Postgres is provisioned in Epic 1 by the bundled installer (Story 1.17) but is not directly modified by workspace stories — it is Paperclip-owned.

### Story Quality Validation

Every story uses Given/When/Then ACs. Each story is sized for a single dev session. No story forward-depends on a later story within the same epic. Cross-epic dependencies are explicit (Epic N references Epic N-1 outputs).

### Epic Structure Validation

- Epics are organized by **user value**, not technical layers. Each epic has a one-sentence "what users can accomplish" goal.
- Epic 1 enables Epic 2; Epics 1+2 enable Epic 3; Epics 1+2+3 enable Epic 4; all enable Epic 5.
- **No epic forward-depends** on a later epic. Epic 2 is functionally complete without Epic 3 (two-fixed-personas product exists). Epic 3 is functionally complete without Epic 4. Epic 4 is functionally complete without Epic 5.
- **File-churn check:** Same packages/crates are touched across multiple epics (e.g., `crates/zellij-adapter` is created in Epic 1 Story 1.11 and extended in Epic 2 Story 2.4 and Epic 3 Story 3.3). This is by design — the spawn primitive grows in capability across milestones, not in tangential ways. Consolidation would force premature complete-from-day-one design.

### Dependency Validation

- **Epic Independence:** Epic 1 stands alone (M1 walking-skeleton product). Epic 2 builds on Epic 1 but does not need Epic 3 to function. Epic 3 builds on Epics 1+2 but does not need Epic 4 to function. Etc.
- **Within-Epic Story Dependencies:** Stories within an epic only depend on previous stories. Example: Epic 1 — Story 1.12 (Dev spawn) depends on Stories 1.10 (credentials), 1.11 (Zellij adapter), 1.9 (Claude Code auth), all earlier. No story forward-references a higher-numbered story within the same epic.

### Acceptance Criteria Completeness

Every story has Given/When/Then ACs that are testable. UX-related details that would normally come from a UX spec are either inline ("visual choice deferred to UI build inline; not a blocker") or marked as out-of-scope-for-AC-text (the user reviews the actual UI build during the milestone).

### Coverage of UX Design Requirements

N/A — no UX-DRs. UX-design stage was explicitly skipped for v1.

### Status

**EPICS-AND-STORIES: COMPLETE.** Ready for `bmad-check-implementation-readiness` re-run (now that epics exist, both previously-BLOCKED steps unblock) and ready for `bmad-create-story` to produce dedicated story files when each story enters its sprint.
