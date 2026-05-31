# BMAD Workflow YAML ↔ Hermes spawn_proposal Schema Alignment

**Issue:** [NEVAAA-50](/NEVAAA/issues/NEVAAA-50) — P0-D of Epic 4 (One-Click BMAD Workflow Execution)  
**Author:** CTO  
**Date:** 2026-05-31  
**Status:** Complete — no blocking gaps for Story 4-2

---

## 1. Schema A — BMAD Workflow YAML (greenfield-fullstack.yaml)

Per-phase persona definition in `greenfield-fullstack.yaml` / `brownfield.yaml`:

```yaml
phases:
  - id: brief
    personas:
      - name: Analyst          # Human-readable persona label
        backing_cli: claude     # Fixed: the persona always runs on this CLI
        lifecycle: ephemeral     # persistent | ephemeral
        task_prompt: >          # Full task instruction string (internal to engine)
          You are the Analyst persona...
    artifact:
      path: vault/projects/{project_id}/bmad/01-brief.md  # Vault output path
    approval_required: true     # Per-phase approval gate flag
```

**Per-phase fields:**
- `id` — machine slug
- `label` — human-readable phase name
- `description` — human-readable description
- `personas[].name` — persona display name
- `personas[].backing_cli` — which CLI runs this persona (`claude` | `aggy`)
- `personas[].lifecycle` — `persistent` | `ephemeral`
- `personas[].task_prompt` — the full instruction string for this persona at this phase
- `artifact.path` — expected vault artifact path (template with `{project_id}`)
- `artifact.description` — human-readable artifact description
- `approval_required` — whether this phase pauses for human approval before advancing

---

## 2. Schema B — Hermes spawn_proposal Bus Event (envelope.ts)

Emitted by Hermes when it wants to spawn a dynamic persona:

```typescript
// packages/core/src/bus/envelope.ts — SpawnProposalEnvelopeSchema
{
  type: "spawn_proposal",
  source: "hermes",           // always from Hermes
  id: uuid_v4,                // unique message id
  schemaVersion: 1,
  ts: unix_ms,
  payload: {
    name: "Security Reviewer",      // Human-readable persona name
    persona_type: "aggy",           // Backing CLI: enum BACKING_CLIS
    task_description: "Review X...", // Short task description
    lifecycle: "ephemeral",          // persistent | ephemeral
    budget_estimate?: 12.50,        // USD cost estimate (optional, max 50)
  }
}
```

**All fields:**
- `payload.name` — persona display name
- `payload.persona_type` — backing CLI (`claude` | `aggy` | future)
- `payload.task_description` — short task description (one-liner)
- `payload.lifecycle` — `persistent` | `ephemeral`
- `payload.budget_estimate` — optional USD cost estimate (rejected if > $50)

Hermes spawn_proposal is an **approval-gated runtime event**: it is emitted, then sits in `PendingProposalsStore` until a human approves/rejects it via SpawnApprovalTray (Story 3-8). On approval, the persona is spawned.

---

## 3. Mapping Table

| BMAD YAML field | Hermes spawn_proposal field | Mapping |
|---|---|---|
| `phases[].personas[].name` | `payload.name` | Direct map — engine copies YAML value into event |
| `phases[].personas[].backing_cli` | `payload.persona_type` | Direct map — YAML `claude` → `claude`, `aggy` → `aggy` |
| `phases[].personas[].lifecycle` | `payload.lifecycle` | Direct map — YAML lifecycle enum matches Hermes lifecycle enum |
| `phases[].personas[].task_prompt` | `payload.task_description` | **Partial gap**: YAML has full instruction string; Hermes has short task_description. Mapping: truncate/prompt inject — engine should prepend `task_prompt` content to a shorter Hermes `task_description` |
| `phases[].artifact.path` | — | Hermes has no equivalent — this is an engine-internal concern (vault path); no runtime mapping needed |
| `phases[].approval_required` | — (Hermes approval is per-persona, not per-phase) | See §4 Gap 1 |
| — | `payload.budget_estimate` | Hermes-only — BMAD YAML has no cost field; P0-D note: budget_estimate can be added to YAML as optional `budget_estimate_usd` or engine can hardcode `null` (unknown = $0, safe) |
| `phases[].id` | — | Engine-internal phase tracking; Hermes has no phase concept |
| `phases[].description` | — | Engine-internal phase description; Hermes has no phase concept |

---

## 4. Identified Gaps

### Gap 1 — Hermes approval is per-persona; BMAD approval is per-phase

