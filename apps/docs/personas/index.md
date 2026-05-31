# Personas Overview

A **persona** is one AI agent with a defined role — Dev, Architect, PM, Analyst, QA, and so on. Every persona is backed by a real CLI process running in a Zellij terminal pane.

## Fixed Personas

These are always-on from the moment a project opens:

| Persona | Backing CLI | Model | Default Role |
|---|---|---|---|
| **Dev** | Claude Code | Claude Opus 4.6 (Thinking) | Engineering |
| **Frontend Designer** | Antigravity CLI (`agy`) | Gemini 3.1 Pro (High) | UX / visual work |

Fixed personas cannot be dismissed. They survive desktop-app restarts.

## Dynamic Personas

Everything else is spawned on demand:

- **Analyst** — explores problem space, research
- **PM** — manages scope, priorities, backlog
- **Architect** — designs system structure
- **SM** (Scrum Master) — runs the BMAD workflow
- **QA** — reviews stories, writes test plans
- **Security Reviewer** — inspects code for security issues
- **Tech Writer** — authors documentation
- Any **custom persona** you define

### Lifecycle

Each dynamic persona is either:

- **Persistent** — full team member with its own Zellij pane, vault directory, and bus identity. Lives until the project closes or you dismiss it.
- **Ephemeral** — one-shot worker. Spawns, runs its single task, posts its output as an artifact, and exits cleanly. No pane, no vault dir, no bus identity retained after exit.

## Adding a Persona

See [Adding a Persona](/personas/add/).

## Creating a Custom Persona

See [Creating a Custom Persona](/personas/custom/).

## Persona File Projection

Each persona has a source-of-truth markdown file in the Obsidian vault (`vault/personas/<persona-id>/`). When a persona spawns, the workspace projects this file into the tool-specific config:

- `claude.md` — for personas backed by Claude Code
- `agy.md` — for personas backed by Antigravity CLI
- `agent.md` — for other CLIs

If you edit the tool config directly (e.g., `claude.md` in your editor), the change flows back into the vault persona file within 30 seconds (best-effort, with conflict logging).
