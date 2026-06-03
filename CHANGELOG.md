# Changelog

All notable changes to 4neverCompany OS are recorded here. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once v1.0 ships. Pre-v1.0 releases use the `0.0.x` scheme with
`Unreleased` for in-flight work.

> **Pre-release notice.** Until v1.0 is published, this is a
> living changelog of an in-progress build. Versions, dates, and
> feature lists will change. See [`README.md`](README.md) for the
> pre-release disclaimer and [`LICENSE`](LICENSE) for the
> source-availability terms.

## How to read this file

- **Versions are milestones.** `0.0.x` lines map 1:1 to the
  milestones in
  [`docs/4neverCompany_OS_Build_Plan.md`](docs/4neverCompany_OS_Build_Plan.md)
  (M0 → M5, plus patch releases).
- **Sections per release:** `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, `Security`. Omit a section if the release
  didn't touch that kind of change.
- **Dates are ISO 8601** (`YYYY-MM-DD`) and reflect the date the
  release tag was cut, not the date the work landed.
- **Unreleased** is the leading section and accumulates work in
  flight. When a release is cut, `Unreleased` is renamed to the
  new version and a fresh empty `Unreleased` section is added.

## [Unreleased]

### Added

- Top-level `CONTRIBUTING.md` covering dev setup on
  Windows/macOS/Linux, the gate commands, lefthook pre-commit /
  pre-push hooks, the per-package / per-crate / per-BMAD-workflow
  extension recipes, the commit message format, and the
  contribution-back policy.
- Top-level `SECURITY.md` with a private disclosure email
  (`security@4nevercompany.com`, TBD), a supported-versions
  table, and the bug-vs-security issue boundary.
- `lefthook.yml` plus `pnpm hooks:install` script: `pre-commit`
  runs `pnpm format` + `pnpm lint` + `cargo fmt` +
  `cargo clippy -D warnings`; `pre-push` runs `pnpm typecheck` +
  `pnpm test` + `cargo test --workspace`. Pure-docs commits skip
  the heavy steps via glob.
- `docs/adr/` ADR index and the first five ADRs (Tauri-over-Electron,
  pnpm workspace, monorepo, keyring crate, embedded Zellij) in
  the Michael Nygard Context / Decision / Consequences format.
- Extended `.gitignore` patterns: explicit `coverage/`, `build/`,
  `*.tsbuildinfo` (already present, kept), `apps/docs/.vitepress/cache/`,
  `.paperclip/`, `.mavis/`, and a fuller set of `.env*` variants.

### Changed

- `docs/HANDOFF.md` path references corrected from `bmad/` /
  `.bmad/` / `.bmad-artifacts/` to the in-tree convention
  `_bmad/` / `_bmad-output/` (with subdirs `bmm/`, `bmb/`, `core/`,
  `planning-artifacts/`, `implementation-artifacts/`). The BMAD
  install instructions and the directory layout diagram now
  match the actual filesystem.

### Fixed

- `docs/HANDOFF.md` was the only file that still referenced the
  pre-`_bmad` path convention; that drift is now resolved.

---

## [0.0.2] — 2026-05-31

The M1 walking-skeleton installer + the M1.5 visual baseline.

### Added

- **Windows NSIS installer** with `PATH` manipulation via NSIS
  `!macro` hooks (NEVAAA-132) — bundles Node, pnpm, Python,
  bundled Zellij v0.44.3, and the Paperclip binary.
- **`@c4n/ui-tokens`** package — design-token source-of-truth
  for the gold/cyan brand palette, consumed by both Tauri
  apps.
- **AppShell** component used by both `apps/desktop` and
  `apps/wizard` for the main window chrome.
- **First-run wizard restyle** to match the M1 visual baseline
  (per the NEVAAA-63 VitePress + Cloudflare Pages decision).
- **macOS DMG and Linux AppImage** installer scaffolding
  (drafts; not yet blessed for M5 public release).
- `apps/docs/` VitePress documentation site scaffolded (Story 5.8
  shortcut — was already in tree).
- `.github/workflows/docs.yml` — Cloudflare Pages deployment
  for the docs site.
- `.github/workflows/release.yml` — draft release creation for
  cross-platform installers.

### Changed

- **M1 "walking skeleton" exit criterion** (≤ 10-min install →
  working Dev agent) achieved. The 12-phase budget table lives in
  [`docs/e2e-smoke-test.md`](docs/e2e-smoke-test.md) (Story 1.18,
  success metric SM-1).
- **Tauri CSP** switched from `csp: null` to an explicit
  permissive CSP with a named `outDir` for the webview assets.
- **`cargo fmt` aligns with CI stable (1.96.0)** — pin
  follow-up from NEVAAA-112.

### Fixed

- NSIS `!ifdef` → `!macro` for `PATH` manipulation (fixes an
  installer regression where the system `PATH` was not updated
  on clean installs).
- `cargo fmt` drift in `apps/desktop/src-tauri/src/ipc/feeder.rs`
  (3 PRs: #3, #4 + an NEVAAA-112 follow-up #5).
- `prettier` drift in `.github/workflows/docs.yml`.

---

## [0.0.1] — 2026-05-26

The M0 pre-work baseline: decisions locked, repo initialized,
audits drafted.

### Added

- **Decision audits.**
  - [`docs/architecture-alternatives-evaluation.md`](docs/architecture-alternatives-evaluation.md)
    — comparative matrix for Tauri / Electron / WinUI 3 / Wails
    / Flutter Desktop; Tauri 2 confirmed as the chosen desktop
    shell, Electron as the documented fallback.
  - [`docs/pinned-versions.md`](docs/pinned-versions.md) — pinned
    tag for every bundled upstream (Paperclip v2026.525.0,
    Hermes v2026.5.16, BMAD Method 6.7.1, Zellij 0.44.x,
    Tauri 2.x).
  - [`LICENSES.md`](LICENSES.md) — per-component license audit
    (Tier 1 bundled = permissive; Tier 2 integrated = user
    auth).
  - [`docs/4neverCompany_OS_Brief.md`](docs/4neverCompany_OS_Brief.md)
    v0.6 — strategic vision.
  - [`docs/4neverCompany_OS_Build_Plan.md`](docs/4neverCompany_OS_Build_Plan.md)
    v0.1 — M0–M5 phasing.
- **Monorepo skeleton.**
  - `apps/desktop` (Tauri shell), `apps/wizard` (Tauri shell),
    `apps/docs/` (VitePress site, scaffolded).
  - `packages/core` (types + Zod schemas + Glossary),
    `packages/bus-client`, `packages/workflow-engine`,
    `packages/persona-sync`, `packages/progress-signal`,
    `packages/stall-detector`, `packages/telemetry`,
    `packages/vault-layout`, `packages/credential-storage`,
    `packages/github-sync`, `packages/supermemory-client`,
    `packages/memory-resolver`, `packages/ui-tokens`.
  - `crates/zellij-adapter`, `crates/bus-relay`,
    `crates/persona-supervisor`, `crates/platform-fs`,
    `crates/vault-scoping`, `crates/credential-storage`,
    `crates/persona-drift`, `crates/github-sync`.
  - `services/` for vendored upstreams; populated per the
    August 2026 quarterly rebase window.
- **CI matrix** (`.github/workflows/ci.yml`): JS + Rust jobs on
  ubuntu-latest / windows-latest / macos-latest, with a
  `ci-pass` summary job required for branch protection.
- **Rust workspace** (`Cargo.toml`): single root workspace
  spanning the 8 crates and the 2 Tauri shells; shared
  dependencies pinned in `[workspace.dependencies]`.
- **pnpm workspace** (`pnpm-workspace.yaml`): `apps/*` and
  `packages/*`; `onlyBuiltDependencies: [esbuild]` per
  pnpm 11's build-approval gate.
- **HANDOFF.md** — Claude Code operator protocol for
  dogfooding the BMAD methodology on this repo.

### Changed

- **Repo transitioned from a single-source monorepo sketch to a
  pnpm + Cargo dual workspace** with shared cross-component
  Schemas in `@c4n/core`. The Zod-based type system is
  upstream-agnostic so neither Paperclip nor Hermes can pull the
  schemas out from under us.

### Security

- **Source-available only** for evaluation until v1.0; the
  permanent license (intended MIT or Apache-2.0) is not yet
  published. See [`LICENSE`](LICENSE).
- **Tier-1 bundled components** all permissive
  (MIT / Apache-2.0 / BSD-family / WebView2 Distribution
  Agreement).
- **Tier-2 integrated tools** (Claude Code, Antigravity CLI,
  Obsidian, Supermemory, GitHub) are installed by the first-run
  wizard via each tool's own installer; the user authenticates
  with their own credentials. The workspace never holds
  third-party credentials.

---

## Release history at a glance

| Version | Date       | Milestone                                                        | Notes                                                                             |
| ------- | ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0.0.2   | 2026-05-31 | M1 walking-skeleton + M1.5 visual baseline                       | Windows NSIS installer, macOS DMG + Linux AppImage drafts, M1 exit criterion met. |
| 0.0.1   | 2026-05-26 | M0 pre-work (decisions locked, repo initialized, audits drafted) | Tauri 2 confirmed, monorepo skeleton, CI matrix, BMAD dogfooded on this repo.     |

[Unreleased]: #unreleased
[0.0.2]: #002--2026-05-31
[0.0.1]: #001--2026-05-26
[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
