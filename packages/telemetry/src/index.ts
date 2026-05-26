// @c4n/telemetry — Per-persona token-cost telemetry. Parses each CLI's structured output (Claude Code, agy, Hermes) and persists token counts to workspace SQLite.
//
// Architecture: D-11
// Implementing stories: M2 Story 2.16; budgets M5 Story 5.6
//
// M0 scaffolding; substantive implementation lands in the stories above.

export const PACKAGE_NAME = "@c4n/telemetry" as const;
