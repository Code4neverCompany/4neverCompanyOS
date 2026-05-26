# Architecture Alternatives Evaluation — Desktop Shell

**Decision audit trail for OQ-C (Tier 2).** This doc captures the comparative evaluation of desktop-shell frameworks against the locked architectural constraints, performed in session 4 (2026-05-26) at Maurice's request as a fresh sanity check after the Tauri spike succeeded.

**Verdict: OQ-C locked as final — Tauri 2.x is the chosen desktop shell.** Electron remains the documented fallback per the original OQ-C resolution. WinUI 3, Wails, and Flutter Desktop were each evaluated and ruled out for the reasons below.

---

## Evaluation constraints (from PRD + Architecture)

The constraints any candidate framework must satisfy, in order of importance:

1. **Host Paperclip's React UI in-process.** Architecture D-13 specifies `react-dom/createPortal` injection into Paperclip's named slot DOM. The fallback is `ReactDOM.createRoot` on a host element. Both require the shell to expose a standards-compliant DOM in the same render tree as Paperclip's React app.
2. **Cross-platform v1.** Windows ships at M1 (FR-35); macOS (FR-36) and Linux (FR-37) ship at M5. A Windows-only candidate cannot satisfy v1.
3. **Sidecar processes in Rust.** Architecture D-1 through D-11 name Rust crates by package: `zellij-adapter`, `bus-relay`, `persona-supervisor`, `platform-fs`, `vault-scoping`, `credential-storage`. Rust was pinned at OQ-J (`pinned-versions.md`).
4. **Lean bundle.** NFR-Performance targets ≤ 300 MB resident memory per idle persona; the shell itself should not consume that budget. Bundles over ~30 MB or idle RAM over ~150 MB compete with the per-persona target.
5. **Standard bundler output.** Per FR-35/36/37 + D-15, the build chain must produce Windows `.exe` (NSIS), macOS `.dmg`, and Linux AppImage from a single source.
6. **Maintained, current as of 2026.** No bet on dead or hobbyist frameworks for a 6–7 month build.

---

## Comparative matrix

| Framework                     | (1) Host React                                                                            | (2) Cross-platform                      | (3) Rust sidecar fit                                                           | (4) Bundle / idle RAM                                                   | (5) Native bundler             | (6) Maturity (2026)       | Net                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tauri 2**                   | ✓ WebView2 + `createPortal` **validated by spike**                                        | ✓ Win/Mac/Linux native                  | ✓ Rust-first design; commands + sidecar IPC                                    | ~5–10 MB bundle, low idle RAM                                           | ✓ NSIS, DMG, AppImage built-in | 121k★, v2 stable Oct 2024 | ✅ **CHOSEN**                                                                                                                                     |
| **Electron**                  | ✓ Trivially (Chromium bundled)                                                            | ✓ Win/Mac/Linux                         | ⚠ Possible via NAPI but mainly Node-native                                     | ~80–150 MB bundle, ≥ 150 MB idle (competes with NFR-Performance budget) | ✓ electron-builder             | Very mature               | ⚠ **Fallback only** (per OQ-C original resolution if Tauri spike had failed)                                                                      |
| **WinUI 3**                   | ⚠ Only via embedding WebView2 inside XAML (more layers, not fewer)                        | ❌ **Windows-only.** Kills M5 outright. | ⚠ C# P/Invoke or WinRT bridging — awkward for our 5+ Rust crates               | ~40–60 MB bundle, medium idle RAM                                       | Windows MSIX/AppX only         | Mature on Win             | ❌ **Ruled out: cross-platform**                                                                                                                  |
| **Wails (Go)**                | ✓ OS WebView (same as Tauri); portal pattern works identically                            | ✓ Win/Mac/Linux                         | ⚠ Go-language backend would require re-writing every Rust crate from D-1..D-11 | ~5–10 MB bundle, low idle RAM                                           | ✓ Built-in bundlers            | 41k★, mature              | 🤔 **Lateral move** — re-opens 11 architectural decisions for at-best parity. Re-evaluate only if Go-language preference becomes a strategic ask. |
| **Flutter Desktop**           | ❌ Not a WebView host; Impeller-rendered native widgets only                              | ✓ Win/Mac/Linux                         | ⚠ Dart FFI; possible but unusual                                               | ~30–50 MB bundle, medium idle                                           | ✓ Built-in                     | 176k★, mature             | ❌ **Ruled out: cannot host Paperclip's React UI** without rewriting Paperclip itself (out of scope — locked upstream)                            |
| **.NET MAUI / Qt / Avalonia** | Same WinUI-3-class issue: not a WebView host; would need to embed WebView2 in a native UI | varies                                  | varies                                                                         | varies                                                                  | varies                         | varies                    | ❌ **Ruled out for the same reason as WinUI 3**                                                                                                   |

