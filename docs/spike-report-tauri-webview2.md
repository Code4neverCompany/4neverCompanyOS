# Spike Report — Tauri / WebView2 / Paperclip Portal-Slot Injection

**Story:** Epic 1, Story 1.1 (`epics.md`)
**Architecture reference:** D-13 / Gap G-1 (`architecture.md`)
**Date:** 2026-05-26
**Spike location:** `spikes/tauri-spike/` (gitignored throwaway)
**Time-box:** one day per Story 1.1 AC

---

## TL;DR — Go / Fallback Decision

**Verdict: FINAL GO on D-13 portal-slot path.** Validated end-to-end 2026-05-26 after Windows 11 SDK 10.0.28000.0 was installed.

- ✅ WebView2 rendering (page paints inside Tauri window)
- ✅ Portal-slot injection (workspace panels render inside Paperclip host's named DOM slots via `createPortal`)
- ✅ Tauri IPC (`invoke('greet')` round-trips)
- ✅ DOM-mount fallback (separate `createRoot` works in the same WebView2)

Cold build of Tauri Rust crates: **1m 40s** in debug mode (1st run); incremental dev builds will be much faster. Tauri 2.11.2 + React 19.2.6 + Vite 7.3.3 + TypeScript 5.8.3 + Rust 1.90.0 + WebView2 148.0.3967.83. The architectural choice is locked in; M0 can proceed to Story 1.2 monorepo scaffolding with full confidence.

**Previous blocker (resolved):** The Windows SDK install at `C:\Program Files (x86)\Windows Kits\10\` was incomplete on first attempt — `Lib\` and `Include\` payloads were missing. Maurice installed Windows 11 SDK 10.0.28000.0 via the official installer; `Lib\10.0.28000.0\um\x64\kernel32.Lib` (311 KB) is now present, and the VS Developer PowerShell launcher (`Launch-VsDevShell.ps1 -Arch amd64 -HostArch amd64 -SkipAutomaticLocation`) populates LIB (4 entries) and INCLUDE (8 entries) correctly. The vcvars64.bat batch file itself still emits a cosmetic "vswhere.exe is not recognized" warning during startup but the env vars load fine.

---

## What the spike validated

### (a) Tauri version verified

- **Tauri CLI:** `@tauri-apps/cli@2.11.2` (latest stable 2.x line; `--tauri-version` defaulted to 2)
- **Tauri Rust crates:** `tauri@2`, `tauri-build@2`, `tauri-plugin-opener@2`
- **Starter command used:** `pnpm create tauri-app -t react-ts -m pnpm --identifier com.c4nfornever.tauri-spike -y tauri-spike` (per Story 1.2's planned command; works identically for the spike folder name)

### (b) Toolchain check

| Tool | Version | Status |
|---|---|---|
| Node.js | v25.0.0 | ✓ above pinned `>=20.0.0` |
| pnpm | 11.3.0 | ✓ above pinned `>=9.15.0` (modern — see "pnpm 11 settings" note below) |
| Rust (rustc) | 1.90.0 | ✓ stable channel, `x86_64-pc-windows-msvc` target |
| Cargo | 1.90.0 | ✓ |
| WebView2 Runtime | 148.0.3967.83 | ✓ pre-installed on the machine |
| Visual Studio 2022 BuildTools | installed at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools` | ⚠ MSVC component present, **WinSDK component MISSING** |
| Visual Studio 2022 Community | installed at `C:\Program Files\Microsoft Visual Studio\2022\Community` | ⚠ same gap |
| Visual Studio 2019 BuildTools | installed | ⚠ same gap (SDK headers/libs not on disk) |

### (c) WebView2 / front-end render result — PASS

- `pnpm install` succeeded after configuring `pnpm-workspace.yaml` with `allowBuilds.esbuild: true` (pnpm 11 changed the build-approval mechanism — see "pnpm 11 settings" finding below).
- `pnpm build` (= `tsc && vite build`) succeeded:
  - 33 modules transformed, no TS errors.
  - Output: `dist/index.html`, `dist/assets/index-*.css` (~3 KB), `dist/assets/index-*.js` (~200 KB).
  - One info-level Vite warning about `react-dom/client` being both dynamically and statically imported — expected because the spike intentionally exercises both code paths (portal injection vs. DOM-mount fallback uses `await import("react-dom/client")`). Cosmetic, not a fault.
- TypeScript strict mode passed on the spike's `App.tsx` which exercises:
  - `useState` + `useEffect` + standard hooks (proves React 19.2.6 wiring).
  - `import { invoke } from "@tauri-apps/api/core"` for IPC (Tauri's standard pattern).
  - `import { createPortal } from "react-dom"` for the D-13 preferred path.
  - `await import("react-dom/client")` + `createRoot(...).render(...)` for the D-13 fallback path.

The frontend code is ready. Visual run-time verification is blocked by (d).

### (d) Tauri Rust-side compile — BLOCKED on environmental SDK gap

`cargo check` against `spikes/tauri-spike/src-tauri` fails at the linker stage with `LNK1181: kernel32.lib not found`. Investigation:

1. `vcvars64.bat` from VS 2022 BuildTools loads MSVC (`INCLUDE` populated) but **`LIB` remains empty** — vcvarsall.bat reports "The system cannot find the file specified" during init.
2. Walking the filesystem: `C:\Program Files (x86)\Windows Kits\10\Lib\` is empty (no `10.0.x.x/um/x64/` directories where `kernel32.lib` would live). `Include\` likewise lacks `um/`, `shared/`, `ucrt/`.
3. Confirmed across both VS 2022 BuildTools and VS 2022 Community vcvars64 — neither resolves a Windows SDK on disk.
4. VS 2019 BuildTools reports having a Win10 SDK 19041 component installed (per `vswhere`), but the filesystem doesn't contain its `Lib`/`Include` payload either.

**Root cause:** Windows SDK installation is *registered* as present but the actual `Lib`/`Include` payload is missing on disk. This typically happens after a partial uninstall, disk-cleanup of "unused" SDK files, or a failed component install.

### (e) react-dom/portal pattern — IMPLEMENTED, awaiting (d) for visual verification

The spike's `App.tsx` implements both paths described in Architecture D-13:

**Preferred path — `ReactDOM.createPortal`** (D-13 primary):
- `PaperclipHost` component renders the "simulated upstream" UI with two named portal slots: `<div id="paperclip-slot-bus" />` and `<div id="paperclip-slot-approvals" />`.
- The workspace components `WorkspaceBusPanel` and `WorkspaceApprovalPanel` render via `createPortal(<WorkspacePanel />, slotElement)` into those slots.
- The React tree of the workspace component lives outside `PaperclipHost`'s subtree, but the *DOM* it produces lives inside the slot — proving cross-tree injection.
- A status panel verifies post-mount that `.workspace-panel-bus` and `.workspace-panel-approval` are present inside the slot DOM nodes, and reports PASS/FAIL.

**Fallback path — `ReactDOM.createRoot`** (D-13 secondary):
- A `runDomMountFallback` handler dynamically imports `react-dom/client` and calls `createRoot(host).render(...)` on a separate DOM node.
- Used if Paperclip's UI doesn't expose React-portal slots — a fully separate React root inside the same WebView2 still works because WebView2 is standards-compliant Chromium.

Both paths compile cleanly. Once (d) is unblocked, launching `pnpm tauri dev` will visually confirm the portal panels are rendered inside the orange-bordered Paperclip-clone host.

---

## Go / Fallback Decision

**Decision: proceed with Tauri + D-13 portal-slot injection** as the primary path. The architectural choice is sound. The blocker is environmental and confined to this developer machine.

**Rationale:**
- Tauri's frontend integration is unproblematic — Vite + React 19 + TypeScript builds cleanly.
- WebView2 runtime is available on the target platform and modern (148.x).
- The `createPortal` pattern is bog-standard React; it works in any DOM environment including WebView2.
- The DOM-mount fallback is also standard React 19 (`createRoot`) and is implemented for the contingency where Paperclip's UI doesn't cooperate.
- The Rust-side blocker is a Windows SDK install issue, not a Tauri choice issue. Re-installing the SDK component restores compile.

**Confidence level for D-13:** high. Once (d) unblocks, the visual portal-render verification is expected to pass on the first run; the spike's code is straightforward.

**Confidence level for D-13's fallback:** equally high. The fallback path uses the same React standard library that the primary path uses; no architectural risk.

---

## Action items

### Immediate (DONE 2026-05-26)

1. ~~Re-install the Windows SDK~~ — **DONE.** Windows 11 SDK 10.0.28000.0 installed. `Lib\10.0.28000.0\um\x64\kernel32.Lib` present (311 KB).
2. ~~Verify SDK payload~~ — **DONE.** `Get-ChildItem` confirms `10.0.28000.0` exists under both `Lib\` and `Include\`.
3. ~~Re-run cargo check~~ — **DONE.** `cargo check` from `spikes\tauri-spike\src-tauri` succeeded in 58.32s after loading the VS Developer PowerShell env (Launch-VsDevShell.ps1).
4. ~~Run the visual phase~~ — **DONE.** `pnpm tauri dev` launched the Tauri window (1m 40s cold debug build). `tauri-spike.exe` running with 6 child `msedgewebview2` processes. Maurice visually confirmed: all four PASS indicators land (WebView2 rendering, Portal-slot injection, Tauri IPC after Greet, DOM-mount fallback after the test button).
5. ~~Update Go / Fallback Decision~~ — **DONE.** Status: FINAL GO (see TL;DR at top).

### Required env setup for any dev machine going forward

To run Tauri dev/build commands, the VS Developer environment must be loaded. The cleanest pattern (verified during this spike):

```powershell
# At the start of every Tauri-touching shell session:
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
```

This populates LIB (4 entries: MSVC + NETFX + SDK ucrt + SDK um) and INCLUDE (8 entries). The launcher emits a cosmetic `vswhere.exe is not recognized` warning that can be ignored — the env loads correctly.

For CI (Story 1.5), the equivalent is the `microsoft/setup-msbuild@v2` action on Windows runners or relying on the runner's pre-baked Developer environment.

### Follow-up findings to absorb into the plan

- **pnpm 11 settings finding:** in pnpm 11 the `pnpm.onlyBuiltDependencies` field in `package.json` is **no longer read**. The replacement lives in `pnpm-workspace.yaml` as `allowBuilds.<pkg>: true` (and optionally `onlyBuiltDependencies` as a list). Story 1.2 (monorepo scaffolding) must use the pnpm-workspace.yaml form from day one. Spike used:
  ```yaml
  allowBuilds:
    esbuild: true
  onlyBuiltDependencies:
    - esbuild
  ```
- **Tauri 2 React-ts template's `pnpm tauri android init` suggestion:** ignore it for v1 — out-of-scope (mobile is Non-Goal per PRD §5).
- **WebView2 runtime version on the spike machine** was 148.0.3967.83 (Edge 148). Once `pinned-versions.md` lands (Story 1.4), add a "minimum WebView2 runtime version" row — bundled installer or Evergreen install should be a wizard prerequisite.
- **VS 2019 BuildTools + 2022 BuildTools + 2022 Community all coexist** on this machine. Once the SDK install lands, document the chosen one in `pinned-versions.md` so the team is consistent.

### What this spike does NOT yet validate

- The actual *Paperclip* React app's structure — we tested against a hand-rolled stand-in (`PaperclipHost`). When Paperclip is pinned at M0 (per OQ-J), a follow-up smoke test should host the real Paperclip UI in the Tauri WebView2 and confirm its DOM structure permits the portal-slot pattern (or that named-slot `<div>` IDs need to be added to Paperclip's UI — possibly as a contribution-back per OQ-M).
- Performance characteristics — the AS-9 NFR-Performance bounds (≤300 MB / ≤500 input tokens per hour idle) are not measured here; that's M2 baselining work (Story 2.16, 2.17).

---

## Files produced by this spike

| File | Purpose | Tracked? |
|---|---|---|
| `spikes/tauri-spike/` | Throwaway Tauri React+TS app demonstrating portal + fallback patterns | No — `spikes/` in `.gitignore` |
| `docs/spike-report-tauri-webview2.md` | This report | Yes |
| `spikes/tauri-spike/src/App.tsx` | Spike code with `PaperclipHost`, `WorkspaceBusPanel`, `WorkspaceApprovalPanel`, fallback handler, status panel | No |
| `spikes/tauri-spike/src/App.css` | Visual styling so the panels are unambiguously different (orange = host, blue = injected via portal, green = fallback) | No |
| `spikes/tauri-spike/pnpm-workspace.yaml` | pnpm 11 build-approval config | No |
