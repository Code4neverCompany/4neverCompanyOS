# pinned-versions.md — 4neverCompany OS

**Purpose:** explicit pinned tags for every upstream component, with rationale, smoke-test status, and the planned quarterly-revisit date. This is the source-of-truth for OQ-J and the per-component row that `LICENSES.md` cross-references.

**Audit status:** **DRAFT** — initial pins captured by Architect at M0 start using upstream release feeds as of 2026-05-26. Final pins land after Maurice's M0 review and after Story 1.4's smoke-tests run on the reference Windows machine.

**Cadence:** quarterly rebase per OQ-J. Each rebase appends a change-log entry at the bottom.

**Date of this snapshot:** 2026-05-26
**Next planned revisit:** 2026-08-26 (Q3 2026 rebase window)

---

## How to read this file

Each row pins a single component to a specific tag/version with:

- **Tag**: the immutable identifier we lock to.
- **Released**: when upstream cut that tag.
- **Confidence**: how comfortable we are that this tag is stable for the M0–M5 window.
- **Smoke-test**: result of the smoke-test on the reference Windows machine *(filled in during Story 1.4)*.
- **Rationale**: why this tag and not another.

The "Confidence" levels translate to rebase priority: `high` = skip next revisit, `medium` = re-evaluate at the scheduled cadence, `low` = re-evaluate sooner than the cadence.

---

## Tier 1 — Bundled runtime + frontend

| Component | Tag | Released | Confidence | Smoke-test | Rationale |
|---|---|---|---|---|---|
| **Node.js** | `>= 20.x LTS`; latest LTS at M0 install time pinned in CI matrix | rolling | high | TBD | Brief §5 requires `>= 20`. Pin to current LTS line so security patches flow. Current dev machine has v25.0.0 (above floor). |
| **pnpm** | `>= 9.15` floor; CI uses `latest` 11.x; reference machine 11.3.0 | 2026-04 (11.3.0 line) | high | ✓ install + workspace resolve verified on 2026-05-26 | Brief §5 floor is 9.15. Modern (10/11.x) is stable and required for the new `pnpm-workspace.yaml` build-approval mechanism the Tauri spike surfaced. |
| **Rust toolchain (rustc + cargo)** | `1.90.0` stable channel | 2025-09-14 | high | ✓ `rustc --version` returns 1.90.0; `cargo check` blocked separately by Windows SDK gap (see "Open prerequisites" below) | Stable channel; Tauri 2 requires recent Rust. Pin in `rust-toolchain.toml`. |
| **Tauri CLI** (`@tauri-apps/cli`) | **`2.11.2`** | 2026-05-16 | high | ✓ Frontend scaffold + build verified on 2026-05-26 (spike) | Most recent stable 2.x. Matches the Cargo `tauri = "2"` constraint. |
| **Tauri Rust crates** (`tauri`, `tauri-build`, `tauri-plugin-opener`) | `2.x` workspace at `tauri-cli-v2.11.2` time | 2026-05 | high | TBD — blocked on Win SDK | Same family as Tauri CLI. |
| **WebView2 Runtime** | minimum **`148.x` Evergreen** (current: 148.0.3967.83 on dev machine) | rolling Evergreen | high | ✓ Detected via `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{...}` | Evergreen auto-updates; we set a minimum and let Microsoft ship patches. First-run wizard chains to Evergreen Bootstrapper if absent (per LICENSES.md WebView2 note). |
| **Vite** | **`7.3.3`** | (latest as of spike install) | high | ✓ `pnpm build` passed on 2026-05-26 (spike) | Tauri 2's default template ships Vite 7. |
| **React** + **React-DOM** | **`19.2.6`** | 2026-04-ish | high | ✓ Spike renders | Tauri 2 React-TS template uses ^19. |
| **TypeScript** | **`5.8.3`** | 2026-03-ish | high | ✓ Spike compiles with `tsc --strict` | Tauri 2 React-TS template's pinned line. |
| **Paperclip** | **`v2026.525.0`** | 2026-05-25 | medium | TBD — needs verification when scaffolded in M1 | Most recent stable on the date of M0 start. Active development; expect frequent rebase. **Calendar-versioning** (`v<year>.<MMDD>.<n>`) makes the cadence obvious. |
| **Hermes Agent** | **`v2026.5.16`** (internal "v0.14.0") | 2026-05-16 | medium | TBD — needs verification at M1 | Most recent stable on date of M0 start. Active development. |
| **BMAD Method** (`bmad-method` npm pkg) | **`6.7.1`** | 2026 (already installed in this project) | high | ✓ Installed + `_bmad` directory verified | Locked in `package.json` devDependencies; matches the BMAD workflow files used to plan this project. |
| **Zellij** | **`v0.44.3`** | 2026-05-13 | medium | TBD — **explicitly verify Windows PTY handling** during M1 Story 1.11 per build plan risk and source brief §9 | Most recent stable. Windows PTY is the known-weakness area. |
| **Embedded Postgres** | matches Paperclip's preferred version (Paperclip ships its own embedded build) | tracks Paperclip | medium | TBD | Defer the explicit Postgres pin to Paperclip's choice — keeps integration surface single-source. |
| **Antigravity CLI (`agy`)** | **public-preview state as of 2026-05-26** — no public-release tag scheme (closed-source). Captured by URL of Google's installer + first-run date. | rolling preview | **LOW — needs M2 re-verification** | TBD; explicitly re-check before Frontend Designer ships (Story 2.1) | Source brief §9 + LICENSES.md note: **RCE issue reported May 2026** must be confirmed fixed at M2 start before Frontend Designer launches into production wizard flows. |

