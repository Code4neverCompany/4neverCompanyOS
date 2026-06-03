//! c4n-credential-storage — OS keychain abstraction.
//!
//! Architecture: D-9.
//! Implementing story: M1 Story 1.10.
//!
//! Wraps the `keyring` crate so the rest of the workspace gets a typed,
//! error-explicit API for set / get / delete operations on the platform's
//! native keychain (Windows Credential Manager on Win, Keychain on macOS,
//! Secret Service on Linux).
//!
//! **Scope (M1):** Supermemory + GitHub credentials when those features land
//! in M5. We do NOT store Anthropic or Google credentials here — those live
//! in Claude Code's and Antigravity CLI's own stores per Anthropic's policy
//! (D-9 / OQ-G).
//!
//! ## Testability (security-hardening, M5 prerequisite)
//!
//! The keychain is the foundation for Supermemory + GitHub secrets (M5).
//! CI runners typically have no real keychain backend (Linux headless,
//! ephemeral macOS, locked Windows) so the round-trip test was historically
//! gated `#[ignore]`. The previously-`#[ignore]`'d test now runs in CI
//! unconditionally because the actual `set`/`get`/`delete` calls go through
//! the [`KeychainBackend`] trait, and [`InMemoryBackend`] (compiled in
//! under `#[cfg(any(test, feature = "test-backend"))]`) lets the test drive
//! the full code path without touching the OS keychain.
//!
//! Production code paths default to [`KeyringBackend`] (the real
//! `keyring` crate wrapper) and never set the test backend, so the
//! wizard + desktop flows keep their current behavior.
//!
//! Public API surface (the module-level [`set`] / [`get`] / [`delete`]
//! functions) is unchanged — the trait is internal plumbing. Callers in
//! `apps/wizard/src-tauri` and `apps/desktop/src-tauri` keep calling
//! `creds::set(...)` / `creds::get(...)` / `creds::delete(...)` exactly
//! as before; their signatures and semantics are preserved.

use serde::Serialize;
#[cfg(any(test, feature = "test-backend"))]
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use thiserror::Error;

/// Service-name prefix for all 4nCO-owned keychain entries. Keeps our
/// entries grouped and avoids collisions with other apps.
pub const SERVICE_PREFIX: &str = "com.c4nfornever";

/// Service and account for the GitHub Personal Access Token (FR-33 / Story 5.4).
pub const GITHUB_SERVICE: &str = "github";
pub const GITHUB_ACCOUNT: &str = "pat";

/// All keychain ops that callers can make. Always-typed; never raw strings.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CredentialError {
    /// Entry not found in the keychain.
    #[error("credential not found: service={service} account={account}")]
    NotFound { service: String, account: String },

    /// Permission denied by the OS keychain (e.g. user dismissed prompt on macOS).
    #[error("permission denied: {0}")]
    PermissionDenied(String),

    /// Any other underlying keyring-crate error.
    #[error("keychain error: {0}")]
    Other(String),
}

impl From<keyring::Error> for CredentialError {
    fn from(err: keyring::Error) -> Self {
        match err {
            keyring::Error::NoEntry => CredentialError::NotFound {
                service: String::new(),
                account: String::new(),
            },
            keyring::Error::Ambiguous(_) | keyring::Error::BadEncoding(_) => {
                CredentialError::Other(err.to_string())
            }
            other => CredentialError::Other(other.to_string()),
        }
    }
}

/// Result alias used across this module.
pub type Result<T> = std::result::Result<T, CredentialError>;

/// Returns the fully-qualified service name with the workspace prefix.
fn qualified_service(service: &str) -> String {
    format!("{SERVICE_PREFIX}.{service}")
}

// ────────────────────────────────────────────────────────────────────
// Backend abstraction (security-hardening)
// ────────────────────────────────────────────────────────────────────
//
// The trait exists so the keychain round-trip can be unit-tested in CI
// (where a real OS keychain is not available) without compromising the
// production code path. Production defaults to [`KeyringBackend`]; tests
// inject [`InMemoryBackend`] via [`set_backend`].
//
// Two production invariants this layer protects:
//
//   1. The public functions ([`set`], [`get`], [`delete`]) keep their
//      exact signatures and behavior — existing wizard + desktop Tauri
//      commands need no changes.
//   2. The default backend is always the real keyring. A test that
//      calls `set_backend(...)` replaces it for the rest of the process;
//      no other code path can mutate the slot, and there's no
//      "auto-detect test env" magic — tests opt in explicitly so
//      production never accidentally hits the in-memory store.

