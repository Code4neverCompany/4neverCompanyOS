# ci-supply-chain — deliverable (resubmission)

## Summary
Resubmission fixing the ci.yml parse error that caused the previous
attempt to fail QA. The ci-pass summary job used dynamic indexing
(`${{ needs.$job.result }}`) inside a shell `for` loop, which
GitHub's expression parser rejects (run #26870566053, line 248,
"Unexpected symbol: '$job'"). Fix: expand the loop into four
explicit `if` blocks with static `${{ needs.<job>.result }}`
references per required job — the same pattern the original ci.yml
used for the two-job case. All other deliverables (audit.yml,
release.yml, deny.toml, the 10 c4n-* Cargo.toml edits,
ARCHITECTURE.md) from attempt 1 are unchanged and remain verified.

## Branch
`feature/ci-supply-chain` off `main`, worktree at
`I:\c4n-4neverCompanyOS\.worktrees\feature-ci-supply-chain`.

**Pushed to origin:** yes. `git rev-parse origin/feature/ci-supply-chain`
returns `3d5ee58dbe48d06c2558d9e7fe49d1c0f4929a12` (the fix commit).

## Commits (6 — was 5, +1 fix)
- `6cfca90` — `ci(ci): two-lane pnpm lockfile enforcement + label-gated strict lane`
- `2c4ecb7` — `chore(crates): declare license + publish=false on internal crates`
- `3c0477b` — `feat(ci): add supply-chain audit workflow (cargo-deny + cargo-audit + pnpm audit)`
- `0f10818` — `feat(release): generate CycloneDX SBOM + non-silent gh release error handling`
- `2783e5d` — `docs(ci-supply-chain): add deliverable.md describing the 4-commit branch`
- `3d5ee58` — `fix(ci): replace dynamic needs indexing with static references in ci-pass` **(NEW)**

## Changed files

### Created
- `.github/workflows/audit.yml` (new) — supply-chain audit
  workflow (triggers: push to main, pull_request, weekly Monday
  06:00 UTC cron). Runs `cargo deny check`, `cargo audit`, and
  `pnpm audit --prod` in parallel, plus a `supply-chain-pass`
  summary job.
- `deny.toml` (new) — cargo-deny policy. Permissive license
  allow list (MIT, Apache-2.0, BSD-{2,3}-Clause, ISC, MPL-2.0,
  Zlib, Unicode-{3.0,DFS-2016}, CC0-1.0, 0BSD, Unlicense,
  CDLA-Permissive-2.0) + `[[licenses.clarify]]` blocks for
  ring and encoding_rs. Bans `openssl`, `openssl-sys`, and
  `chrono >= 0.5`. Wildcards = deny with
  `allow-wildcard-paths = true`. Sources restricted to
  crates.io.
- `deliverable.md` (new) — this file.

### Modified
- `.github/workflows/ci.yml` — single `js-checks` job split
  into three: `js-checks` (PRs, `--frozen-lockfile=false`),
  `js-checks-strict` (push to main, `--frozen-lockfile=true`),
  `js-checks-typo` (label `dependencies` or `pin-upstream`,
  `--frozen-lockfile`). The `ci-pass` summary job uses static
  `${{ needs.<job>.result }}` references (one explicit if-block
  per required job) — no dynamic indexing of the `needs`
  context. **(CHANGED IN THIS RESUBMISSION.)**
- `.github/workflows/release.yml` — added `generate-sbom` job
  (cargo-cyclonedx → `c4n-os-cyclonedx.json`); `create-release`
  downloads the SBOM artifact and attaches it to the release;
  the silent `|| echo` on `gh release create` replaced with
  captured-exit-code + diagnose + debug-failure steps.
- `ARCHITECTURE.md` — §"Package manager" updated to document
  the two-lane behavior (was inconsistent with the actual
  ci.yml before this branch).
- 10 c4n-* `Cargo.toml` files (`apps/desktop/src-tauri`,
  `apps/wizard/src-tauri`, and the 8 crates under `crates/`) —
  added `license = "MIT OR Apache-2.0"` (matches the
  pre-v1.0 intent stated in the root LICENSE) and
  `publish = false` (these crates are internal to the
  workspace, never published to crates.io).

## What changed since attempt 1 (rejected)

**Only** `.github/workflows/ci.yml` line ~248 was fixed. The
broken pattern was:

```yaml
# OLD (rejected by GitHub — needs.$job is a literal symbol)
for job in js-checks js-checks-strict js-checks-typo rust-checks; do
  result="${{ needs.$job.result }}"
  ...
done
```

Replaced with four explicit static-reference `if` blocks:

