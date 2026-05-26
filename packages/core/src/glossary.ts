// Glossary constants from PRD §3 — single source of truth for terms used
// across the monorepo. Every cross-package reference to these concepts
// MUST use these exported names verbatim. Introducing a synonym anywhere
// in code or docs is a discipline violation (per PRD rubric mechanical
// notes and architecture §5 enforcement guidelines).

/** The two lifecycle modes a dynamic persona can choose at spawn time. */
export const LIFECYCLES = ["persistent", "ephemeral"] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

/** Fixed-persona identifiers (the two that spawn on every project open). */
export const FIXED_PERSONAS = ["dev", "frontend-designer"] as const;
export type FixedPersona = (typeof FIXED_PERSONAS)[number];

/** Backing CLI identifiers known to the workspace. */
export const BACKING_CLIS = ["claude-code", "agy", "agent"] as const;
export type BackingCli = (typeof BACKING_CLIS)[number];

/** Progress-signal kinds Hermes watches for forward motion (D-4). */
export const PROGRESS_SIGNALS = [
  "artifact.changed",
  "code.changed",
  "story.state.changed", // added in M4 — see PRD FR-18 + Story 4.5
] as const;
export type ProgressSignal = (typeof PROGRESS_SIGNALS)[number];

/** Workflow phase identifiers used by the BMAD workflow engine (D-12). */
export const WORKFLOW_PHASES = [
  "analyst",
  "pm",
  "ux", // present in some workflows but skipped for v1 4nCO product per session-2 decision
  "architect",
  "sm",
  "dev",
  "qa",
] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];
