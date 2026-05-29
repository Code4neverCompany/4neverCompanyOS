//! Story 3.9 — Promotion path: ephemeral → persistent after 3 spawns.
//!
//! Tracks how many times each ephemeral persona has been spawned.
//! After the 3rd spawn, callers receive a [`PromotionState::Offer`] that
//! they surface as a UI prompt. The user can:
//!
//! - **Promote** — [`EphemeralRegistry::promote`] scaffolds
//!   `<vault>/personas/<slug>/` (log/, skills/, memory/ + `.persona-meta.json`)
//!   and returns a stable `agent:<slug>:<uuid>` bus identity. Counter is reset.
//! - **Dismiss once** — the count stays ≥ threshold; the next spawn will
//!   re-offer. Call [`EphemeralRegistry::dismiss_once`] for clarity (no-op on
//!   the persisted record — the count already captures the intent).
//! - **Dismiss permanently** — [`EphemeralRegistry::dismiss_permanent`] sets
//!   a flag that suppresses the offer for all future spawns of this persona.
//!
//! ## Vault layout
//!
//! Per-persona records: `<vault>/ephemeral-registry/<slug>.json`
//!
//! On promotion the persona vault layout matches Story 3.3
//! (`ensure_persona_vault_dir`):
//! ```text
//! <vault>/personas/<slug>/
//!     log/
//!     skills/
//!     memory/
//!     .persona-meta.json   (lifecycle: "persistent", persona_type: "dynamic")
//! ```
//!
//! The `.persona-meta.json` schema is vault-layout v1.0, identical to
//! Story 3.3 so the desktop UI can render both native-persistent and
//! promoted-ephemeral personas through the same path.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Registry schema version embedded in every `<slug>.json` record.
pub const REGISTRY_SCHEMA_VERSION: &str = "ephemeral-registry/v1.0";
/// Vault-layout version embedded in every `.persona-meta.json`.
pub const VAULT_DIR_VERSION: &str = "vault-layout/v1.0";
/// Number of spawns required before the promotion offer is shown.
pub const PROMOTION_THRESHOLD: u32 = 3;

// ── Errors ────────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

// ── Persisted record ──────────────────────────────────────────────────────────

/// Per-ephemeral-persona record stored at
/// `<vault>/ephemeral-registry/<slug>.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EphemeralRecord {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub slug: String,
    /// How many times this ephemeral persona has been spawned.
    pub spawn_count: u32,
    /// When `true`, the promotion offer is permanently suppressed.
    pub dismiss_permanent: bool,
    /// Whether this persona has been promoted to persistent.
    pub promoted: bool,
    /// ISO-8601 UTC timestamp of promotion, absent until promoted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub promoted_at: Option<String>,
}

impl EphemeralRecord {
    fn new(slug: &str) -> Self {
        Self {
            schema: REGISTRY_SCHEMA_VERSION.to_string(),
            slug: slug.to_string(),
            spawn_count: 0,
            dismiss_permanent: false,
            promoted: false,
            promoted_at: None,
        }
    }
}

// ── Promotion state ───────────────────────────────────────────────────────────

/// What callers should do after a spawn is recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PromotionState {
    /// Count is below threshold, persona is permanently dismissed, or
    /// already promoted — no prompt needed.
    None,
    /// This spawn reached or exceeded `PROMOTION_THRESHOLD` for a persona
    /// that hasn't been permanently dismissed or already promoted.
    /// The UI should surface a promotion dialog.
    Offer {
        /// Total spawn count after this spawn (≥ `PROMOTION_THRESHOLD`).
        spawn_count: u32,
    },
}

// ── PersonaMeta (vault-layout/v1.0, matches Story 3.3) ───────────────────────

/// `.persona-meta.json` written to a promoted persona's vault directory.
///
/// Schema matches Story 3.3's `PersonaMeta` so the desktop UI can render
/// native-persistent and promoted-ephemeral personas via the same path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonaMeta {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub persona_id: String,
    /// Always `"dynamic"` for promoted ephemerals (dynamically created).
    pub persona_type: String,
    /// `"persistent"` after promotion.
    pub lifecycle: String,
    /// CLI that backed this persona (e.g. `"claude"`).
    pub backing_cli: String,
    pub created_at: String,
    pub vault_dir_version: String,
    /// Stable `agent:<slug>:<uuid>` bus identity minted at promotion time.
    pub bus_identity: String,
}

