# Architecture — 4neverCompany OS

_One-paragraph summary per concern. Detailed decisions live in [`_bmad-output/planning-artifacts/architecture.md`](_bmad-output/planning-artifacts/architecture.md)._

## App shell

The desktop product is a **Tauri 2** application (Rust backend + WebView2 frontend on Windows). Two separate Tauri windows exist: `apps/desktop` hosts the main workspace UI (embedding Paperclip's React control plane and Zellij terminal panes), and `apps/wizard` is a first-run setup wizard that handles credential entry and vault scaffolding. Tauri was chosen over Electron for its smaller binary footprint, memory profile, and native Rust interop; the M0 spike confirmed that Paperclip's React UI renders correctly inside WebView2. An Electron fallback was evaluated and rejected (see `docs/architecture-alternatives-evaluation.md`).

## Language / runtime

The monorepo uses two languages. **Rust** (stable, pinned via `rust-toolchain.toml`) owns everything that touches the OS: process spawning, PTY supervision, file-watching, keychain access, and Tauri IPC commands. **TypeScript** (5.8.x, ESM modules, strict mode) owns the UI layer and all orchestration packages (bus client, workflow engine, persona sync, stall detector, vault layout, credential storage facade). Python and Go appear only as bundled upstream binaries (Hermes, BMAD toolchain) — no custom Python or Go code is authored in this repo. Node 22.13+ is required at the workspace level because pnpm 11's internal `node:sqlite` module depends on it.

## Package manager

**pnpm 11** (pinned to `11.3.0`, declared in `package.json#packageManager`). The workspace uses `pnpm-workspace.yaml` to enumerate packages and apps. Build-script allowlist is maintained in `pnpm-workspace.yaml` under `allowedDeprecatedVersions` / `onlyBuiltDependencies` to satisfy pnpm 11's build-approval model. The lockfile (`pnpm-lock.yaml`) is committed and enforced in CI with `--frozen-lockfile`. Rust dependencies are managed by Cargo (`Cargo.toml` + committed `Cargo.lock`).

## Build

TypeScript packages are compiled with `tsc --noEmit` for type-checking; Vite bundles the two frontend apps. Rust crates are compiled with `cargo build --workspace`. Root scripts aggregate both: `pnpm typecheck` runs `tsc` across all 14 packages; `pnpm build` runs each package's Vite or `tsc` build; `pnpm build:desktop` / `pnpm build:wizard` invoke `tauri build` for the full Tauri bundle. The VS Developer Shell (`Launch-VsDevShell.ps1 -Arch amd64`) must be active before any Cargo/Tauri command on Windows so that the MSVC linker and Windows SDK headers are on `PATH`.

## Test

JavaScript tests use **vitest** (per-package, run from the workspace root with `pnpm test`, which delegates via `pnpm -r --if-present test`). Rust tests use the standard `cargo test --workspace`. CI runs both suites on every push to `main` and every PR, across Windows, macOS, and Linux. Slow integration tests requiring optional system tools (Zellij, supervisor binary) are gated with `#[ignore]` and run separately when those tools are available.

## Packaging

Release builds are produced by `tauri build`, which invokes the **NSIS bundler** on Windows to generate a single-file `.exe` installer. The icon chain starts at `apps/desktop/icons/icon.ico` (multi-resolution, generated from the monogram SVG). The NSIS installer is the primary Windows distribution artifact (Story 1.17a); a portable `.zip` fallback may be added in M5 alongside macOS (`.dmg`) and Linux (`.AppImage`) targets.

## Persona system (M2, Story 2.3+)

The desktop exposes a **three-tier persona surface**. Two fixed personas are always available: the **Dev** persona (Claude Code, Zellij session `dev-<project-id>`) and the **Frontend Designer** (Antigravity CLI `agy`, session `designer-<project-id>`). A third tier of **dynamic personas** (Story 3.1) is spawned via the BMad Builder "Add Agent" panel: session naming is `dyn-<slug>-<project-id>`, lifecycle is either `persistent` (pane survives exit) or `ephemeral` (pane closes on CLI exit). All three tiers route through the `c4n-persona-supervisor` PTY wrapper so stdout/stderr land in `vault/personas/<id>/log/`.

Before spawning the Frontend Designer, the Rust backend reads the most-recently-modified `.md` files from the user's Obsidian vault (capped at 8 entries × 16 KB each via `c4n_platform_fs::recent_vault_entries`) and appends them as a context section to `agy.md`. This gives the designer persona working memory at session start without requiring a separate sync step. Vault write-back from the UI (Personas panel "Write note →") calls `write_vault_note`, which appends Markdown to `vault/inbox/<date>-<slug>.md`. Direct file I/O is used for M2; the pub/sub bus write path (Stories 2.7–2.10) layers on top in M3.

## Progress signal / stall detection (M2, Stories 2.12–2.17)

`@c4n/progress-signal` is a module-level singleton (`ProgressBus`) that forwards file-system events from the Rust platform-fs layer to TypeScript subscribers. Three signal kinds are supported: `artifact.changed` (vault file written), `code.changed` (project code file written), and `story.state` (BMAD story transition, M4). `@c4n/stall-detector` subscribes to `ProgressBus` via a rolling-window algorithm: if the window (default 5 min) elapses with zero signals, a `stall-detected` event fires for Hermes Agent to consume. Tests use `vi.useFakeTimers()` and call `ProgressBus.emitArtifact()` directly to inject synthetic signals without a Tauri runtime.