---

## Tier 2 — Integrated tools (no pin we control; we lock at install-time only)

| Component | Version contract | Smoke-test | Notes |
|---|---|---|---|
| **Claude Code CLI** | Tracks Anthropic's standard channel (`@anthropic-ai/claude-code` or equivalent npm pkg; or system-package channel if Anthropic ships one). Pin via `package.json` if installable as a dep; otherwise the wizard runs its installer at first-run. | TBD via Story 1.9 wizard work | The user authenticates with their own Anthropic credentials per the Anthropic Commercial ToS clause that forbids third-party login routing. |
| **Obsidian** | User-installed via Obsidian's official channel (`obsidian.md/download`). The wizard checks for presence and offers to download if missing. | TBD via Story 1.7 wizard work | Workspace treats vault as filesystem; no Obsidian API integration. |
| **Supermemory** | SaaS API. The `packages/supermemory-client` pins to the version of the Supermemory client library that's stable at M5; the SaaS itself evolves independently. | TBD at M5 | M5 deliverable only. |
| **GitHub** | SaaS / git protocol. We integrate via `gh` CLI or libgit2; pin those at M5. | TBD at M5 | M5 deliverable only. |

---

## Tier 3 — Build-time only

| Component | Version | Notes |
|---|---|---|
| **`rustfmt`** | bundled with Rust 1.90.0 stable | Used for `cargo fmt`. |
| **`clippy`** | bundled with Rust 1.90.0 stable | Used for `cargo clippy` in CI. |
| **`@vitejs/plugin-react`** | `^4.7.0` (latest at scaffold time) | Vite plugin. Auto-updated by pnpm minor-version rules. |
| **`@types/react`** + **`@types/react-dom`** | `^19.x` (latest at scaffold time) | TS types. |
| **MSVC** (Visual Studio Build Tools 2022 + Windows 11 SDK) | Build Tools 2022, MSVC `14.44.35207`, Windows 11 SDK 10.0.22621.x or newer | **Required on every Windows dev machine** to link Tauri Rust crates. Not redistributed. Spike surfaced that the dev machine's SDK install is incomplete — Story 1.4 follow-up flagged in `docs/spike-report-tauri-webview2.md`. |
| **NSIS** | bundled with Tauri's `tauri build` Windows bundler | Bundles the `.exe`. |
| **`cargo-deny`** *(planned M0 follow-up)* | latest stable | Add to CI baseline (Story 1.5) for license-policy enforcement. |

---

## Open prerequisites that block at M0 start

These are not version pins but environmental items the team needs to resolve before pin verification can complete on the reference machine.

1. **Windows 11 SDK install** — required for `cargo check` / `cargo build` of Tauri Rust crates on Windows. Surfaced by Story 1.1 spike. Action: Maurice re-installs via VS Installer modify or `winget install Microsoft.WindowsSDK.10.0.22621`. See `docs/spike-report-tauri-webview2.md` "Action items" section.
2. **`pnpm-workspace.yaml` build-approval syntax** — pnpm 11+ moved `pnpm.onlyBuiltDependencies` from `package.json` to `pnpm-workspace.yaml` with `allowBuilds.<pkg>: true`. Story 1.2 monorepo scaffolding must include this from day 1.
3. **WebView2 minimum runtime version** — confirm the `>= 148.x` floor is correct against Tauri 2's actual minimum requirement at the pinned CLI version.

---

## Smoke-test methodology

When Story 1.4 completes for a given pin, the smoke-test is:

1. **Install**: install the component at the pinned tag in a clean directory.
2. **Compile**: `cargo check` for Rust crates; `pnpm build` for JS packages; manual binary launch for tools.
3. **Run-time minimum**: invoke the tool's `--version` or equivalent and confirm it matches the pin.
4. **Cross-integration**: invoke any integration point we'll rely on (e.g., for Paperclip: start its embedded Postgres + verify Paperclip's event system fires; for Hermes: verify `hermes-paperclip-adapter` resolves the pinned Paperclip).

The smoke-test result column gets filled with:
- ✓ on pass
- ⚠ with a note on partial pass (e.g., "compiles but flaky under N concurrent agents")
- ✗ with a remediation note on fail

---

## Rebase cadence and policy (per OQ-J)

- **Quarterly rebase window:** the team reserves the first week of each calendar quarter (Q1: Jan, Q2: Apr, Q3: Jul, Q4: Oct) to walk every Tier-1 row and re-evaluate. For 2026, the next window is **August 2026** (Q3) since this draft lands in Q2.
- **Out-of-band rebase:** if an upstream ships a security fix or a breaking change before the window, rebase that one row out-of-band and document in the change-log below.
- **Per-milestone reserve:** ~10% of each milestone's capacity is reserved for upstream-sync work per build plan cross-cutting concern. With 4+ engineers (per OQ-L), this distributes across the team.
- **Contribution-back:** per OQ-M, when we find or fix a bug in any Tier-1 component during integration, the fix is offered upstream as a PR before being carried in-tree.

---

## Change log

| Date | Action | Outcome | By |
|---|---|---|---|
| 2026-05-26 | Initial DRAFT produced at M0 start. Tier-1 tags captured from upstream release feeds: Paperclip v2026.525.0, Hermes Agent v2026.5.16, Zellij v0.44.3, Tauri CLI 2.11.2, BMAD 6.7.1 (locked from prior install). Smoke-tests TBD until Win SDK environmental gap is resolved. | DRAFT pending Maurice's M0 review and Story 1.4 smoke-test run | Architect (Winston) |
