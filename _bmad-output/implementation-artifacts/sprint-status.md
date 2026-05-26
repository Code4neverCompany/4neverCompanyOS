---
title: 4neverCompany OS — Sprint Status (M1)
date: 2026-05-26
generator: bmad-sprint-planning (manual emulation — see methodology note)
sprint: M1 (post-M0)
inputs:
  - _bmad-output/planning-artifacts/epics.md (5 epics, ~60 stories)
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-26.md (verdict: READY)
  - git log on main (commits 75d963f..b576307)
status_legend:
  done: implemented + local validation gates green + committed
  in_progress: actively being executed
  pending: not yet started
  blocked: started but stuck on external dependency
methodology_note: |
  BMAD 6.7 ships bmad-sprint-planning as a catalog entry; the SKILL.md
  is not materialized in this install. This artifact follows the
  catalog description: "Generate sprint status tracking from epics."
  Format mirrors the implementation-readiness-report's frontmatter
  style.
---

# Sprint status — M1

## At a glance

M0 is fully shipped. M1's first batch (1.10–1.14) shipped, plus 1.15 audit-trail and the entire **Story 1.16 (a/b/c/d) — Hermes TUI embedded as a fully bidirectional pane**. Stories 1.17 (NSIS installer), 1.18 (E2E ≤ 10 min), 1.19 (attribution surfaces) close M1.

| Sprint                                      | State          | Notes                                                                                                                                                                                                                |
| ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Foundations**                        | ✅ Done        | Tauri spike + monorepo + CI + LICENSES + pinned-versions all shipped; CI baseline green twice across Win/Mac/Linux × JS+Rust before the GitHub Actions infrastructure incident on 2026-05-26.                        |
| **M1 — Spawn pipeline + first-run**         | 🟡 In progress | First-batch (wizard auth flow, credential storage, vault-layout, Zellij adapter) shipped; spawn pipeline (1.12–1.14) shipped; restart survival (1.15) shipped; **Hermes embedding fully shipped (1.16a/b/c/d) — Story 1.16 closed**; NSIS installer (1.17), E2E (1.18), attribution (1.19) remain. |
| M2 — Frontend Designer + BMad Builder       | ⏸ Not started  | Depends on M1 close-out.                                                                                                                                                                                             |
| M3 — Sentinel + opt-in cross-project memory | ⏸ Not started  | —                                                                                                                                                                                                                    |
| M4 — Polish + onboarding                    | ⏸ Not started  | —                                                                                                                                                                                                                    |
| M5 — Public release                         | ⏸ Not started  | —                                                                                                                                                                                                                    |

## M0 detail

| Story | Title                                        | Status                                 | Commit             |
| ----- | -------------------------------------------- | -------------------------------------- | ------------------ |
| 1.1   | Tauri/WebView2 + Paperclip portal-slot spike | ✅ Done                                | 6bae369 (FINAL GO) |
| 1.2   | Monorepo scaffolding                         | ✅ Done                                | c38dc6a            |
| 1.3   | LICENSES.md license audit                    | ✅ Done (DRAFT pending Maurice review) | 189d95e            |
| 1.4   | pinned-versions.md                           | ✅ Done (DRAFT pending Maurice review) | 189d95e            |
| 1.5   | CI baseline                                  | ✅ Done                                | c38dc6a            |

## M1 detail

