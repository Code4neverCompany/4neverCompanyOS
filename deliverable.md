# security-hardening — deliverable

## Summary

Three security improvements landed on `feature/security-hardening` off
`origin/main`:

1. **credential-storage** is now testable in CI — the previously
   `#[ignore]`'d round-trip test runs unconditionally against a new
   `InMemoryBackend`, with a second `#[ignore]`'d test retained for
   manual real-keychain verification.
2. **vault-scoping** violations are now visible on the bus as
   `vault.scope.violation` envelopes (new TS schema variant +
   `ViolationPublisher` Rust trait wired into `ScopeGuard`).
3. **pty-in path validation** in `c4n-persona-supervisor` rejects
   cross-persona input injection; the desktop's `write_persona_pty_in`
   Tauri command now calls the validator before any filesystem work.

## Branch

- Branch name: `feature/security-hardening`
- Base: `origin/main` (commit `78c1fee feat(BMAA-17): BMAD governance gates via Paperclip approvals`)
- Pushed: `feature/security-hardening -> origin/feature/security-hardening`
- Worktree: `I:\c4n-4neverCompanyOS\.worktrees\feature-security-hardening`

## Commits

```
c8a7a12 chore(security-hardening): rustfmt ephemeral.rs (trailing newline)
0f946e9 feat(security-hardening): validate_pty_in_path prevents cross-persona injection
8f17064 feat(security-hardening): vault.scope.violation bus event + ViolationPublisher
1c41018 feat(security-hardening): credential-storage backend trait + in-memory test backend
```

## Changed files

### Commit `1c41018` — credential-storage backend abstraction

- `crates/credential-storage/Cargo.toml`
  - Add `[features] test-backend = []` (default off)
- `crates/credential-storage/src/lib.rs`
  - New `KeychainBackend` trait (Send + Sync + Debug; `set` / `get` / `delete`)
  - `KeyringBackend`: production wrapper around the `keyring` crate
  - `InMemoryBackend`: HashMap-backed, gated `#[cfg(any(test, feature = "test-backend"))]`
  - `set_backend(Arc<dyn KeychainBackend>)` and `reset_backend_to_default()` (test seam)
  - Public `set` / `get` / `delete` signatures unchanged — wizard + desktop keep working
  - Tests:
    - `roundtrip_in_memory_backend` — **un-ignored**, runs in CI
    - `roundtrip_real_keyring` — `#[ignore]`'d, manual verification on a real machine
    - `in_memory_backend_counts_entries`
    - `in_memory_backend_get_missing_returns_not_found`
    - `in_memory_backend_delete_missing_is_error`

### Commit `8f17064` — vault-scope-violation bus event

- `packages/core/src/bus/envelope.ts`
  - Add `"vault.scope.violation"` to `BUS_EVENT_TYPES`
  - New `VaultScopeViolationEnvelopeSchema` (payload: `persona_id`,
    `attempted_path`, `allowed_paths[]`, `write_type`)
  - Add to the discriminated union
  - Export `VaultScopeViolationEnvelope` inferred type
- `crates/vault-scoping/src/lib.rs`
  - New `ViolationEvent` struct (matches the envelope payload)
  - New `ViolationPublisher` trait (Send + Sync + Debug) with
    `NullPublisher` default impl
  - `ScopeGuard::new_with_publisher(...)` constructor; `new(...)` keeps
    `NullPublisher` so pre-hardening call sites are unchanged
  - `classify_and_log` fires the publisher after appending the on-disk
    log entry; `log_out_of_scope_write` (direct-call) stays publisher-free
  - Pre-existing clippy fix: `five_persona_full_cross_concurrent_no_contamination`
    used `for i in 0..personas.len()` — converted to `for persona in personas.iter()`
  - Tests:
    - `out_of_scope_write_fires_publisher_event` (full event shape)
    - `in_scope_write_does_not_fire_publisher`
    - `attached_projects_appear_in_allowed_paths`
    - `default_guard_does_not_publish`
    - `log_out_of_scope_write_does_not_publish`

### Commit `0f946e9` — pty-in path validation

- `crates/persona-supervisor/src/lib.rs`
  - New `validate_pty_in_path(vault, requested_persona_id, claimer_persona_id) -> Result<PathBuf, SupervisorError>`
  - New `SupervisorError::PtyInClaimMismatch { requested, claimer }` variant
  - New `SupervisorError::PtyInInvalidPersonaId(String)` variant
  - Tests:
    - `validate_pty_in_path_accepts_self_claim`
    - `validate_pty_in_path_rejects_cross_persona_claim`
    - `validate_pty_in_path_rejects_empty_ids`
    - `validate_pty_in_path_matches_desktop_helper` (path layout pinned)
- `apps/desktop/src-tauri/Cargo.toml`
  - Add `c4n-persona-supervisor` dep so the validator is canonical
