// @c4n/stall-detector — Rolling-window algorithm watching bus chatter vs progress-signal fires. Emits stall-detected on the bus when chatter exceeds threshold with zero progress.
//
// Architecture: D-5
// Implementing stories: M2 Story 2.14-2.17
//
// M0 scaffolding; substantive implementation lands in the stories above.

export const PACKAGE_NAME = "@c4n/stall-detector" as const;
