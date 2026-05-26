//! c4n-persona-supervisor — Wraps each persona process; captures stdout/stderr per line; pipes capture to the per-persona vault log file and to telemetry. Also exposes pause / dismiss control.
//!
//! Architecture: D-11
//! Implementing stories: M1 Story 1.14 + M2 Story 2.18 + M3 Story 3.11
//!
//! M0 scaffolding; substantive implementation lands in the stories above.

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-persona-supervisor"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-persona-supervisor");
    }
}