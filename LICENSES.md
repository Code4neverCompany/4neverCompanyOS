# LICENSES — 4neverCompany OS

**Purpose:** verify bundling rights, redistribution, attribution, and commercial-use terms for every component the 4neverCompany OS distribution touches. This is the canonical source-of-truth for the attribution surfaces required by Story 1.19 (Settings → About + first-run wizard final screen + app-launch splash + this file).

**Audit status:** **DRAFT** — researched and structured by Architect (Winston) at M0 start using web-verified license metadata. Maurice's M0 review is required before any binaries land in CI release artifacts.

**Date:** 2026-05-26
**Quarterly revisit:** see `docs/pinned-versions.md`.

---

## How to read this file

Components fall into three handling tiers based on what we actually do with their bits:

1. **Bundled** — we ship the binary or source inside our installer / monorepo. Requires redistribution rights and full attribution.
2. **Integrated** — we do not ship the binary. The first-run wizard orchestrates each tool's *own* official installer, and the user authenticates with their *own* credentials. We act as glue, not redistributor. Attribution is still required.
3. **Build-time only** — used by our build pipeline but never shipped to end users. Lighter attribution.

This distinction is critical because Claude Code, Antigravity CLI, Obsidian, and Supermemory are proprietary — we cannot legally redistribute their binaries, but we can integrate with them as the user's authorized installer/launcher.

---

## Tier 1 — Bundled components

These are shipped inside the Windows `.exe` (and later macOS `.dmg` / Linux AppImage).

