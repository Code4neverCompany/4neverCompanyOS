//! c4n-zellij-adapter — Spawn / supervise Zellij sessions. Owns all pane creation; persona-supervisor and the Tauri shell call into this crate.
//!
//! Architecture: D-2
//! Implementing stories: M1 Story 1.11 + M2 Story 2.4 + M3 Story 3.3
//!
//! M0 scaffolding; substantive implementation lands in the stories above.

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-zellij-adapter"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-zellij-adapter");
    }
}
