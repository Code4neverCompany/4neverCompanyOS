---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - docs/4neverCompany_OS_Brief.md
  - docs/4neverCompany_OS_Build_Plan.md
  - docs/HANDOFF.md
  - _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/brief.md
  - _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/.decision-log.md
  - _bmad-output/planning-artifacts/prds/prd-c4n-4neverCompanyOS-2026-05-25/prd.md
  - _bmad-output/planning-artifacts/prds/prd-c4n-4neverCompanyOS-2026-05-25/.decision-log.md
workflowType: 'architecture'
project_name: 'c4n-4neverCompanyOS'
user_name: 'Maurice'
date: '2026-05-26'
lastStep: 8
status: 'complete'
completedAt: '2026-05-26'
author_role: 'Architect (Winston)'
working_mode: 'Fast path'
locked_strategic_decisions:
  - Two fixed personas (Dev on Claude Code / Claude Opus 4.6 Thinking; Frontend Designer on Antigravity CLI / Gemini 3.1 Pro High)
  - Dynamic persona model with persistent vs ephemeral lifecycle chosen at spawn
  - BMAD as default methodology; BMad Builder featured as top-level UI surface
  - Liberal pub/sub bus over Paperclip events with WebSocket relay to UI; progress-based stall detection (not turn budget)
  - Embedded Zellij multiplexer for persistent-agent panes
  - Embedded Postgres for Paperclip; Obsidian local vault; opt-in Supermemory; opt-in GitHub sync
tier2_resolutions:
  desktop_shell: 'Tauri preferred; M0 spike validates Paperclip React UI in WebView2; Electron fallback only if spike fails (OQ-C)'
  repo_structure: 'monorepo with pnpm workspaces (OQ-I)'
  version_pinning: 'Architect researches current stable tags at M0 start; quarterly cadence (OQ-J)'
  license_audit: 'LICENSES.md is an M0 deliverable (OQ-K)'
---

# Architecture Decision Document

_This document was produced by the Architect persona (Winston) in a single Fast-path pass through bmad-create-architecture's 8-step workflow. The PRD is the authoritative requirements source; this document expands the locked architectural model from source brief §3 into concrete decisions, patterns, structure, and validation. Strategic decisions are not redesigned per HANDOFF._

---

## 1. Workspace setup

See frontmatter for input-document manifest and locked context. The brief workspace + PRD workspace are the upstream artifacts; this architecture.md is the canonical Architect deliverable that the Scrum Master persona (and Dev/QA personas downstream) will source-extract from. UX-design stage was explicitly skipped for v1 — the product is internal-tool / power-user, not consumer; the PRD's UJ-1 through UJ-7 carry the user-facing flow and the Architect picks up the rest.

---

## 2. Project Context Analysis

### Requirements Overview

**Functional Requirements.** 37 FRs grouped into 11 feature groups in the PRD. Architecturally, the FRs cluster into seven concern bands:

| Concern band | FRs | What it means architecturally |
|---|---|---|
| **Provisioning & first-run** | FR-1, FR-2, FR-3 | A bundled installer that lays down all subsystems; a wizard UI; OAuth flows for two upstream CLIs; vault scaffolding |
| **Persona lifecycle (fixed + dynamic)** | FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-14 | A central agent-lifecycle service that knows persona definitions, spawns processes into Zellij, tracks state, cleans up |
| **Persona-discovery & spawn-proposal (Hermes-directed)** | FR-12, FR-13, FR-14 | Hermes can post proposals to the bus; the UI surfaces approval prompts; the lifecycle service acts on user verdict |
| **Inter-agent messaging** | FR-15, FR-16, FR-17, FR-18, FR-19 | A pub/sub bus on Paperclip's events + WebSocket relay to UI; progress-signal aggregator; stall-detection algorithm |
| **Persona-file projection / sync** | FR-20, FR-21 | A bidirectional file-watch loop between vault persona files and CLI-specific tool configs (`claude.md`, `agy.md`, `agent.md`) with conflict rules |
| **Workspace orchestration UI** | FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28 | Tauri desktop shell hosting Paperclip's React UI, embedding Zellij panes, exposing BMad Builder, exposing the workflow engine |
| **Memory & sync** | FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37 | Per-persona scoped vault dirs; opt-in Supermemory; opt-in GitHub sync; cross-platform installers |