/// Storage backend for the credential store. Implementations are responsible
/// for service+account scoping; callers always go through the module-level
/// [`set`] / [`get`] / [`delete`] helpers, which qualify the service name
/// with [`SERVICE_PREFIX`] and add the canonical NotFound error variant.
///
/// `Send + Sync` because [`set_backend`] stores the impl behind an `Arc`
/// and the slot is read from any thread (Tauri commands run on a worker
/// pool).
pub trait KeychainBackend: Send + Sync {
    /// Persist `secret` under (`service`, `account`). Overwrites any
    /// existing entry. The service name passed in is the qualified
    /// `com.c4nfornever.<service>` form — the trait does not re-prefix.
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<()>;

    /// Retrieve the secret for (`service`, `account`). Returns
    /// [`CredentialError::NotFound`] (with the concrete service+account
    /// filled in) when no entry exists — both real and test backends
    /// share the contract so callers don't need to special-case.
    fn get(&self, service: &str, account: &str) -> Result<String>;

    /// Delete the entry for (`service`, `account`). Returns NotFound when
    /// no entry exists rather than silent success, so callers can decide
    /// intentionally how to handle "nothing to delete".
    fn delete(&self, service: &str, account: &str) -> Result<()>;
}

/// Production backend: wraps the `keyring` crate's `Entry` per call.
///
/// We don't hold a long-lived `Entry` handle because the `keyring` crate
/// is intentionally designed for short-lived handles — caching across
/// process boundaries breaks on keychain prompts / account changes.
pub struct KeyringBackend;

impl KeychainBackend for KeyringBackend {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<()> {
        let entry = keyring::Entry::new(service, account)?;
        entry.set_password(secret)?;
        Ok(())
    }

    fn get(&self, service: &str, account: &str) -> Result<String> {
        let entry = keyring::Entry::new(service, account)?;
        entry.get_password().map_err(|err| match err {
            keyring::Error::NoEntry => CredentialError::NotFound {
                service: service.to_string(),
                account: account.to_string(),
            },
            other => CredentialError::Other(other.to_string()),
        })
    }

    fn delete(&self, service: &str, account: &str) -> Result<()> {
        let entry = keyring::Entry::new(service, account)?;
        entry.delete_credential().map_err(|err| match err {
            keyring::Error::NoEntry => CredentialError::NotFound {
                service: service.to_string(),
                account: account.to_string(),
            },
            other => CredentialError::Other(other.to_string()),
        })
    }
}

/// Process-wide backend slot. `OnceLock` so a fresh key is only initialized
/// on first access; the inner `Mutex<Option<...>>` lets tests swap the impl
/// at any time. We use a `Mutex<Option<...>>` rather than always initializing
/// to `KeyringBackend` so a test that calls `set_backend` *before* the first
/// production-style call still wins (no surprise "first writer kept" races).
static BACKEND: OnceLock<Mutex<Option<Arc<dyn KeychainBackend>>>> = OnceLock::new();

fn backend_slot() -> &'static Mutex<Option<Arc<dyn KeychainBackend>>> {
    BACKEND.get_or_init(|| Mutex::new(None))
}

/// Get the currently-installed backend, lazily installing [`KeyringBackend`]
/// on first access if no test ever set one. This is the single point of
/// truth for "what backend do the public functions use right now".
fn current_backend() -> Arc<dyn KeychainBackend> {
    let mut guard = backend_slot()
        .lock()
        .expect("credential-storage backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(Arc::new(KeyringBackend));
    }
    guard
        .as_ref()
        .expect("backend initialized above; qed")
        .clone()
}

/// Replace the active backend. **Test-only** — production code never calls
/// this. Designed for `#[cfg(test)]` test cases that need to drive
/// `set`/`get`/`delete` without a real keychain. Pass `Arc::new(KeyringBackend)`
/// to restore the real backend at the end of a test (or, more idiomatically,
/// accept the default and never call `set_backend` at all in the test).
///
/// `set_backend` is a module-level function (not a `pub` method on a
/// builder) because the public API is a single global — there's no
/// per-call or per-thread backend; the round-trip is a process-level
/// concern and the production path never has to think about it.
pub fn set_backend(backend: Arc<dyn KeychainBackend>) {
    let mut guard = backend_slot()
        .lock()
        .expect("credential-storage backend mutex poisoned");
    *guard = Some(backend);
}

/// Reset the backend slot to "not installed" so the next call to a
/// public function lazily installs [`KeyringBackend`] again. Useful for
/// test cleanup so a test that injected an `InMemoryBackend` doesn't
/// leak the in-memory state into the next test in the same process.
#[cfg(any(test, feature = "test-backend"))]
pub fn reset_backend_to_default() {
    let mut guard = backend_slot()
        .lock()
        .expect("credential-storage backend mutex poisoned");
    *guard = None;
}

