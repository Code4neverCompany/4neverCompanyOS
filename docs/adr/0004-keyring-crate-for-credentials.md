# 0004 — `keyring` crate for OS-keychain credential storage

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Maurice, Winston (Architect), Amelia (Dev),
  ratified in the M0 security review
- **Source materials:** [`docs/4neverCompany_OS_Brief.md`](../4neverCompany_OS_Brief.md) §3.7
  & §5, [`docs/pinned-versions.md`](../pinned-versions.md),
  [`Cargo.toml`](../../Cargo.toml) `crates/credential-storage`,
  [`SECURITY.md`](../../SECURITY.md).

## Context

Several M1+ surfaces need to **persist and read user-supplied
secrets** without ever writing them to plaintext on disk:

- **Anthropic API key** — entered in the first-run wizard
  (Story 1.8), validated, then read by the Dev persona's
  supervisor on every `claude` spawn.
- **Antigravity OAuth refresh token** — captured by the wizard
  (Story 2.2), used by the Frontend Designer persona's `agy`
  spawn.
- **GitHub PAT** (M5) — for the GitHub-sync flow.
- **Supermemory API key** (M5) — for the cross-project memory
  layer.

The secrets are user-owned, never cross-shared between personas,
and never leave the host machine. The candidate backends are:

- **OS keychain via the [`keyring`](https://crates.io/crates/keyring)
  crate** — uses Windows Credential Manager, macOS Keychain, and
  the Secret Service (libsecret) on Linux.
- **Encrypted-at-rest JSON file** in the vault — would require
  inventing a key-derivation story for each platform, plus a
  recovery flow when the key is lost.
- **A user-managed `.env`** — would put plaintext in the vault
  and violates the no-plaintext-secrets rule.

Third-party CLI auth tokens (Claude Code, Antigravity CLI,
Obsidian, Supermemory) are a **separate concern**: each tool's
own installer handles its credential store, and the wizard
authenticates the user with each tool's own OAuth flow. The
workspace never holds those credentials.

## Decision

**Adopt the `keyring` crate** for all first-party credential
storage. Use a single, namespaced service prefix
**`com.c4nfornever.`** (e.g. `com.c4nfornever.dev.anthropic-key`,
`com.c4nfornever.frontend-designer.agy-refresh`,
`com.c4nfornever.user.github-pat`, …). The crate lives at
`crates/credential-storage/` and is consumed by both Tauri
shells and any other Rust code that needs secret access
(notably `crates/persona-supervisor`).

**The `packages/credential-storage` TypeScript facade** wraps the
Rust crate via Tauri commands so the React / TS code can call
`getCredential('dev.anthropic-key')` and never sees a secret
that wasn't explicitly requested.

## Consequences

**Positive:**

- **Per-platform security defaults** come for free: DPAPI on
  Windows, Keychain on macOS, libsecret on Linux. The workspace
  inherits the OS's own access-control story (e.g. macOS
  Keychain Access prompts on first use, Windows Credential
  Manager's per-user encryption).
- **No secrets on disk** in any of our formats. The
  `~/.4nevercompanyos/active-project.toml` and similar files
  (see [`docs/restart-survival.md`](../restart-survival.md))
  contain only metadata; secrets live in the OS keychain.
- **Service-prefix namespacing** (`com.c4nfornever.*`) keeps
  our entries isolated from any other app on the same machine
  and makes them trivially auditable / revocable. A future
  `pnpm c4n:reset-credentials` admin command can wipe the
  prefix in one call.
- **Cross-platform Rust API** — the `keyring` crate's trait
  surface is stable; the workspace compiles against it on all
  three target platforms (validated in CI on
  ubuntu-latest / windows-latest / macos-latest per
  `.github/workflows/ci.yml`).
- **Test-friendly** — the crate's `MockKeyring` backend is used
  in `cargo test` runs so unit tests never touch the real
  keychain.

**Negative / trade-offs:**

- **Linux libsecret must be installed** on the user's machine
  (most desktops have it; some minimal server / container
  installs do not). The first-run wizard's prerequisites
  check (Story 1.8) should fail fast with a clear error message
  if `secret-tool` is missing.
- **macOS Keychain Access prompts** appear the first time each
  process reads each entry. The wizard's first-run UX surfaces
  this; subsequent spawns are silent. Worth a follow-up ADR
  if user feedback surfaces friction.
- **CI's ubuntu runner** may not have a libsecret provider
  available in the default GitHub Actions image. The Rust
  test job uses the `MockKeyring` backend in CI; documented
  in the `crates/credential-storage` README.
- **Vault backup semantics** change: a user's vault snapshot
  (the Obsidian directory) no longer contains their secrets.
  M5's GitHub-sync story must be explicit about this in
  [`docs/vault-layout.md`](../vault-layout.md) — secrets are
  not synced via the GitHub mirror; the user re-enters them
  on each new machine, or the wizard re-prompts for them
  on first launch of the new install.

**Followups required:**

- Document the **service prefix** in
  [`docs/pinned-versions.md`](../pinned-versions.md) so it's
  discoverable as a pinned policy.
- Add a **`pnpm c4n:reset-credentials`** admin script (M3) that
  wipes everything under `com.c4nfornever.*`. Useful for
  support and for the wizard's "sign out" flow.
- Wire the **MockKeyring** backend into integration tests
  (M2) so the `#[ignore]`d supervisor tests in
  `crates/persona-supervisor/` can run end-to-end without a
  real keychain.

## Alternatives considered

- **Encrypted JSON in the vault** — rejected: forces us to
  invent a KDF + key-recovery story per platform, and the key
  has to live somewhere anyway, so we lose the "OS keychain
  is the source of truth" property.
- **`secret-service` crate directly on Linux, DPAPI manually on
  Windows, Keychain crate manually on macOS** — rejected:
  triples the maintenance surface for the same outcome.
  `keyring` is the canonical cross-platform abstraction in
  the Rust ecosystem.
- **A vault-resident secrets file with user-supplied passphrase**
  — rejected: adds a second password to remember (Anthropic
  key + the passphrase), and the user pattern of "I forgot
  my passphrase, please reset" is a known support drag.
- **HashiCorp Vault / AWS Secrets Manager** — out of scope;
  this is a local-first desktop product, not a cloud
  secrets manager.
