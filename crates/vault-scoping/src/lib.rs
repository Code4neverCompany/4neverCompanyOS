//! c4n-vault-scoping — Per-persona vault write logger. Detects writes outside persona scope and logs to out-of-scope-writes.log (best-effort enforcement per PRD FR-29 NOTE FOR PM).
//!
//! Architecture: D-7
//! Implementing stories: M3 Story 3.5
//!
//! M0 scaffolding; substantive implementation lands in the stories above.

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-vault-scoping"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-vault-scoping");
    }
}
