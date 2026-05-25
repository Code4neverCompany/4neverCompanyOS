---
title: 4neverCompany OS — Product Brief
status: draft
created: 2026-05-25
updated: 2026-05-25
source: docs/4neverCompany_OS_Brief.md (v0.6)
source_companion: docs/4neverCompany_OS_Build_Plan.md (v0.1)
author_role: Analyst (Mary)
project: c4n-4neverCompanyOS
---

# Product Brief: 4neverCompany OS

> This brief is a BMAD-format distillation of the authoritative source brief at `docs/4neverCompany_OS_Brief.md` (v0.6) and its companion build plan at `docs/4neverCompany_OS_Build_Plan.md` (v0.1). Strategic decisions — personas, lifecycle model, fixed-vs-dynamic agents, methodology, tech stack — are locked by the source and are not re-litigated here. Deep architecture, technical stack, user workflows, and risk register live in `addendum.md`. Decisions and gaps are tracked in `.decision-log.md`.

## Executive Summary

**4neverCompany OS** is a packaged desktop workspace — initially a Windows `.exe`, cross-platform to follow — that bundles three existing open-source projects (Paperclip, Hermes Agent, BMAD Method) into a single, locally-installable product. It is not a new orchestrator, not a new methodology, and not a fork: it is the integration layer that makes the existing stack work as one product.

The defining commitment: **two fixed persona agents** (Dev on Claude Code, Frontend Designer on Antigravity CLI) spawn the moment a project opens and stay live; every other persona is **dynamic**, spawned on demand by Hermes or the user via a featured BMad Builder "Add Agent" panel, with each dynamic agent choosing a **persistent** (joins the team) or **ephemeral** (one-shot) lifecycle. Persistent agents run in attachable Zellij terminal panes that survive desktop-app restarts. Agents talk freely on a liberal pub/sub bus; Hermes watches for *progress* on artifacts/code/stories, not chatter, and only intervenes when conversation happens without forward motion.

The friction this product removes is **installation, configuration, methodology onboarding, persona-to-agent wiring, and memory integration** across four moving upstream projects. The product is opinionated, curated, single-binary, local-first.

## The Problem

A working AI-agent development setup today requires the user to manually install and wire together a control plane (Paperclip), an orchestrator (Hermes), a methodology (BMAD), one or more terminal-native coding agents (Claude Code, Antigravity CLI, MiniMax), a terminal multiplexer (Zellij), a local memory store (Obsidian), and optional cloud memory (Supermemory) — then keep each of them pinned, updated, and integrated as four-plus upstreams move fast. Each project is strong on its own; none of them ship as "the workspace." The cost of the status quo: every individual user re-solves the same plumbing problem, and most never get past it.

## The Solution

A single Windows installer that provisions Paperclip + Hermes + BMAD + Zellij + embedded Postgres + Antigravity CLI + Claude Code + Obsidian vault, walks the user through a first-run wizard (model API keys, vault location, OAuth flows), and on first project creation spawns Dev and Frontend Designer into their own attached Zellij panes. From there: BMad Builder is a top-level UI surface for spawning the rest of BMAD's persona library on demand, with explicit persistent-vs-ephemeral lifecycle choice; BMAD's `greenfield-fullstack` workflow runs end-to-end as the day-1 experience; the message bus is visible and liberal; and everything — persona files, BMAD artifacts, skills, configs — lives as version-controlled markdown in the Obsidian vault, optionally GitHub-synced.

## What Makes This Different

- **Two roles always present, every other role on demand.** Mirrors how real teams actually work.
- **One persona = one persistent process = one Zellij terminal.** Real, attachable, durable.
- **Right model behind each role.** Claude Code for Dev, Antigravity CLI/Gemini for Frontend, whatever fits for the rest.
- **Dynamic spawning is a featured UI primitive.** BMad Builder is a top-level panel, not a power-user toggle.
- **Liberal bus with progress-based stall detection.** Chatter is fine if work is happening.
- **Methodology as default day-1 UX.** BMAD ships preinstalled; `greenfield-fullstack` is the headline flow.
- **Config-as-code.** Persona files, artifacts, skills — all markdown, all version-controlled.
- **Local-first memory, optional cloud.** Obsidian is source of truth; Supermemory is opt-in.
- **Single desktop binary.** No browser tabs, no docker-compose, no separate dashboard.

## Who This Serves

> **[GAP — needs PM input]** The source brief does not name explicit user personas. The HANDOFF flags this as a PM-stage blocker. Best inference from the source ("a single user can install in one click", "single-user desktop product", "GitHub-based sync as the only collaboration story for v1"):
> - **Primary persona (inferred):** a solo developer or small-team technical lead who wants an opinionated, locally-runnable AI-agent workspace without assembling four upstream projects themselves.
> - **Secondary persona (inferred):** a methodology-curious practitioner who wants BMAD's structured workflow available as a one-click flow rather than a CLI ritual.
> These are placeholders. PM persona needs the user's explicit answer before producing the PRD.

## Success Criteria

> **[GAP — needs PM input]** The build plan defines "usable v1" as "~24–32 weeks (6–7 months)" but does not state measurable success criteria for the v1 product as a whole. The HANDOFF flags this as a PM-stage blocker. Candidates the source materials *do* state, which the PM can promote, refine, or replace:
> - **M1 exit criterion (install → working Dev agent in a terminal pane) takes under 10 minutes** on a fresh Windows 10/11 machine.
> - **M4 exit criterion** — a clean `greenfield-fullstack` run produces a working code skeleton plus complete BMAD artifacts (brief, PRD, architecture, story files, QA reports) in one work session, on three different test project ideas.
> - **M5 exit criterion** — round-trip cross-machine continuity (Windows → GitHub → macOS → Linux) works with full state preservation.
> No business / adoption / retention metrics are stated in the source. The PM persona should propose at least one user-facing success signal beyond the engineering exit criteria.