| Component | License | Source | Redistribution | Attribution | Commercial use |
|---|---|---|---|---|---|
| **Tauri** (desktop shell + native bundler) | Apache-2.0 / MIT dual | https://github.com/tauri-apps/tauri | ✓ Permitted | Include license + copyright notice | ✓ Permitted |
| **Rust standard library** (linked into Tauri binaries) | Apache-2.0 / MIT dual | https://github.com/rust-lang/rust | ✓ Permitted | Include license + copyright notice | ✓ Permitted |
| **Node.js runtime** (Hermes + workspace scripts) | MIT *(plus subcomponents under various OSS licenses — see `LICENSE` shipped with Node)* | https://github.com/nodejs/node | ✓ Permitted | Include license + copyright notice | ✓ Permitted |
| **pnpm** (package manager — invoked at install time) | MIT | https://github.com/pnpm/pnpm | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **Vite** (frontend build tool) | MIT | https://github.com/vitejs/vite | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **React** + **React-DOM** | MIT | https://github.com/facebook/react | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **TypeScript** | Apache-2.0 | https://github.com/microsoft/TypeScript | ✓ Permitted | Include license + copyright notice | ✓ Permitted |
| **Paperclip** (control plane) | MIT | https://github.com/paperclipai/paperclip | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **Hermes Agent** (orchestrator) | MIT | https://github.com/NousResearch/hermes-agent | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **BMAD Method** (methodology + persona library) | MIT (Copyright © 2025 BMad Code, LLC) | https://github.com/bmad-code-org/BMAD-METHOD | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **Zellij** (terminal multiplexer) | MIT | https://github.com/zellij-org/zellij | ✓ Permitted | Include copyright + permission notices | ✓ Permitted |
| **Embedded Postgres** (Paperclip's database) | PostgreSQL License (permissive, BSD-style) | https://www.postgresql.org/ | ✓ Permitted | Include license + copyright notice | ✓ Permitted |
| **WebView2 Runtime** | Microsoft Software License Terms (Evergreen Distributable) | https://developer.microsoft.com/microsoft-edge/webview2/ | ✓ Permitted under Distribution license | Microsoft attribution per Distribution Agreement | ✓ Permitted |

> **WebView2 deployment options.** Per Microsoft's Distribution Agreement, the WebView2 Runtime can be (a) bundled with our installer as a fixed-version dependency, OR (b) installed via the Evergreen Bootstrapper at first-run. **Recommended:** Evergreen — auto-updates with security patches, smaller installer footprint. The first-run wizard should detect missing WebView2 and chain to the Evergreen Bootstrapper if absent. [NOTE FOR PM: revisit with Story 1.7/1.8 wizard design.]

---

## Tier 2 — Integrated components (NOT bundled; user installs via official channel)

These tools are **proprietary or otherwise unredistributable**. The first-run wizard chains to each tool's official installer; the user authenticates with their own credentials. We do not ship the binary.

| Component | License terms | Source | Our integration | User-supplied credentials |
|---|---|---|---|---|
| **Claude Code CLI** (Dev backing CLI) | © Anthropic PBC. All rights reserved. Subject to [Anthropic Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms). | https://github.com/anthropics/claude-code (LICENSE.md is "all rights reserved" + ToS link) | Wizard runs Claude Code's official installer via its standard channel; the user authenticates with their own Anthropic / Claude account. We do not route requests through workspace-aggregated credentials (per Anthropic's policy against third-party developers offering Claude.ai login on behalf of their users). | Anthropic API key OR Claude Code OAuth flow per user |
| **Antigravity CLI (`agy`)** (Frontend Designer backing CLI) | Proprietary (closed-source as of 2026-05). Google product. Public preview. Free for personal use with a Google account. | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ ; Google docs at https://codelabs.developers.google.com/getting-started-google-antigravity | Wizard chains to Antigravity CLI's official installer; user authenticates via Google OAuth. **Replaces Gemini CLI** which sunset on 2026-06-18 for individual Pro/Ultra users. | Google OAuth (user's own Google account) |
| **Obsidian** (local vault host) | Proprietary. Personal use is free. Commercial use requires Obsidian Commercial license per [obsidian.md/license](https://obsidian.md/license). | https://obsidian.md/ | The workspace manages a vault directory; Obsidian itself is installed by the user via its official installer. The workspace treats the vault as a filesystem and does not call any Obsidian-specific APIs (D-13 vault model). | None — local-only filesystem |
| **Supermemory** (cross-project semantic memory, M5 opt-in) | SaaS; subject to Supermemory's Terms of Service. | https://supermemory.ai/ | M5 feature only. User opts in per content category (FR-31). The workspace uses Supermemory's public API client with the user's own API key. No bundling. | Supermemory API key (user's own) |
| **GitHub** (sync target, M5 opt-in) | SaaS; subject to GitHub Terms of Service. | https://github.com/ | M5 feature. User opts in. `packages/github-sync` uses `gh` CLI or libgit2 with the user's own GitHub credentials. | GitHub credentials (user's own) |

> **Integration policy.** None of the Tier-2 binaries ship with our installer. Each is launched by the first-run wizard via its own installer flow. Our attribution surfaces (Story 1.19) credit them as "powered by" so users know what they're authenticating into.

---

## Tier 3 — Build-time only

Used by the build pipeline (CI + local dev) but never shipped to end users.

| Component | License | Used for |
|---|---|---|
| **`@tauri-apps/cli`** | Apache-2.0 / MIT | CLI for `tauri dev` / `tauri build` |
| **`@vitejs/plugin-react`** | MIT | Vite plugin |
| **Cargo + Rust toolchain (rustc, rustup, rustfmt, clippy)** | Apache-2.0 / MIT | Building Tauri Rust crates |
| **Visual Studio Build Tools 2022 / MSVC + Windows SDK** | Microsoft Software License Terms; specific terms vary by component | Required to link Tauri Rust crates on Windows. **Not redistributed.** |
| **MinGW-w64** *(if needed as fallback)* | LGPL / various | Rust GNU target (only if MSVC unavailable) |
| **NSIS** | Common Public License + Modified zlib | Tauri's Windows `.exe` bundler |
| **`cargo-deny`** *(future, M0 follow-up)* | Apache-2.0 / MIT | License-policy enforcement in CI |

---

## Bundling and redistribution summary

| Question | Answer |
|---|---|
| Can we redistribute the entire bundled set as part of our `.exe` / `.dmg` / AppImage? | **Yes** for Tier 1. **No** for Tier 2 — those are user-installed via official channels. |
| Are commercial-use rights granted? | **Yes** for all Tier 1 components. Tier 2 components require the user to bring their own commercial licenses if applicable (Anthropic Commercial, Obsidian Commercial, Google Enterprise, etc.). |
| Must we display attribution? | **Yes for everything.** Story 1.19 ships the "Powered by" surface to all four locations (Settings → About panel, first-run wizard final screen, app-launch splash screen, this `LICENSES.md`). |
| Are there copyleft viral terms in the bundle? | **No.** All Tier 1 licenses are permissive (MIT / Apache-2.0 / BSD-family / Microsoft Distribution Agreement). No GPL/LGPL/AGPL components. |

---

## Attribution copy (canonical text — single source-of-truth)

Per Story 1.19, the canonical attribution lives in `packages/core/src/attribution.ts` so all four surfaces render the same text. Suggested copy:

```
Powered by:

  Paperclip (MIT) — paperclipai/paperclip
  Hermes Agent (MIT) — NousResearch/hermes-agent
  BMAD Method (MIT, © 2025 BMad Code, LLC) — bmad-code-org/BMAD-METHOD
  Zellij (MIT) — zellij-org/zellij
  Tauri (Apache-2.0 / MIT) — tauri-apps/tauri
  React + React-DOM (MIT) — facebook/react
  Vite (MIT) — vitejs/vite
  TypeScript (Apache-2.0) — microsoft/TypeScript
  Node.js (MIT) — nodejs/node
  pnpm (MIT) — pnpm/pnpm
  PostgreSQL (PostgreSQL License) — postgresql.org
  Microsoft Edge WebView2 Runtime — © Microsoft

Integrated with:

  Claude Code (© Anthropic PBC) — anthropics/claude-code
  Antigravity CLI (© Google) — Google
  Obsidian (© Obsidian / Dynalist Inc.) — obsidian.md
  Supermemory (© Supermemory) — supermemory.ai
  GitHub (© GitHub Inc.) — github.com

Full license texts in LICENSES.md at the project root.
```

---

## Open items and follow-ups for Maurice's M0 review

1. **WebView2 distribution choice (bundled vs. Evergreen Bootstrapper)** — decide before Story 1.7 wizard work.
2. **Embedded Postgres version + exact bundle.** Paperclip ships an embedded Postgres — confirm which binary distribution Paperclip prefers at the pinned tag, and whether we redistribute that with our installer or rely on `npm install paperclip` pulling it. Decide at M0 alongside pinned-versions.md.
3. **MinGW-w64 / cargo-deny inclusion.** Decide at M0 whether to add `cargo-deny` to the CI baseline as a license-policy enforcement step (recommended). Decide whether MinGW-w64 fallback is needed; if not, remove the row.
4. **NSIS, NSIS plugin, code-signing certificates.** Code-signing (Windows Authenticode, macOS Apple Developer ID, Linux package signing) is required for installers to clear OS Smart Screen and Gatekeeper. Certificates are administrative, not licensing. Track in pinned-versions.md.
5. **Anthropic Commercial ToS — explicit opt-in confirmation.** Confirm that the "Powered by Claude Code" attribution + the wizard's "the user authenticates with their own Anthropic account" pattern satisfies Anthropic's policy that no third-party developer routes requests on behalf of users.
6. **Google Antigravity Terms of Service — same as above.** Confirm wizard pattern (chain to official installer + user OAuth with own Google account) satisfies Google's policy.
7. **Obsidian — commercial license clarification.** v1 ships single-user desktop with personal-use Obsidian; if users on Obsidian Commercial subscriptions are part of the audience, document the path.
8. **Quarterly upstream license re-check.** Per OQ-J quarterly cadence, re-run this audit each quarter and append a change-log entry below.

---

## Change log

| Date | Action | By |
|---|---|---|
| 2026-05-26 | Initial DRAFT produced at M0 start | Architect (Winston) |
