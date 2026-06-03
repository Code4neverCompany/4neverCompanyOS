// Re-export everything that downstream packages should consume from @c4n/core.
// Keep this file's surface small: types, schemas, attribution constants, glossary.
// Do NOT add Paperclip/Hermes/BMAD-specific code here — core is upstream-agnostic.

export * from "./attribution";
export * from "./versions";
export * from "./glossary";
export * from "./bus";
// BMAD workflow YAML schema (Story 4.1 / D-12). Re-exported from
// `@c4n/core/schemas/bmad-workflow` for downstream consumers; the engine
// uses `safeParseBmadWorkflow` to validate YAML bodies at load time.
export * from "./schemas/bmad-workflow";
