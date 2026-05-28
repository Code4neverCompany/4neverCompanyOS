// Re-export everything that downstream packages should consume from @c4n/core.
// Keep this file's surface small: types, schemas, attribution constants, glossary.
// Do NOT add Paperclip/Hermes/BMAD-specific code here — core is upstream-agnostic.

export * from "./attribution";
export * from "./versions";
export * from "./glossary";
