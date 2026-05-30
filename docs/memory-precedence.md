# Memory Tier Precedence (FR-32 / Architecture D-8)

> **Status:** Finalized at M5 Story 5.3. Previous draft existed as Architecture D-8 input; this document is the authoritative spec.

## The Four Tiers

When a persona performs a memory **read**, the resolver searches tiers in the following strict order and returns the **first hit**:

| Priority | Tier | Source | Path pattern |
|----------|------|---------|--------------|
| 1 (highest) | Per-persona scoped | `personas/<id>/memory/*.md` | Persona-specific observations, notes, preferences |
| 2 | Project vault | `projects/<id>/**/*.md` | BMAD artifacts, decisions, project context |
| 3 | Hermes native | FTS5 in-memory / session search | Runtime session context, short-term recall |
| 4 (lowest) | Supermemory | Opt-in cross-project semantic index | Cross-project semantic recall |

## Precedence Rules

### Rule 1 — Specificity wins
A more specific tier wins over a less specific tier. Per-persona memory (`personas/dev/memory/`) is the most specific because it is scoped to exactly one persona and one project.

### Rule 2 — Conflicting entries across tiers
When the same fact appears in multiple tiers:
- **Tier 1 wins** (most specific) — even if older
- Exception: an explicit project-vault override entry (tagged `[override]` in a decision log) beats a persona tier entry
- Tier 3 (Hermes native) is treated as ephemeral session state — it never overwrites a tier 1 or tier 2 entry but is consulted when no tier 1/2 hit exists

### Rule 3 — Supermemory as fallback only
Supermemory is searched only when tiers 1–3 return no result. It is cross-project and semantic — exact matches from tiers 1–2 always take precedence.

### Rule 4 — Staleness
No staleness filter is applied by the resolver. The caller (persona or workflow engine) decides whether to trust a hit based on its metadata (file mtime, decision-log date, etc.).

## Read API

```typescript
interface MemoryReadResult {
  content: string;
  source: "persona" | "project" | "hermes" | "supermemory";
  path: string;       // absolute path for tiers 1/2; query string for tier 3/4
  relevance?: number; // 0–1 score, tier 4 only
  ts: number;         // Unix millis — file mtime or session ts
}

/**
 * Resolve a memory query across all four tiers, in precedence order.
 * Returns the first hit, or null if no tier has a result.
 */
async function resolveMemoryQuery(
  query: string,
  ctx: { personaId: string; projectId: string; vaultRoot: string }
): Promise<MemoryReadResult | null>
```

## Tier Implementation Details

### Tier 1 — Per-persona vault dir
- Scoped to: `personas/<personaId>/memory/`
- Resolution: full-text search over `.md` files in the persona's memory dir
- Persona can write notes here via `memory/` files
- This tier is **local-only** — never synced to Supermemory

### Tier 2 — Project vault
- Scoped to: `projects/<projectId>/**/*.md`
- Resolution: full-text search over project vault tree
- Includes: BMAD artifacts (`bmad/`), decisions (`.decision-log.md`), project context
- This tier is **Supermemory-indexable** (opt-in)

### Tier 3 — Hermes native
- Scope: Hermes's own FTS5 session memory
- Resolution: Hermes API call
- This tier is **in-memory only** — not persisted to vault or Supermemory

### Tier 4 — Supermemory
- Scope: opt-in cross-project semantic index
- Resolution: Supermemory API (`@c4n/supermemory-client`)
- Only consulted when `supermemory.enabled = true` and tiers 1–3 miss
- Returns relevance score; highest-score hit wins

## Supermemory Category Routing (FR-31)

When Supermemory indexing is enabled for a category, writes to that category land in both the local vault tier AND the Supermemory index. Reads route to Supermemory only for opted-in categories.

Categories and their default opt-in state:

| Category | Default | Local vault tier |
|----------|---------|-----------------|
| Decisions | **ON** | Tier 2 (project vault) |
| Architecture artifacts | **ON** | Tier 2 (project vault) |
| Code-review notes | OFF | Tier 1 (persona memory) |
| Personal notes | OFF | Tier 1 (persona memory) |
| Secrets | **NEVER** | None |

## Conflict Handling

When tiers 1 and 2 both have an entry for the same query:
1. Tier 1 entry wins by default (precedence rule)
2. If the tier 2 entry is a `[override]` tagged decision (in `.decision-log.md`), tier 2 wins instead
3. Conflict is logged to `personas/<id>/memory/.conflict-log.md`

## Implementation

The `MemoryResolver` class lives in `packages/memory-resolver/src/index.ts`. It is consumed by the persona supervisor at spawn time to inject memory context, and by the workflow engine when personas request memory reads.

Unit tests: `packages/memory-resolver/src/index.test.ts` — must cover all four tiers with conflicting entries verifying the precedence order (see Story 5.3 acceptance criteria).