| Story | Title                                      | Status          | Commit                          | Notes                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------ | --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.6   | Vault directory layout spec                | ✅ Done         | 2186857                         | `@c4n/vault-layout` helpers + spec v1.0                                                                                                                                                                                                                                |
| 1.7   | Wizard vault location step                 | ✅ Done         | e8bd9f8                         | Browse + scaffold + config persistence                                                                                                                                                                                                                                 |
| 1.8   | Wizard Anthropic API key                   | ✅ Done         | e8bd9f8                         | Real validation vs api.anthropic.com/v1/models                                                                                                                                                                                                                         |
| 1.9   | Wizard Claude Code check                   | ✅ Done         | e8bd9f8                         | `claude --version` via Tauri command                                                                                                                                                                                                                                   |
| 1.10  | Credential storage abstraction             | ✅ Done         | e8bd9f8                         | keyring 3.x; roundtrip test #[ignore] due to Win 11 flake                                                                                                                                                                                                              |
| 1.11  | Zellij adapter — single-pane spawn         | ✅ Done         | 6878e8e                         | spawn_pane / list_sessions / kill / session_exists                                                                                                                                                                                                                     |
| 1.12  | Dev persona spawn on project open          | ✅ Done (1.12a) | a945324 + abf8985               | 6 Tauri commands + ProjectsView UI; embedded-terminal piece (1.12b) deferred to align with 1.14/1.16                                                                                                                                                                   |
| 1.13  | claude.md projection from Dev persona      | ✅ Done         | 00ae101                         | `@c4n/persona-sync/personas/dev.md` + BMAD customize-chain override                                                                                                                                                                                                    |
| 1.14  | Persona supervisor — stdout/stderr capture | ✅ Done         | 568f006 (lib) + b576307 (wired) | JSONL per-day per-persona logs; supervisor binary on PATH                                                                                                                                                                                                              |
| 1.15  | Dev persona survives desktop-app restart   | ✅ Done         | (this commit)                   | Audit-trail story; no behavior change. `#[ignore]` manual-verification test + `docs/restart-survival.md`. Code review PASS (HIGH=0).                                                                                                                                   |
| 1.16  | Hermes TUI embedded as a pane              | ✅ Done         | 1.16a 823b5ff · 1.16b 24645b9 · 1.16c 1e8f043 · 1.16d (this commit) | **All four sub-stories done.** Backend (PTY supervisor + spawn) + display (xterm.js tail) + input (`.pty.in` watcher + `write_persona_pty_in` + `PtyTail.onData`). Story 1.16 is fully complete. 21 c4n-desktop tests pass + 7 supervisor tests + 1 ignored each. |
| 1.16d | Hermes TUI — bidirectional input           | ✅ Done         | (this commit)                                                       | Supervisor `.pty.in` watcher task + `write_persona_pty_in` Tauri command + `PtyTail.onData` → invoke wiring. ~200 LOC. Code review PASS (HIGH=0, MED=0, LOW=1 pre-existing path-traversal note).                                                                                                                  |
| 1.17  | Tauri build → Windows .exe with NSIS       | ⏸ Pending       | —                               | Includes the monogram .ico regen we flagged earlier                                                                                                                                                                                                                    |
| 1.18  | End-to-end scenario test (≤ 10 min)        | ⏸ Pending       | —                               | Depends on 1.16 + 1.17                                                                                                                                                                                                                                                 |
| 1.19  | In-product attribution surfaces            | ⏸ Pending       | —                               | Settings → About + splash + wizard final + LICENSES.md (the file is already there; the UI surfaces aren't)                                                                                                                                                             |

## Open blockers

- **GitHub Actions infrastructure incident (2026-05-26 10:57Z, status: investigating)** — silently drops workflow runs. Affects validation of commits 890ef85..b576307. Local validation gates green; CI verdict pending GitHub recovery. Not blocking development; blocking external CI signal.
- **Tauri auto-regen schema files** (`apps/*/src-tauri/gen/schemas/*.json`) churn on every cargo build and show as modified. Covered by `.gitignore` (`src-tauri/gen/`) but tracked from before the ignore rule landed. `git restore` is the current workaround. Cleanup story: `git rm --cached` all four; one-line follow-up.

## Risks

- **Story 1.16 PTY upgrade scope creep.** The supervisor currently uses raw stdio (intentional 1.14a/b scope). Embedding xterm.js in the Tauri webview will likely require upgrading to `portable-pty` so the terminal sees a real TTY. That's a meaningful complexity bump — flag for breakdown into 1.16a (xterm.js + IPC) + 1.16b (PTY upgrade in supervisor).
- **Production binary distribution for `c4n-persona-supervisor`.** Currently relies on `cargo install --path crates/persona-supervisor` for dev; production needs either Tauri sidecar bundling or the installer-side binary placement. Tied to Story 1.17.

## What's next

This sprint: ✅ **Story 1.16 fully closed** (a/b/c/d all done). Next is **Story 1.17** — Tauri `.exe` via NSIS bundler + multi-res `.ico` regen. After 1.17 the M1-closer stories are 1.18 (E2E ≤ 10 min) and 1.19 (attribution surfaces).

## Change log

| Date       | By                            | Change                                                                                          |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-05-26 | bmad-sprint-planning (manual) | Initial sprint-status artifact at the BMAD-method pivot point.                                  |
| 2026-05-26 | bmad-sprint-planning (manual) | Story 1.15 marked done; code-review PASS verdict captured; next-up updated to Story 1.16 (a/b). |
| 2026-05-26 | bmad-sprint-planning (manual) | Story 1.16c done (display layer + xterm.js); Story 1.16d split for bidirectional input.         |
| 2026-05-26 | bmad-sprint-planning (manual) | Story 1.16d done (bidirectional input). Story 1.16 fully complete. Next-up: Story 1.17.         |
