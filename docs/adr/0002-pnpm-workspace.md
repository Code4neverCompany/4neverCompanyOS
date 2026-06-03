# 0002 — pnpm workspace with `onlyBuiltDependencies` allowlist

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Maurice, Winston (Architect), Amelia (Dev)
- **Source materials:** [`package.json`](../../package.json),
  [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml),
  [`docs/pinned-versions.md`](../pinned-versions.md),
  [`docs/4neverCompany_OS_Brief.md`](../4neverCompany_OS_Brief.md) §5.

## Context

The monorepo (see ADR 0003) needs a **Node-side package manager**
that (1) supports workspaces natively so `apps/*`, `packages/*`, and
the embedded BMAD tooling can share a single `node_modules` tree;
(2) is fast on a cold install (the Windows installer pays this cost
on every fresh-install user); (3) hardens the supply chain against
silent postinstall script execution; (4) integrates with the pinned
Node 22.13 LTS line that the M0 brief specifies (the brief's floor
was Node ≥ 20; pnpm 11's `node:sqlite` builtin requires 22.13+).

The 2026 candidate set is npm workspaces, Yarn (classic + Berry),
Bun, and pnpm 11. The M0 spike rejected Bun for production
([`docs/spike-report-tauri-webview2.md`](../spike-report-tauri-webview2.md)
flags it as Tauri-sidecar-incompatible at the time of the spike);
npm workspaces and Yarn are viable but lack the build-script gate.

## Decision

**Adopt pnpm 11.3.0 as the Node package manager**, pinned via the
`packageManager` field in [`package.json`](../../package.json).
**Harden install scripts** with pnpm 11's `onlyBuiltDependencies`
allowlist in [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml)
(currently `{ esbuild, lefthook }`; both are pinned to specific
upstream packages with documented postinstall behavior).

## Consequences

**Positive:**

- **Single source of truth** for the package manager: `corepack` /
  Volta / asdf will pick the pinned version automatically from
  `packageManager: "pnpm@11.3.0"`. New contributors can't accidentally
  use npm or yarn and silently break the lockfile.
- **Faster installs** than npm on a cold cache, which matters for
  the Windows installer (M1) and for CI's `pnpm install` step in
  `.github/workflows/ci.yml`.
- **Workspace protocol** is first-class: `pnpm -F @c4n/desktop build`
  filters by package name; `pnpm -r --if-present test` recurses and
  skips packages without the script. Both are used heavily in
  [`package.json`](../../package.json) `scripts`.
- **`onlyBuiltDependencies` gate** makes the supply chain
  auditable: any new package that wants to run a postinstall
  script must be added to the allowlist explicitly. Story 1.1
  found this gap on the original monorepo; the gate has been on
  since M0.
- **Cross-platform parity** — pnpm works identically on Windows,
  macOS, and Linux, which the CI matrix in
  `.github/workflows/ci.yml` depends on.

**Negative / trade-offs:**

- **Hard link store** requires admin / filesystem support on some
  Windows configurations. Workaround documented in
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md) (the VS dev shell
  load is required for Tauri builds anyway).
- **`onlyBuiltDependencies` is additive** — pnpm warns but does
  not fail by default. CI must run with the right config to
  enforce the allowlist as a hard gate; the lockfile update PR
  flow uses `--frozen-lockfile=false` per `.github/workflows/ci.yml`
  to allow lockfile bumps while still failing on unknown scripts.
- **Some packages** (notably native addons with `.node` binaries)
  have rough edges on Windows. So far we've worked around them
  with platform-specific optional deps; no permanent blockers.

**Followups required:**

- When pnpm 12 ships, re-evaluate the `onlyBuiltDependencies`
  allowlist shape — pnpm 12 may change how the gate is configured.
- Keep `lefthook` in the allowlist (its postinstall creates the
  git-hook symlinks; this is a known, audited behavior).
- Document the **`--frozen-lockfile=false`** CI choice in
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md) so the team knows
  that lockfile updates land in a separate, reviewable PR.

## Alternatives considered

- **npm workspaces** — viable but no build-script gate and slower
  cold installs; the supply-chain hardening benefit of
  `onlyBuiltDependencies` is unique to pnpm in 2026.
- **Yarn (classic)** — legacy at this point; lockfile format
  divergence (Yarn 1 vs. Berry) is a known onboarding tax.
- **Yarn Berry (PnP)** — the PnP mode is incompatible with the
  Tauri / VitePress toolchains without `@yarnpkg/pnpify` or
  equivalent, and the team is not yet staffed to debug PnP
  resolution failures.
- **Bun** — fast, but rejected at the M0 spike for Tauri
  sidecar compatibility; revisit at M5 if Bun's native
  bundler story catches up.
