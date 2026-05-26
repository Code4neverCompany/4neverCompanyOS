// @c4n/credential-storage — Thin TS facade over the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service). The actual keychain work is in crates/credential-storage (TBD — Rust side).
//
// Architecture: D-9
// Implementing stories: M1 Story 1.10
//
// M0 scaffolding; substantive implementation lands in the stories above.

export const PACKAGE_NAME = "@c4n/credential-storage" as const;