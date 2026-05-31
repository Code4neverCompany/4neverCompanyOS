# 4neverCompany OS

**4neverCompany OS** is a packaged desktop workspace for AI-agent-driven development. It bundles Paperclip, Hermes Agent, and the BMAD Method into a single installable product.

## What You Get

- **Two fixed persona agents** from project start: Dev (Claude Code) and Frontend Designer (Antigravity CLI / `agy`)
- **Dynamic persona spawning** on demand — Analyst, PM, Architect, QA, and more — via the BMad Builder panel
- **Liberal inter-agent message bus** with progress-based stall detection
- **Persistent Zellij terminal multiplexer** — every persona runs in a real, attachable terminal
- **Local Obsidian vault** for project memory + **Supermemory** for cross-project semantic recall
- **Auto-generated agent configs** (`claude.md`, `agy.md`, `agent.md`) kept in sync with vault persona files

## Quick Start

1. [Install the workspace](/install/) (Windows, macOS, or Linux)
2. [Run the first-run wizard](/first-run/) to configure API keys and vault location
3. [Start a BMAD project](/bmad/) to see the full workflow in action

## Key Concepts

| Concept             | Description                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **Persona**         | One AI agent with a defined role (Dev, Architect, PM, etc.)                                 |
| **Fixed Persona**   | Always-on from project start (Dev, Frontend Designer)                                       |
| **Dynamic Persona** | Spawned on demand, persistent or ephemeral                                                  |
| **BMAD**            | Bundled development methodology; `greenfield-fullstack` and `brownfield` workflows included |
| **Hermes**          | Main orchestrator — watches the bus for progress, intervenes on stalls                      |

## System Requirements

- **Windows** 10/11 (x64) — `.exe` installer
- **macOS** 12+ (Intel / Apple Silicon) — `.dmg` installer
- **Linux** Ubuntu 22.04 LTS or 24.04 LTS — AppImage
- Internet connection for initial setup and model API calls
