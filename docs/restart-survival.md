# Restart survival

> The Dev persona's Claude Code session survives a full desktop-app restart. Closing 4neverCompany OS for the day and reopening it the next morning re-attaches to the same conversation — no re-spawn, no re-auth, no lost context.
>
> Implements Story 1.15. Architecture decision: D-2 (Zellij is the sole spawn path; owns session persistence).

## Why this matters

A Dev persona session — `claude` running inside a Zellij pane with the project's full context loaded — is expensive to bring up: the model has to re-read `claude.md`, the user has to re-explain whatever they were mid-thought on, and any cached state is gone. The product's promise is that opening a project tomorrow looks just like leaving it tonight. **Restart survival is the mechanism that delivers on that promise.**

## How it works — the five-link chain

Restart survival is not a feature we wrote; it's a property that falls out of five separate decisions stacking correctly.

### 1. The active-project pointer lives on disk, not in memory

When the user opens a project (`open_project` Tauri command, see `apps/desktop/src-tauri/src/commands/mod.rs`), the project's `ProjectInfo { id, path, name, opened_at }` is serialized to `~/.4nevercompanyos/active-project.toml`. On every desktop launch, `current_project()` reads this file back. Closing the desktop process doesn't touch the file.

```text
~/.4nevercompanyos/
└── active-project.toml         ← survives desktop restart by being on disk
```

### 2. The Zellij server is a separate process from the desktop

Per Architecture D-2 and the `crates/zellij-adapter` docstring:

> The Zellij server outlives the desktop app's lifetime; closing the workspace doesn't kill the persona's CLI process.

Zellij runs as its own daemon. When `spawn_dev_persona` calls `zellij --session dev-<id> action new-pane -- <supervisor> ...`, the Zellij CLI talks to (or starts) the Zellij server, which then owns the new pane. The desktop process is just a client to Zellij at spawn time; once the call returns, the desktop has no handle on the pane or the processes inside it.

### 3. The supervisor + claude are children of Zellij, not of the desktop

The actual process tree inside the pane is:

```
zellij server (long-lived daemon)
└── pane (PTY-owned by zellij)
    └── c4n-persona-supervisor dev <vault> -- claude
        └── claude
```

Both `c4n-persona-supervisor` and `claude` are spawned by Zellij, parented to the Zellij server, in Zellij's PTY. Closing the desktop has no effect on any of them. The supervisor is configured with `close_on_exit: false` (see `SpawnPaneConfig` in `spawn_dev_persona`) so the pane stays open even if `claude` itself ever exits.

### 4. `spawn_dev_persona` has a session-reuse branch

When the desktop relaunches and the user clicks "Spawn Dev persona" (or when `dev_persona_status` polling discovers the session is already running), the spawn path checks `zellij::list_sessions()` first:

```rust
let already_running = sessions
    .iter()
    .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
if already_running {
    return Ok(DevPersonaStatus::Running { session_name });
}
```

If the session exists, we return `Running` without calling `zellij::spawn_pane` again. **No duplicate session.**

### 5. The UI auto-reflects the running state on launch

`apps/desktop/src/views/ProjectsView.tsx` polls `dev_persona_status` every 3 seconds while a project is open. On a fresh desktop launch:

1. `ProjectsView` mounts.
2. `current_project()` returns the previously-opened project (chain link 1).
3. The status poll fires immediately + every 3s thereafter.
4. The poll sees the running session (chain link 4 — without spawning) and returns `{ state: "running", session_name }`.
5. The UI renders the green "attached" badge.

End-to-end latency: typically < 3 seconds from desktop launch to "attached" badge visible.

## Manual verification protocol

The `#[ignore]`-tagged test `restart_survival_manual_verification` in `apps/desktop/src-tauri/src/commands/mod.rs` documents this protocol in code. Run with:

```powershell
cargo test -p c4n-desktop -- --ignored
```

Preconditions: Zellij ≥ 0.44.3, Claude Code, and `c4n-persona-supervisor` all on PATH; first-run wizard completed.

Walk through it on a real Win 11 dev box. See the test's `eprintln!` for the step-by-step. The pass condition is that the Zellij session still exists after the desktop is closed, the desktop reattaches to it on relaunch, and no duplicate session is created.

## Failure modes and recovery

### The user deleted the project folder while the desktop was closed

`current_project()` returns a path that no longer exists. The `ProjectsView` will:

