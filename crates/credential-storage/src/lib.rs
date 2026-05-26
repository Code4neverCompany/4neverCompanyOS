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

use serde::Serialize;
use thiserror::Error;

/// Service-name prefix for all 4nCO-owned keychain entries. Keeps our
/// entries grouped and avoids collisions with other apps.
pub const SERVICE_PREFIX: &str = "com.c4nfornever";

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

/// Store a secret in the OS keychain under the given service+account pair.
/// Overwrites any existing entry. Service is auto-prefixed with
/// "com.c4nfornever" so workspace entries stay grouped.
pub fn set(service: &str, account: &str, secret: &str) -> Result<()> {
    let entry = keyring::Entry::new(&qualified_service(service), account)?;
    entry.set_password(secret)?;
    Ok(())
}

/// Retrieve a secret. Returns CredentialError::NotFound (with concrete
/// service/account in the variant) if no entry exists.
pub fn get(service: &str, account: &str) -> Result<String> {
    let entry = keyring::Entry::new(&qualified_service(service), account)?;
    entry.get_password().map_err(|err| match err {
        keyring::Error::NoEntry => CredentialError::NotFound {
            service: service.to_string(),
            account: account.to_string(),
        },
        other => CredentialError::Other(other.to_string()),
    })
}

/// Delete a secret. NotFound is mapped to an error rather than silent success
/// so callers can decide intentionally how to handle "nothing to delete."
pub fn delete(service: &str, account: &str) -> Result<()> {
    let entry = keyring::Entry::new(&qualified_service(service), account)?;
    entry.delete_credential().map_err(|err| match err {
        keyring::Error::NoEntry => CredentialError::NotFound {
            service: service.to_string(),
            account: account.to_string(),
        },
        other => CredentialError::Other(other.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip — set, get, delete. Uses a test-only service name to avoid
    /// polluting the real keychain in case the test leaks across runs.
    ///
    /// Note: on CI without a real keychain (e.g. Linux headless), the
    /// underlying keyring crate may fail with a permission/availability error.
    /// We accept either a successful round-trip or a clean PermissionDenied/
    /// Other error — what we are guarding against is an unexpected NotFound
    /// after a set() or a malformed error.
    #[test]
    fn roundtrip_or_clean_failure() {
        let service = "test.credential-storage";
        let account = "round-trip-account";
        let secret = "s3cr3t-value-for-test";

        // Best-effort cleanup of any leftover entry.
        let _ = delete(service, account);

        // set + get
        match set(service, account, secret) {
            Ok(()) => {
                let got = get(service, account).expect("get after set should succeed");
                assert_eq!(got, secret, "round-tripped secret must match original");

                // delete and confirm absence
                delete(service, account).expect("delete should succeed");
                match get(service, account) {
                    Err(CredentialError::NotFound { .. }) => {} // expected
                    Err(other) => panic!("expected NotFound after delete, got {other:?}"),
                    Ok(_) => panic!("get after delete should fail"),
                }
            }
            Err(CredentialError::PermissionDenied(_)) | Err(CredentialError::Other(_)) => {
                // Headless CI environment without a real keychain — acceptable.
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
