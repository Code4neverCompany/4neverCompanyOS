# M4 Story 4.7 — E2E Scenario Test: greenfield-fullstack × 3 ideas
# Validates exit criterion SM-6: clean greenfield-fullstack run produces
# working code skeleton + complete BMAD artifact set in one session on
# three different test project ideas.

## Project Ideas

| Run | Project | Description |
|-----|---------|-------------|
| 1 | Task-tracking CLI | A terminal-based task/project tracker with persistent storage (SQLite), command-line interface, subcommands (add/list/done/delete), date deadlines, and tag support. |
| 2 | Recipe-sharing web app | A multi-user web app for sharing recipes with search, categories, ingredient lists, step-by-step instructions, ratings, and user accounts. |
| 3 | Slack-style chat client | A real-time chat application with channels, direct messages, user presence indicators, file attachments, and a persistent message history. |

## Protocol

### Prerequisites
- Desktop app running with Tauri dev build or release build
- Vault configured (Obsidian vault path set in wizard)
- Claude API key configured (ANTHROPIC_API_KEY or wizard OAuth)
- Paperclip instance running with the workspace OS
- `greenfield-fullstack` workflow visible in the WorkflowsView chooser

### Per-Run Steps

1. **Launch the desktop app** — confirm vault path and API key are configured.
2. **Open the Workflows rail** — click "Start a BMAD project" entry point.
3. **Select `greenfield-fullstack`** from the chooser.
4. **Enter project name and idea** (see per-run idea below).
5. **Click Start** — the engine begins phase 1 (Brief/Analyst).
6. **Wait for artifact** — the vault artifact `01-brief.md` appears at the expected path.
7. **Review the ApprovalGate** — read the brief content, click Approve (or Request Changes with feedback).
8. **Repeat** for each subsequent phase: Plan → Architecture → Solutioning → Implementation → QA.
9. **Capture run artifacts** — copy the full `vault/projects/<project-id>/bmad/` directory tree into `tests/manual/m4-greenfield-runs/run-<N>-<slug>/`.
10. **Verify all artifacts exist** (see checklist below).
11. **Tear down** — close the workflow run; optionally close and reopen the app to confirm the resume prompt does NOT appear (run is done).

### Per-Run Idea Text

**Run 1 — Task-tracking CLI**
> Build a terminal-based task tracker. Users can add tasks with deadlines and tags, list open tasks, mark them done, and delete them. Data persists in a local SQLite file. Subcommands: `task add <description> --due <date> --tag <tag>`, `task list`, `task done <id>`, `task delete <id>`. Colorized output. Auto-generated help.

**Run 2 — Recipe-sharing web app**
> A multi-user recipe sharing platform. Features: user registration/login, recipe CRUD with photos, ingredient lists with quantities, step-by-step instructions, category browsing, full-text search, ratings and reviews, and a "saved recipes" bookmark feature. Tech stack: React frontend, Node.js/Express API, PostgreSQL database, JWT auth.

**Run 3 — Slack-style chat client**
> A real-time team chat application. Features: persistent channels and direct messages, real-time message delivery via WebSockets, user online/offline presence, file/image attachments, message search, threaded replies, and message reactions. Tech stack: React frontend, Node.js with Socket.io backend, PostgreSQL for message storage.

## Artifact Checklist (per run)

Each run must produce ALL of the following artifacts:

```
vault/projects/<id>/bmad/
├── 01-brief.md              ✅ Present and non-empty (> 200 chars)
├── 02-prd.md                ✅ Present and non-empty (> 500 chars)
├── 03-architecture.md       ✅ Present and non-empty (> 500 chars)
├── 04-solutioning.md        ✅ Present and non-empty (> 300 chars)
├── 05-implementation.md      ✅ Present and non-empty (> 200 chars)
├── qa-report.md             ✅ Present and non-empty (> 200 chars)
└── stories/
    └── *.md                 ✅ At least 2 story files present
```

Additionally:
- Implementation phase produces at least one code file in the project directory
- All approval gates were clicked (Approve or Request Changes — both count)
- Workflow reached `done` status (final phase completed or user dismissed)

## SM-6 Success Criteria

- [ ] Run 1 (task-tracking CLI): all 6 artifacts + story files + code produced
- [ ] Run 2 (recipe-sharing app): all 6 artifacts + story files + code produced
- [ ] Run 3 (Slack-style chat): all 6 artifacts + story files + code produced
- [ ] Each run completed in a single session without crash
- [ ] Pause/resume tested (close app mid-workflow, reopen, resume — from Story 4.4)
- [ ] brownfield run produces `refactor-plan.md` (Story 4.6, separate from these 3 runs)

## Run Documentation Template

For each run, create `run-<N>-<slug>/RESULTS.md`:

```markdown
# Run <N>: <Project Name>

**Date:** YYYY-MM-DD
**Run duration:** HH:MM
**Persona phases completed:** Brief → Plan → Architecture → Solutioning → Implementation → QA
**Approval gates:** [Approve / Request Changes per phase]

## Artifacts

| Artifact | Path | Status | Notes |
|----------|------|--------|-------|
| 01-brief.md | vault/projects/<id>/bmad/01-brief.md | ✅/❌ | |
| 02-prd.md | vault/projects/<id>/bmad/02-prd.md | ✅/❌ | |
| 03-architecture.md | vault/projects/<id>/bmad/03-architecture.md | ✅/❌ | |
| 04-solutioning.md | vault/projects/<id>/bmad/04-solutioning.md | ✅/❌ | |
| 05-implementation.md | vault/projects/<id>/bmad/05-implementation.md | ✅/❌ | |
| qa-report.md | vault/projects/<id>/bmad/qa-report.md | ✅/❌ | |
| stories/*.md | vault/projects/<id>/bmad/stories/ | ✅/❌ | |

## Code Produced

List any code files created in the project directory during the Implementation phase.

## Issues / Observations

[Any problems encountered, UX friction points, or unexpected behavior]

## Pass / Fail

SM-6 criteria met: YES / NO
```