- Show the stale `ProjectInfo` (since `open_project`'s validation only runs at open time)
- The first spawn-or-status call against it will fail with a path-not-found error
- The user has to manually call `close_active_project` from the UI

**Fix in scope for a future story:** detect missing path at `current_project()` time and offer to clear the active-project pointer. Not in scope for Story 1.15.

### The Zellij server crashed or was killed externally

`zellij::list_sessions()` returns an empty list (or fails). `dev_persona_status` shows `not-running`. The user can re-spawn — a fresh session under the same name picks up where the lost one left off, modulo Claude Code's own conversation cache.

This is expected behavior; we don't try to be smarter than Zellij about session recovery.

### Stale `active-project.toml` from a removed `~/.4nevercompanyos/`

If the user wipes their workspace config (e.g., reinstalled the workspace), `current_project()` returns `None` and the UI shows the empty-state CTA. No error. Re-opening a project re-creates the file.

### Two desktop instances against the same vault

Architecture assumes single-instance desktop. Running two instances of `pnpm dev:desktop` against the same vault would race on `active-project.toml`. The Zellij sessions themselves are fine (Zellij multiplexes happily) but the active-project pointer would flip-flop. **Out of M1 scope.** Flag if multi-window becomes a real M2+ requirement.

## Sibling stories

- **Story 1.11** — Zellij adapter — provides the `list_sessions` / `session_exists` primitives this story depends on.
- **Story 1.12** — Dev persona spawn — provides `spawn_dev_persona` with the existing session-reuse branch (chain link 4) and `current_project()` for restoring the pointer on launch (chain link 1).
- **Story 1.14** — Persona supervisor — provides the supervisor + `close_on_exit: false` semantics (chain link 3).
- **Story 1.16** — Hermes TUI embedded as a pane — uses the **same** restart-survival chain documented here. The 1.16a sub-story upgrades the supervisor from raw stdio to a PTY tap (`<vault>/personas/<id>/log/<date>.pty.raw`); restart survival is unaffected because Zellij still parents the supervisor (chain link 3 holds). The xterm.js layer in 1.16c is a DISPLAY of the running session, not a replacement; on desktop restart, xterm.js re-attaches its tail to the existing tap file. Both Dev and Hermes get restart survival on the same pattern.
- **Story 2.5** (M2) — Frontend Designer's restart survival — extends the same five-link chain to the third persona. Confirms the architecture generalizes to N personas. See the dedicated section below.

## Both fixed personas (Story 2.5)

Story 2.5 closes the loop on the product's "two fixed personas" promise: **both** Dev (Claude Code) and Frontend Designer (Antigravity CLI / `agy`) must reattach on restart, with zero orphans and scrollback preserved.

No new runtime code path was needed — `spawn_designer_persona` (`apps/desktop/src-tauri/src/commands/mod.rs`) was already built on the same five-link chain as Dev:

| Link | Dev (Story 1.15) | Frontend Designer (Story 2.5) |
| ---- | ---------------- | ----------------------------- |
| 1. On-disk active-project pointer | `read_active_project()` | shared — same pointer |
| 2. Zellij daemon outlives desktop | `dev-<id>` session | `designer-<id>` session |
| 3. Supervisor `close_on_exit: false` | `spawn_dev_persona` | `spawn_designer_persona` |
| 4. Session-reuse branch | `if already_running { Running }` | identical branch in `spawn_designer_persona` |
| 5. UI auto-reflects on launch | `ProjectsView` polls `dev_persona_status` | `PersonasView` polls `designer_persona_status` every 3s |

### The `agy`-vs-Claude-Code session-persistence concern

The story flags a real-looking risk: "`agy` session persistence vs Claude Code session persistence differ." It turns out to be a non-issue for OS-level restart survival, and it's worth spelling out why so nobody re-litigates it:

**Restart survival never restarts either CLI.** Zellij owns the PTY and parents the supervisor + CLI; closing the desktop merely drops a Zellij *client*. The `claude` and `agy` processes keep running, untouched, with all of their in-memory state intact. Because neither process is ever killed-and-relaunched on a desktop restart, neither one's *own* on-disk session-resume mechanism is exercised — so any difference between how `agy` and Claude Code persist their sessions is irrelevant here. The guarantee is identical for both, and it's stronger than relying on either CLI's resume: the live process simply never goes away.

### Scrollback ≥ 1000 lines

The AC requires each pane's scrollback to show ≥ the last 1000 lines after restart. This is carried by Zellij's pane scrollback buffer, held in the Zellij server's memory. Since the pane and its process survive (links 2–3), the buffer survives with it. Zellij's `scroll_buffer_size` default is 10000 lines — comfortably above the 1000-line floor — so the AC holds for both panes out of the box. (A user who manually sets `scroll_buffer_size < 1000` in their own Zellij config would undercut this; that's a user-config concern outside the app's control.)

## Bottom line for new contributors

Restart survival is **already working** because of how Stories 1.11, 1.12, and 1.14 were structured. Story 1.15 is the audit-trail story that formalizes this guarantee. **Don't add new code paths for restart survival** — the existing chain is intentional and resilient. If you find a way to break it, that's a regression, not a missing feature.
