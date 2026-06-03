# Security Policy

> **Pre-release notice.** 4neverCompany OS is a pre-release
> in-progress build. The code, license, and security contact
> below are part of the live development process and may change
> before v1.0. See [`README.md`](README.md) and
> [`LICENSE`](LICENSE) for the current source-availability terms.
> Until v1.0 ships, treat this document as a working policy, not
> a contractual commitment.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security
problems.** Public issues turn a reportable finding into a
publicly-visible attack surface before the maintainers can ship a
fix.

Instead, send a private disclosure email to:

**`security@4nevercompany.com`** (TBD — placeholder pending
mailbox provisioning; once provisioned the same address is the
point of contact throughout the project's life)

Include as much of the following as you can:

- A clear description of the issue and the impact you observed
  (what data is exposed, what code path is affected, what an
  attacker can do).
- Steps to reproduce — a minimal repro is worth more than a
  long narrative.
- The affected version (commit SHA, tag, or installed build
  number — see the in-app About panel once shipped).
- Environment details that matter: OS, Tauri version, which
  embedded component is in the path (Paperclip, Hermes, BMAD,
  Zellij, vault).
- Your assessment of severity, if you have one (CVSS, OWASP
  category, or just "high / medium / low" with reasoning).
- Whether you intend to coordinate public disclosure, and on
  what timeline.

### What to expect

- **Acknowledgement** within **5 business days** of the report
  reaching a maintainer. (Pre-v1.0: best-effort, not a
  contractual SLA.)
- **Triage** within **10 business days** — we confirm
  reproducibility, scope, and severity.
- **Fix coordination.** We'll propose a timeline based on
  severity:
  - **Critical** (data loss, RCE, auth bypass in the desktop
    shell): patch within 7 days, security release as soon as
    CI is green.
  - **High** (privilege escalation, secret exposure, persistent
    XSS in the desktop UI): patch in the next sprint, or sooner
    if a credible exploit is in the wild.
  - **Medium / Low**: rolled into the next regular release.
- **Credit** in the next `CHANGELOG.md` `Security` section
  unless you ask to remain anonymous.
- **Coordinated disclosure.** We ask for a 90-day disclosure
  window by default (per
  [Google's Project Zero](https://googleprojectzero.blogspot.com/p/vulnerability-disclosure-faq.html)
  convention); we can negotiate shorter or longer windows for
  particular findings.

If we cannot reproduce a finding or disagree on severity, we'll
say so explicitly rather than silently close the report.

---

## Supported versions

Until v1.0 ships, **only the current `main` branch is supported
for security fixes.** There is no LTS line, no backport policy,
and no patch-release stream. If you find a vulnerability in a
forked or older build, upgrade to `main` and re-test before
reporting.

| Version (branch) | Supported          |
| ---------------- | ------------------ |
| `main`           | ✅ Yes             |
| Anything else    | ❌ No (use `main`) |

The table will be expanded when v1.0 ships. Backport policy for
post-v1.0 patch releases will live here too.

---

## Security update cadence

- **Critical** findings: out-of-band release, typically within
  7 days of triage.
- **High** findings: bundled with the next sprint release
  (usually weekly during active development).
- **Medium / Low** findings: rolled into the next regular
  milestone release.

Until v1.0 there is no fixed patch-Tuesday; the team ships when
the fix is ready and CI is green. `CHANGELOG.md` is the source
of truth for "what shipped when."

---

## What counts as a security issue (vs. a regular bug)

**Security issue — report privately to
`security@4nevercompany.com` (TBD):**

- Credential leakage to disk, network, or logs.
  Anthropic / Antigravity / GitHub / Supermemory / Obsidian
  secrets are all in scope.
- Process isolation failures: one persona agent reading or
  writing another persona's vault scope (D-7 in
  [`docs/architecture.md`](docs/architecture.md)).
- Sandbox bypass: a Dev or ephemeral agent escaping the
  intended vault / project directory.
- RCE in the Tauri shell, the Paperclip UI host, or the
  Hermes / Zellij control paths.
- Auth bypass in the first-run wizard (Anthropic key
  validation, Claude Code `--version` check, Antigravity
  OAuth).
- Supply-chain compromise: a malicious dep that ends up in
  `pnpm-lock.yaml` or in a vendored upstream under
  `services/`.
- A serious bug in `crates/credential-storage` /
  `crates/vault-scoping` that could leak the OS keychain
  service prefix `com.c4nfornever.*` entries.

**Regular bug — open a public GitHub issue:**

- The desktop UI crashes on a specific but unprivileged input.
- A progress signal fires late or duplicated but doesn't leak
  data.
- A typo, a wrong default, a missing tooltip.
- A `#[ignore]`d integration test that should run by default.
- A documentation error.
- Performance regression without a security implication.
- Bus protocol correctness issues that don't leak outside the
  bus (e.g. a message delivered to a wrong topic but not to
  an unauthorized subscriber).

If you're unsure, err on the side of private disclosure — we'd
rather triage a non-security report than miss a real one.

---

## Threat model — scope of this policy

In scope for the project's own code (the integration layer in
`apps/`, `packages/`, `crates/`):

- The Tauri shell and its IPC surface.
- The first-run wizard and its OAuth / API-key handling.
- The persona lifecycle (spawn / supervise / dismiss) and
  vault scoping.
- The inter-agent message bus.
- The local memory (Obsidian vault) and the credential-storage
  crate.
- The installer (NSIS / DMG / AppImage), in particular the
  sidecar bundling and `PATH` manipulation.

Out of scope (governed by the upstream's own security policy):

- Paperclip (paperclipai/paperclip) → upstream issue tracker
  - their security contact.
- Hermes Agent (NousResearch/hermes-agent) → upstream.
- BMAD Method (bmad-code-org/BMAD-METHOD) → upstream.
- Tauri (tauri-apps/tauri) → upstream; the WebView2 runtime
  ships with Windows and is patched by Microsoft.
- Zellij → upstream.
- VitePress → upstream.
- Claude Code, Antigravity CLI, Obsidian, Supermemory, GitHub
  → each tool's own security policy; we integrate, we don't
  reimplement.

If a vulnerability lives in an upstream and only manifests
through our integration, **report to us** and we'll coordinate
upstream. If it lives entirely in the upstream and is
reproducible without our code, **report upstream directly**.

---

## Hardening commitments

What we promise in the integration layer:

- **Credentials never leave the OS keychain** except through
  Tauri's documented IPC and the `credential-storage` crate's
  documented surface.
- **Vault scoping is enforced by `crates/vault-scoping`**, not
  by agent self-discipline (D-7 in the architecture).
- **No telemetry leaves the host machine** by default. The
  `packages/telemetry` package emits to a local SQLite store;
  the user explicitly opts in to any network sync.
- **Installer code-signing** is on the procurement track
  (tracked in `docs/pinned-versions.md`). Until that lands,
  SmartScreen will warn; we document the "Run anyway" path
  in [`docs/e2e-smoke-test.md`](docs/e2e-smoke-test.md).
- **Dependencies are pinned.** `pnpm-lock.yaml` and
  `Cargo.lock` are committed; CI uses
  `--frozen-lockfile=false` to allow the lockfile update PR
  flow but fails on unpinned transitive additions.
- **Pre-commit and pre-push gates** (see
  [`CONTRIBUTING.md`](CONTRIBUTING.md)) catch the common
  foot-guns before they hit `main`.

---

## Acknowledgements

We will list reporters (with their consent) in
[`CHANGELOG.md`](CHANGELOG.md) under the relevant release's
`Security` section. Thank you for keeping the project's users
safe.
