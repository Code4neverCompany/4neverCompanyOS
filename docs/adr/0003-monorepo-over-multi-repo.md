# 0003 — Single monorepo over multi-repo for desktop + integration layer

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Maurice, Winston (Architect), with BMAD-PM and
  BMAD-Architect ratification in the planning chain
- **Source materials:** [`docs/4neverCompany_OS_Build_Plan.md`](../4neverCompany_OS_Build_Plan.md)
  §M0, [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md),
  [`README.md`](../../README.md) "Monorepo layout," [`Cargo.toml`](../../Cargo.toml),
  [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml).

## Context

The build plan's M0 decisions list explicitly considers
**monorepo vs. multi-repo** for the integration layer that wraps
Paperclip, Hermes, and BMAD. The four moving upstreams are
themselves separate repos (and beyond our control), but the
**integration layer** — desktop shell, first-run wizard, installer,
persona lifecycle, inter-agent message bus, vault layout, GitHub
sync, and Supermemory integration — sits on top of them and could
plausibly be split across multiple repos.

The integration layer has strong internal coupling:

- The Tauri shells (`apps/desktop`, `apps/wizard`) and the Rust
  sidecar crates (`crates/*`) share a single Tauri command
  surface; changing one crate's API ripples to both shells.
- The TypeScript packages (`packages/core`, `packages/bus-client`,
  `packages/workflow-engine`, `packages/persona-sync`, …) are
  interdependent: `core` ships the Zod schemas; every other
  package depends on them.
- The BMAD workflow engine (`packages/workflow-engine`) consumes
  BMAD persona files (`_bmad/bmm/agents/*.md`) and writes
  artifacts into the vault layout (`packages/vault-layout`).
- The Rust crates share `[workspace.dependencies]` for version
  pinning per [`Cargo.toml`](../../Cargo.toml).

Splitting these into separate repos would require either a
published package version per repo (slow, friction-heavy) or git
submodules (painful in 2026).

## Decision

**Adopt a single monorepo** for the entire 4neverCompany OS
integration layer — pnpm workspace for the Node side, Cargo
workspace for the Rust side, side-by-side in the same checkout.
The four vendored upstreams (Paperclip, Hermes, BMAD, Zellij)
remain in **their own upstream repos**; we vendor pinned copies
under `services/` and rebase quarterly (per
[`services/README.md`](../../services/README.md)).

## Consequences

**Positive:**

- **Atomic cross-component changes** — a single PR can change
  `packages/core`'s schema, the Tauri shell that consumes it,
  the Rust crate that emits it, and the docs page that describes
  it. This is the dominant change shape during M1–M3.
- **Shared cross-cutting schema** in `@c4n/core` (Zod) plus a
  matching Rust schema crate keeps the type system
  upstream-agnostic — neither Paperclip nor Hermes can pull the
  schemas out from under us.
- **Single CI matrix** (`.github/workflows/ci.yml`) runs the JS
  - Rust gate jobs on every push, with no per-repo status
    reconciliation.
- **Single source of truth** for tooling: ESLint, Prettier,
  lefthook (see
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md) /
  [`lefthook.yml`](../../lefthook.yml)), and Cargo profiles all
  live at the repo root.
- **Onboarding** is one `git clone` + `pnpm install` + `pnpm
hooks:install`, not five separate clones each with their own
  bootstrap.

**Negative / trade-offs:**

- **Larger working tree.** A full clean checkout with `node_modules`
  weighs in around 1–2 GB; CI caches it aggressively, but a local
  cold start pays the disk cost.
- **Build-time cost** of a "touched everything" change. Mitigated
  by pnpm's content-addressed store and Cargo's incremental
  compilation, but a full `cargo build --workspace` from cold is
  still 5–10 minutes on Windows.
- **Vendored upstreams** in `services/` are populated per the
  August 2026 quarterly rebase window (per
  [`services/README.md`](../../services/README.md)). Between
  rebases, we run against pinned snapshots; this is deliberate
  but worth knowing.
- **Permission boundaries** are weaker than a multi-repo split.
  Every contributor with merge access effectively has it across
  all of `apps/`, `packages/`, `crates/`, and `docs/`. Mitigated
  by CODEOWNERS (planned for M3, not yet enforced) and by the
  PR template's "one logical change per PR" rule.
- **A "broken main" affects every concurrent branch** — the
  `feature/repo-dx` worktree, every paperclip worktree, and the
  Hermes integration all run off the same `main`. Mitigated by
  CI's required-status-checks (`ci-pass` summary job in
  `.github/workflows/ci.yml`).

**Followups required:**

- Add **CODEOWNERS** at M3 when the contributor count grows
  past 2–3 maintainers (per
  [`docs/4neverCompany_OS_Build_Plan.md`](../4neverCompany_OS_Build_Plan.md) §Cross-Cutting).
- When M5's GitHub sync lands, the **GitHub-sync policy** must
  decide which of these directories the user wants backed up
  vs. kept local. See
  [`docs/vault-layout.md`](../vault-layout.md) for the local-
  vs-synced content split.
- Keep `spikes/` **gitignored** and reserved for throwaway
  exploration; the monorepo is otherwise meant to be lean.

## Alternatives considered

- **Multi-repo (one per app + per crate family)** — viable but
  multiplies the integration cost for the dominant change shape
  (cross-component refactors) without buying any isolation
  benefit, since the same 2–3 engineers work across all repos.
- **Git submodules** for the per-app split — rejected: the
  tooling pain (submodule rebase conflicts, "the submodule is at
  the wrong commit") is well-documented and not worth the
  apparent modularity.
- **Polyglot workspaces** (e.g. Nx, Turborepo) — viable for the
  Node side but they don't address the pnpm + Cargo dual stack,
  and the team's M0–M2 velocity matters more than the build-
  orchestration surface.
