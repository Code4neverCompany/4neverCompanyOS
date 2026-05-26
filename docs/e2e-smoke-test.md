# E2E smoke test — M1 exit criterion (≤ 10 min)

> The promise: from double-clicking `4neverCompany OS_0.0.1_x64-setup.exe` on a clean Windows machine to typing into a working Dev agent's Zellij pane takes **less than 10 minutes wall-clock**. This document is the protocol that verifies it.
>
> Implements Story 1.18. Validates PRD success metric **SM-1**.

## Why this matters

SM-1 is the M1 exit criterion. If a fresh-install user can't reach a productive Dev agent in under 10 minutes, the M1 walking-skeleton story breaks. This protocol is the calibration loop that catches regressions in any of the 12 stories whose surfaces compose the install → wizard → spawn flow (1.6–1.17a).

The test is **manual**. Automating Tauri 2 + xterm.js end-to-end requires a WebDriver harness that's an M2-class undertaking. The `#[ignore]`d `e2e_scenario_manual_verification` test in `apps/desktop/src-tauri/src/commands/mod.rs` surfaces this protocol via `cargo test -p c4n-desktop -- --ignored e2e_scenario_manual` for discoverability.

## Prerequisites — NOT counted in the 10-min budget

These are one-time setup costs a fresh-install user pays before the stopwatch starts.