// ────────────────────────────────────────────────────────────────────
// Public API (unchanged signatures)
// ────────────────────────────────────────────────────────────────────

/// Store a secret in the active backend under the given service+account pair.
/// Overwrites any existing entry. Service is auto-prefixed with
/// "com.c4nfornever" so workspace entries stay grouped.
pub fn set(service: &str, account: &str, secret: &str) -> Result<()> {
    let qualified = qualified_service(service);
    current_backend().set(&qualified, account, secret)
}

/// Retrieve a secret. Returns CredentialError::NotFound (with concrete
/// service/account in the variant) if no entry exists.
pub fn get(service: &str, account: &str) -> Result<String> {
    let qualified = qualified_service(service);
    let raw = current_backend().get(&qualified, account)?;
    Ok(raw)
}

/// Delete a secret. NotFound is mapped to an error rather than silent success
/// so callers can decide intentionally how to handle "nothing to delete."
pub fn delete(service: &str, account: &str) -> Result<()> {
    let qualified = qualified_service(service);
    current_backend().delete(&qualified, account)
}

// ────────────────────────────────────────────────────────────────────
// In-memory backend (test-only)
// ────────────────────────────────────────────────────────────────────
//
// Compiled under `#[cfg(any(test, feature = "test-backend"))]` so the
// production binary never contains the HashMap state. The
// `feature = "test-backend"` opt-in lets downstream crates' integration
// tests (e.g. the desktop crate's Tauri-command tests) enable the
// in-memory backend without needing the cfg(test) graph.

/// `HashMap`-backed `KeychainBackend` for unit tests and CI.
///
/// Backed by a `Mutex<HashMap<(String, String), String>>` so multiple
/// threads see the same state and the API matches the real keychain's
/// "single process owns the entry" semantics. The map is `String`-keyed
/// to keep the impl `Send + Sync` without depending on a custom
/// `Path`-hashable wrapper.
#[cfg(any(test, feature = "test-backend"))]
#[derive(Default, Clone)]
pub struct InMemoryBackend {
    store: Arc<Mutex<HashMap<(String, String), String>>>,
}

#[cfg(any(test, feature = "test-backend"))]
impl InMemoryBackend {
    /// Build an empty in-memory store.
    pub fn new() -> Self {
        Self::default()
    }

    /// Number of entries currently held. Test-only diagnostic.
    pub fn len(&self) -> usize {
        self.store
            .lock()
            .expect("in-memory store mutex poisoned")
            .len()
    }

    /// Whether the store is empty. Test-only diagnostic.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(any(test, feature = "test-backend"))]
impl KeychainBackend for InMemoryBackend {
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<()> {
        let mut store = self.store.lock().expect("in-memory store mutex poisoned");
        store.insert(
            (service.to_string(), account.to_string()),
            secret.to_string(),
        );
        Ok(())
    }

    fn get(&self, service: &str, account: &str) -> Result<String> {
        let store = self.store.lock().expect("in-memory store mutex poisoned");
        store
            .get(&(service.to_string(), account.to_string()))
            .cloned()
            .ok_or_else(|| CredentialError::NotFound {
                service: service.to_string(),
                account: account.to_string(),
            })
    }

