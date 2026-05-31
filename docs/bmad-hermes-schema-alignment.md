# BMAD Workflow YAML ↔ Hermes spawn_proposal Schema Alignment

> P0-D (NEVAAA-50): Align BMAD workflow YAML schema with Hermes spawn_proposal event schema
> Author: CTO
> Date: 2026-05-31
> Status: No blocking gaps for Story 4-2 implementation

## Overview

Hermes emits `spawn_proposal` events when it wants to spawn a dynamic persona. The M4 workflow engine (Story 4-2) needs to dispatch personas based on BMAD workflow YAML definitions. This document maps the two schemas side-by-side, identifies the translation layer, and flags gaps.

---

## Schema A — Hermes `spawn_proposal` Bus Event

Source: `packages/core/src/bus/envelope.ts` (`SpawnProposalEnvelopeSchema`, line 137)

```typescript
SpawnProposalEnvelopeSchema = z.object({
  ...envelopeBase, // schemaVersion: 1, id: uuid, source: agentId, ts: unix-ms
  type: "spawn_proposal",
  payload: z.object({
    name: z.string().min(1), // Human-readable persona name
    persona_type: z.enum(BACKING_CLIS), // claude | aggy | ...
    task_description: z.string().min(1), // What the persona should do
    lifecycle: z.enum(LIFECYCLES), // persistent | ephemeral
    budget_estimate: z.number().nonnegative().optional(), // USD, max 50
  }),
});
```

**BACKING_CLIS** = `["claude", "aggy", "claude-code", "gemini", "openai"]` (from `glossary.ts`)

**LIFECYCLES** = `["persistent", "ephemeral"]` (from `glossary.ts`)

---

## Schema B — BMAD Workflow Phase Definition

Source: `_bmad/bmm/workflows/greenfield-fullstack.yaml`

```yaml
phases:
  - id: string # Phase identifier (e.g. "brief", "plan")
    label: string # Human-readable phase name
    description: string # What the phase does
    personas:
      - name: string # Human-readable persona name
        backing_cli: string # Backing CLI type
        lifecycle: string # persistent | ephemeral
        task_prompt: string # Full task instruction for the persona
    artifact:
      path: string # Vault path for output artifact
      description: string # Human-readable artifact description
    approval_required: boolean # Whether a human must approve before advancing
```

---

## Mapping Table

| Hermes `spawn_proposal` field | BMAD workflow phase field | Translation                                                                                                                                                   |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                        | `personas[*].name`        | Direct map: workflow persona name → spawn proposal name                                                                                                       |
| `persona_type`                | `personas[*].backing_cli` | Direct map: `backing_cli` value → enum member (e.g. `"claude"` → `BACKING_CLIS.claude`)                                                                       |
| `task_description`            | `personas[*].task_prompt` | Direct map: `task_prompt` → `task_description`                                                                                                                |
| `lifecycle`                   | `personas[*].lifecycle`   | Direct map: `lifecycle` string → enum member                                                                                                                  |
| `budget_estimate`             | _(not in workflow)_       | Workflow engine does not set budget; Hermes computes its own. No gap — workflows are bounded by the persona's task_prompt scope, not a separate budget field. |
| `envelopeBase` fields         | _(workflow engine adds)_  | Workflow engine stamps `schemaVersion`, generates `id` (UUID v4), sets `source` to the engine's own agentId, and sets `ts` to now.                            |
| `approved`                    | _(post-approval only)_    | `workflow.phase.advanced` event (not `spawn_proposal`) carries `approved: bool` — separate bus event, no conflict.                                            |

### Phase-level fields (not in Hermes spawn_proposal)

| BMAD phase field        | Status | Handling                                                                                                                                                                                                |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` (phase identifier) | Gap    | Workflow engine tracks phase context internally. Does NOT need to be in spawn_proposal — Hermes doesn't need to know which workflow phase is running. The engine manages phase ordering and sequencing. |
| `artifact.path`         | Gap    | Engine watches vault for artifact arrival; Hermes doesn't need to know artifact paths.                                                                                                                  |
| `approval_required`     | Gap    | Engine manages approval gates separately from persona spawning. SpawnProposal fires before approval gate; after human approves, engine advances to next phase.                                          |

### Multi-persona phases

Some BMAD phases (e.g., "implementation") define **multiple personas**:

```yaml
personas:
  - name: Dev
  - name: Frontend Designer
```

These require **multiple Hermes `spawn_proposal` events** — one per persona. The workflow engine must fan out. This is an implementation detail of Story 4-2, not a schema gap.

---

## Gap Analysis

### Gap 1: Hermes cannot specify phase context in spawn_proposal

**Severity:** Non-blocking

Hermes `spawn_proposal` carries no workflow-phase context (phase `id`, `artifact.path`, `approval_required`). This is by design — Hermes operates at the persona-spawn level, not the workflow level.

**Resolution:** Workflow engine owns phase context. It:

1. Reads phase definition from workflow YAML
2. Dispatches persona(s) via `spawn_proposal`
3. Watches vault for artifact arrival
4. Manages approval gates
5. Posts `workflow.phase.advanced` on phase transition

**No blocking gap for Story 4-2.** The engine's phase state machine is an internal concern not exposed in Hermes messages.

### Gap 2: BMAD workflow has no budget field

**Severity:** Non-blocking

Hermes enforces `SPAWN_PROPOSAL_BUDGET_MAX_USD = 50` per proposal. BMAD workflows do not include a `budget_estimate` field.

**Resolution:** Budget is Hermes's concern. Workflow personas are defined by `task_prompt` scope, not a separate budget. If a persona's estimated cost exceeds $50, Hermes should surface a `spawn_proposal` with `budget_estimate` — the board-approval gate handles over-budget cases.

### Gap 3: Multi-persona phases require fan-out

**Severity:** Implementation detail (Story 4-2)

The `implementation` phase defines 2 personas. Hermes can only propose one persona per `spawn_proposal`. Story 4-2 must issue one `spawn_proposal` per persona and wait for all before advancing.

**No schema gap** — this is an engine implementation pattern.

---

## Reconciliation Summary

| Concern                            | Owner                                    | Status                                        |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Persona name, CLI, lifecycle, task | Hermes → spawn_proposal                  | Aligned                                       |
| Budget enforcement                 | Hermes (board approval gate)             | Aligned                                       |
| Phase sequencing                   | Workflow engine (internal state machine) | Aligned                                       |
| Artifact arrival detection         | Workflow engine (vault watcher)          | Aligned                                       |
| Approval gate management           | Workflow engine                          | Aligned                                       |
| `workflow.phase.advanced` events   | Workflow engine (Story 4-2)              | Aligned — schema defined in `envelope.ts:171` |

**No blocking gaps identified. Story 4-2 can proceed with the workflow engine implementation.**

---

## Relevant Source Files

| File                                            | Role                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| `packages/core/src/bus/envelope.ts:137`         | Hermes `spawn_proposal` Zod schema                     |
| `packages/core/src/bus/envelope.ts:171`         | `workflow.phase.advanced` envelope schema              |
| `_bmad/bmm/workflows/greenfield-fullstack.yaml` | BMAD workflow YAML reference                           |
| `packages/workflow-engine/`                     | Story 4-2 engine package (to be created)               |
| `packages/core/src/glossary.ts`                 | `BACKING_CLIS`, `LIFECYCLES`, `PROGRESS_SIGNALS` enums |
