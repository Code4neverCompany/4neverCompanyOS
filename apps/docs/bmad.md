# BMAD Workflows

4neverCompany OS ships with two BMAD workflows: `greenfield-fullstack` (for new projects) and `brownfield` (for existing codebases).

## greenfield-fullstack

The headline v1 workflow. Runs from a blank project idea to a working code skeleton plus full BMAD artifact set in one session.

### Phases

```
Analyst → PM → Architect → SM → Dev/QA
```

| Phase | Persona | Output |
|---|---|---|
| Analyst | Analyst | Brief — problem space, goals, constraints |
| PM | PM | PRD — product requirements document |
| Architect | Architect | Architecture doc — system design |
| SM | Scrum Master | Story file set — stories with ACs |
| Dev/QA | Dev + QA | Working code skeleton + QA reports |

At each phase boundary, an **approval gate** appears:
- **Approve and continue** (Enter key) — advance to next phase
- **Request changes** — opens a dialog to send the persona back with feedback
- **Pause workflow** — suspend the workflow; resume later

### Approval Gate

The gate shows:
- Current phase output (artifact preview)
- Proposed next phase
- The three action buttons

Decisions are logged to `vault/projects/<project-id>/bmad/.workflow-decisions.md`.

### Pause and Resume

You can pause a workflow at any time via the gate UI. The workflow state (current phase + persona states + decision log) is persisted. On app reopen, a **Resume workflow?** prompt appears for that project.

## brownfield

Ingests an existing codebase and produces a `refactor-plan.md`.

### Phases

```
Ingest → Analyze → Propose Refactor Plan
```

| Phase | Persona | Output |
|---|---|---|
| Ingest | Analyst | Codebase snapshot and structure summary |
| Analyze | Architect | Dependency graph, pain points, risks |
| Propose | Architect | `refactor-plan.md` artifact |

## Workflow State

Workflow state is persisted in the workspace SQLite database. If the app closes mid-workflow and you reopen, the workflow can be resumed from where it left off.

## Progress Signals

During workflow execution, three signals track forward motion:

1. **Vault artifact changed** — any file in `vault/projects/<project-id>/` changes
2. **Project code changed** — any file in the project root changes (excluding `vault/`, `_bmad/`, `node_modules/`)
3. **Story state changed** — a story file's frontmatter `status` field transitions (`open → in-progress → review → done`)

Hermes watches these signals. If the bus is active but none of these signals fire for a sustained window (~5 minutes), Hermes intervenes with a stall-detection prompt.

## Story State Machine

Story files live in `vault/projects/<project-id>/bmad/stories/`. Each story has a `status` field in its frontmatter:

```yaml
---
status: open
---
```

Valid transitions:
- `open → in-progress` — when a persona picks up the story
- `in-progress → review` — when the implementation is ready for QA
- `review → done` — when QA approves
- Any state → `open` — if rework is needed

These transitions are the third progress signal Hermes watches.
