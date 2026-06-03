# 0001 — Tauri 2 over Electron for the desktop shell

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Maurice (4neverCompany CEO), Winston (Architect), with
  BMAD-Architect ratification at the end of session 4
- **Source materials:** [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md),
  [`docs/4neverCompany_OS_Brief.md`](../4neverCompany_OS_Brief.md) §3.9
  & §5, [`docs/spike-report-tauri-webview2.md`](../spike-report-tauri-webview2.md),
  Architecture D-13.

## Context

4neverCompany OS bundles Paperclip's existing React UI
(`paperclipai/paperclip`) into a single installable desktop product.
The desktop shell must (1) host Paperclip's React app **in the same
render tree** so that architecture D-13's `react-dom/createPortal`
injection of workspace panels into Paperclip's named slot DOM works;
(2) ship on Windows at M1 (FR-35) and reach macOS (FR-36) and Linux
(FR-37) by M5; (3) own and supervise 5+ Rust sidecar crates
(zellij-adapter, bus-relay, persona-supervisor, platform-fs,
vault-scoping, credential-storage, …) without a per-crate language
switch; (4) respect the NFR-Performance budget of ≤ 300 MB resident
memory per **idle persona**; and (5) produce Windows NSIS, macOS DMG,
and Linux AppImage installers from a single source. Rust as the
sidecar language was locked at OQ-J
([`docs/pinned-versions.md`](../pinned-versions.md)).

The five credible candidate frameworks — Tauri 2, Electron, WinUI 3,
Wails, Flutter Desktop — were evaluated against these constraints in
[`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md).
After the M0 Tauri spike succeeded (see
[`docs/spike-report-tauri-webview2.md`](../spike-report-tauri-webview2.md))
the alternatives were re-evaluated with fresh 2026 data.

## Decision

**Adopt Tauri 2.x as the desktop shell for 4neverCompany OS.**
**Document Electron as the explicit fallback** for the case where
Tauri 3 (or a future Paperclip rewrite) hits an unfixable WebView2
incompatibility; do not pursue Wails, WinUI 3, or Flutter Desktop
unless the locked decisions change.

## Consequences

**Positive:**

- **Bundle size** drops from Electron's ~80–150 MB to Tauri's
  ~5–10 MB before any of our code. The installer is smaller,
  faster to download, and easier to sign.
- **Idle RAM** drops from Electron's ≥ 150 MB baseline to a
  negligible share of Tauri's WebView2 footprint, leaving the
  NFR-Performance budget intact for the persona agents.
- **Rust sidecar fit** is native — Tauri's `tauri::Builder` and
  sidecar IPC contract are designed for the same Rust crates
  the architecture document names (D-1 through D-11).
- **Cross-platform** support is on par: Windows NSIS, macOS DMG,
  Linux AppImage all built-in. Validated by the M0 spike.
- **Host Paperclip's React UI** via Tauri's WebView2, using
  `react-dom/createPortal` exactly as D-13 specifies.

**Negative / trade-offs:**

- We couple to the **system WebView**. Windows uses WebView2
  (Edge-based), macOS uses WKWebView, Linux uses WebKitGTK. Each
  platform's quirks are still our problem — paperclip-ui rendering
  regressions on Linux WebKitGTK are now a thing we have to test.
- The **plugin ecosystem is smaller** than Electron's, and some
  advanced WebView2 / WKWebView features (e.g. custom URL scheme
  registration, deep-link handling) need hand-rolled IPC.
- Tauri's **iOS / Android path** is real but separate from the
  desktop shells; cross-platform mobile would mean a second
  Tauri-shell build matrix that's not on the v1 roadmap.
- The SmartScreen warning on Windows for unsigned `.exe` is now a
  permanent onboarding tax until code-signing is procured (tracked
  in [`docs/pinned-versions.md`](../pinned-versions.md)).

**Followups required:**

- Document the **WebView2 auto-bootstrap** in the installer
  pipeline (Story 1.17). NSIS must fetch + install the evergreen
  runtime if missing.
- Add a **Tauri-specific CSP** to the desktop shell (the
  permissive-CSP work in `2ca2ba6` lands this).
- Keep the **Wails spike** as a documented "if Go ever wins the
  sidecar argument, this is the path" option in
  [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md).
- Maintain **Electron fallback readiness** in
  [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md)
  so the team can pivot in a sprint if Tauri 3 breaks a critical
  Paperclip integration.

## Alternatives considered

See [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md)
for the full matrix and per-framework reasoning. Headline rejections:

- **Electron** — fallback only. Bundle + RAM cost competes with the
  NFR budget and pushes the sidecar story away from Rust.
- **WinUI 3** — ruled out: Windows-only, no Mac/Linux path, and the
  industry signal is Microsoft migrating Windows itself _away_ from
  embedded WebView2 toward native XAML.
- **Wails (Go)** — lateral move; would force re-evaluating D-1
  through D-11 to rewrite every Rust crate.
- **Flutter Desktop** — ruled out: not a WebView host, would force
  re-implementing Paperclip's UI in Dart (violates the no-fork
  principle in [`docs/HANDOFF.md`](../HANDOFF.md)).
- **.NET MAUI / Qt / Avalonia / SwiftUI** — same WebView2-inside-
  native-UI problem as WinUI 3, without the Windows polish upside.
