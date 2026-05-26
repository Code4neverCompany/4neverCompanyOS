//! c4n-bus-relay — Bus relay sidecar. Subscribes to Paperclip's event system, normalizes messages into the bus envelope, broadcasts to IPC subscribers + the desktop UI WebSocket.
//!
//! Architecture: D-3
//! Implementing stories: M2 Story 2.7-2.11
//!
//! M0 scaffolding; substantive implementation lands in the stories above.

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-bus-relay"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-bus-relay");
    }
}
