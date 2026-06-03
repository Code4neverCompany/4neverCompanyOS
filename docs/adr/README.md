# Architecture Decision Records (ADRs)

This directory holds the **Architecture Decision Records** for
4neverCompany OS. Each ADR captures one significant architectural
decision: the context that forced it, the decision we made, and
the consequences we accept (both positive and negative) as a
result.

## Format

We follow the
[Michael Nygard format](https://github.com/joelparkerhenderson/architecture-decision-records/blob/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md):

1. **Title** — `<four-digit-padded-id>-<short-kebab-summary>.md`
2. **Status** — Accepted · Proposed · Superseded · Deprecated
3. **Date** — when the decision was ratified
4. **Deciders** — who was in the room
5. **Context** — what situation forced the decision; links to
   the source material (spike reports, brief sections,
   architecture docs)
6. **Decision** — what we chose, in one sentence
7. **Consequences** — positive outcomes, negative trade-offs, and
   explicit followups
8. **Alternatives considered** — what else was on the table, and
   why each was rejected

## Index

| ID                                             | Title                                                     | Status   | Date       |
| ---------------------------------------------- | --------------------------------------------------------- | -------- | ---------- |
| [0001](0001-tauri-over-electron.md)            | Tauri 2 over Electron for the desktop shell               | Accepted | 2026-05-26 |
| [0002](0002-pnpm-workspace.md)                 | pnpm workspace with `onlyBuiltDependencies` allowlist     | Accepted | 2026-05-26 |
| [0003](0003-monorepo-over-multi-repo.md)       | Single monorepo over multi-repo for the integration layer | Accepted | 2026-05-26 |
| [0004](0004-keyring-crate-for-credentials.md)  | `keyring` crate for OS-keychain credential storage        | Accepted | 2026-05-26 |
| [0005](0005-zellij-as-terminal-multiplexer.md) | Embedded Zellij as the terminal multiplexer for personas  | Accepted | 2026-05-26 |

## How to add a new ADR

1. **Pick the next four-digit ID** in the sequence (currently
   `0006`). File name is `<id>-<kebab-case-summary>.md`.
2. **Write the ADR in the Nygard format** (sections above). A new
   ADR typically lands as **Proposed** with a "Proposed on YYYY-MM-DD;
   awaiting ratification" note. Once ratified in the architecture
   review, change the status to **Accepted** and add the date +
   deciders section.
3. **Reference the source material** in the Context section. We do
   **not** duplicate design rationale that already lives in
   [`../4neverCompany_OS_Brief.md`](../4neverCompany_OS_Brief.md),
   [`../4neverCompany_OS_Build_Plan.md`](../4neverCompany_OS_Build_Plan.md),
   [`../architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md),
   [`../bmad-hermes-schema-alignment.md`](../bmad-hermes-schema-alignment.md),
   [`../restart-survival.md`](../restart-survival.md),
   [`../vault-layout.md`](../vault-layout.md), or the corresponding
   BMAD artifact under
   [`../../_bmad-output/planning-artifacts/`](../../_bmad-output/planning-artifacts/).
   Link, summarize, then write the decision-specific context.
4. **Add a row to the index** above.
5. **Cross-link from the relevant existing doc** when an ADR
   supersedes or refines a decision previously captured in a
   longer-form doc. ADRs are atomic; longer docs are the
   narrative.

## When to write an ADR

- The decision **changes the public surface** of the desktop
  shell, the installer, the message bus, the vault layout, or
  the persona lifecycle.
- The decision **locks a dependency** (a crate, a system tool, a
  service) that future contributors can't easily reverse.
- The decision **constrains cross-cutting concerns** (security,
  memory model, IPC, supply-chain).
- The decision has **at least one reasonable alternative** that
  was seriously considered — and that someone, somewhere, will
  reasonably argue for in the future.

**Don't** write an ADR for:

- Per-story implementation choices that don't ripple beyond the
  story's own surface (those go in the story file).
- A/B decisions inside a single package (use a code comment).
- Process / workflow changes (those go in
  [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) or
  [`../../docs/HANDOFF.md`](../HANDOFF.md)).

## Superseding an ADR

When a decision changes, write a **new** ADR that references the
old one and mark the old one **Superseded by 0006**. Don't rewrite
history — the superseded record is part of the audit trail.

## Why this format

- **Atomic** — one decision per record. Easier to find, easier
  to supersede.
- **Reversible** — the Consequences section makes the cost of
  reversing visible at decision time, not three years later.
- **Discoverable** — the index + filename convention means a
  new contributor can scan the whole architectural history in
  five minutes.
- **Source-of-truth-adjacent** — the ADRs live next to the docs
  they reference, and the BMAD planning chain (Analyst → PM →
  Architect) produces the design context they summarize. The
  ADRs are the **short, version-controlled, signed-off** version
  of decisions that would otherwise live only in long-form
  design docs.

See [`../../README.md`](../../README.md) for the rest of the
repo's documentation index.