## Scope

**In scope for v1 (per source §4 and build plan M1–M5):** Single Windows `.exe` installer; first-run wizard (model keys, vault location, OAuth for Claude Code and Antigravity); preinstalled Paperclip + Hermes + BMAD + Zellij + embedded Postgres; two fixed persona agents (Dev, Frontend Designer) from day one; featured BMad Builder "Add Agent" panel for dynamic persona creation with explicit lifecycle choice; pub/sub message bus with progress-based stall detection and a UI channel view; auto-generated and bidirectionally-synced `claude.md` / `agy.md` / `agent.md`; "Start a BMAD project" flow running `greenfield-fullstack` end-to-end; embedded multi-terminal view (Zellij-powered) per persistent agent; GitHub sync for configs/artifacts/skills/personalities; Supermemory integration as opt-in; macOS and Linux installers landing in M5.

**Out of scope for v1 (per source §8):** Mobile clients; multi-user real-time collaboration with presence; a marketplace for community-published agents/skills/BMAD modules; hosted SaaS tier. Also out of scope by definition: building a competing orchestrator, authoring a competing methodology, forking any bundled upstream.

## Vision

Two- to three-year horizon: 4neverCompany OS becomes the default way an individual or small team runs an AI-agent-driven development practice on their own machine — the "AIO desktop workspace" category leader — sitting alongside terminal-native agent CLIs (Claude Code, Antigravity CLI, MiniMax) and orchestration platforms (Paperclip) as the curated, opinionated layer that turns them into a single product. BMad Builder evolves from a featured UI panel into the de-facto authoring surface for personas, workflows, and modules that flow back upstream as reusable BMAD modules. Memory, configs, and skills as version-controlled markdown become a portable identity the user carries across machines and projects.

---

## Open Questions for the User Before PM Handoff

These are the questions the Analyst surfaces; answering them (or explicitly deferring each one) unblocks the PM persona's PRD work. They are grouped by urgency.

### Tier 1 — Required before PM stage can fully produce the PRD

1. **User persona — primary and secondary.** Best inferences are listed in the brief; please confirm, revise, or replace. Without this the PRD's "who" section is speculative.
2. **Success metrics for "usable v1."** The build-plan engineering exit criteria are listed as candidates; please confirm whether those *are* the success criteria or whether the PM should propose additional user-facing / adoption / retention signals.

### Tier 2 — M0 decisions the build plan defers and the Architect will need

3. **Desktop shell: Tauri vs. Electron.** Build plan recommends a one-day Tauri spike before committing; do you want the spike scheduled in M0, or pre-decide?
4. **Repository structure: monorepo (pnpm workspaces) vs. multi-repo.** Build plan recommends monorepo unless the team is already split across repos.
5. **Upstream version pinning.** Paperclip, Hermes, BMAD, Antigravity CLI, Zellij — each needs a specific pinned tag and an update cadence. Defer to M0 or specify now?
6. **License audit (LICENSES.md).** Paperclip is MIT; Hermes, BMAD, Antigravity CLI, Claude Code, Zellij each need explicit verification of bundling, redistribution, attribution, and commercial-use terms. M0 work — confirm bandwidth in this session or defer to a later one?

### Tier 3 — Team and resourcing the build plan assumes but does not confirm

7. **Team size.** Build plan estimates assume 2–3 engineers (solo work roughly doubles them). Confirm.
8. **Budget envelope.** Implicit in 2–3 engineers × 6–7 months but never stated; confirm or defer.

### Tier 4 — Brand and contribution policy

9. **Attribution copy.** "Powered by Paperclip / Hermes / BMAD / Antigravity" — where does this appear in the product UI, and what is the contribution-back policy for adapters, plugins, personas, BMAD modules?

---

## Validation Findings — Brief vs. BMAD Format

| BMAD Section | Source Brief Maps To | Status |
|---|---|---|
| Executive Summary | §1 Executive Summary | ✓ direct map |
| The Problem | §2 "Why now / why bundle" (implicit) | ✓ reframed |
| The Solution | §1 + §4 MVP Scope | ✓ direct map |
| What Makes This Different | §7 Differentiators | ✓ direct map |
| Who This Serves | — | ⚠ GAP (see open question 1) |
| Success Criteria | build plan exit criteria only | ⚠ GAP (see open question 2) |
| Scope | §4 (in) + §8 (out) | ✓ direct map |
| Vision | §2 Vision & Positioning (partial) | ✓ expanded for 2–3y horizon |

**No strategic decisions in the source brief were redesigned.** Personas (two fixed + dynamic), lifecycle model (persistent vs. ephemeral), methodology choice (BMAD), bus model (liberal with progress-based stall detection), tech stack (Tauri-preferred, Zellij, Obsidian, Supermemory), and v1 scope boundaries are preserved verbatim from v0.6.

**Deep technical content** (full §3 Core Architecture, §5 Technical Stack, §6 Primary User Workflows, §9 Risks & Open Questions, plus the build plan's milestone-level details) has been moved to `addendum.md` per BMAD convention (brief aims at 1–2 pages; depth belongs in the addendum).