- `apps/desktop/src-tauri/src/commands/mod.rs`
  - `write_persona_pty_in` now calls `validate_pty_in_path` with
    `claimer == persona_id` before any filesystem work
  - Removed the local `pty_in_path_for` duplicate (the validator
    returns the path; tests now go through the supervisor's helper)
  - Pre-existing tests `pty_in_path_matches_supervisor_convention` and
    `pty_in_path_is_not_date_rotated` updated to call
    `c4n_persona_supervisor::pty_in_file_path` directly
- `Cargo.lock`
  - Adds `c4n-persona-supervisor` to the desktop crate's deps

### Commit `c8a7a12` — rustfmt cleanup

- `crates/persona-supervisor/src/ephemeral.rs`
  - Trailing-newline normalization (rustfmt stable 1.96.0); pre-existing
    drift that the gate caught.

## New bus event schema

`vault.scope.violation` — added to the `BusEnvelope` discriminated
union in both the Rust and TS sources of truth.

**TS** (`packages/core/src/bus/envelope.ts`):

```typescript
export const VaultScopeViolationEnvelopeSchema = z.object({
  ...envelopeBase,
  type: z.literal("vault.scope.violation"),
  payload: z.object({
    persona_id: z.string().min(1),
    attempted_path: z.string().min(1),
    allowed_paths: z.array(z.string().min(1)),
    write_type: z.enum(["create", "modify", "remove"]),
  }),
});
```

**Rust** (in `crates/vault-scoping`):

```rust
pub struct ViolationEvent {
    pub persona_id: String,
    pub attempted_path: String,
    pub allowed_paths: Vec<String>,
    pub write_type: WriteType,    // {Create, Modify, Remove}
    pub ts: String,               // ISO-8601 UTC, e.g. "2026-05-29T15:00:00Z"
}
```

`ViolationPublisher` is the trait consumers implement to translate the
typed event into a `BusEnvelope` and call `relay.publish(...)`. The
persona-supervisor is the canonical production caller; the desktop
observes the log file independently via the existing
`persona_scope_violations` Tauri command (unchanged) and can publish
from there as a future enhancement.

## Test results

`cargo test --workspace -- --test-threads=1` (exit 0):

```
c4n-bus-relay           : 20 passed, 0 failed, 0 ignored
c4n-credential-storage  :  5 passed, 0 failed, 1 ignored   ← previously-#[ignore]'d test now un-ignored
c4n-desktop             : 66 passed, 0 failed, 4 ignored
c4n-github-sync         :  7 passed, 0 failed, 1 ignored
c4n-persona-drift       :  8 passed, 0 failed, 0 ignored
c4n-persona-supervisor  : 49 passed, 0 failed, 1 ignored
c4n-persona-supervisor  :  9 passed, 0 failed, 0 ignored   (main.rs unittests)
c4n-platform-fs         : 20 passed, 0 failed, 1 ignored
c4n-vault-scoping       : 20 passed, 0 failed, 1 ignored   ← 5 new publisher tests
c4n-wizard              :  4 passed, 0 failed, 0 ignored
c4n-zellij-adapter      : 11 passed, 0 failed, 2 ignored
                        + 1 bus-relay doc test
                        + 1 ignored persona-supervisor doc test
                        = 0 failures total
```

The `cargo test --workspace` command without `--test-threads=1` exposes
a pre-existing test-isolation race in `apps/desktop/src-tauri/src/ipc/feeder.rs`'s
`with_env` helper (parallel tests racing on the `C4N_PAPERCLIP_SSE_URL`
env var). That helper is in code I did not touch; with single-threaded
execution every test in the workspace passes. The race is orthogonal to
this branch and would be a separate fix.

## Lint gates

- `cargo fmt --all -- --check`: **exit 0**
- `cargo clippy --workspace --all-targets -- -D warnings`: **exit 0**

## Notes for the verifier

1. **Public API of `set/get/delete` is unchanged.** The wizard
   (`apps/wizard/src-tauri`) and desktop (`apps/desktop/src-tauri`)
   call `creds::set` / `creds::get` / `creds::delete` exactly as
   before. The trait is internal plumbing; the only new public surface
   is `set_backend` (test seam) and the `test-backend` cargo feature.

2. **The `vault.scope.violation` envelope is wired into the supervisor's
   `ScopeGuard` path**, not the desktop process. The desktop process
   has no live bus publisher for the supervisor's process — the desktop
   observes the log file via the existing `persona_scope_violations`
   Tauri command (unchanged in this branch). For end-to-end bus flow
   the persona-supervisor would need a future named-pipe / IPC bridge
   into the desktop's `BusRelayState`; the test in
   `crates/vault-scoping/src/lib.rs` (a `RecordingPublisher`) demonstrates
   the publisher contract that bridge would implement.

3. **The `pty_in_path_for` local helper in `apps/desktop/src-tauri/src/commands/mod.rs`
   was removed** in favor of `c4n_persona_supervisor::pty_in_file_path`
   (now reachable via the new dep). The dep build cost is the price of
   having one canonical path-resolution + claim-check function.

4. **Wiz flow on Windows is unaffected.** The wizard Tauri commands
   (`store_credential`, `get_credential`, `delete_credential`) keep
   their signatures; the new `KeychainBackend` defaults to
   `KeyringBackend` (real OS keychain) so production wizard paths go
   through the existing keyring wrapper.

5. **Pre-existing clippy fix in `crates/vault-scoping/src/lib.rs`**
   (`five_persona_full_cross_concurrent_no_contamination` had a
   `needless_range_loop`) was required to clear the `-D warnings` gate
   in scope of this branch.