---

## Detailed reasoning per framework

### WinUI 3 (Microsoft's modern Windows UI)

WinUI 3 is the right choice for **native Windows-only applications** authored in C#/C++/XAML. Three independent showstoppers against using it here:

- **Windows-only.** Microsoft has no roadmap to bring WinUI 3 to macOS or Linux. v1 must ship Mac and Linux at M5 (FR-36/FR-37); WinUI 3 has no path there. Choosing WinUI 3 means cancelling M5 cross-platform scope.
- **Architectural pattern mismatch.** Our design (D-13) hosts Paperclip's React UI _inside the shell's render tree_ and injects workspace panels into Paperclip's portal slots. WinUI 3 would force us to embed WebView2 _inside_ a XAML host — same Chromium runtime, but a XAML↔WebView boundary the workspace's React panels would have to traverse via `window.chrome.webview.postMessage` instead of in-tree `createPortal`. **More layers, not fewer.** Story 1.19's attribution surfaces would also need parallel XAML versions for the Settings/About panel and the splash screen.
- **Industry signal.** Per [Windows Latest May 2026 coverage](https://www.windowslatest.com/2026/05/15/microsoft-commits-to-native-ui-for-windows-11-as-users-push-back-against-web-app-slop/), Microsoft is actively migrating Windows 11's own Start menu _away from_ React-embedded WebView2 _toward_ native XAML. They want WinUI 3 used for fully-native experiences, not as a wrapper around an upstream React app. That's the opposite of our use case.

Verdict: **Ruled out.** A spike would confirm this without changing it.

### Electron

Electron is the conservative cross-platform option and the one OQ-C named as Tauri's fallback. The reasons it isn't the primary:

- **Bundle size** ≈ 80–150 MB before any of our code, vs. Tauri's ~5–10 MB. Each Electron install ships its own Chromium copy.
- **Idle RAM** ≥ 150 MB baseline. Tier-1 NFR-Performance is ≤ 300 MB _per idle persona_ — Electron would consume half that budget on the shell alone.
- **Sidecar story** is fine (Node + native modules) but pushes us toward Node-native rather than Rust crates. We'd need to re-evaluate D-2 through D-11 if we made this switch.

Verdict: **Fallback only.** Today's Tauri spike succeeded; no need to invoke the fallback. Electron remains documented for the edge case where Tauri 3 (or a future Paperclip rewrite) hits an unfixable WebView2 incompatibility.

### Wails (Go)

Wails is the closest peer to Tauri — same OS-WebView strategy, same React-hosting pattern, same lean bundle. The only real difference is **Go backend instead of Rust**.

- **Hosts React UI identically** to Tauri. `createPortal` and `createRoot` work the same.
- **Cross-platform** support is on par.
- **Sidecar fit** is the deciding axis. Our architecture's Rust crates (D-1 IPC, D-2 Zellij adapter, D-3 bus relay, D-4 progress signals, D-5 stall detector, D-6 persona-sync, D-7 vault scoping, D-9 credential storage, D-10 workspace SQLite via sqlx, D-11 telemetry tap) would all need Go equivalents. Real cost: ~2–3 days to rewrite the architecture decisions document, re-pin versions, and re-author crate names; plus the per-crate re-implementation effort during M1–M5.
- **Maturity differential:** Tauri 121k★ vs. Wails 41k★. Both have stable v2-class releases as of 2026; both are production-real. Tauri's ecosystem (plugins, mobile path) is broader.

Verdict: **Lateral move with switching cost.** A Wails spike would likely succeed — but the architecturally honest question is "do we want Go for the sidecars?" That's a strategic preference, not a technical superiority claim. **Rust was locked at OQ-J**; flipping it now re-opens 11 architectural decisions for at-best parity. The case for a Wails spike is "team prefers Go" and Maurice's answer to that in this session was: confirm Tauri, no Wails spike.

### Flutter Desktop

Flutter renders its own UI via Impeller (Metal/Vulkan/D3D). It does not host arbitrary web UIs — there is no in-process DOM for `createPortal` to target. Hosting Paperclip's React UI would require re-implementing Paperclip's UI in Dart/Flutter.

- Paperclip is **upstream** (locked per HANDOFF — no fork, no reimplementation).
- Re-writing its UI in Dart would put us in a perpetual maintenance debt against Paperclip's upstream.

Verdict: **Ruled out.** Doesn't fit the integration thesis ("the bundle is the product"). Building our own React-equivalent of Paperclip's UI defeats the whole reason 4nCO exists.

### .NET MAUI / Qt / Avalonia / SwiftUI

Same fundamental issue as WinUI 3: these are native-widget UI frameworks, not WebView hosts. Each would require embedding a WebView2 (or equivalent system WebView) inside the native UI to host Paperclip — the same complexity tax as WinUI 3, without WinUI 3's Windows-native polish on the native panels.

Verdict: **Ruled out** for the same reason as WinUI 3, plus they don't even have Windows-native UI as a compensating benefit.

---

## What this audit changes

- **OQ-C** in `prd.md` §8 stays as-is (Tauri preferred, M0 spike validates, Electron fallback) — no rewrite needed.
- **D-13** in `architecture.md` stays as-is.
- **`pinned-versions.md`** stays as-is.
- **Story 1.1** spike report stays at FINAL GO.

This document is the audit trail proving the alternatives were considered with fresh data after the spike succeeded. It is not a re-decision — it confirms the locked decision.

---

## Sources

- [SourceForge — Tauri vs WinUI comparison](https://sourceforge.net/software/compare/Tauri-vs-WinUI/)
- [Visual Studio Magazine — choosing the right UI framework for native Windows](https://visualstudiomagazine.com/articles/2024/02/13/desktop-dev.aspx)
- [Microsoft Learn — WebView2 in WinUI 3](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winui)
- [Microsoft Learn — WinUI 3 WebView2 platform docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/platforms/winui3-windows-app-sdk)
- [Windows Latest — Microsoft commits to native UI for Win 11, away from React](https://www.windowslatest.com/2026/05/15/microsoft-commits-to-native-ui-for-windows-11-as-users-push-back-against-web-app-slop/)
- [Elanis web-to-desktop framework comparison](https://github.com/Elanis/web-to-desktop-framework-comparison)
- [CodeNote 2026 cross-platform comparison (Flutter / RN / Tauri / KMP / Electron / MAUI)](https://codenote.net/en/posts/cross-platform-dev-tools-comparison-2026/)
- [Wails vs Tauri IPC analysis](https://medium.com/@tacherasasi/why-wails-wins-at-ipc-for-go-desktop-apps-and-how-it-stacks-up-against-tauri-electron-5a00b202cf09)

---

## Change log

| Date       | Action                                                                                 | By                  |
| ---------- | -------------------------------------------------------------------------------------- | ------------------- |
| 2026-05-26 | Initial audit at Maurice's request after Tauri spike succeeded; OQ-C reconfirmed final | Architect (Winston) |
