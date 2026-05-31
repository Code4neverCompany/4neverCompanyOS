# Multi-Machine Setup

4neverCompany OS supports cross-machine continuity. Set up GitHub sync once, and you can pull your project on any machine and resume with the same personas.

## How It Works

1. On **machine A**, configure GitHub sync for a project
2. The following are pushed to GitHub:
   - Persona files (canonical vault copies)
   - BMAD artifacts (brief, PRD, architecture, stories, QA reports)
   - Custom personas
   - Project settings
3. On **machine B**, clone the repo and open the project
4. Fixed personas (Dev + Frontend Designer) spawn automatically
5. A prompt offers to respawn any persistent dynamic personas from machine A

## What Is Synced

The synced set (per `docs/sync-policy.md`) includes:

- `vault/personas/<persona-id>/` — canonical persona files
- `vault/projects/<project-id>/bmad/` — all BMAD artifacts
- `_bmad/custom/` — custom persona modules
- Project settings (Paperclip project config)

## What Is NOT Synced

These stay local to each machine:

- API keys and credentials (stored in OS keychain)
- Workspace SQLite (contains ephemeral runtime state)
- Supermemory index (opt-in, privacy-sensitive)
- Any vault content not explicitly opted into sync

## Configuring GitHub Sync

1. Open **Settings → GitHub Sync** in the desktop UI
2. Authenticate with GitHub (OAuth or personal access token)
3. Pick the repo to sync to (create a new one or link an existing)
4. Click **Sync**

The initial sync pushes all configured content. Subsequent syncs are incremental.

## Round-Trip Continuity Test

The M5 exit criterion includes:

- **Win → GitHub → Mac → Linux** round-trip
- Each leg: clone, open project, verify fixed personas spawn, verify persistent dynamic personas offered for respawn

Results are recorded in `tests/manual/m5-round-trip-runs/` in the repo.

## Supermemory (Cross-Project Memory)

Supermemory is an opt-in layer that indexes your vault to a semantic memory server, enabling cross-project recall. To enable:

1. Open **Settings → Memory**
2. Toggle on content categories you want indexed (Decisions, Architecture artifacts, Code-review notes, etc.)
3. Credentials for Supermemory are stored in your OS keychain

Supermemory content is **not synced to GitHub** — it stays private to your account.
