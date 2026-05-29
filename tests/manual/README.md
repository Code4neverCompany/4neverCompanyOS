# tests/manual/

> Capture slots for human-run verification protocols. NOT a build target; not picked up by `cargo test` or `pnpm test`.

## What lives here

This directory holds artifacts a tester produces while running one of the project's manual verification protocols. The protocols themselves live under `docs/`; this folder is where the run records land.

| Protocol                                                  | Recording filename                | Notes filename               |
| --------------------------------------------------------- | --------------------------------- | ---------------------------- |
| `docs/e2e-smoke-test.md` (Story 1.18 — M1 exit criterion) | `m1-exit-criterion-recording.mp4` | `m1-exit-criterion-notes.md` |

These filenames are mandated by the Story 1.18 acceptance criteria (epics.md §1.18). The story file at `_bmad-output/implementation-artifacts/stories/1.18-e2e-scenario-test.md` is the spec.

## Conventions

- **Recording format:** `.mp4` is the default per the AC ("or similar"). `.gif` or `.webm` acceptable if the file ends up smaller — both are viewable on GitHub's web UI without download.
- **Recording size:** screen recordings of a 10-minute install run are typically 30–150 MB. If your file exceeds 25 MB, enable Git LFS for this directory before committing:
  ```
  git lfs install
  git lfs track "tests/manual/*.mp4" "tests/manual/*.gif" "tests/manual/*.webm"
  git add .gitattributes
  ```
  Then commit normally. The repo's `.gitattributes` will route the binary through LFS so the regular `.git` history doesn't bloat.
- **Notes format:** plain markdown. One run per file (the AC names one file; if a future run produces a second pass, append a section dated with the run date rather than overwriting).
- **Per-protocol subdirs:** when a third protocol joins, switch the convention to `tests/manual/<protocol-slug>/` subdirs. For now (Story 1.18 is the only protocol with capture artifacts), the flat layout is fine.

## Why this is `tests/manual/` and not `apps/desktop/tests/manual/`

The recording + notes are runtime captures of a manual protocol that exercises _the entire monorepo end-to-end_ — installer (`apps/desktop`) + wizard (`apps/wizard`) + supervisor (`crates/persona-supervisor`) + Zellij adapter (`crates/zellij-adapter`) + the embedded xterm.js terminal (`apps/desktop/src/views/`). Nesting under any single crate's `tests/` would imply a crate-scoped concern that this isn't. Top-level `tests/manual/` reads as "manual artifacts for the whole repo," which is accurate.

The `.gitkeep` next to this README keeps the directory in git pre-capture. Delete `.gitkeep` once a real recording lands.