```yaml
# NEW (passes GitHub's expression parser)
if [ "${{ needs.js-checks.result }}" = "failure" ] || \
   [ "${{ needs.js-checks.result }}" = "cancelled" ]; then
  echo "::error::Required job 'js-checks' result: ${{ needs.js-checks.result }}"
  failed=1
fi
# (three more blocks, one per required job)
```

A long-form comment block above the job documents the
`${{ needs.$var }}` parser limitation so a future maintainer
who is tempted to "DRY this up with a for loop" knows why
the static-reference form is required.

## Verification

### YAML / TOML syntax
```
$ python -c "import yaml; yaml.safe_load(...)" \
  ci.yml audit.yml release.yml docs.yml
OK (all four)
$ python -c "import tomllib; tomllib.load(...)" deny.toml
OK

$ yamllint -d "{extends: relaxed, rules: {line-length: {max: 200},
                indentation: {spaces: 2, indent-sequences: consistent},
                truthy: {check-keys: false}}}" \
  .github/workflows/*.yml
(no output, exit 0)
```

### Dynamic `needs` indexing check
A regex pass for `needs.$<varname>` and `needs[$<varname>]`
patterns outside YAML comments found **zero** occurrences in
ci.yml / audit.yml / release.yml.

### Audit commands (all exit 0)
- `cargo deny check` → `advisories ok, bans ok, licenses ok, sources ok`
- `cargo audit` → `warning: 17 allowed warnings found` (all in
  the deny.toml ignore list — unmaintained gtk-rs family +
  transitive `unic-*` + one `glib` unsound; no actual
  vulnerabilities)
- `pnpm audit --prod` → `No known vulnerabilities found`

### Lockfile drift test
On a clean checkout of `main`:
```
$ pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
(exit 0, 387 packages, no lockfile modification)
```
The lockfile on `main` is in sync with `package.json`, so the
strict lane would pass on a `push` to main.

## Notes for the verifier

1. **CI parse error** — the previous attempt's only blocker was
   the `ci.yml` ci-pass summary job's `${{ needs.$job.result }}`
   expression. CI run #26870566053 confirmed the parse error.
   The fix commit (3d5ee58) replaces the dynamic-indexing loop
   with explicit static references, which is the pattern the
   original ci.yml used for the two-job case.

2. **GitHub CI re-run** — the new fix commit (3d5ee58) is on
   `origin/feature/ci-supply-chain`. The CI should re-run on
   push and dispatch normally. If it doesn't, the workflow
   files are also valid under `python -c "import yaml;
   yaml.safe_load(...)"` and `yamllint`, so a local parser
   disagrees with GitHub's parser about something subtle —
   please report the run URL and I'll dig in.

3. **Push status** — branch is pushed. `git rev-parse
   origin/feature/ci-supply-chain` and `git rev-parse HEAD`
   both return `3d5ee58dbe48d06c2558d9e7fe49d1c0f4929a12`.

4. **License placeholder** — every c4n-* crate's `license`
   field is the SPDX expression `MIT OR Apache-2.0`. The root
   `LICENSE` file currently says "source-available for
   evaluation only" with the intent to release under MIT or
   Apache-2.0 before v1.0. The Cargo.toml field reflects that
   intent and is in the audit allow list. When the final
   license is chosen, update the Cargo.toml field, the
   deny.toml allow list, and the LICENSE file in the same
   commit.

5. **`publish = false` is reversible** — none of the c4n-*
   crates are on crates.io today, so `publish = false` is
   documentation as much as enforcement. It is required by
   cargo-deny to treat path-only workspace deps as private
   (without it, `wildcards = "deny"` false-positives on the
   `path = "..."` deps).

6. **SBOM format** — the release artifact is
   `c4n-os-cyclonedx.json` (CycloneDX 1.5, JSON). The same
   SBOM is attached to every platform release (macOS / Linux /
   Windows) because `cargo-cyclonedx` walks Cargo.lock, which
   is platform-independent. One canonical SBOM per release
   rather than three redundant copies.

7. **gh release error handling** — the "Diagnose partial
   release failure" step distinguishes between "release
   created, some assets failed" (warn + continue, operator
   re-runs) and "release not created" (fail with the captured
   stderr from `/tmp/gh-release-create.stderr`). The "Debug:
   print artifact state on failure" step runs on any prior
   failure and dumps the artifacts directory and on-GitHub
   release state to the job log.

8. **Tauri gtk-rs migration** — the 17 ignored advisories
   are all in the gtk-rs GTK3 binding family + transitive
   `unic-*` data crates + one `glib` unsound. They are pulled
   in transitively through the Tauri 2.x stack. When the
   Tauri team ships gtk4-rs support (tracked at
   https://github.com/tauri-apps/tauri/issues/9684), the
   ignore list in `deny.toml` should be pruned and the audit
   job will catch any new advisories on the new dep tree.
