# Installer — 4neverCompany OS (Windows / macOS / Linux)

> **Status:** Stories 1.17, 5.9, 5.10 ship all three platform installers.
> Windows NSIS, macOS DMG, and Linux AppImage are all produced via CI on
> each release tag. Persona-supervisor sidecar bundling (Story 1.17b) is still
> pending — see "Known caveats" below.

## CI Release Builds

All three platform installers are built via GitHub Actions on each version tag.
To trigger a release build:

```bash
# Create and push a version tag (must match v* pattern in release.yml)
git tag v0.0.1
git push origin v0.0.1
```

Or manually dispatch the workflow via GitHub CLI:

```bash
gh workflow run release.yml --field version=v0.0.1
```

Artifacts are uploaded to the draft GitHub Release at:
`https://github.com/Code4neverCompany/4neverCompanyOS/releases`

## Local Build (Windows)

From the repo root:

```powershell
# 1. Enter a VS Dev Shell (Tauri's build needs the MSVC toolchain).
& 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64 -SkipAutomaticLocation

# 2. Build the desktop crate's release binary + bundle into an NSIS installer.
Set-Location 'apps\desktop'
pnpm tauri build
```

Output lands at:

```
target/release/c4n-desktop.exe                                       # raw release binary
target/release/bundle/nsis/4neverCompany OS_0.0.1_x64-setup.exe     # signed installer (~2.2 MB)
```

## What the installer does

- **Per-user install** (`installMode: currentUser`) — no UAC elevation
  required. Lands under `%LOCALAPPDATA%\Programs\4neverCompany OS\`.
- **WebView2 auto-bootstrap** (`downloadBootstrapper`) — if the system is
  missing the Edge WebView2 runtime, the installer downloads + installs it
  silently before continuing.
- **Branded icon** — multi-resolution `.ico` regenerated from the 256×256
  monogram (`packages/ui-tokens/assets/logo/monogram.png`) via
  `pnpm tauri icon` (Story 1.17).
- **Start menu shortcut** + **uninstaller** registered with Windows
  Add/Remove Programs.

## Regenerating icons

If the brand monogram changes, regenerate the full icon set:

```powershell
Set-Location 'apps\desktop'
pnpm tauri icon ..\..\packages\ui-tokens\assets\logo\monogram.png
```

This rebuilds:

- `icons/32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`
- `icons/icon.icns` (macOS)
- `icons/icon.ico` (multi-resolution Windows; this is the one NSIS embeds)
- `icons/Square*.png`, `StoreLogo.png` (Windows Store metadata; harmless if unused)
- `icons/android/`, `icons/ios/` (mobile variants; .gitignored — we don't ship mobile)

## Known caveats (Story 1.17a)

- **`c4n-persona-supervisor` binary must be on `PATH`** for the installed
  app's "Spawn Dev" / "Spawn Hermes" flows to work. Until Story 1.17b
  bundles the supervisor as a Tauri sidecar, run once during install:
  ```powershell
  cargo install --path crates\persona-supervisor
  ```
  Override via `C4N_PERSONA_SUPERVISOR=<absolute-path>` env var if the
  binary lives outside `PATH`.
- **Zellij must be installed separately.** The brief commits to Zellij as
  the spawn authority (D-2); we don't bundle it. Install via
  `winget install zellij-org.zellij` (≥ 0.44.3 for Windows ConPTY support).
- **Code signing not configured.** The installer is unsigned, so Windows
  SmartScreen will warn on first launch. Code-signing certificate
  procurement is tracked separately (see LICENSES.md / pinned-versions.md
  for related procurement items).

## Verification

After install, verify the desktop binary works:

1. Launch from Start menu → app window opens
2. Wizard runs on first launch → completes setup (vault location, API key,
   Claude Code check)
3. Open a project → ProjectsView shows the project card
4. **If `c4n-persona-supervisor` is on `PATH`:** click "Spawn Dev" → Dev
   persona starts in a Zellij session + embedded terminal renders below

If the supervisor isn't on `PATH`, "Spawn Dev" surfaces an error; spawn
will start working as soon as the supervisor is installed.
