---
title: 4neverCompany OS — Product Brief
status: approved-tier1
created: 2026-05-25
updated: 2026-05-25
source: docs/4neverCompany_OS_Brief.md (v0.6)
source_companion: docs/4neverCompany_OS_Build_Plan.md (v0.1)
author_role: Analyst (Mary)
project: c4n-4neverCompanyOS
tier1_questions_answered: 2026-05-25
tier2_4_questions_status: deferred-to-next-session
---

# Product Brief: 4neverCompany OS

> This brief is a BMAD-format distillation of the authoritative source brief at `docs/4neverCompany_OS_Brief.md` (v0.6) and its companion build plan at `docs/4neverCompany_OS_Build_Plan.md` (v0.1). Strategic decisions — personas, lifecycle model, fixed-vs-dynamic agents, methodology, tech stack — are locked by the source and are not re-litigated here. Deep architecture, technical stack, user workflows, and risk register live in `addendum.md`. Decisions and gaps are tracked in `.decision-log.md`.

## Executive Summary

**4neverCompany OS** is a packaged desktop workspace — initially a Windows `.exe`, cross-platform to follow — that bundles three existing open-source projects (Paperclip, Hermes Agent, BMAD Method) into a single, locally-installable product. It is not a new orchestrator, not a new methodology, and not a fork: it is the integration layer that makes the existing stack work as one product.

The defining commitment: **two fixed persona agents** (Dev on Claude Code, Frontend Designer on Antigravity CLI) spawn the moment a project opens and stay live; every other persona is **dynamic**, spawned on demand by Hermes or the user via a featured BMad Builder "Add Agent" panel, with each dynamic agent choosing a **persistent** (joins the team) or **ephemeral** (one-shot) lifecycle. Persistent agents run in attachable Zellij terminal panes that survive desktop-app restarts. Agents talk freely on a liberal pub/sub bus; Hermes watches for _progress_ on artifacts/code/stories, not chatter, and only intervenes when conversation happens without forward motion.

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

**Primary persona — the solo developer who is also an AI-tooling power user.** They ship side projects on their own, own the whole stack themselves, and already run terminal-native agent CLIs (Claude Code, Antigravity CLI, or similar) as part of their daily flow. They have felt the friction of trying to stitch Paperclip + Hermes + BMAD + Zellij + Obsidian together by hand — installation, configuration, persona-to-agent wiring, memory integration — and want a single locally-installable binary that gives them persistent state, vault memory, and a real orchestrator on top of the agent CLIs they already trust. They care strongly about install speed (the M1 exit criterion of ≤10 minutes from fresh install to a working Dev agent matters to them concretely), about a no-friction `greenfield-fullstack` flow as the day-one win, and about config-as-code so their personas, skills, and BMAD artifacts travel with them as version-controlled markdown.

What "success looks like" for this persona: open the workspace, pick "Start a BMAD project," and within a single work session have a working code skeleton plus the BMAD artifact set (brief, PRD, architecture, story files, QA reports) — without having spent any time on tool plumbing.

> Secondary personas (small-team technical lead onboarding 1–3 teammates; methodology-curious practitioner drawn to BMAD as the headline UX) are **deferred — not selected as primary v1 targets**. The product does not preclude them — GitHub sync supports multi-machine continuity and BMAD is the default day-1 flow — but the PRD's "who" framing is built around the primary above. Revisit in v2.

## Success Criteria

