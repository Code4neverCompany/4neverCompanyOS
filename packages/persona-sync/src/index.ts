// @c4n/persona-sync — Bidirectional sync between canonical persona files
// (vault) and CLI-specific tool configs (claude.md / agy.md / agent.md).
// Last-writer-wins + per-persona conflict log.
//
// Architecture: D-6
// Implementing stories: Story 1.13 (Dev persona claude.md projection — this),
//                       Story 2.3 (Designer persona agy.md projection),
//                       Story 3.4 (drift detection + conflict log).
//
// ## v1 scope (Story 1.13)
//
// The Dev persona's canonical content lives at
// `packages/persona-sync/src/personas/dev.md`. Two consumers read it:
//
//   1. **The desktop shell's Rust side** (`apps/desktop/src-tauri/src/commands/`)
//      `include_str!`s the markdown at compile time and projects it to
//      `<project-root>/claude.md` on every project open / Dev-persona spawn.
//      Project-level override at `<project>/_bmad/custom/agents/dev.md`
//      (BMAD's customize chain) wins if present.
//
//   2. **This TypeScript package** exposes the same path as a constant so
//      future TS consumers (persona editor UI, drift-detection report
//      generation, vault-side reads) don't have to hardcode the location.
//      The actual markdown content stays in the `.md` file as the single
//      source of truth.

export const PACKAGE_NAME = "@c4n/persona-sync" as const;

/**
 * Repo-root-relative path to the canonical Dev persona markdown.
 *
 * Stable across stories; do not move the file without updating consumers.
 * The desktop Rust side hardcodes the relative path via `include_str!` —
 * if this constant changes, that hardcoded path must change too (see
 * `apps/desktop/src-tauri/src/commands/mod.rs`).
 */
export const DEV_PERSONA_PATH = "packages/persona-sync/src/personas/dev.md" as const;

/**
 * Relative path inside a user-project where a BMAD customize-chain override
 * for the Dev persona would live. Checked before falling back to the
 * bundled default per Story 1.13's customize-chain semantics.
 */
export const DEV_PERSONA_PROJECT_OVERRIDE_PATH = "_bmad/custom/agents/dev.md" as const;

/**
 * Filename written into `<project-root>/` when the Dev persona spawns.
 * Claude Code reads `claude.md` automatically on launch.
 */
export const DEV_PROJECTION_FILENAME = "claude.md" as const;

// ── Story 2.3 — Frontend Designer (Antigravity CLI) persona ─────────

/**
 * Repo-root-relative path to the canonical Frontend Designer persona markdown.
 * The desktop Rust side embeds it at compile time via `include_str!`.
 */
export const DESIGNER_PERSONA_PATH =
  "packages/persona-sync/src/personas/designer.md" as const;

/**
 * Relative path inside a user-project where a BMAD customize-chain override
 * for the Frontend Designer persona would live.
 */
export const DESIGNER_PERSONA_PROJECT_OVERRIDE_PATH =
  "_bmad/custom/agents/designer.md" as const;

/**
 * Filename written into `<project-root>/` when the Frontend Designer persona spawns.
 * Antigravity CLI reads `agy.md` automatically on launch.
 */
export const DESIGNER_PROJECTION_FILENAME = "agy.md" as const;