1. **Clean Windows 10 or 11 environment.** A throwaway VM (Hyper-V, VirtualBox, Parallels) is ideal. A fresh user profile on an existing Win 11 box works as a fallback.
2. **Zellij ≥ 0.44.3 on `PATH`.** Install via `winget install zellij-org.zellij`. (Per architecture D-2, Zellij is the spawn authority for every persistent persona; the desktop app doesn't bundle it.)
3. **Claude Code installed + authenticated.** Story 1.9's wizard step only verifies presence (`claude --version`). Authentication is OOB until M2 wires the Anthropic OAuth flow into the wizard.
4. **Anthropic API key paste-ready.** Get one from <https://console.anthropic.com/settings/keys> if you don't already have one.
5. **A folder to use as the test "project."** A checkout of any repo (4neverCompany OS itself works) — the project doesn't need a `claude.md` (Story 1.13 projects one on spawn).
6. **`c4n-persona-supervisor` on `PATH`** — one-time prerequisite until Story 1.17b ships sidecar bundling. From the 4nCO repo root: `cargo install --path crates/persona-supervisor`. See `docs/installer.md` for the resolution-order table.
7. **Stopwatch + screen recorder.** Your phone is fine for the timing. For the recording: OBS Studio, Windows Game Bar (`Win+G`), or any screen-capture tool that produces `.mp4`.

## The 10-minute budget

Wall-clock budget from the moment you double-click the `.exe` to the moment you type into a working Dev agent's Zellij pane and get a response. Each phase has an estimated cap; the totals are cumulative.

| #   | Phase                                                              | Budget | Cumulative |
| --- | ------------------------------------------------------------------ | ------ | ---------- |
| 1   | Double-click `.exe` → NSIS installer window visible                | 0:30   | 0:30       |
| 2   | SmartScreen "More info" → "Run anyway" detour                       | 0:30   | 1:00       |
| 3   | Click through NSIS installer (Next → Install → Finish)             | 1:00   | 2:00       |
| 4   | App launches → first-run wizard step 1 visible                     | 0:30   | 2:30       |
| 5   | Wizard — vault location pick + scaffold                            | 0:45   | 3:15       |
| 6   | Wizard — Anthropic key paste + validate (real network call)        | 1:00   | 4:15       |
| 7   | Wizard — Claude Code `--version` check passes                      | 0:30   | 4:45       |
| 8   | Wizard — finish → Projects view visible                            | 0:30   | 5:15       |
| 9   | Open project — browse dialog + confirm                             | 1:00   | 6:15       |
| 10  | Click "Spawn Dev →"                                                | 0:30   | 6:45       |
| 11  | Dev embedded terminal appears with Claude's first prompt           | 1:00   | 7:45       |
| 12  | Type a real prompt + receive a response                            | 2:00   | 9:45       |
| —   | **Buffer**                                                         | 0:15   | **10:00**  |

If any single phase blows past its budget by more than 50%, log the actual time in `tests/manual/m1-exit-criterion-notes.md` with a remediation plan. That's the calibration signal — the budget table itself is an estimate until the first real run.

## Protocol

### Step 1 — Double-click `4neverCompany OS_0.0.1_x64-setup.exe`

**Expected:** NSIS installer window opens within ~10s. Branded 4never gold-on-dark icon in the title bar. Page reads "Install for current user."

**Verification:** Title bar text matches "4neverCompany OS Setup."

**Failure modes:**

- *Nothing happens after 5s.* Event Viewer → Windows Logs → Application; look for `c4n-desktop` or NSIS errors. Most likely cause: corrupted download (re-download and retry).
- *Installer immediately crashes.* Check the installer's filesize matches the released artifact's; partial download is the usual culprit.

### Step 2 — SmartScreen "Run anyway"

**Expected:** Windows SmartScreen warns about an unsigned executable. Click **More info** → **Run anyway**.

**Verification:** After "Run anyway," step 1's installer window appears.

**Failure modes:**

- *No SmartScreen warning at all.* You're either re-running the same installer (Windows remembers approvals per-file) or have SmartScreen disabled — both fine for the test. Skip this step's time cost.
- *"Run anyway" button missing.* Group Policy may be locking it down. Use a different test box.

**Note:** SmartScreen warnings retire when code-signing is configured (separate procurement track tracked in `docs/LICENSES.md` / `docs/pinned-versions.md`).

### Step 3 — Click through NSIS installer

**Expected:** Three clicks: **Next** (welcome) → **Install** (action) → **Finish** (with "Launch 4neverCompany OS" checkbox pre-checked).

**Verification:** App launches automatically from the Finish page; Start Menu now has a "4neverCompany OS" entry.

**Failure modes:**

- *WebView2 bootstrap stalls.* If the system is missing the Edge WebView2 runtime, the installer auto-downloads it. On a slow connection this can spike past budget. Check Task Manager for `MicrosoftEdgeWebview2Setup.exe` — let it finish.
- *"Access denied" on install.* You probably hit a folder requiring elevation. Per-user install (our default) lands in `%LOCALAPPDATA%\Programs\4neverCompany OS\` — no UAC needed. If you see UAC, something's off with the bundle config.

### Step 4 — App launches → first-run wizard

**Expected:** A window opens with the 4never wizard splash (gold monogram, "Set up your workspace" headline).

**Verification:** Title bar reads "4neverCompany OS." The wizard's first step is visible.

**Failure modes:**

- *Blank white window.* Vite dev assets failed to embed. Wouldn't happen from a real installer build — only seen on misconfigured `pnpm tauri dev`.
- *Window crashes on launch.* `%LOCALAPPDATA%\Programs\4neverCompany OS\` has `crash-*.log` files; check the first one.

### Step 5 — Wizard: vault location

**Expected:** "Where should your vault live?" step. Default suggestion is `~/.4nevercompanyos-vault/`. Click **Browse** to pick a different folder, or accept the default with **Continue →**.

**Verification:** After Continue, the chosen path appears at `~/.4nevercompanyos/config.toml` as `vault_path = "…"`. Story 1.7's vault scaffolding creates `vault/personas/`, `vault/projects/`, etc.

**Failure modes:**

- *"Could not write config."* Home dir is read-only (uncommon) or `~/.4nevercompanyos/` permissions are wrong. `attrib` the dir, re-run.
- *Default path doesn't exist after Continue.* Scaffolding silently failed. Check console logs (`Win+R` → `wt.exe` → `Get-ChildItem ~/.4nevercompanyos-vault/`).

### Step 6 — Wizard: Anthropic API key

**Expected:** Paste your `sk-ant-…` key. Click **Validate**. Within ~2s, a green check appears: "Validated — your key works."

**Verification:** Real network call to `https://api.anthropic.com/v1/models` (Story 1.8). The key is stored via `@c4n/credential-storage` (Story 1.10).

**Failure modes:**

- *"Validation failed: 401."* The key is invalid or revoked. Get a new one from <https://console.anthropic.com/settings/keys>.
- *"Validation hangs > 5s."* Likely captive portal or proxy. Test with `curl https://api.anthropic.com/v1/models -H "x-api-key: $YOUR_KEY"` outside the app.
- *Green check but next step fails to advance.* Hit **Continue →** after the green check; the validate step doesn't auto-advance.

### Step 7 — Wizard: Claude Code check

**Expected:** Wizard runs `claude --version` via a Tauri command (Story 1.9). Success: "Claude Code v…detected." Click **Continue →**.

**Verification:** The version string in the UI matches `claude --version` in your shell.

**Failure modes:**

- *"Claude Code not found."* The `claude` binary isn't on PATH. Install per <https://docs.claude.com/en/docs/claude-code/setup>. Restart the desktop app after install (PATH refreshes only on new processes).
- *Stuck on this step.* Window may have lost focus; click into it.

### Step 8 — Wizard: finish → Projects view

**Expected:** A "You're ready" summary screen. Click **Open the workspace →**. The wizard window closes; the main desktop shell opens to the Projects view (or the side-rail with Projects highlighted).

**Verification:** Top bar shows the 4never logo + "Projects" eyebrow. The main area shows the empty-state "No project open" card.

**Failure modes:**

- *Main shell shows a blank canvas.* Wizard didn't write `~/.4nevercompanyos/config.toml`. Re-run the wizard (delete the file first if it exists).
- *Window doesn't change after Finish.* The Finish handler errored silently. Console logs.

### Step 9 — Open project

**Expected:** Click **Open project →**. A native file picker opens. Navigate to the folder you chose as the test project and click **Select Folder**.

**Verification:** The Projects view now shows a project card with the folder's basename, the absolute path, and an "Open at HH:MM" timestamp. `~/.4nevercompanyos/active-project.toml` exists on disk.

**Failure modes:**

- *Picker doesn't open.* The dialog plugin (`tauri-plugin-dialog`) failed to load. Restart the app.
- *"Not a directory."* You selected a file, not a folder. Re-open and pick a folder.

### Step 10 — Click "Spawn Dev →"

**Expected:** Within the project card, a "Spawn Dev →" CTA. Click it. Within ~5s, the card transitions to "Running" with a green dot + the session name `dev-<project-id>`.

**Verification:** `zellij list-sessions` in any shell shows `dev-<project-id>` listed. `<vault>/personas/dev/log/<date>.pty.raw` exists and is non-empty.

**Failure modes:**

- *"zellij not on PATH."* Prerequisite #2 was skipped or your shell PATH didn't refresh post-install. Restart the desktop app.
- *"c4n-persona-supervisor not found."* Prerequisite #6 was skipped. Run `cargo install --path crates/persona-supervisor` and restart the app. Story 1.17b removes this prerequisite when it lands.
- *"Spawn failed."* Check the dev console (F12 in the embedded WebView2 if devtools are enabled, otherwise the Rust stderr; in dev builds, it's the terminal you launched `pnpm dev:desktop` from).

### Step 11 — Dev embedded terminal renders

**Expected:** Below the project card, an embedded xterm.js terminal appears (`Dev · live tap` header). Within ~3s of the spawn, Claude Code's prompt renders: ANSI-colored banner, conversation indicator, cursor blinking.

**Verification:** The terminal's content matches what you'd see if you ran `zellij attach dev-<project-id>` in a separate shell. Cursor is responsive to focus.

**Failure modes:**

- *Terminal blank > 5s.* The `.pty.raw` tail isn't running. Check `<vault>/personas/dev/log/<date>.pty.raw` exists and is being appended to (use Sysinternals Process Monitor filtered on that path).
- *Terminal shows only ANSI escape gibberish.* xterm.js didn't pick up the theme; cosmetic, not a budget-blocker.
- *Wrong content (random shell instead of Claude).* The supervisor's child argv is wrong; check `commands::spawn_dev_persona`'s `SpawnPaneConfig.args` chain.

### Step 12 — Type a real prompt + get a response

**Expected:** Type `Summarize the README.md in this project in 3 bullets.` (or any real prompt) + Enter. The PTY input path (Story 1.16d's `.pty.in` writer) carries the keystrokes; Claude processes; within ~30s you see a response stream in.

**Verification:** Response appears in the same terminal. The conversation is live and the M1 walking-skeleton story holds end-to-end.

**Failure modes:**

- *Typing produces nothing in the terminal.* Story 1.16d's `.pty.in` writer path is broken. Check `<vault>/personas/dev/log/current.pty.in` grows on keypress (Sysinternals Process Monitor).
- *Typing echoes but Enter doesn't submit.* xterm.js may be eating the Enter; click into the terminal first to ensure focus.
- *Response takes > 30s.* Network slow OR the prompt was a long one. Acceptable inside the 2-min phase budget; flag as a remediation note if persistent.

## Failure modes — the top 5 (one-page summary)

1. **Wizard Anthropic-key validation hangs.** Captive portal / corporate proxy. Test `curl` outside the app.
2. **"Spawn Dev →" says "zellij not on PATH."** Prereq #2 skipped or shell PATH stale; restart the app.
3. **"Spawn Dev →" says "c4n-persona-supervisor not found."** Prereq #6 skipped; `cargo install --path crates/persona-supervisor` and restart. Goes away in Story 1.17b.
4. **Terminal blank > 5s after spawn.** PTY tap file isn't being written. Check the file path in the persona log dir; check the supervisor process is alive in `zellij list-sessions`.
5. **Typing has no effect.** Story 1.16d's `.pty.in` writer path. Verify the input file is being appended to per keystroke.

## Recording + notes capture

The AC mandates two artifacts. Drop them in `tests/manual/`:

- **Screen recording** → `tests/manual/m1-exit-criterion-recording.mp4` (or similar `.mp4`/`.gif`/`.webm`). If the file is large (> 25 MB), enable Git LFS for the path per `tests/manual/README.md`. Goal: a viewable record of the run, not production-quality output.
- **Run notes** → `tests/manual/m1-exit-criterion-notes.md`. For each phase that took longer than its budget by > 50%, write one line: `Phase N (<name>): X:XX actual vs Y:YY budget — reason — proposed remediation.` Phases that came in under budget can be omitted.

If the total comes in **under 10:00**: the run is a PASS and the M1 exit criterion holds. Commit both files to a follow-up PR (not Story 1.18 itself — this story ships the protocol; the capture is a separate procedural artifact).

If the total comes in **over 10:00**: the run is a FAIL. The notes file becomes the source-of-truth for what regressed and which story needs fixing.

## Sign-off

Replace the placeholders below when you run the protocol. This block is the canonical record per run.

```
Run by:       __________________________________________
Date:         __________________________________________
Environment:  __________________________________________   (e.g., "Hyper-V Win 11 23H2, fresh VM")
Installer:    __________________________________________   (artifact path + commit SHA)
Total time:   ____:____   ☐ PASS (≤ 10:00)   ☐ FAIL (> 10:00; see notes)
Notes file:   tests/manual/m1-exit-criterion-notes.md
Recording:    tests/manual/m1-exit-criterion-recording.mp4
```

## Story 1.18 closes when

- This file (`docs/e2e-smoke-test.md`) is on `main`.
- `apps/desktop/src-tauri/src/commands/mod.rs::tests::e2e_scenario_manual_verification` exists and is discoverable via `cargo test -p c4n-desktop -- --ignored`.
- `tests/manual/README.md` + `tests/manual/.gitkeep` are on `main`, naming the recording + notes filenames the AC mandates.

The first actual real-hardware run that produces a passing recording + notes capture is a separate follow-up commit Maurice ships when his test VM is ready.