// ── EphemeralRegistry ─────────────────────────────────────────────────────────

/// Manages spawn counters and promotion records for ephemeral personas.
///
/// Records live at `<vault>/ephemeral-registry/<slug>.json`. All I/O is
/// synchronous and designed to be called from the same context as
/// [`run_ephemeral`][crate::run_ephemeral].
#[derive(Debug, Clone)]
pub struct EphemeralRegistry {
    vault_path: PathBuf,
}

impl EphemeralRegistry {
    /// Build a registry rooted at `vault_path`.
    pub fn new(vault_path: impl Into<PathBuf>) -> Self {
        Self {
            vault_path: vault_path.into(),
        }
    }

    fn registry_dir(&self) -> PathBuf {
        self.vault_path.join("ephemeral-registry")
    }

    fn record_path(&self, slug: &str) -> PathBuf {
        self.registry_dir().join(format!("{slug}.json"))
    }

    /// Load the record for `slug`, returning a fresh default if not found.
    pub fn load_record(&self, slug: &str) -> Result<EphemeralRecord, RegistryError> {
        let path = self.record_path(slug);
        if !path.exists() {
            return Ok(EphemeralRecord::new(slug));
        }
        let raw = std::fs::read_to_string(&path)?;
        let record = serde_json::from_str(&raw)?;
        Ok(record)
    }

    fn save_record(&self, record: &EphemeralRecord) -> Result<(), RegistryError> {
        let dir = self.registry_dir();
        std::fs::create_dir_all(&dir)?;
        let path = self.record_path(&record.slug);
        let body = serde_json::to_string_pretty(record)?;
        std::fs::write(&path, body)?;
        Ok(())
    }

    /// Record one spawn of `slug`, incrementing its counter.
    ///
    /// Returns:
    /// - [`PromotionState::Offer`] when the count just reached or exceeded
    ///   [`PROMOTION_THRESHOLD`] and the persona hasn't been permanently
    ///   dismissed or already promoted.
    /// - [`PromotionState::None`] otherwise.
    pub fn record_spawn(&self, slug: &str) -> Result<PromotionState, RegistryError> {
        let mut record = self.load_record(slug)?;
        record.spawn_count += 1;
        self.save_record(&record)?;

        if record.promoted || record.dismiss_permanent {
            return Ok(PromotionState::None);
        }
        if record.spawn_count >= PROMOTION_THRESHOLD {
            Ok(PromotionState::Offer {
                spawn_count: record.spawn_count,
            })
        } else {
            Ok(PromotionState::None)
        }
    }

    /// Skip the promotion offer for this occurrence only.
    ///
    /// The spawn count stays ≥ threshold; the next spawn will re-offer.
    /// This is a logical no-op on the persisted record (the count already
    /// captures the intent), provided for explicit call-site clarity.
    pub fn dismiss_once(&self, _slug: &str) -> Result<(), RegistryError> {
        Ok(())
    }

    /// Permanently suppress the promotion offer for `slug`.
    ///
    /// After this call [`record_spawn`][Self::record_spawn] returns
    /// [`PromotionState::None`] for all future spawns of this persona.
    pub fn dismiss_permanent(&self, slug: &str) -> Result<(), RegistryError> {
        let mut record = self.load_record(slug)?;
        record.dismiss_permanent = true;
        self.save_record(&record)
    }

