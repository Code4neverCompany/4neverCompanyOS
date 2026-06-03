# 0005 — Embedded Zellij as the terminal multiplexer for persistent personas

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Maurice, Winston (Architect), Amelia (Dev),
  ratified in the M0 architecture review
- **Source materials:** [`docs/4neverCompany_OS_Brief.md`](../4neverCompany_OS_Brief.md) §3.3
  & §3.9 & §5, [`docs/architecture-alternatives-evaluation.md`](../architecture-alternatives-evaluation.md),
  [`docs/restart-survival.md`](../restart-survival.md), [`Cargo.toml`](../../Cargo.toml)
  `crates/zellij-adapter`.

## Context

Architecture D-2 names Zellij as the **sole spawn path** for
persona agents and the **owner of session persistence**. The
product's promise is that a Dev persona's `claude` session
**survives a full desktop-app restart** — closing 4neverCompany
OS for the day and reopening it the next morning re-attaches
to the same conversation with no re-spawn, no re-auth, no lost
context (see [`docs/restart-survival.md`](../restart-survival.md),
implements Story 1.15, satisfies PRD success metric SM-1's
"≤ 10-min install" only insofar as the _first_ install is
under 10 min; restart survival is the _recurring_ user
experience promise).

The candidate multiplexers in 2026 are:

- **Zellij** — Rust, active development, scrollable terminal,
  layout DSL, can run as a long-lived server detached from any
  one client. Bundled as a single Go binary in our installer.
- **tmux** — battle-tested, ubiquitous on Unix, weaker on
  Windows (Cygwin/MSYS2 builds vary; no native PTY support).
- **GNU Screen** — even weaker on Windows, no real layout DSL,
  declining mindshare.
- **A purpose-built Rust PTY supervisor** — would re-invent
  session persistence, scrollback, and layout management from
  scratch.
- **ConPTY / Windows pseudo-console directly** — Windows-only,
  no cross-platform story; rules out Mac/Linux at M5.

## Decision

**Adopt Zellij** as the embedded terminal multiplexer. Bundle
Zellij v0.44.3 in the Windows NSIS installer (per
`feat(NEVAAA-132): bundle Zellij v0.44.3 in NSIS installer` and
the follow-up `fix(desktop): use NSIS !macro hooks instead of
!ifdef for PATH manipulation`). The Rust crate at
`crates/zellij-adapter/` owns the spawn / supervise / status
surface and is the **only** code path allowed to start a
persona agent. The desktop shell talks to Zellij via the
`zellij` CLI; the actual PTY and the processes inside it
are parented to the Zellij server, never to the desktop.

## Consequences

**Positive:**

- **Restart survival works out of the box.** The Zellij server
  outlives the desktop process; persona processes are
  parented to the Zellij server, not the desktop. Closing the
  workspace doesn't kill `claude`, `agy`, or any other
  persistent persona. See [`docs/restart-survival.md`](../restart-survival.md)
  for the five-link chain that makes this work.
- **Real, attachable terminals.** Each persistent persona
  (fixed or dynamic-persistent) gets its own Zellij pane. The
  desktop UI renders the pane via xterm.js + the Zellij
  attach protocol; the user can type into it, scroll it,
  copy / paste, detach / re-attach.
- **Layout DSL** lets us define "Dev on the left, Frontend
  Designer on the right, bus log at the bottom" as a
  declarative config that's diffable in Git.
- **Single binary, single dependency.** Zellij ships as a
  single Go static binary. NSIS bundles it; PATH manipulation
  is the only installer surgery needed.
- **Cross-platform.** Zellij runs on Windows, macOS, and Linux
  with the same layout files — the M5 cross-platform installers
  reuse the same Zellij configuration.

**Negative / trade-offs:**

- **Windows PTY quirks.** Zellij's Windows support is the
  weakest of the three target platforms. ConPTY behavior
  differs from Unix PTYs in subtle ways (signal delivery, EOF
  semantics, control-character handling). The `crates/zellij-adapter`
  crate papers over the worst of it; integration tests that
  need a real Zellij are `#[ignore]`d by default and run with
  `--ignored` on a Windows machine with Zellij installed.
- **PATH detection on Windows.** SmartScreen, antivirus, and
  per-user install locations have caused intermittent "zellij
  not found" failures. The wizard's
  `docs(NEVAAA-142): wizard Zellij-detection workaround` and
  the `winget / PATH override` notes in the
  [`docs/4neverCompany_OS_Build_Plan.md`](../4neverCompany_OS_Build_Plan.md)
  §Cross-Cutting track the workarounds; the right long-term
  answer is bundled-in-binary resolution (which the
  NSIS bundling work in `feat(NEVAAA-132)` provides).
- **Multi-pane complexity.** Layouts are powerful but easy to
  get wrong. The `crates/zellij-adapter` crate validates
  layouts against a known-good schema before applying them;
  malformed layouts fail loud at spawn time, not silently at
  attach time.
- **Coupling to Zellij's release cadence.** Pinning is a
  quarterly rebase concern (per
  [`services/README.md`](../../services/README.md)). If
  Zellij ships a breaking change between rebases, the
  adapter crate has to carry a shim. Worth it for the
  benefit, but worth tracking.

**Followups required:**

- Add an **integration test** that spawns a Zellij session,
  spawns a persona inside it, closes the desktop, reopens the
  desktop, and verifies the attach works. The
  `#[ignore]`d tests in `crates/zellij-adapter` are the
  starting point.
- Track the **Zellij-bundled PATH resolution** in the NSIS
  installer (per `feat(NEVAAA-132)`); verify on clean
  Windows installs as part of the M1 exit criterion.
- When M5 brings macOS / Linux installers online, verify the
  same Zellij layout files work without per-platform patches.
- Document the **Zellij version pin** in
  [`docs/pinned-versions.md`](../pinned-versions.md) and bump
  it on the quarterly rebase.

## Alternatives considered

- **tmux** — viable on macOS/Linux, weak on Windows; the
  Windows PTY story alone is enough to rule it out for a
  product that ships Windows at M1.
- **GNU Screen** — even weaker on Windows, no layout DSL,
  declining mindshare. No reason to choose it over Zellij.
- **A purpose-built Rust PTY supervisor** — rejected: we'd
  re-invent scrollback, layout, and persistence. Zellij
  already has these and is actively maintained.
- **ConPTY / Windows pseudo-console directly** — Windows-only;
  no Mac/Linux path. Ruled out by FR-36 / FR-37 (M5).
- **xterm.js with `node-pty` + a custom supervisor** — would
  work for the desktop-side rendering, but persistence (the
  process outliving the desktop) still needs a real
  multiplexer. Zellij is that multiplexer; xterm.js is the
  renderer. (We do use xterm.js, in `apps/desktop`'s
  embedded-terminal view.)