**Non-Functional Requirements.** From PRD §10: Performance (idle agent ≤ 300 MB / ≤ 500 input tokens per hour), Reliability (agents survive desktop-app crashes, ephemerals leave zero orphans), Security (sandboxing leans on each CLI's own permission model — workspace does not invent a parallel one), Observability (per-persona token-cost telemetry from M2; structured logs), Resilience to Upstream Churn (reserve ~10% of each milestone for rebases), Headless-Scriptability (all UI actions reachable from CLI).

**Constraints (PRD §11).** Safety (no spawn without lifecycle choice; no silent cost runaway; no surprise bus interventions), Privacy (local-first; opt-in cloud per content category; credentials stay in owning CLI), Cost (liberal bus but bounded agents; per-persona budgets from M2 telemetry; project-level kill switch).

### Scale & Complexity Assessment

- **Project complexity:** **high** — but not enterprise.
- **Primary technical domain:** **desktop application + multi-process orchestration + integration bundle.** Not web, not mobile, not pure backend.
- **Component count (estimated):** ~14 components in the monorepo (see §6 Project Structure) plus 3 vendored upstreams (Paperclip, Hermes, BMAD).
- **Cross-cutting concerns:** version pinning (5 upstreams × quarterly cadence), license compliance, multi-language runtime (TS + Python + Rust + Go binaries), bus protocol stability across feature work, observability and cost telemetry, cross-platform divergence (M5 macOS + Linux).

### Technical Constraints & Dependencies

**Hard constraints (locked, not negotiable):**
1. Two-fixed-personas model (Dev on Claude Code, Frontend Designer on Antigravity).
2. Embedded Zellij for persistent agent panes.
3. Liberal pub/sub bus with progress-based stall detection.
4. BMAD as the bundled methodology.
5. Tauri preferred (M0 spike validates).
6. Monorepo with pnpm workspaces.

**Soft constraints (architect-defined, subject to M0/M2 validation):**
1. AS-2 / AS-3 / AS-6 / AS-7 / AS-8 / AS-9 latency and resource targets (all "initial; Architect may revise at M2 baseline").
2. Quarterly upstream-rebase cadence (per OQ-J).
3. Postgres embedded version (TBD at M0; track Paperclip's preference).

**Upstream dependencies (each with churn risk):**
- Paperclip: control plane + event system. Pinned tag set at M0. *MIT, clear redistribution.*
- Hermes Agent: orchestrator. Pinned tag set at M0. *Licence verified at M0 (OQ-K).*
- BMAD Method: methodology + persona library + workflow YAML. **Currently 6.7.1 in this project.** Pinned via `bmad-method@6.7.1` in `package.json`.
- Antigravity CLI (`agy`): Frontend-Designer backing CLI. *Public preview as of May 2026; RCE issue reported May 2026 — verify state at M2 start before fixed-persona spawn lands.*
- Claude Code CLI: Dev-backing CLI. Anthropic standard channel.
- Zellij: terminal multiplexer. Pinned tag set at M0. **Known weaker PTY handling on Windows historically — spike during M1.**
- Embedded Postgres: track Paperclip's preferred version.

### Cross-Cutting Concerns Mapped

- **Version pinning + rebase rhythm** → owned by Architect; lives in `package.json` (JS-side), `Cargo.toml` (Rust-side), and a separate `pinned-versions.md` doc that tracks non-package-manager pins (Zellij binary, embedded Postgres, Antigravity CLI). Cadence: quarterly.
- **License compliance** → `LICENSES.md` at repo root; updated on every dependency add and at every quarterly rebase.
- **Telemetry & cost tracking** → instrumented from M2; lives in `packages/telemetry`. Per-persona token meter taps each CLI's own usage output (no proxy, no scraping — read each CLI's structured output stream).
- **Sandboxing** → leans on each backing CLI's own permission model; the workspace adds a per-persona vault-write log (FR-29 best-effort enforcement) and a project-level kill switch (M5).
- **Observability** → structured logs (JSON streams); per-persona log file in vault; `hermes`/`paperclipai`/`bmad-method`/`agy`/`claude` all on system path so headless inspection works.

---

## 3. Starter Template Evaluation

### Primary Technology Domain

**Desktop application bundling multiple subsystems**, with these well-known archetypes:
- Tauri desktop shell hosting a React UI (Paperclip's React UI runs inside the Tauri WebView2).
- pnpm-workspace monorepo for cross-package code in TypeScript.
- Rust on the Tauri side for native sidecars (process orchestration, Zellij control, file-watching that out-performs Node's `chokidar` on Windows).
- Python for Hermes (vendored package, run as a sidecar process).
- Go binaries for Zellij and the Antigravity CLI (bundled, not built).

### Starter Options Considered

| Option | Verdict |
|---|---|
| **`create-tauri-app`** with `React + TypeScript + pnpm` template | **Selected.** Official Tauri starter. Establishes the Tauri shell, pnpm-workspace scaffolding, Rust toolchain, and basic dev/build commands. Maps cleanly onto OQ-I monorepo decision. |
| `electron-vite-react` | Fallback if M0 Tauri spike fails (OQ-C). Not selected at outset. |
| `nextra` / `vitepress` / docs-style starters | Not relevant; we are not a docs site. |
| Hand-rolled scaffolding | Rejected — costs M0 days, no upside over the official starter. |

### Selected Starter: `create-tauri-app` (React + TypeScript + pnpm template)

**Rationale.** Official starter from the Tauri team; minimal opinionated baggage; React + TypeScript matches Paperclip's UI stack; pnpm template matches OQ-I. The starter establishes the WebView2-host shell, the IPC bridge between front-end React and back-end Rust, and the Tauri build chain that produces the Windows `.exe` (and later `.dmg` / AppImage).

**Initialization command (M0 first task, after the Tauri/WebView2 spike succeeds):**

```bash
pnpm create tauri-app --template react-ts --manager pnpm 4nevercompany-os
cd 4nevercompany-os
pnpm install
# Then convert into a monorepo by adding pnpm-workspace.yaml + restructuring per §6
```

**Architectural decisions provided by starter:**

- **Language & runtime:** TypeScript on front-end + integration packages; Rust on Tauri sidecars; Python (vendored) for Hermes; Go binaries (bundled) for Zellij and `agy`.
- **Front-end framework:** React 18+ with Vite as build tool (Tauri's default React template); no React Router yet (Tauri shell is single-window with Paperclip's own routing inside).
- **Styling:** **deferred to Paperclip's existing styling solution** — we are hosting Paperclip's React UI, not building our own. Our own panels (BMad Builder Add-Agent, bus channel view, approval prompts) layer on top using whatever Paperclip ships with. Architect re-evaluates at M3 when BMB Add-Agent ships and we need to author cross-Paperclip-UI components.
- **Build tooling:** Vite (front-end), Cargo (Rust sidecars), `tauri build` (final installer). pnpm orchestrates across workspaces.
- **Testing framework:** Vitest (TypeScript), `cargo test` (Rust), pytest (Python for Hermes wrappers). E2E via Playwright at M4+.
- **Linting/formatting:** ESLint + Prettier (TS), `rustfmt` + clippy (Rust), Ruff (Python).
- **Code organization:** pnpm-workspace monorepo (see §6).

**Note:** Project initialization using this command is **the first implementation story** of M1, after the M0 Tauri/WebView2 spike has succeeded.

### Pinned Versions (M0-confirmable pre-baseline pins)

Per OQ-J, the Architect will verify and finalize these at M0 start. Initial pre-baseline pins (Architect updates after M0 research):

| Component | Pre-baseline pin | Source / note |
|---|---|---|
| Node.js | `>=20.0.0` (LTS line) | Brief §5 |
| pnpm | `>=9.15.0` | Brief §5 |
| Tauri CLI | latest 2.x stable at M0 | Re-verified during M0 spike |
| Rust toolchain | stable channel as of M0 | `rust-toolchain.toml` |
| Python | `>=3.11` | For Hermes |
| `bmad-method` | `6.7.1` *(already installed)* | locked in this project's `package.json` |
| Paperclip | TBD at M0 (pin to latest stable tag at M0 start) | Pre-spike via `paperclipai/paperclip` releases |
| Hermes Agent | TBD at M0 (pin to latest stable tag at M0 start) | Pre-spike via `NousResearch/hermes-agent` releases |
| Zellij | latest stable at M0; **verify Windows PTY status before pinning** | Brief §9 calls out the Windows PTY risk |
| Antigravity CLI (`agy`) | **public-preview state must be re-verified at M2 before Frontend-Designer ships**; RCE issue from May 2026 must be confirmed fixed | Brief §9 |
| Embedded Postgres | track Paperclip's preferred version | Brief §5 |
| `webview2-com` (Tauri) | matches Tauri CLI's pinned version | M0 spike will surface compatibility |

Cadence: quarterly rebase (per OQ-J). Each rebase produces a delta entry in `pinned-versions.md` (path: `docs/pinned-versions.md`) with rationale and a smoke-test result.

---

## 4. Core Architectural Decisions

### Already Decided (Don't re-decide these)

From locked brief, locked PRD §4 FRs, Tier 1 + Tier 2 resolutions, and the starter:
- Two fixed personas: Dev / Claude Code + Frontend Designer / Antigravity.
- Dynamic-persona lifecycle model (persistent vs ephemeral).
- BMAD as methodology; BMB featured top-level.
- Liberal bus + progress-based stall detection.
- Embedded Zellij multiplexer.
- Embedded Postgres for Paperclip.
- Obsidian for local vault; Supermemory opt-in; GitHub opt-in.
- Tauri-preferred desktop shell with Electron fallback path.
- Monorepo with pnpm workspaces.
- Quarterly version-pinning cadence.
- LICENSES.md at M0.

### Critical Decisions (block implementation)

**D-1. Tauri↔backend IPC: Tauri commands for synchronous calls, sidecar IPC for streaming.** Synchronous front-end → Rust calls go through Tauri `invoke()` commands. Long-lived streams (bus messages, agent stdout/stderr, file-watch events) use a sidecar IPC channel (Unix socket on macOS/Linux, named pipe on Windows; same shape on both via a thin Rust abstraction). Rationale: Tauri commands are awkward for streams; sidecar IPC keeps the Rust side honest about backpressure. Affects: FR-15 bus, FR-17 UI bus render, FR-22 panes view, FR-26 workflow phases.

**D-2. Persona-agent spawn = Zellij `action new-pane` + child process inside Zellij.** Not direct child process from Tauri. The Rust `zellij-adapter` package owns spawning and supervising. Zellij's session-level persistence is what gives FR-6 / FR-23 their "survive app restart" property. Rationale: re-using Zellij's session-resume is dramatically simpler than building our own. Affects: FR-4, FR-5, FR-6, FR-9, FR-22, FR-23.

**D-3. Message bus implementation = Paperclip events + WebSocket relay + bounded queue per channel.** Bus producers post to Paperclip's existing event system; a Rust `bus-relay` sidecar reads from Paperclip's event stream, broadcasts to subscribed agents (over the IPC channel) and to the desktop UI (over WebSocket). Each channel has a bounded message queue (default 1000 messages — AS-4) for restart-survival. Rationale: leverage Paperclip's existing event system per source brief §3.5; do not build a parallel bus. Affects: FR-15, FR-16, FR-17, FR-18.

**D-4. Progress-signal aggregation = three subscribers in `progress-signal` package, one signal type each.** (a) Vault file-system watcher → emits `artifact-changed` events; (b) project-directory file-system watcher → emits `code-changed` events; (c) **story-state listener** subscribes to Paperclip's story-state-change events → emits `story-state-changed` events (lands at M4 per build plan). Hermes subscribes to all three and runs the stall detector. Rationale: cleanly separable signal sources; M2 lands two and M4 lands the third without surgery. Affects: FR-18.

**D-5. Stall detector = rolling-window algorithm in `stall-detector` package, configurable window + per-signal weight.** A simple algorithm: maintain a rolling window (default 300s — AS-5 / OQ-E) of (bus-message-count, progress-signal-fires). If `bus-message-count > N && progress-signal-fires == 0` within the window, fire intervention. M2 calibrates `N` and the window. Per-signal weights let M4 add the story-state signal without re-tuning the others. Rationale: O(window-size) memory, no ML, deterministic, easy to debug. Affects: FR-18, NFR-Observability.

**D-6. Persona-file ↔ tool-config sync = file-watch loop with last-writer-wins + conflict log.** A Rust `persona-sync` package watches both directions. On file change in either direction, propagate; on simultaneous change (within debounce window — 1000ms), the most-recently-saved wins and the *other* version is appended to a per-persona `conflict-log.md` in the vault. Rationale: hard conflict resolution (3-way merge) is overkill for single-user; last-writer-wins is simple and the conflict log preserves the lost edit for user review. Affects: FR-20, FR-21, OQ-A.

**D-7. Per-persona vault scoping = filesystem path convention + write-attempt logger (best-effort).** Each persistent persona gets `vault/personas/{persona-id}/` as its scope. The `vault-scoping` package monitors writes via fs-watcher; writes outside the persona's scope are logged to a per-persona `out-of-scope-writes.log` (NOT prevented). Hard enforcement is deferred per FR-29 [NOTE FOR PM]. Rationale: matches PRD constraint that enforcement is best-effort per CLI permission model. Affects: FR-29.

**D-8. Memory-tier precedence (OQ-B): explicit per-read with documented defaults.** When a persona reads memory, the resolution order is **(1) persona's own vault dir → (2) project vault → (3) Hermes native memory → (4) Supermemory (if opted-in for that content category).** Writes go to whichever tier the writer intends; Hermes synthesizes across tiers when answering. Documented in `docs/memory-precedence.md` (M3 draft, M5 finalize per OQ-B revisit). Rationale: deterministic, debuggable, matches "local-first" constraint. Affects: FR-32.

**D-9. Credential storage = each CLI's own permission model, no workspace aggregation.** Confirmed per FR-2 [NOTE FOR PM] and OQ-G. Anthropic credentials live in Claude Code's store; Google credentials in Antigravity's store; Supermemory + GitHub credentials in OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service via `keyring` crate on Rust side). Rationale: minimize parallel credential surface; rely on each tool's own audit/revoke flow. Affects: FR-2, NFR-Security.

**D-10. Database = embedded Postgres (matches Paperclip's preference) + a separate SQLite for workspace-only state.** Paperclip uses its embedded Postgres for its own state (companies, projects, goals, agents). The workspace adds a SQLite at `~/.4nevercompanyos/workspace.db` for installer/wizard state, OAuth refresh hints (not the tokens themselves), telemetry rollups, and local cache of bus-message metadata. Migrations: `node-pg-migrate` for Paperclip-side; `sqlx` migrations for SQLite. Rationale: keep workspace concerns out of Paperclip's DB so upstream rebases don't touch our schema. Affects: FR-1 (installer scope), NFR-Observability, NFR-Resilience-to-Upstream-Churn.

### Important Decisions (shape architecture significantly)

**D-11. Telemetry tap = stdout/stderr capture per agent process; structured-event parser per CLI.** Each Claude Code, `agy`, and Hermes process is wrapped in a Rust supervisor that captures stdout/stderr. Per-CLI parsers extract structured events (token counts, errors, model calls). No proxying or upstream patching. Telemetry persists to SQLite. Affects: NFR-Observability, NFR-Performance baselines, FR-31 cost gates at M5.

**D-12. BMAD workflow execution engine = TypeScript service in `workflow-engine` package, reads BMAD YAML, dispatches phases.** Reads the BMAD-installed workflow YAML files from `_bmad/bmm/workflows/`; runs each phase as: (1) check for prerequisite artifacts in vault, (2) propose persona spawn (or activate existing persona), (3) wait for phase artifact in vault, (4) emit phase-completion event. User-approval gates are HTTP endpoints the UI calls. Workflow run state in SQLite. Pause/resume = walk to current phase + replay. Affects: FR-25, FR-26, FR-27, FR-28.

**D-13. UI = Paperclip's React app + workspace-injected panels.** We do not author our own SPA. We host Paperclip's UI in the Tauri WebView2 and inject our panels (BMad Builder Add-Agent, bus channel view, approval prompts, terminal pane view) via a React-portal pattern: Paperclip exposes named portal slots; we provide React components that render into them via `react-dom/portal`. Affects: FR-7, FR-17, FR-22, FR-25. *(Architect note: if M0 spike shows Paperclip's UI doesn't expose portal slots, fall back to injecting via DOM mounts.)*

**D-14. First-run wizard = standalone React app in `apps/wizard`, runs before main shell.** The wizard is its own Tauri window; on completion, it writes config to `~/.4nevercompanyos/config.toml` and the main shell reads it. Skipping or interrupting the wizard leaves config absent; main shell detects and re-runs wizard. Affects: FR-2, FR-3.

**D-15. Cross-platform installer = Tauri's native bundler for each OS.** Tauri's `tauri build` generates `.exe` (NSIS), `.dmg`, and AppImage natively. CI matrix builds all three per release. Code signing: Windows (Authenticode), macOS (notarization), Linux (signed AppImage). Affects: FR-35, FR-36, FR-37.

### Nice-to-Have (defer)

- **N-1.** Custom workflow editor via BMB (post-v1).
- **N-2.** Workflow forking / branching mid-run (post-M4).
- **N-3.** Marketplace for community-published personas / BMAD modules (post-v1).
- **N-4.** Sandbox-grade enforcement of per-persona vault scope (current is best-effort log; hard enforcement is a future story per D-7).

### Decision Impact Analysis

**Implementation sequence (M0 → M5):**

| Milestone | Architectural deliverables (this doc → engineering) |
|---|---|
| M0 | Tauri/WebView2 spike (validates D-13); LICENSES.md (OQ-K); pinned-versions.md (OQ-J); monorepo scaffolding via `create-tauri-app` + pnpm-workspace conversion (OQ-I) |
| M1 | D-1 IPC; D-2 Zellij adapter (Dev only); D-14 wizard; D-9 credential storage; D-10 SQLite addition; OQ-N vault layout spec lands |
| M2 | D-3 bus relay; D-4 progress signals (artifact + code, not story-state); D-5 stall detector v1; D-11 telemetry tap; D-2 extended to Frontend Designer |
| M3 | D-2 extended to dynamic persona library; D-6 persona-sync; D-7 vault scoping log; D-8 memory-tier precedence draft; D-13 BMB Add-Agent portal panel |
| M4 | D-4 + story-state signal; D-5 + story-state weight; D-12 workflow engine |
| M5 | Supermemory integration; GitHub sync; cross-platform installers via D-15; D-8 finalize; per-persona budget gates; project-level kill switch |

**Cross-component dependencies:**
- D-13 (Paperclip portal slots) MUST validate in M0 spike before D-2 / D-3 / D-12 can rely on it.
- D-3 bus relay MUST stabilize in M2 before D-12 workflow engine can use it for handoffs in M4.
- D-4/D-5 progress signals must be calibrated in M2 before M3 stories add the dynamic-persona load that exercises the heuristic at scale.

---

## 5. Implementation Patterns & Consistency Rules

These patterns are for **the team building the product** (TS/Rust/Python/Go code that humans and AI personas write together inside this monorepo). They are **distinct from** anything the product enables its own users' AI personas to do downstream.

### Naming Patterns

**Database (Postgres + SQLite):**
- Tables: `snake_case`, plural (`users`, `agent_spawns`).
- Columns: `snake_case`. Primary key: `id`. Foreign key: `<other_table_singular>_id` (e.g. `user_id`, `project_id`).
- Indexes: `idx_<table>_<columns>` (e.g. `idx_agent_spawns_persona_id`).
- Timestamps: `created_at`, `updated_at`, all UTC, all `timestamptz`.
- Workspace SQLite tables prefixed `ws_` to keep them visually distinct from Paperclip's Postgres tables in shared diagrams.

**HTTP / WebSocket / IPC (where they exist):**
- HTTP endpoint paths: `/api/<resource>/<sub-resource>`, plural resource, kebab-case for multi-word (`/api/persona-spawns/{id}`).
- Path parameters: `{id}` style, not `:id`.
- Query parameters: `camelCase` (matches JS convention, decoded server-side).
- Header names: `X-Workspace-*` prefix for workspace-defined headers.
- WebSocket message types: `dotted.lower` (`bus.message.posted`, `workflow.phase.advanced`).

**TypeScript / React code:**
- Files: `kebab-case.ts` and `kebab-case.tsx`. Component file mirrors the component name in PascalCase: `bmb-add-agent.tsx` exports `BmbAddAgent`.
- Components: `PascalCase`. Hooks: `useCamelCase`. Variables / functions: `camelCase`. Types / interfaces: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Tests: co-located with source as `*.test.ts` / `*.test.tsx`. E2E tests in `tests/e2e/` at workspace root.

**Rust code:**
- Files: `snake_case.rs`. Modules: `snake_case`. Structs / Enums / Traits: `PascalCase`. Functions / variables: `snake_case`. Constants: `UPPER_SNAKE_CASE`.

**Python (Hermes wrappers only):**
- Files: `snake_case.py`. Functions / variables: `snake_case`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.

**Go (not authored by us — Zellij and `agy` are bundled binaries):** their own conventions; we do not write Go in this repo.

### Structure Patterns

**Monorepo organization (pnpm workspaces):**
- `apps/` — runnable applications with their own bundlers (desktop shell, installer-wizard).
- `packages/` — TypeScript packages consumed by `apps/`.
- `crates/` — Rust crates consumed by `apps/desktop` as Tauri sidecars.
- `services/` — vendored upstreams (Paperclip, Hermes, BMAD scripts).
- `tests/` — workspace-level E2E tests.
- `docs/` — design docs and reference materials (existing brief, build plan, this architecture, pinned-versions.md, memory-precedence.md, etc.).
- `_bmad/` and `_bmad-output/` — BMAD framework install + BMAD-produced artifacts (already present from this session).
- `scripts/` — pnpm-script-callable maintenance scripts.

**File-organization rules within a package:**
- `src/index.ts` is the only public entry point. Internal modules are private.
- One concept per file. Co-locate related types with implementation.
- Tests co-located: `foo.ts` ↔ `foo.test.ts`.
- Config (e.g. `tsconfig.json`, `package.json`) at package root.

### Format Patterns

**Internal message envelopes (bus + IPC):**
- Every message has frame: `{ "v": 1, "type": "...", "from": "...", "ts": "ISO-8601", "id": "uuid", "payload": {...} }`.
- `v` is the schema version; bumped only on breaking changes.
- `type` is dotted-lower (see naming above).
- `from` is the agent ID or `"user"` or `"hermes"` or `"system"`.
- `ts` is ISO-8601 UTC.
- `id` is a UUID v4 for de-dup and trace.
- `payload` is type-specific; schemas defined in `packages/core/src/schemas/`.

**HTTP response envelope (where we expose HTTP — wizard's tiny config server + telemetry endpoints):**
- Success: `{ "data": <result> }`.
- Error: `{ "error": { "code": "...", "message": "...", "details": {...} } }`.
- Status codes: `200` success, `400` validation, `401` unauthorized, `403` forbidden, `404` not found, `409` conflict, `429` rate-limited (if we ever rate-limit), `500` server error.

**Date / time:**
- All persisted dates ISO-8601 UTC strings.
- UI renders local with explicit timezone label.

**Boolean / null:**
- Booleans are JSON `true` / `false`.
- Missing-vs-explicit-null: explicit `null` only when "we know it's absent"; missing key when "we didn't observe."

### Communication Patterns

**Event naming on the bus:**
- `dotted.lower` with action in past tense: `persona.spawned`, `workflow.phase.advanced`, `vault.artifact.changed`.
- Two main categories: `*.<changed|advanced|spawned|exited|posted>` (state-change events) vs. `*.requested` (proposals / commands).

**Bus payload schemas:**
- Defined in `packages/core/src/schemas/bus.ts` as Zod schemas, exported as `BusMessage<T>` typed unions.
- All bus producers / subscribers import from `packages/core` — no inline schemas.
- Schema changes require a `v` bump and a migration of stored messages (or a wipe — we are pre-v1).

**State updates (UI):**
- The desktop UI uses Paperclip's existing state-management system for Paperclip-owned state (we don't fight it).
- Our injected panels (BMad Builder, bus view, approval prompts) use **React `useState` + custom hooks reading from the bus WebSocket** — no Redux / Zustand / etc. layered on. Rule of Three before abstraction (Winston's principle): if we end up with three panels duplicating the same store pattern, extract a hook.

### Process Patterns

**Error handling:**
- TypeScript: errors are `Error` subclasses with `code: string` and optional `cause: Error`. Never throw raw strings.
- Rust: `thiserror` for library errors, `anyhow` for application code. Always preserve the cause chain.
- Python (Hermes wrappers): standard exceptions; raise with `from` clause.
- Cross-boundary errors (IPC, bus): always serialize as `{ code, message, details }` per the response envelope; never serialize stack traces in production builds.

**Loading states:**
- UI: panels show a skeleton on initial load; spinner only for inline async actions; "stale data + refreshing" indicator if we have last-known-good but are refetching.
- Agent processes are *long-lived* and the UI shows three states per persona: `spawning` (yellow), `attached` (green), `stalled` (orange — Hermes intervention pending). No spinner for these.

**Retry policy:**
- Bus message delivery: at-least-once from producer to relay; relay deduplicates by `id`.
- HTTP calls (wizard's OAuth callbacks): exponential backoff, max 3 retries, then user-visible failure.
- Filesystem ops: no retry; surface error immediately. Retries hide bugs.

**Logging:**
- Structured JSON to stdout (per process). One log file per persistent persona in `vault/personas/{persona-id}/log/`.
- Levels: `error`, `warn`, `info`, `debug`. Default `info` in production builds, `debug` in dev.
- Every log line has `ts`, `level`, `component`, `message`, `extra` (object).
- No PII in logs unless explicitly tagged with `pii: true` (so retention can drop them).

### Enforcement Guidelines

**All contributors (human or AI persona) MUST:**
1. Use the Glossary terms from PRD §3 verbatim in code symbols and docs. No synonyms.
2. Add a Zod schema to `packages/core/src/schemas/` for any new bus / IPC / HTTP payload.
3. Co-locate tests with source.
4. Bump the schema `v` on any breaking change to a payload.
5. Run `pnpm format && pnpm lint && pnpm test` before commit; CI re-runs them.
6. Update `LICENSES.md` whenever adding a runtime dependency.

**Anti-patterns to avoid:**
- Reaching across package boundaries except via the package's `src/index.ts` exports.
- Putting Paperclip-aware code in `packages/core` (core is upstream-agnostic).
- Hand-rolling JSON envelopes outside `packages/core/src/schemas/`.
- Adding state-management libraries before Rule of Three has fired.
- Spawning agent processes directly from Tauri commands (use `zellij-adapter` always; bypassing it breaks D-2).

---

## 6. Project Structure & Boundaries

### Complete Project Directory Structure

```
4nevercompany-os/
├── README.md
├── LICENSES.md                      # OQ-K — produced at M0
├── package.json                     # workspace root; declares pnpm workspaces, dev tools
├── pnpm-workspace.yaml              # OQ-I — declares apps/*, packages/*, services/*
├── pnpm-lock.yaml
├── tsconfig.base.json               # shared TS config
├── rust-toolchain.toml              # locks the Rust toolchain channel
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .eslintrc.cjs
├── .prettierrc
├── ruff.toml                        # Python linting (for Hermes wrappers)
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + test + build matrix (Windows/Mac/Linux)
│       └── release.yml              # tag-driven release pipeline (D-15)
│
├── apps/
│   ├── desktop/                     # Tauri desktop shell
│   │   ├── src/                     # React UI host (Paperclip injection + workspace panels)
│   │   │   ├── main.tsx
│   │   │   ├── shell/               # Tauri shell-side code
│   │   │   ├── panels/              # workspace-injected React panels (D-13)
│   │   │   │   ├── bmb-add-agent/
│   │   │   │   ├── bus-channel-view/
│   │   │   │   ├── approval-prompt/
│   │   │   │   └── multi-terminal/
│   │   │   └── paperclip-host/      # Paperclip injection harness
│   │   ├── src-tauri/               # Rust sidecars (Tauri-side)
│   │   │   ├── src/
│   │   │   │   ├── main.rs
│   │   │   │   ├── commands/        # Tauri `invoke` handlers (D-1)
│   │   │   │   └── ipc/             # IPC channel for streams (D-1)
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   ├── public/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── wizard/                      # First-run wizard (D-14, FR-2, FR-3)
│       ├── src/
│       ├── src-tauri/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── core/                        # types, Zod schemas, shared utils — upstream-agnostic
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schemas/
│   │   │   │   ├── bus.ts
│   │   │   │   ├── ipc.ts
│   │   │   │   ├── persona.ts
│   │   │   │   ├── workflow.ts
│   │   │   │   └── ...
│   │   │   └── glossary.ts          # exported constants for PRD §3 terms
│   │   ├── tests/
│   │   └── package.json
│   ├── bus-client/                  # TS client for the message bus (D-3)
│   ├── workflow-engine/             # BMAD YAML executor (D-12)
│   ├── persona-sync/                # vault ↔ tool-config sync (D-6, FR-20, FR-21)
│   ├── progress-signal/             # progress-signal subscribers (D-4)
│   ├── stall-detector/              # rolling-window stall detector (D-5)
│   ├── telemetry/                   # token-cost + perf telemetry (D-11)
│   ├── vault-layout/                # vault directory layout spec implementation (OQ-N)
│   ├── credential-storage/          # keychain abstractions (D-9)
│   ├── github-sync/                 # M5 — opt-in GitHub sync (FR-33, FR-34)
│   └── supermemory-client/          # M5 — opt-in Supermemory wrapper (FR-31)
│
├── crates/                          # Rust crates consumed as Tauri sidecars
│   ├── zellij-adapter/              # spawn / supervise Zellij sessions (D-2)
│   ├── bus-relay/                   # bus over IPC + WebSocket (D-3)
│   ├── persona-supervisor/          # wrap each persona process for stdout/stderr capture (D-11)
│   ├── platform-fs/                 # file-watch (chokidar replacement on Rust side)
│   └── vault-scoping/               # per-persona vault write logger (D-7)
│
├── services/                        # vendored upstreams (pinned per OQ-J)
│   ├── paperclip/                   # pinned tag; rebased quarterly
│   ├── hermes/                      # pinned tag; rebased quarterly
│   └── bmad-method/                 # consumed via npm dep in root package.json (currently 6.7.1)
│
├── tests/                           # workspace-level E2E (Playwright at M4+)
│   ├── e2e/
│   │   ├── fixtures/
│   │   └── scenarios/
│   └── manual/                      # M2 stall-detection test corpus
│
├── docs/
│   ├── 4neverCompany_OS_Brief.md           # source (locked, do not modify)
│   ├── 4neverCompany_OS_Build_Plan.md      # source (locked, do not modify)
│   ├── HANDOFF.md                          # protocol (locked)
│   ├── pinned-versions.md                  # OQ-J output; updated quarterly
│   ├── memory-precedence.md                # OQ-B; M3 draft → M5 finalize
│   ├── vault-layout.md                     # OQ-N; M1 deliverable
│   ├── progress-signal-taxonomy.md         # M2 follow-up artifact per build plan
│   ├── bus-protocol-schema.md              # M2 follow-up artifact per build plan
│   └── first-run-wizard-spec.md            # M1 follow-up artifact per build plan
│
├── _bmad/                           # BMAD framework install (already present)
├── _bmad-output/                    # BMAD artifacts: briefs, prds, architecture
│
└── scripts/
    ├── dev.sh                       # run desktop + wizard locally
    ├── build-installer.sh           # tauri build wrapper
    └── pin-upstream-versions.sh     # M0 + quarterly rebase helper
```

### Architectural Boundaries

**Tauri front-end (TypeScript) ↔ Tauri back-end (Rust):**
- Synchronous calls: `invoke('command-name', args)` → Tauri command in `apps/desktop/src-tauri/src/commands/`. (D-1)
- Streaming: Tauri front-end opens an IPC subscription to the bus-relay sidecar via `apps/desktop/src-tauri/src/ipc/`. (D-1)

**Workspace ↔ Paperclip:**
- Paperclip's React UI is hosted inside the Tauri WebView2.
- Workspace panels inject via Paperclip's portal slots (D-13). If slots are not exposed at M0, fall back to DOM mounts (less clean, more brittle, but unblocks M1).
- Workspace reads from Paperclip's event system via the `bus-relay` crate (D-3).
- Workspace does **not** write to Paperclip's database directly. Any state we need is in workspace SQLite (D-10).

**Workspace ↔ Hermes:**
- Hermes runs as a sidecar process; the workspace wraps it via `persona-supervisor` crate.
- Hermes exposes its existing TUI (FR-24); workspace embeds it in a Zellij pane.
- Workspace contributes proposals to the bus that Hermes can react to (FR-12).

**Workspace ↔ Zellij:**
- Single owner: `zellij-adapter` crate. All spawn / attach / detach / kill flows go through it.
- Persistence is Zellij-native: we use Zellij sessions, not our own session abstraction (D-2).

**Workspace ↔ Obsidian:**
- Obsidian manages the vault directory; we treat the vault as a filesystem. We do **not** call Obsidian's API.
- File-watching is via `platform-fs` crate (Rust-side fs-watcher), not Obsidian plugins.

**Workspace ↔ Supermemory / GitHub (M5):**
- Both are opt-in per content category (FR-31, FR-33).
- Credentials in OS keychain via `credential-storage` package (D-9).
- Local-only content never reaches either (NFR-Privacy).

### Requirements → Structure Mapping

| FR group | Lives in |
|---|---|
| FR-1 / FR-2 / FR-3 (installer + wizard) | `apps/wizard/`, `scripts/build-installer.sh`, `crates/credential-storage/` |
| FR-4 / FR-5 / FR-6 (fixed personas) | `crates/zellij-adapter/`, `crates/persona-supervisor/`, `apps/desktop/src/shell/` |
| FR-7 / FR-8 / FR-9 / FR-10 / FR-11 / FR-14 (dynamic personas, BMB) | `apps/desktop/src/panels/bmb-add-agent/`, `packages/persona-sync/` |
| FR-12 / FR-13 (Hermes-initiated spawn) | `apps/desktop/src/panels/approval-prompt/`, `packages/bus-client/` |
| FR-15 / FR-16 / FR-17 (bus) | `crates/bus-relay/`, `packages/bus-client/`, `apps/desktop/src/panels/bus-channel-view/` |
| FR-18 (progress + stall detection) | `packages/progress-signal/`, `packages/stall-detector/` |
| FR-19 (user pause / redirect) | `apps/desktop/src/panels/bus-channel-view/`, `crates/persona-supervisor/` |
| FR-20 / FR-21 (persona-file sync) | `packages/persona-sync/`, `crates/platform-fs/` |
| FR-22 / FR-23 (multi-terminal view) | `apps/desktop/src/panels/multi-terminal/`, `crates/zellij-adapter/` |
| FR-24 (Hermes TUI embedded) | `apps/desktop/src/panels/multi-terminal/` (Hermes TUI is one of the panes) |
| FR-25 / FR-26 / FR-27 / FR-28 (workflow execution) | `packages/workflow-engine/`, `apps/desktop/src/panels/` |
| FR-29 / FR-30 (vault scoping + layout) | `crates/vault-scoping/`, `packages/vault-layout/`, `docs/vault-layout.md` |
| FR-31 (Supermemory opt-in) | `packages/supermemory-client/` |
| FR-32 (memory tier precedence) | `docs/memory-precedence.md`, `packages/core/` |
| FR-33 / FR-34 (GitHub sync) | `packages/github-sync/` |
| FR-35 / FR-36 / FR-37 (cross-platform installers) | `scripts/build-installer.sh`, `.github/workflows/release.yml`, Tauri's bundler |

### Integration Points

**Internal communication:**
- IPC (sync calls): Tauri `invoke()`.
- IPC (streams): Unix socket / named pipe, framed as JSON-lines, schema in `packages/core/src/schemas/ipc.ts`.
- Bus: pub/sub over Paperclip events + WebSocket relay; schema in `packages/core/src/schemas/bus.ts`.
- File system: watched by `platform-fs` crate; events flow into `progress-signal` subscribers.
- Database: Paperclip Postgres for Paperclip state; workspace SQLite for workspace state (D-10).

**External integrations:**
- **Anthropic API** via Claude Code CLI (credentials in Claude Code's store, D-9).
- **Google API** via Antigravity CLI (credentials in `agy`'s store, D-9).
- **Supermemory API** (opt-in, M5).
- **GitHub** (opt-in, M5; uses GitHub CLI or libgit2 via Rust).

**Data flow:**
- User input → Tauri UI → IPC → backend service → file system / Postgres / SQLite → event → bus → UI updates.
- Agent output → process stdout/stderr → `persona-supervisor` → telemetry SQLite + bus + log file in vault → UI.

---

## 7. Architecture Validation

### Coherence Validation

**Decision compatibility.** All ten critical decisions (D-1 through D-10) and five important decisions (D-11 through D-15) compose cleanly:
- D-1 IPC pattern feeds D-3 bus relay and D-12 workflow engine on the streaming side.
- D-2 Zellij adapter is the sole spawn path for D-7 vault scoping and D-11 telemetry tap (both wrap persona processes).
- D-3 bus relay is consumed by D-4 progress signals, D-5 stall detector, D-12 workflow engine, and D-13 UI panels.
- D-6 persona-sync depends on `platform-fs` (Rust), the same crate D-4's vault watcher uses — single fs-watch implementation.
- D-8 memory precedence is read by Hermes (via D-3 bus subscriber) when answering — no parallel resolver lives in personas.
- D-13 (Paperclip portal injection) is the **biggest single coherence dependency** — if Paperclip's UI doesn't cooperate, D-13's fallback path (DOM mounts) kicks in but everything downstream still works.

**Pattern consistency.** §5 patterns align with §4 decisions:
- Bus message envelope (§5 format patterns) implements D-3 bus + D-1 IPC frame.
- Bus event naming (§5 communication patterns) used by D-4 progress signals, D-5 stall detector, D-12 workflow engine.
- Error handling (§5 process patterns) used uniformly across Rust crates and TS packages.

**Structure alignment.** §6 monorepo structure supports every decision:
- Each crate / package has exactly one Architectural Decision as its primary motivation (see Requirements → Structure mapping).
- Cross-cutting concerns (`packages/core` schemas, `crates/platform-fs` fs-watch) live in dedicated packages, not duplicated.
- Vendored upstreams in `services/` keep upstream rebase work isolated.

### Requirements Coverage Validation

| PRD FR | Coverage in this doc | Status |
|---|---|---|
| FR-1 installer | D-15, `scripts/build-installer.sh`, `apps/wizard` | ✓ |
| FR-2 wizard credentials | D-9, D-14, `crates/credential-storage` | ✓ |
| FR-3 vault location | D-14, OQ-N spec in `docs/vault-layout.md` | ✓ (depends on OQ-N landing at M1) |
| FR-4 / FR-5 / FR-6 fixed personas | D-2, `crates/zellij-adapter`, `crates/persona-supervisor` | ✓ |
| FR-7 BMB panel | D-13, `apps/desktop/src/panels/bmb-add-agent` | ✓ (depends on D-13 portal slots — fallback path exists) |
| FR-8 / FR-9 / FR-10 lifecycle | D-2, D-7, `packages/core` lifecycle types | ✓ |
| FR-11 custom personas | `packages/persona-sync`, `_bmad/custom/` | ✓ |
| FR-12 / FR-13 Hermes-initiated | D-3 (Hermes posts proposals via bus), `apps/desktop/src/panels/approval-prompt` | ✓ |
| FR-14 promotion path | `packages/workflow-engine` tracks ephemeral spawn count per persona type | ✓ |
| FR-15 / FR-16 / FR-17 bus | D-3, `crates/bus-relay`, `packages/bus-client` | ✓ |
| FR-18 stall detection | D-4, D-5, `packages/progress-signal`, `packages/stall-detector` | ✓ |
| FR-19 user pause / redirect | `crates/persona-supervisor` exposes pause; `packages/bus-client` handles redirect | ✓ |
| FR-20 / FR-21 sync | D-6, `packages/persona-sync` | ✓ |
| FR-22 / FR-23 / FR-24 multi-terminal | D-2, `apps/desktop/src/panels/multi-terminal` | ✓ |
| FR-25 / FR-26 / FR-27 / FR-28 workflows | D-12, `packages/workflow-engine` | ✓ |
| FR-29 / FR-30 vault scope | D-7, OQ-N spec | ✓ |
| FR-31 Supermemory | `packages/supermemory-client` | ✓ |
| FR-32 memory precedence | D-8, `docs/memory-precedence.md` | ✓ (M3 draft / M5 finalize) |
| FR-33 / FR-34 GitHub sync | `packages/github-sync` | ✓ |
| FR-35 / FR-36 / FR-37 installers | D-15, Tauri bundler, CI release workflow | ✓ |

**NFR coverage:**
- NFR-Performance (≤300 MB / ≤500 input tokens per hour idle): instrumented via D-11 telemetry; baselined at M2.
- NFR-Reliability: D-2 (Zellij session-resume), D-10 (workspace SQLite for run state), `crates/persona-supervisor` (clean ephemeral exit).
- NFR-Security: D-9 (credentials per CLI), D-7 (best-effort vault scoping), formal security review between M3 and M4.
- NFR-Observability: D-11 telemetry tap; structured logs per process; per-persona log file in vault.
- NFR-Resilience-to-Upstream-Churn: OQ-J quarterly rebase; vendored `services/`; workspace SQLite isolates workspace schema from Paperclip schema (D-10).
- NFR-Headless-Scriptability: all CLIs on system path; HTTP endpoints for wizard config and workflow control are documented.

**Constraints coverage:**
- Safety: D-8 (lifecycle gate at spawn), D-11 (cost telemetry from M2), project-level kill switch at M5.
- Privacy: D-9 (no credential aggregation), FR-31 (opt-in Supermemory per category), FR-33 (opt-in GitHub).
- Cost: D-11 (per-persona token meter), per-persona budgets at M5.

### Implementation Readiness

**Decision completeness:**
- All 15 decisions documented with versions (where applicable) and rationale.
- Each FR has a delivering crate / package.
- Each OQ has an owning decision or is parked with a clear revisit (memory precedence, vault layout, auto-approve policy, hot-load vs reload).

**Structure completeness:**
- Complete project tree at §6 with every directory and key file.
- Component boundaries explicit (Tauri front/back, Workspace ↔ Paperclip / Hermes / Zellij / Obsidian).
- Requirements → Structure mapping covers every FR.

**Pattern completeness:**
- Naming, structure, format, communication, process patterns all defined.
- Anti-patterns enumerated.
- Enforcement guidelines listed for both human and AI contributors.

### Gap Analysis

**Critical gaps (block implementation): NONE.** All Tier 1 + Tier 2 questions resolved. D-13's risk (Paperclip portal slots) is mitigated by a documented fallback (DOM mounts).

**Important gaps:**
- **G-1.** D-13 Paperclip portal-slot validation must succeed in the M0 spike. If it fails, we exercise the DOM-mount fallback path and the architecture stands; if both fail, we re-evaluate UI strategy. Owner: Architect at M0.
- **G-2.** OQ-N vault layout spec is referenced everywhere (FR-3, FR-29, FR-30, D-7, D-8) but the spec itself lands at M1. Until it lands, downstream package skeletons can be stubbed but their internals are blocked. Owner: PM + Architect, M1.
- **G-3.** Antigravity CLI public-preview state must be re-verified at M2 start before Frontend-Designer spawn ships. RCE issue from May 2026 must be confirmed fixed. Owner: Architect at M2 start.
- **G-4.** OQ-E stall-window default value is intentionally tunable at M2. Until M2 telemetry runs, FR-18's "default" is a placeholder. Owner: PM + Architect at M2.

**Nice-to-have gaps:**
- **G-5.** OQ-D Hermes auto-approve policy specifics (M3 detail design).
- **G-6.** OQ-F hot-load vs. reload of newly installed BMAD modules (M3 detail design).
- **G-7.** N-4 sandbox-grade vault scoping enforcement (post-v1).

### Validation Issues Addressed

Issues found during validation and resolved in this document:
- **Resolved:** D-13 portal-slot dependency mitigated with explicit fallback (DOM mounts).
- **Resolved:** D-10 added to separate workspace state from Paperclip state — protects upstream rebases.
- **Resolved:** OQ-G credential storage policy made concrete in D-9.
- **Resolved:** OQ-B memory precedence given a concrete order in D-8 (M3 draft, M5 finalize).
- **Resolved:** OQ-A persona-sync conflict rules made concrete in D-6 (last-writer-wins + per-persona conflict log).
- **Resolved:** OQ-N elevated from a follow-up artifact phrase to a concrete deliverable in `docs/vault-layout.md` (M1).

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed (§2)
- [x] Scale and complexity assessed (§2)
- [x] Technical constraints identified (§2)
- [x] Cross-cutting concerns mapped (§2)

**Architectural Decisions**
- [x] Critical decisions documented with versions (§3 + §4)
- [x] Technology stack fully specified (§3)
- [x] Integration patterns defined (§4 + §6)
- [x] Performance considerations addressed (NFR-Performance + D-11)

**Implementation Patterns**
- [x] Naming conventions established (§5)
- [x] Structure patterns defined (§5)
- [x] Communication patterns specified (§5)
- [x] Process patterns documented (§5)

**Project Structure**
- [x] Complete directory structure defined (§6)
- [x] Component boundaries established (§6)
- [x] Integration points mapped (§6)
- [x] Requirements to structure mapping complete (§6)

### Architecture Readiness Assessment

**Overall status: READY WITH MINOR GAPS.** All 16 checklist items are `[x]` and no Critical Gaps remain, but four Important Gaps (G-1 D-13 portal spike, G-2 vault layout spec landing at M1, G-3 Antigravity preview re-verification, G-4 stall-window M2 calibration) have explicit owners and revisit milestones. None of them block M0 work.

**Confidence level: high.** The architecture preserves every locked strategic decision, gives every PRD FR a concrete delivering package/crate, and lays out a clean cross-cutting story for telemetry, security, privacy, and cost. The M0 spike (G-1) is genuinely a spike, not a gamble — both the success path and the fallback path are described.

**Key strengths:**
- Single ownership of fs-watch and Zellij spawn (one crate each); no duplicated implementations.
- Workspace SQLite (D-10) isolates our state from Paperclip's — major resilience win for upstream rebases.
- Telemetry pattern (D-11) reuses each CLI's own structured output; no upstream patching.
- Last-writer-wins + conflict log (D-6) avoids 3-way-merge complexity while preserving the lost edit.
- Bus envelope versioning (`v` field) gives a clean migration path when payload shapes change.

**Areas for future enhancement:**
- N-4: hard sandbox enforcement of vault scoping (post-v1).
- Workflow forking / branching mid-run (post-M4).
- Custom workflow authoring via BMB (post-v1).
- Marketplace for community-published personas (post-v1).

### Implementation Handoff

**AI Agent / Human Implementer Guidelines:**
- Follow every locked strategic decision (frontmatter: `locked_strategic_decisions`) and every architectural decision in §4 exactly as documented.
- Use implementation patterns from §5 consistently; the enforcement guidelines spell out the bar.
- Respect project structure and boundaries from §6.
- For any question this document does not answer, raise it as a new OQ — do not invent.

**First implementation priority (M0):**
1. **Tauri/WebView2 spike** — validate Paperclip's React UI hosts cleanly (D-13). Time-box: one day. Output: spike-report.md with go/fallback decision.
2. **LICENSES.md** — bundling rights, redistribution, attribution, commercial-use for every component (OQ-K).
3. **pinned-versions.md** — concrete tags for every upstream (OQ-J).
4. **Monorepo scaffolding** via `pnpm create tauri-app --template react-ts --manager pnpm 4nevercompany-os` → convert to pnpm-workspace per §6.
5. **CI baseline** (.github/workflows/ci.yml) — lint + typecheck + test on Windows/Mac/Linux matrix.

After M0, M1 work begins per PRD Release Plan.

---

## 8. Completion

The architecture is complete and ready for Scrum Master handoff. The SM persona will source-extract from this document to produce the epics-and-stories listing.

**What was achieved:**
- Every PRD FR has a concrete delivering crate/package, documented in §6.
- Every locked strategic decision preserved verbatim and threaded through §3–§6.
- Every Tier 2 question resolved in the frontmatter and §3–§4.
- Three Tier 1 / Tier 2 questions remained at PRD level (OQ-L team size + budget, OQ-M attribution + contribution-back) — these are not blocking for the SM persona; they surface again in sprint planning.
- 15 architectural decisions (10 critical, 5 important), 4 implementation pattern categories, complete monorepo tree, validation checklist passed with READY WITH MINOR GAPS.

**Recommended next steps in the BMAD chain (per `bmad-help` routing):**
1. **`bmad-create-epics-and-stories`** (Scrum Master persona — Bob) — break PRD FRs + Architecture decisions into epics and stories ready for Dev execution.
2. **`bmad-create-story`** — produces individual story files. First story should be the Tauri/WebView2 spike from M0.
3. **`bmad-check-implementation-readiness`** — once epics, stories, PRD, architecture are all in place, sanity-check alignment.
4. Then begin M0: Tauri spike → LICENSES.md → pinned-versions.md → monorepo scaffolding → CI baseline.

This document is the canonical architectural source-of-truth for the project from this point forward.
