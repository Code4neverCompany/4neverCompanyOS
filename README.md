# 4neverCompanyOS

Personal OS dashboard for 4neverCompany — tasks, daily priorities, notes, an Obsidian-style memory vault, and an agent harness for your CLIs (claude, pi, antigravity), in the 4never brand design (dark, violet→cyan).

Runs in two modes off the same codebase:

## Desktop-App (Tauri, nativ — empfohlen)

Backend komplett in Rust, eine eigenständige .exe mit Tray-Icon, Live-Streaming der Agent-Ausgaben. Einmalig Rust (MSVC) installieren, dann:

```
cd I:\4neverCompanyOS\src-tauri
cargo tauri dev        # Entwicklung
cargo tauri build      # Installer (.msi/.exe)
```

Details: `build-tauri.md`. Daten bleiben in `data/` + `vault/` — beide Modi teilen sie sich.

## Web-Modus (Node)

```
cd I:\4neverCompanyOS
npm install && npm start     # oder: start.bat doppelklicken
```

Open http://localhost:4444 (set `PORT` to override). Requires Node 18+.

## Pages

- **Dashboard** — today's priorities (auto-pulls starred, P0, and due tasks), stat counts, quick-add, pinned notes, agent + integration status.
- **Tasks** — Open/Doing/Done board, priority tags P0–P3, business-unit tags (aiart4never, 4nevercompany, master4broker, master4never), free tags, due dates, "today" star. Press `n` for a new task.
- **Notes** — quick note cards with pinning.
- **Vault** — markdown files in `vault/`. `[[Wiki Links]]` are clickable, backlinks tracked, link graph rendered. The folder is plain `.md` — point Obsidian at it if you want.
- **Agents** — the harness. Runs installed CLIs with a prompt, shows live output, and **Delegate** chains agents so one's output feeds the next's context. Availability is auto-detected from PATH. Add custom agents via `customAgents` in `data/config.json`.
- **Settings** — Slack/Notion tokens and MCP server definitions (Claude-Desktop-style JSON). These are config-ready stubs: the UI, storage, and masking are live; wire actual API calls when you're ready.

## File structure

```
public/index.html    Entire frontend (single file; auto-detects Tauri vs. browser)
src-tauri/           Native desktop app (Rust, Tauri v2)
  core/              Pure backend logic crate (34 unit tests)
  src/lib.rs         24 Tauri commands, tray, streaming
  tauri.conf.json    App config; icons/ = brand icons
server.js            Express app + routes (port 4444) — web mode
lib/                 Node backend (store, agents, integrations)
data/                tasks.json, notes.json, runs.json, config.json (shared)
vault/               Your markdown memory vault (shared, Obsidian-compatible)
build-tauri.md       Build-Anleitung (Deutsch)
```

## Design

Brand tokens (documented in index.html): bg #0a0b0e, accent #7c5cff→#4cc2ff gradient, unit colors aiart4never #c084fc / 4nevercompany #7c5cff / master4broker #3ecf8e / master4never #ffb020. Keyboard: `g`+`d/t/n/v/a/s` navigation, `n` new task, `?` shortcut overlay, Ctrl+S saves vault notes.

Everything persists as plain JSON/markdown on disk — no database. Tokens in `data/config.json` are stored in plaintext locally and masked in the API; don't commit that folder.
