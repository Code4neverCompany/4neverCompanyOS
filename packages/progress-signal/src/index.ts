// @c4n/progress-signal — Progress-signal subscribers — artifact.changed (vault), code.changed (project dir), story.state.changed (M4). Hermes uses these via stall-detector to decide when to intervene.
//
// Architecture: D-4
// Implementing stories: M2 Story 2.12-2.13 + M4 Story 4.5
//
// M0 scaffolding; substantive implementation lands in the stories above.

export const PACKAGE_NAME = "@c4n/progress-signal" as const;
