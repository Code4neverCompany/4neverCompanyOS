# Getting Started

This guide walks you through the core workflow after installing and running the first-run wizard.

## Create a Project

1. Click **New Project** in the desktop UI
2. Enter a project name and (optionally) an initial idea or goal
3. A Paperclip project and vault directory are created automatically
4. The two fixed personas spawn immediately:
   - **Dev** — Claude Code in a Zellij pane
   - **Frontend Designer** — Antigravity CLI (`agy`) in a Zellij pane

You can immediately type into either pane.

## The Desktop UI

The workspace has three main areas:

- **Multi-terminal view** — Zellij panes showing each active persona's terminal
- **Channel view** — live bus messages between personas (peer-to-peer chatter)
- **Sidebar** — project navigator, settings, persona management

## Start a BMAD Project

The headline workflow is the BMAD `greenfield-fullstack` run:

1. Click **Start a BMAD Project** in the sidebar
2. Pick `greenfield-fullstack` (or `brownfield` for an existing codebase)
3. Enter your project idea in the text field
4. Click **Start Workflow**

The workflow engine then walks through phases:

```
Analyst → PM → Architect → SM → Dev/QA
```

At each phase boundary, an approval gate appears. Click **Approve and continue** (or press Enter) to advance.

The workflow produces: brief, PRD, architecture doc, story files, and a working code skeleton — all in one session.

## Add a Dynamic Persona

You can add personas on demand at any time:

1. Click **+ Add Agent** in the sidebar or use the BMad Builder panel
2. Pick a persona type (e.g., Architect, QA, Security Reviewer)
3. Choose the backing CLI (Claude Code or Antigravity CLI)
4. Choose **Persistent** (stays for the project) or **Ephemeral** (runs one task and exits)
5. Click **Spawn**

The new persona appears in its own Zellij pane.

## Pause or Redirect a Persona

Right-click any persona pane to:

- **Pause** — stop the persona's bus posts and CLI input
- **Redirect** — post a user message to steer the persona
- **Dismiss** — terminate a dynamic persona (fixed personas cannot be dismissed)

## Next Steps

- [Adding a Persona](/personas/add/) — more detail on the Add Agent flow
- [Creating a Custom Persona](/personas/custom/) — define your own persona type
- [BMAD Workflows](/bmad/) — deeper dive into greenfield and brownfield
- [Multi-Machine Setup](/multi-machine/) — sync your project across machines
