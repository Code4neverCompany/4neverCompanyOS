// @c4n/persona-sync — Bidirectional sync between canonical persona files (vault) and CLI-specific tool configs (claude.md / agy.md / agent.md). Last-writer-wins + per-persona conflict log.
//
// Architecture: D-6
// Implementing stories: M3 Story 3.4
//
// M0 scaffolding; substantive implementation lands in the stories above.

export const PACKAGE_NAME = "@c4n/persona-sync" as const;