**Severity:** Medium  
**Description:** Hermes spawn_proposal is a per-persona approval event. The user approves or rejects each persona spawn individually. BMAD workflow has `approval_required: true` on a per-phase basis — a phase may involve multiple personas, and the approval gate fires after all phase personas have completed, not per-persona.

**Proposed resolution — two architectural options:**

**Option A (recommended): Hermes-native**  
Use Hermes spawn_proposal as the persona spawning mechanism. The workflow engine, at each phase, emits one Hermes spawn_proposal per persona. Hermes displays each proposal in SpawnApprovalTray. On approval of all phase personas, the engine advances to the next phase. The BMAD phase-level `approval_required` maps to "wait for all phase proposals to be approved before advancing." This unifies the approval surface (one tray for all approvals) and keeps Hermes as the single source of truth for persona lifecycle.

**Option B: Engine-owned approval**  
The workflow engine handles BMAD phase-level approvals internally (via a custom ApprovalCard, Story 4-3), bypassing Hermes spawn_proposal for phase approvals. Hermes proposals can still fire for dynamic personas spawned outside the workflow engine context. This is more complex but allows richer per-phase approval logic.

**Decision for Story 4-2:** Use Option A (Hermes-native). The engine emits spawn_proposal events per phase persona, waits for Hermes approval, then advances. This reuses P0-A's UX improvements and keeps the architecture simple.

### Gap 2 — BMAD task_prompt vs Hermes task_description semantic mismatch

**Severity:** Low  
**Description:** Hermes `task_description` is a short one-liner (designed for the SpawnApprovalTray display). BMAD `task_prompt` is a full instruction string (the complete prompt sent to the persona CLI). If the engine emits Hermes spawn_proposal, it cannot faithfully pass the full `task_prompt` as `task_description` without overflowing the tray.

**Proposed resolution:** Hermes event carries a short `task_description` (≤200 chars, suitable for tray display). The engine stores the full `task_prompt` in vault metadata keyed by persona instance ID. On persona spawn, the CLI runner reads the full prompt from vault metadata rather than from the Hermes event. This avoids schema changes to Hermes.

### Gap 3 — Hermes budget_estimate has no BMAD counterpart

**Severity:** Low  
**Description:** Hermes spawn_proposal carries an optional `budget_estimate_usd`. BMAD workflow YAML has no cost field.

**Proposed resolution:** Add optional `budget_estimate_usd` to each persona entry in the BMAD YAML schema. Engine passes it through to Hermes. If absent in YAML, pass `null` (treated as $0 — no budget enforcement). No blocker for 4-2.

---

## 5. Reconciliation Architecture

The adapter layer lives in `packages/workflow-engine/src/adapters/hermes-spawn.adapter.ts` (to be created in Story 4-2):

```
BMAD Phase Definition (YAML)
         │
         ▼
HermesSpawnAdapter
  - Reads: phase personas, task_prompt, lifecycle, backing_cli
  - Emits: Hermes spawn_proposal event per persona
         │
         ▼
Hermes / SpawnApprovalTray
  - User approves/rejects each proposal
         │
         ▼
Workflow Engine
  - Receives: lifecycle.spawned bus event per persona
  - Spawns persona with full task_prompt from vault metadata
  - Tracks phase completion
         │
         ▼
Phase Complete → workflow.phase.advanced bus event
```

Reverse direction (Hermes-initiated proposals outside workflow context):
- Proposals not tied to a running workflow → handled by Hermes directly (existing Story 3-7 behaviour unchanged)
- Proposals tied to a workflow phase → Hermes enriches event with `workflow_phase_id`, engine routes approval to phase context

---

## 6. Blocking Gap Assessment for Story 4-2

**Are there blocking gaps?** No.

Story 4-2 can proceed with the following design decisions:
1. Use Hermes spawn_proposal for persona spawning (Option A above)
2. Use vault metadata for full task_prompt storage (not Hermes event)
3. Add optional `budget_estimate_usd` to YAML schema when cost tracking is needed (non-blocking for v1)
4. Track phase state entirely within the engine; Hermes does not track phases

No schema changes to Hermes or the bus event envelope are required to start Story 4-2.

---

## 7. BMAD YAML Schema Summary (for Story 4-2 reference)

Current persona definition schema in `greenfield-fullstack.yaml`:

```yaml
persona:
  name: string            # Display name
  backing_cli: claude|aggy # CLI runner
  lifecycle: persistent|ephemeral
  task_prompt: string      # Full instruction (stored in vault metadata)
```

Phase-level approval: `approval_required: boolean`

Artifact expectation: `artifact.path` (vault template), `artifact.description` (display)

No changes to the BMAD YAML schema are required for Story 4-2.
