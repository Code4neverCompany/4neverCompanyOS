# Contributing to 4neverCompany OS

Thanks for considering a contribution. This document is the operator's
manual: how to set up your machine, run the gates, add a new package
or BMAD workflow, and land a clean change.

> **Read first.** The authoritative docs are
> [`docs/4neverCompany_OS_Brief.md`](docs/4neverCompany_OS_Brief.md)
> (vision) and [`docs/4neverCompany_OS_Build_Plan.md`](docs/4neverCompany_OS_Build_Plan.md)
> (phasing). The brief and the plan are **source of truth** — do not
> edit them casually. If a change requires touching them, raise a
> new version and get approval first.
>
> Day-to-day Claude Code session protocol lives in
> [`docs/HANDOFF.md`](docs/HANDOFF.md). This file is the engineering
> workflow on top of that.

## Code of conduct

We follow the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Be patient, be specific, be kind. Critique ideas, not people.

## Table of contents

1. [Project layout at a glance](#project-layout-at-a-glance)
2. [Dev environment setup](#dev-environment-setup)
3. [Build, test, and quality gates](#build-test-and-quality-gates)
4. [Pre-commit / pre-push hooks (lefthook)](#pre-commit--pre-push-hooks-lefthook)
5. [Adding a new TypeScript package](#adding-a-new-typescript-package)
6. [Adding a new Rust crate](#adding-a-new-rust-crate)
7. [Adding a new BMAD workflow / persona](#adding-a-new-bmad-workflow--persona)
8. [Commit message format](#commit-message-format)
9. [Pull request checklist](#pull-request-checklist)
10. [Contribution-back policy](#contribution-back-policy)
11. [License](#license)

---

## Project layout at a glance

```
4nevercompany-os/
├── apps/                   Tauri apps (desktop, wizard) + VitePress site
├── packages/               TypeScript packages (core, bus-client, …)
├── crates/                 Rust crates consumed as Tauri sidecars
├── services/               Vendored upstreams (Paperclip, Hermes, …)
├── tests/                  Workspace-level E2E (manual scenarios)
├── docs/                   Authoritative + generated docs
├── scripts/                Dev / build / pin-rebase helpers
├── _bmad/                  BMAD framework install (managed by npx bmad-method)
├── _bmad-output/           BMAD-produced planning + implementation artifacts
├── .github/workflows/      CI matrix
├── spikes/                 Throwaway exploratory code (gitignored)
├── docs/adr/               Architecture Decision Records
├── Cargo.toml              Rust workspace
├── pnpm-workspace.yaml     pnpm workspace
└── package.json            Root JS/TS package + scripts
```

Per-package unit tests live **alongside source** inside each
`packages/*` and `crates/*` directory. Workspace-level E2E lives in
`tests/manual/`.

---

## Dev environment setup

The same workflow runs on Windows, macOS, and Linux. Tauri's WebView2
runtime is Windows-specific at install time; everything else is
cross-platform.

### Common prerequisites (all platforms)

| Tool                  | Version       | Notes                                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------------------------- |
| **Node.js**           | ≥ 22.13       | Required by pnpm 11 (uses `node:sqlite` builtin). Use the active LTS line.            |
| **pnpm**              | 11.3.0        | Pinned via `packageManager` field. Install with `npm i -g pnpm@11.3.0`.               |
| **Rust**              | 1.90.0 stable | Pinned in `rust-toolchain.toml`. `rustup` will install it automatically on first use. |
| **Git**               | latest        | For version control.                                                                  |
| **GitHub CLI (`gh`)** | latest        | For license/version audits and PR creation.                                           |

### Platform extras

**Windows (10 / 11):**

1. Install **Visual Studio 2022 Build Tools** with the **Windows 11 SDK
   (10.0.28000.0 or newer)** component. Tauri's Rust crates need the
   C++ build tools + Windows SDK headers to link.
2. Install **Microsoft Edge WebView2 Runtime (Evergreen)** — the Windows
   installer usually has it; if not, the bootstrap step of the Tauri
   installer will fetch it.
3. **Every Tauri-touching shell session** must load the VS Developer
   environment so `LIB` and `INCLUDE` are populated for the Rust
   toolchain:
   ```powershell
   & 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
   ```

**macOS (13+):**

1. Install Xcode Command Line Tools: `xcode-select --install`.
2. Tauri 2's macOS bundle needs nothing else beyond the toolchain.

**Linux (Ubuntu 22.04+ or equivalent):**

Tauri's Linux build needs a few system packages:

```bash
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  build-essential
```

### Bootstrap

```bash
# Clone
git clone https://github.com/Code4neverCompany/4neverCompanyOS.git
cd 4neverCompanyOS

# Install JS/TS deps (also generates pnpm-managed node_modules)
pnpm install

# Verify Rust toolchain + add rustfmt + clippy
rustup show                              # confirms 1.90.0 stable is active
rustup component add rustfmt clippy

# Run the gates once to confirm everything's wired
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm rust:fmt
pnpm rust:clippy
pnpm rust:test

# Install git hooks (see "Pre-commit / pre-push hooks" below)
pnpm hooks:install
```

> **Zellij for persona work.** The embedded Zellij multiplexer is
> used by the desktop app and the wizard. If you're working on
> `crates/zellij-adapter/` or the spawn pipeline, install Zellij
> separately (`winget install zellij` on Windows, `brew install zellij`
> on macOS, distro package on Linux). The M1+ installer bundles it,
> so the dev environment does not strictly require it.

---

## Build, test, and quality gates

All commands run from the repo root. `pnpm -r` recurses across the
workspace; `--if-present` means a package without that script is
skipped instead of erroring.

| Gate           | Command             | What it does                                                       |
| -------------- | ------------------- | ------------------------------------------------------------------ |
| Format (check) | `pnpm format`       | `prettier --check .` — verifies formatting.                        |
| Format (fix)   | `pnpm format:fix`   | `prettier --write .` — applies formatting. Use during local dev.   |
| Lint           | `pnpm lint`         | `eslint .` — flat config, ignores `_bmad/`, `_bmad-output/`, etc.  |
| Lint (fix)     | `pnpm lint:fix`     | `eslint . --fix` — auto-fix where safe.                            |
| Type-check     | `pnpm typecheck`    | `tsc --noEmit` across every TS package.                            |
| Test (TS)      | `pnpm test`         | Runs `vitest` per package. Tests live next to source.              |
| Build (TS)     | `pnpm build`        | Builds every TS package that has a `build` script.                 |
| Rust fmt       | `pnpm rust:fmt`     | `cargo fmt --all -- --check`.                                      |
| Rust fmt (fix) | `pnpm rust:fmt:fix` | `cargo fmt --all`.                                                 |
| Rust clippy    | `pnpm rust:clippy`  | `cargo clippy --workspace --all-targets -- -D warnings`.           |
| Rust test      | `pnpm rust:test`    | `cargo test --workspace`. Use `-- --ignored` for opt-in scenarios. |
| Desktop dev    | `pnpm dev:desktop`  | Tauri dev server for the desktop shell.                            |
| Wizard dev     | `pnpm dev:wizard`   | Tauri dev server for the first-run wizard.                         |
| Docs dev       | `pnpm docs:dev`     | VitePress dev server for the docs site.                            |

The same gates run in CI on every push / PR (see
`.github/workflows/ci.yml`): a JS matrix on ubuntu/windows/macos
plus a Rust matrix on the same three runners. **A green PR is one
where every job is green.** A single rustfmt or prettier diff on a
modified file will fail the build.

### When something fails

- **`prettier --check` is the most common local-only failure.** Run
  `pnpm format:fix` and re-commit. Don't hand-edit formatting
  drift.
- **`tsc --noEmit` errors after a dep upgrade** are usually
  `pnpm install` drift. `pnpm install` again; if it persists,
  check that the lockfile was updated.
- **`cargo clippy ... -D warnings`** treats warnings as errors.
  Address the warning or `#[allow(...)]` with a comment justifying
  the exception.
- **Integration tests that need Zellij / supervisor binaries** are
  `#[ignore]`d by default. Run them once those tools are installed:
  `pnpm rust:test -- --ignored`.

---

## Pre-commit / pre-push hooks (lefthook)

We use [lefthook](https://github.com/evilmartians/lefthook) as a
single, fast hook manager for both `git` and the pnpm / cargo
toolchains. Configured in [`lefthook.yml`](lefthook.yml) at the
repo root.

Install on a fresh clone with:

```bash
pnpm hooks:install   # = lefthook install
```

What runs and when:

| Hook         | Steps                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `pnpm format` · `pnpm lint` · `cargo fmt --all -- --check` · `cargo clippy --workspace --all-targets -- -D warnings` |
| `pre-push`   | `pnpm typecheck` · `pnpm test` · `cargo test --workspace`                                                            |

The heavy steps (`typecheck`, `test`, cargo test) are deferred to
`pre-push` so the inner dev loop stays fast. The hooks **skip the
heavy steps if only docs changed** via a `glob` filter on `*.md` /
`*.txt` (i.e. a pure-docs commit won't trigger typecheck or test
runs).

To run a single gate manually, use the `pnpm` scripts above. To
bypass a hook for a one-off (e.g. a WIP commit), use
`git commit --no-verify` and surface it in the PR description.

---

## Adding a new TypeScript package

1. **Create the directory** under `packages/<kebab-case-name>/` with
   this skeleton:
   ```
   packages/<name>/
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   └── index.ts
   └── tests/             (if not co-located)
   ```
2. **`package.json`** — name `@c4n/<name>`, `"type": "module"`, and
   add a `"scripts"` block with at minimum `"build": "tsc"`,
   `"typecheck": "tsc --noEmit"`, and `"test": "vitest run"` if
   the package has tests. pnpm picks the package up automatically
   from `pnpm-workspace.yaml`'s `packages/*` glob.
3. **`tsconfig.json`** — extend `../../tsconfig.base.json`. Don't
   duplicate compiler options.
4. **Write source.** Co-locate tests as `*.test.ts` next to the
   file under test where it makes sense; pull them out to a
   sibling `tests/` if they get noisy.
5. **Run the gates** before opening a PR:
   ```bash
   pnpm -F @c4n/<name> build
   pnpm -F @c4n/<name> typecheck
   pnpm -F @c4n/<name> test
   ```
6. **Document the package.** Add a row to the `packages/` block in
   the `README.md` monorepo-layout diagram, and a short page in
   `apps/docs/` if it's user-visible.

## Adding a new Rust crate

1. **Create the directory** under `crates/<kebab-case-name>/` with
   this skeleton:
   ```
   crates/<name>/
   ├── Cargo.toml
   ├── src/
   │   └── lib.rs
   └── tests/             (integration tests)
   ```
2. **`Cargo.toml`** — set `[package].name = "c4n-<name>"` and
   `edition = "2021"`. Add the crate to the workspace `members` list
   in the root `Cargo.toml`.
3. **Use workspace dependencies** — reference shared deps via
   `my-dep.workspace = true` so versions stay pinned at the root.
4. **If the crate is consumed by a Tauri shell**, add it to the
   appropriate `apps/*/src-tauri/Cargo.toml` and wire any
   `tauri::Builder` registration in that shell's `main.rs` /
   `lib.rs`.
5. **Run the gates**:
   ```bash
   pnpm rust:fmt:fix
   pnpm rust:clippy
   pnpm rust:test -p c4n-<name>
   ```
6. **Document the crate.** Update the `crates/` block in the
   `README.md` and the `architecture.md` decision document that
   the crate supports (D-1 through D-11 in the architecture).

---

## Adding a new BMAD workflow / persona

BMAD is a methodology framework, not a code framework. New
workflows and personas live as **markdown** under `_bmad/...` and
are managed by `npx bmad-method install`. Don't hand-edit
`_bmad/`; treat it as vendored and use the BMAD CLI for additions
or upgrades.

1. **Decide where it goes.**
   - Persona: `_bmad/bmm/agents/<name>.md` (BMM) or
     `_bmad/bmb/agents/<name>.md` (BMB).
   - Workflow: `_bmad/bmm/workflows/<workflow-name>/workflow.yaml`
     (plus any prompts / templates it references).
2. **Use the BMAD CLI for module changes.** If the addition is
   general-purpose, do it in a `npx bmad-method install` upgrade
   and then commit the diff. If it's a workspace-specific
   override, put it under `_bmad/custom/...` (the override surface
   preserved across upgrades).
3. **Validate** by running the workflow end-to-end against a
   scratch project. Use the `greenfield-fullstack` workflow
   itself for self-tests (the project is dogfooded).
4. **Document** the new capability in `apps/docs/`. BMAD additions
   deserve a one-page user doc — keep it short.

If the addition is **general-purpose** (likely useful to other
BMAD users), it should be contributed back upstream — see
[Contribution-back policy](#contribution-back-policy).

---

## Commit message format

We follow **Conventional Commits** v1.0.0
([conventionalcommits.org](https://www.conventionalcommits.org/))
with these scopes in active use:

| Type       | Used for                                                   |
| ---------- | ---------------------------------------------------------- |
| `feat`     | A user-visible new feature.                                |
| `fix`      | A user-visible bug fix.                                    |
| `docs`     | Documentation-only changes (no code behavior change).      |
| `style`    | Whitespace / formatting / comment-only changes (no logic). |
| `refactor` | Code change that neither fixes a bug nor adds a feature.   |
| `perf`     | Performance improvement.                                   |
| `test`     | Adding or correcting tests.                                |
| `build`    | Build system / dependency / CI changes.                    |
| `chore`    | Repo hygiene, scripts, or non-code maintenance.            |
| `revert`   | Reverts a previous commit.                                 |

### Format

```
<type>(<scope>): <description>  [TICKET-ID]

<body, wrapped at ~72 cols, explaining the *why* not the *what*>

<footer, e.g. BREAKING CHANGE: ... or Refs: ARCH-DECISION>
```

- **Subject line ≤ 72 chars**, imperative mood ("add", not "added").
  No trailing period.
- **Scope** is the touched area: `desktop`, `wizard`, `docs`,
  `workflow-engine`, `persona-supervisor`, `ci`, `monorepo`, etc.
- **Ticket ID in brackets** when the change maps to a sprint story
  (`[NEVAAA-49]`, `[BMAA-17]`) or sprint shorthand (`[M3-12]`).
  Drop the brackets for chores and small fixes.
- **Body** explains the why. The diff shows the what.

### Examples from history

```
feat(NEVAAA-49): P0-C vault-scoping concurrent hardening
fix(desktop): use NSIS !macro hooks instead of !ifdef for PATH manipulation
docs(NEVAAA-142): wizard Zellij-detection workaround (winget / PATH override)
chore(ci): prettier format docs.yml
test(NEVAAA-139): AnthropicSettings validation + persistence regression
```

---

## Pull request checklist

Before opening a PR, confirm each of the following:

- [ ] **One logical change per PR.** Small PRs merge faster and
      bisect cleanly. If you're tempted to write "and also…" in
      the description, split the change.
- [ ] **PR title is a Conventional Commit** matching the lead
      commit on the branch.
- [ ] **PR description** includes: - The **why** (one paragraph). - The **how** (link to design doc / ADR if non-obvious). - **Test plan** — what you ran, what the reviewer should
      run, and a link to a manual test scenario if relevant. - **Screenshots / recordings** for any UI-visible change
      (`apps/desktop`, `apps/wizard`, `apps/docs`). - **Migration notes** for any `BREAKING CHANGE` in the
      commit footer.
- [ ] **All local gates green:**
      `pnpm format && pnpm lint && pnpm typecheck && pnpm test &&
pnpm rust:fmt && pnpm rust:clippy && pnpm rust:test`.
- [ ] **CI is green.** Don't open a PR against a failing main.
- [ ] **No new untracked files** that should be gitignored
      (run `git status` and check).
- [ ] **Authoritative docs untouched.** If the brief or build
      plan needed to change, file a separate docs PR with a
      version bump.
- [ ] **No secrets** committed. `.env`, API keys, OAuth tokens,
      etc. are git-ignored — keep them out of diffs.
- [ ] **At least one reviewer's approval.** For significant
      changes, the Architect (Winston) and the relevant
      persona lead (Dev, Frontend Designer, PM, …) sign off.

PR template lives in `.github/PULL_REQUEST_TEMPLATE.md` (or your
editor's GitHub PR extension). The PR title is what lands in
`CHANGELOG.md`, so write it once and write it well.

---

## Contribution-back policy

This project is an **integrator**. We do not maintain forks of
upstreams unless forced. General-purpose work goes back upstream
first.

Concretely:

- **Adapter, plugin, persona, or BMAD module** that is reusable
  outside 4neverCompany OS is opened as a PR to the upstream
  project (Paperclip, Hermes, BMAD, VitePress, Tauri, …) before
  being carried in-tree.
- **Maintaining a fork** is the exception, requires a written
  rationale, and is recorded in the corresponding ADR in
  `docs/adr/`.
- **License + attribution** for the upstream must be preserved in
  the contribution. See [`LICENSES.md`](LICENSES.md) for the
  per-upstream policy.

This is both good open-source citizenship and a way to reduce the
long-term maintenance cost of carrying patches in our own tree.

---

## License

By contributing, you agree that your contributions will be
licensed under the project's source-code license (see
[`LICENSE`](LICENSE) for the current notice; the final license
chosen at v1.0 will apply retroactively to accepted
contributions). If you're contributing on behalf of an employer,
confirm you have authority to do so.

For the **bundled third-party components** (Paperclip, Hermes,
BMAD, Zellij, Claude Code, Antigravity CLI, Obsidian, etc.) the
respective upstream licenses apply — see [`LICENSES.md`](LICENSES.md)
for the per-component audit. If your contribution touches a
bundled component, make sure the new code's license is compatible
with the upstream's terms.

---

Questions? Open a GitHub issue on this repository. Pre-release
status means there's no public roadmap commitment or SLA on
responses — but architectural feedback, bug reports, and small
PRs are always welcome.
