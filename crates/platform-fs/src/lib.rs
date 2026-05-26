//! c4n-platform-fs — Rust-side file-watching. Replaces chokidar (which is weaker on Windows). Backs progress-signal artifact.changed and code.changed subscribers.
//!
//! Architecture: D-4
//! Implementing stories: M2 Story 2.12-2.13
//!
//! M0 scaffolding; substantive implementation lands in the stories above.

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-platform-fs"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-platform-fs");
    }
}
