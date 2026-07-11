//! fournever_core — pure-logic core of 4neverCompanyOS.
//!
//! This crate deliberately has NO Tauri dependency (only serde/serde_json) so
//! it can be unit-tested anywhere. It mirrors the behavior and JSON shapes of
//! the original Node backend (server.js + lib/) exactly: camelCase keys via
//! serde rename_all, same defaults, same validation and merge rules.

pub mod agents;
pub mod config;
pub mod model;
pub mod notes;
pub mod store;
pub mod tasks;
pub mod util;
pub mod vault;
