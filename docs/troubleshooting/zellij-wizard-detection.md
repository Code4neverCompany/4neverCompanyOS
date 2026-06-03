# Tauri wizard — "Zellij not installed" detection workaround

> **Status:** Documentation workaround for a known detection gap. The underlying
> code fix lives in [NEVAAA-136](/NEVAAA/issues/NEVAAA-136); that work is
> currently blocked on the harness fix in
> [NEVAAA-140](/NEVAAA/issues/NEVAAA-140). Use one of the workarounds below
> in the meantime.

## Symptom

On first launch of the Tauri desktop app, the setup wizard stalls on the
**Zellij** step with a red "Zellij not installed" message and a single
**Recheck** button. There is no "Install" or "Use bundled" affordance inside
the wizard — the only way to clear the gate today is to make `zellij`
resolvable on `PATH` from outside the wizard, then click **Recheck**.

You will see this even on machines that have never had a Zellij install, and
even though the NSIS installer does ship a `zellij.exe` alongside the app
binary (see [NEVAAA-132](/NEVAAA/issues/NEVAAA-132), commit `21bbaf4`).

## Why it happens

The wizard's detection probe calls
[`zellij_available`](apps/desktop/src-tauri/src/commands/mod.rs:260), which
delegates to `c4n_zellij_adapter::is_available()`. That helper only walks
the **process `PATH`** — it does not look at the app's own resource /
sidecar directory where the bundled `zellij.exe` lives
(`apps/desktop/src-tauri/binaries/zellij.exe`, v0.44.3+).

So on a fresh box where Zellij was never installed system-wide, the probe
returns `false` even though a working `zellij.exe` is sitting one directory
over from the desktop binary.

The fix — teach `is_available` to fall back to the bundled sidecar path —
is tracked in [NEVAAA-136](/NEVAAA/issues/NEVAAA-136). Implementation is
blocked on the opencode_local adapter bug
[NEVAAA-140](/NEVAAA/issues/NEVAAA-140). Until that lands, the workarounds
below are the supported way to get past the gate.

## Workarounds

Pick **one** of the two options below. Both end with the wizard's
**Recheck** button flipping to green.

### Option 1 — Install Zellij via winget (preferred)

This is the cleanest path and matches the version floor the wizard expects
(≥ 0.44.3 for Windows ConPTY support).

```powershell
winget install zellij-org.zellij
```

Then close the wizard entirely, relaunch the desktop app, and click
**Recheck** on the Zellij step. `zellij --version` should report ≥ 0.44.3.

If you ever need to uninstall:

```powershell
winget uninstall zellij-org.zellij
```

### Option 2 — `PATH` override against the bundled binary (no install)

Use this if you don't want to install Zellij system-wide, or if winget is
unavailable (locked-down corporate box, no internet, etc.). It points `PATH`
at the in-repo bundled `zellij.exe` for the lifetime of the current shell
session.

```powershell
# Run BEFORE `pnpm tauri dev` (or before launching the installed app from
# that same shell). Adjust the prefix to wherever you cloned the repo.
$env:PATH = "I:\c4n-4neverCompanyOS\apps\desktop\src-tauri\binaries;$env:PATH"

# Sanity check
zellij --version    # should print zellij 0.44.3 or newer
```

Then:

- **Dev workflow:** run `pnpm tauri dev` from that same shell so the wizard
  inherits the modified `PATH`.
- **Installed app:** launch the desktop app from that same shell (Start menu
  shortcut won't see the override; use `Start-Process` from the shell, or
  set the env var system-wide).

Notes:

- The override only lives as long as the shell. Closing PowerShell drops it;
  reopen and re-export to bring it back.
- The override is **per-user, per-shell** — it doesn't touch the system
  `PATH` and doesn't require admin.

## Verification

Whichever workaround you chose, the success condition is identical:

1. Open a fresh PowerShell and run `zellij --version` → reports
   `zellij 0.44.3` (or newer).
2. Launch the desktop app from that same shell.
3. Wizard's Zellij step → **green** after **Recheck**.
4. Click **Spawn Dev** (or any persona) → the embedded terminal renders
   below and a `zellij list-sessions` from another shell shows the new
   `dev-<project-id>` session.

If the wizard still shows red after `zellij --version` succeeds in the
launching shell, you've hit a different bug — file an issue with the output
of `zellij --version` and `Get-Command zellij` from the launching shell.

## Tracking

- Code fix (bundled-sidecar fallback in `zellij_available`):
  [NEVAAA-136](/NEVAAA/issues/NEVAAA-136)
- Blocker for [NEVAAA-136](/NEVAAA/issues/NEVAAA-136) (opencode_local
  harness bug):
  [NEVAAA-140](/NEVAAA/issues/NEVAAA-140)
- Bundled Zellij in NSIS installer (shipped, [NEVAAA-132](/NEVAAA/issues/NEVAAA-132),
  commit `21bbaf4`).
- This workaround doc: [NEVAAA-142](/NEVAAA/issues/NEVAAA-142).