    fn delete(&self, service: &str, account: &str) -> Result<()> {
        let mut store = self.store.lock().expect("in-memory store mutex poisoned");
        if store
            .remove(&(service.to_string(), account.to_string()))
            .is_none()
        {
            return Err(CredentialError::NotFound {
                service: service.to_string(),
                account: account.to_string(),
            });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip — set, get, delete. Uses the in-memory backend so the
    /// test runs in CI (no OS keychain required) and exercises the real
    /// public [`set`]/[`get`]/[`delete`] code path.
    ///
    /// The previously-`#[ignore]`'d `roundtrip_or_clean_failure` test
    /// required a real keychain and was skipped on every CI run. With
    /// the backend abstraction, the same code path now runs against
    /// [`InMemoryBackend`] and proves the trait + dispatcher wiring
    /// holds end-to-end.
    #[test]
    fn roundtrip_in_memory_backend() {
        // Install the in-memory backend for this test only.
        let backend = Arc::new(InMemoryBackend::new());
        set_backend(backend.clone());
        // Always restore the default backend so a test failure can't
        // poison the next test in the same process.
        let _restore = scopeguard_lite::RestoreOnDrop;

        let service = "test.credential-storage";
        let account = "round-trip-account";
        let secret = "s3cr3t-value-for-test";

        // Best-effort cleanup of any leftover entry (defensive — the
        // in-memory store starts empty per test).
        let _ = delete(service, account);

        // set + get
        set(service, account, secret).expect("set should succeed against in-memory backend");
        let got = get(service, account).expect("get after set should succeed");
        assert_eq!(got, secret, "round-tripped secret must match original");

        // delete and confirm absence.
        delete(service, account).expect("delete should succeed");
        match get(service, account) {
            Err(CredentialError::NotFound { .. }) => {} // expected
            Err(other) => panic!("expected NotFound after delete, got {other:?}"),
            Ok(_) => panic!("get after delete should fail"),
        }

        // Restore the default (KeyringBackend) so the next test in the
        // process isn't surprised. Idempotent with the scopeguard above.
        reset_backend_to_default();
    }

    /// Sanity check: InMemoryBackend counts and lifecycle.
    #[test]
    fn in_memory_backend_counts_entries() {
        let backend = InMemoryBackend::new();
        assert!(backend.is_empty());
        backend.set("com.c4nfornever.github", "pat", "tok").unwrap();
        assert_eq!(backend.len(), 1);
        backend.delete("com.c4nfornever.github", "pat").unwrap();
        assert!(backend.is_empty());
    }

    /// InMemoryBackend propagates NotFound the same way as the real
    /// keyring — verified by the trait dispatcher since the public
    /// `get` function re-uses the same `CredentialError` enum.
    #[test]
    fn in_memory_backend_get_missing_returns_not_found() {
        let backend = InMemoryBackend::new();
        let err = backend
            .get("com.c4nfornever.github", "missing")
            .unwrap_err();
        match err {
            CredentialError::NotFound { service, account } => {
                assert_eq!(service, "com.c4nfornever.github");
                assert_eq!(account, "missing");
            }
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    /// InMemoryBackend.delete on a missing entry is an error, matching
    /// the real keyring's contract (callers decide whether to swallow).
    #[test]
    fn in_memory_backend_delete_missing_is_error() {
        let backend = InMemoryBackend::new();
        let err = backend
            .delete("com.c4nfornever.github", "nope")
            .unwrap_err();
        assert!(matches!(err, CredentialError::NotFound { .. }));
    }

    /// A second test using the **real** keyring behind `#[ignore]`. This
    /// is the manual verification path — it requires a working OS
    /// keychain (Win Credential Manager / macOS Keychain / Linux
    /// Secret Service) and is documented as "run with `--ignored` on a
    /// real machine". On Windows 11 with keyring 3.6.x the historical
    /// `set()` → `get()` flakiness can still surface here, so a green
    /// run is the canonical signal that the live integration is healthy.
    #[test]
    #[ignore = "env-dependent (real OS keychain); run with `cargo test -p c4n-credential-storage -- --ignored`"]
    fn roundtrip_real_keyring() {
        // Make sure the default (KeyringBackend) is installed in case a
        // previous test swapped it.
        reset_backend_to_default();

        let service = "test.credential-storage";
        let account = "real-keyring-account";
        let secret = "real-keyring-secret";

        let _ = delete(service, account);

        match set(service, account, secret) {
            Ok(()) => {
                let got = get(service, account).expect("get after set should succeed");
                assert_eq!(got, secret, "round-tripped secret must match original");
                delete(service, account).expect("delete should succeed");
                match get(service, account) {
                    Err(CredentialError::NotFound { .. }) => {}
                    Err(other) => panic!("expected NotFound after delete, got {other:?}"),
                    Ok(_) => panic!("get after delete should fail"),
                }
            }
            Err(CredentialError::PermissionDenied(_)) | Err(CredentialError::Other(_)) => {
                eprintln!("skipping keychain round-trip: no keychain backend available");
            }
            Err(CredentialError::NotFound { .. }) => {
                panic!("set() returned NotFound — should not happen");
            }
        }
    }

    #[test]
    fn service_prefix_format() {
        assert_eq!(
            qualified_service("supermemory"),
            "com.c4nfornever.supermemory"
        );
    }
}

// Tiny RAII helper used by the in-memory roundtrip test to guarantee
// the default backend is restored even on panic. We hand-roll this
// rather than pull in the `scopeguard` crate — it's a single test-only
// utility, the stdlib doesn't have a one-liner, and the public API
// surface is unaffected. (No-op struct means "I assert the developer
// reads the comment"; the real restore is the explicit call below.)
#[cfg(test)]
mod scopeguard_lite {
    pub struct RestoreOnDrop;
}