    /// Promote `slug` to a persistent persona.
    ///
    /// Scaffolds `<vault>/personas/<slug>/` (log/, skills/, memory/ subdirs
    /// + `.persona-meta.json`) and marks the registry record as promoted
    /// with the spawn counter reset to 0.
    ///
    /// Idempotent: re-calling returns the existing [`PersonaMeta`] without
    /// re-minting the bus identity or resetting the creation timestamp.
    pub fn promote(&self, slug: &str, backing_cli: &str) -> Result<PersonaMeta, RegistryError> {
        let persona_dir = self.vault_path.join("personas").join(slug);
        let meta_path = persona_dir.join(".persona-meta.json");

        // Idempotent: return existing meta if present and parseable.
        if meta_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&meta_path) {
                if let Ok(existing) = serde_json::from_str::<PersonaMeta>(&raw) {
                    self.mark_promoted(slug)?;
                    return Ok(existing);
                }
            }
        }

        // Scaffold vault directory layout (matches Story 3.3).
        for sub in ["log", "skills", "memory"] {
            std::fs::create_dir_all(persona_dir.join(sub))?;
        }

        let meta = PersonaMeta {
            schema: VAULT_DIR_VERSION.to_string(),
            persona_id: slug.to_string(),
            persona_type: "dynamic".to_string(),
            lifecycle: "persistent".to_string(),
            backing_cli: backing_cli.to_string(),
            created_at: iso8601_utc_now(),
            vault_dir_version: VAULT_DIR_VERSION.to_string(),
            bus_identity: build_bus_identity(slug),
        };
        let body = serde_json::to_string_pretty(&meta)?;
        std::fs::write(&meta_path, body)?;

        self.mark_promoted(slug)?;
        Ok(meta)
    }

    /// Mark a record as promoted and reset its spawn counter.
    fn mark_promoted(&self, slug: &str) -> Result<(), RegistryError> {
        let mut record = self.load_record(slug)?;
        if !record.promoted {
            record.promoted = true;
            record.spawn_count = 0;
            record.promoted_at = Some(iso8601_utc_now());
            self.save_record(&record)?;
        }
        Ok(())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Current time as ISO-8601 UTC, e.g. `2026-05-29T15:00:00Z`.
fn iso8601_utc_now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

/// Non-cryptographic UUID-v4-shaped string (8-4-4-4-12 hex).
///
/// Mirrors Story 3.3's `generate_uuid_v4`: no `uuid`/`rand` crate to keep
/// the dep footprint lean. Uses monotonic nanos as entropy; sufficient for
/// bus identity uniqueness across human-paced spawns.
fn generate_uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0u64);
    // Linear-congruential step — enough entropy spread for this use-case.
    let mut state: u64 = seed ^ 0xDEAD_BEEF_CAFE_0000u64;
    let mut next = || -> u64 {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        state
    };
    let a = next();
    let b = next();
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        a as u16 & 0x0FFF,
        ((b >> 48) as u16 & 0x3FFF) | 0x8000, // variant: 10xx
        b & 0x0000_FFFF_FFFF_FFFF,
    )
}