"Usable v1" is defined exclusively by the **engineering exit criteria** stated in the build plan. No user-facing activation, retention, or value/time-saved metrics are part of the v1 success bar; the PM persona is instructed **not** to invent additional metrics on top of the criteria below. (Rationale: this is a curated bundle for a power-user audience; the product's own adoption story is downstream of getting the engineering right.)

The v1 success criteria, in full:

- **M1 — Walking skeleton.** Fresh install on a clean Windows 10/11 machine → completing the first-run wizard → creating a project → having a working Dev/Claude Code agent in a Zellij pane takes **under 10 minutes**. Dev agent persists across desktop-app restarts (Zellij session survives). Vault directory layout is documented and stable.
- **M2 — Two agents + bus.** Dev and Frontend Designer coordinate on a small task end-to-end without crashing. Progress-based stall detection validated against ~10 manual test scenarios (mix of "should intervene" and "should not intervene"). Bus messages survive Paperclip restart. Two idling agents do not burn significant tokens.
- **M3 — Dynamic spawning.** At least five distinct persona types can be spawned successfully (Analyst, PM, Architect, SM, QA at minimum). Ephemeral agents reliably clean up — no orphan processes after 100 spawn/exit cycles. Persistent dynamic agents survive app restart the same as fixed ones. Custom personas can be created and reused across projects via BMad Builder.
- **M4 — Full BMAD workflow.** A clean `greenfield-fullstack` run produces a working code skeleton plus complete BMAD artifacts (brief, PRD, architecture, story files, QA reports) in **one work session**, on at least **three different test project ideas**. `brownfield` runs on at least one real test repo. Workflow can be paused, app closed, reopened later, and resumed cleanly.
- **M5 — Polish + cross-platform.** Three working installers (Windows `.exe`, macOS `.dmg`, Linux AppImage or distro packages) tested clean-install on at least one machine each. **Round-trip cross-machine continuity test passes:** project created on Windows, pushed to GitHub, opened and resumed on macOS, then on Linux, with full state preservation. Supermemory measurably improves Hermes responses on at least one defined cross-project retrieval scenario.

If all five exit criteria pass, v1 is shipped.

## Scope

**In scope for v1 (per source §4 and build plan M1–M5):** Single Windows `.exe` installer; first-run wizard (model keys, vault location, OAuth for Claude Code and Antigravity); preinstalled Paperclip + Hermes + BMAD + Zellij + embedded Postgres; two fixed persona agents (Dev, Frontend Designer) from day one; featured BMad Builder "Add Agent" panel for dynamic persona creation with explicit lifecycle choice; pub/sub message bus with progress-based stall detection and a UI channel view; auto-generated and bidirectionally-synced `claude.md` / `agy.md` / `agent.md`; "Start a BMAD project" flow running `greenfield-fullstack` end-to-end; embedded multi-terminal view (Zellij-powered) per persistent agent; GitHub sync for configs/artifacts/skills/personalities; Supermemory integration as opt-in; macOS and Linux installers landing in M5.

**Out of scope for v1 (per source §8):** Mobile clients; multi-user real-time collaboration with presence; a marketplace for community-published agents/skills/BMAD modules; hosted SaaS tier. Also out of scope by definition: building a competing orchestrator, authoring a competing methodology, forking any bundled upstream.

## Vision

Two- to three-year horizon: 4neverCompany OS becomes the default way an individual or small team runs an AI-agent-driven development practice on their own machine — the "AIO desktop workspace" category leader — sitting alongside terminal-native agent CLIs (Claude Code, Antigravity CLI, MiniMax) and orchestration platforms (Paperclip) as the curated, opinionated layer that turns them into a single product. BMad Builder evolves from a featured UI panel into the de-facto authoring surface for personas, workflows, and modules that flow back upstream as reusable BMAD modules. Memory, configs, and skills as version-controlled markdown become a portable identity the user carries across machines and projects.

---

## Open Questions Status

### Tier 1 — Resolved (2026-05-25)

1. **User persona — RESOLVED.** Primary v1 persona is the solo developer who is also an AI-tooling power user. Small-team technical lead and methodology-curious practitioner are deferred as non-primary for v1. Folded into § "Who This Serves" above.
2. **Success metrics — RESOLVED.** "Usable v1" is defined exclusively by the build-plan engineering exit criteria (M1 through M5). No additional user-facing activation, retention, or value/time-saved metrics for v1; PM is instructed not to add them. Folded into § "Success Criteria" above.

### Tier 2 — Deferred to next session (M0 / Architect-blocking)

3. **Desktop shell: Tauri vs. Electron.** Build plan recommends a one-day Tauri spike before committing; do you want the spike scheduled in M0, or pre-decide?
4. **Repository structure: monorepo (pnpm workspaces) vs. multi-repo.** Build plan recommends monorepo unless the team is already split across repos.
5. **Upstream version pinning.** Paperclip, Hermes, BMAD, Antigravity CLI, Zellij — each needs a specific pinned tag and an update cadence. Defer to M0 or specify now?
6. **License audit (LICENSES.md).** Paperclip is MIT; Hermes, BMAD, Antigravity CLI, Claude Code, Zellij each need explicit verification of bundling, redistribution, attribution, and commercial-use terms.

### Tier 3 — Deferred to next session (team and resourcing)

7. **Team size.** Build plan estimates assume 2–3 engineers (solo work roughly doubles them). Confirm.
8. **Budget envelope.** Implicit in 2–3 engineers × 6–7 months but never stated; confirm or defer.

### Tier 4 — Deferred to next session (brand and contribution policy)

9. **Attribution copy.** "Powered by Paperclip / Hermes / BMAD / Antigravity" — where does this appear in the product UI, and what is the contribution-back policy for adapters, plugins, personas, BMAD modules?

> Tier 2–4 questions are deferred to the next session. The PM persona can begin drafting the PRD using the Tier 1 answers; the Architect persona will need Tier 2 resolved before producing architecture artifacts.

---

## Validation Findings — Brief vs. BMAD Format

| BMAD Section              | Source Brief Maps To                                                             | Status                      |
| ------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| Executive Summary         | §1 Executive Summary                                                             | ✓ direct map                |
| The Problem               | §2 "Why now / why bundle" (implicit)                                             | ✓ reframed                  |
| The Solution              | §1 + §4 MVP Scope                                                                | ✓ direct map                |
| What Makes This Different | §7 Differentiators                                                               | ✓ direct map                |
| Who This Serves           | resolved 2026-05-25: solo dev / AI-tooling power user                            | ✓ filled                    |
| Success Criteria          | resolved 2026-05-25: build-plan engineering exit criteria, no additional metrics | ✓ filled                    |
| Scope                     | §4 (in) + §8 (out)                                                               | ✓ direct map                |
| Vision                    | §2 Vision & Positioning (partial)                                                | ✓ expanded for 2–3y horizon |

**No strategic decisions in the source brief were redesigned.** Personas (two fixed + dynamic), lifecycle model (persistent vs. ephemeral), methodology choice (BMAD), bus model (liberal with progress-based stall detection), tech stack (Tauri-preferred, Zellij, Obsidian, Supermemory), and v1 scope boundaries are preserved verbatim from v0.6.

**Deep technical content** (full §3 Core Architecture, §5 Technical Stack, §6 Primary User Workflows, §9 Risks & Open Questions, plus the build plan's milestone-level details) has been moved to `addendum.md` per BMAD convention (brief aims at 1–2 pages; depth belongs in the addendum).