/// `agent:<slug>:<uuid>` bus identity for a promoted persona.
fn build_bus_identity(slug: &str) -> String {
    format!("agent:{slug}:{}", generate_uuid_v4())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn registry_in(dir: &TempDir) -> EphemeralRegistry {
        EphemeralRegistry::new(dir.path())
    }

    // ── Spawn counter ────────────────────────────────────────────────────────

    #[test]
    fn two_spawns_no_prompt() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        assert_eq!(reg.record_spawn("reviewer").unwrap(), PromotionState::None);
        assert_eq!(reg.record_spawn("reviewer").unwrap(), PromotionState::None);

        let record = reg.load_record("reviewer").unwrap();
        assert_eq!(record.spawn_count, 2, "count must be 2 after two spawns");
    }

    #[test]
    fn third_spawn_triggers_offer() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        reg.record_spawn("reviewer").unwrap();
        reg.record_spawn("reviewer").unwrap();
        let state = reg.record_spawn("reviewer").unwrap();

        assert_eq!(
            state,
            PromotionState::Offer { spawn_count: 3 },
            "3rd spawn must return an offer"
        );
    }

    #[test]
    fn subsequent_spawns_keep_offering() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        // 4th and 5th also offer.
        assert_eq!(
            reg.record_spawn("reviewer").unwrap(),
            PromotionState::Offer { spawn_count: 4 }
        );
        assert_eq!(
            reg.record_spawn("reviewer").unwrap(),
            PromotionState::Offer { spawn_count: 5 }
        );
    }

    #[test]
    fn counter_is_per_slug() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        reg.record_spawn("reviewer").unwrap();
        reg.record_spawn("reviewer").unwrap();
        // Second persona is independent.
        reg.record_spawn("linter").unwrap();

        assert_eq!(
            reg.record_spawn("reviewer").unwrap(),
            PromotionState::Offer { spawn_count: 3 },
            "reviewer must hit threshold independently"
        );
        assert_eq!(
            reg.record_spawn("linter").unwrap(),
            PromotionState::None,
            "linter still at 2 spawns"
        );
    }

    // ── Dismiss ──────────────────────────────────────────────────────────────

    #[test]
    fn dismiss_once_re_offers_next_spawn() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        // User dismisses once.
        reg.dismiss_once("reviewer").unwrap();
        // Next spawn still offers (count is 4 now, ≥ 3, not permanently dismissed).
        assert_eq!(
            reg.record_spawn("reviewer").unwrap(),
            PromotionState::Offer { spawn_count: 4 }
        );
    }

    #[test]
    fn dismiss_permanent_suppresses_all_future_offers() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        reg.dismiss_permanent("reviewer").unwrap();

        // No offer on subsequent spawns.
        assert_eq!(reg.record_spawn("reviewer").unwrap(), PromotionState::None);
        assert_eq!(reg.record_spawn("reviewer").unwrap(), PromotionState::None);

        let record = reg.load_record("reviewer").unwrap();
        assert!(record.dismiss_permanent, "flag must be persisted");
    }

    // ── Promote ──────────────────────────────────────────────────────────────

    #[test]
    fn promote_creates_vault_layout() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        let meta = reg.promote("reviewer", "claude").unwrap();

        // persona_type / lifecycle correct.
        assert_eq!(meta.persona_type, "dynamic");
        assert_eq!(meta.lifecycle, "persistent");
        assert_eq!(meta.backing_cli, "claude");
        assert_eq!(meta.persona_id, "reviewer");

        // bus identity shape: "agent:<slug>:<uuid>".
        assert!(
            meta.bus_identity.starts_with("agent:reviewer:"),
            "got: {}",
            meta.bus_identity
        );

        // Vault subdirs exist.
        let persona_dir = dir.path().join("personas").join("reviewer");
        for sub in ["log", "skills", "memory"] {
            assert!(
                persona_dir.join(sub).is_dir(),
                "personas/reviewer/{sub}/ must exist"
            );
        }

        // .persona-meta.json is readable and round-trips cleanly.
        let raw = std::fs::read_to_string(persona_dir.join(".persona-meta.json")).unwrap();
        let parsed: PersonaMeta = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.lifecycle, "persistent");
    }

    #[test]
    fn promote_resets_spawn_counter() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..5 {
            reg.record_spawn("reviewer").unwrap();
        }
        reg.promote("reviewer", "claude").unwrap();

        let record = reg.load_record("reviewer").unwrap();
        assert_eq!(record.spawn_count, 0, "counter must reset on promotion");
        assert!(record.promoted, "promoted flag must be set");
        assert!(record.promoted_at.is_some(), "promoted_at must be recorded");
    }

    #[test]
    fn promote_idempotent() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        let first = reg.promote("reviewer", "claude").unwrap();
        let second = reg.promote("reviewer", "claude").unwrap();

        // Identity is stable across re-promotion calls.
        assert_eq!(
            first.bus_identity, second.bus_identity,
            "bus identity must be stable across idempotent promotes"
        );
    }

    #[test]
    fn promoted_persona_no_longer_offers() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);

        for _ in 0..3 {
            reg.record_spawn("reviewer").unwrap();
        }
        reg.promote("reviewer", "claude").unwrap();

        // Spawns after promotion no longer offer (it's persistent now).
        assert_eq!(reg.record_spawn("reviewer").unwrap(), PromotionState::None);
    }

    #[test]
    fn registry_dir_is_under_vault() {
        let dir = TempDir::new().unwrap();
        let reg = registry_in(&dir);
        reg.record_spawn("reviewer").unwrap();

        // Record must live at <vault>/ephemeral-registry/reviewer.json.
        let path = dir
            .path()
            .join("ephemeral-registry")
            .join("reviewer.json");
        assert!(path.exists(), "registry record must be at {}", path.display());

        let raw = std::fs::read_to_string(&path).unwrap();
        let record: EphemeralRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(record.slug, "reviewer");
        assert_eq!(record.spawn_count, 1);
    }

    #[test]
    fn uuid_shape_is_correct() {
        let uuid = generate_uuid_v4();
        let parts: Vec<&str> = uuid.split('-').collect();
        assert_eq!(parts.len(), 5, "UUID must have 5 parts: {uuid}");
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        assert!(parts[2].starts_with('4'), "version nibble must be 4: {uuid}");
    }
}
