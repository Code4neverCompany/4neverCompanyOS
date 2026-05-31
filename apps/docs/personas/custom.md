# Creating a Custom Persona

You can define entirely new persona types beyond the built-in BMAD library. Custom personas work exactly like built-in ones — they appear in the Add Agent panel, can be spawned persistent or ephemeral, and are saved as reusable modules.

## How to Create

1. Open the **BMad Builder** panel
2. Click **Create Persona**
3. Fill in the persona definition:
   - **Persona ID** (slug) — used in file names and bus identities, e.g., `customer-support-triage`
   - **Display Name** — how it appears in the UI, e.g., "Customer Support Triage"
   - **Role Description** — what this persona does
   - **Default Backing CLI** — Claude Code or Antigravity CLI
   - **Default Model** — pick from available models
   - **Tools** — list the tools/capabilities the persona has access to
   - **Personality Prompt** — how the persona should behave and communicate
4. Click **Save**

The persona file is written to `_bmad/custom/<persona-id>/persona.md` following the BMAD persona file convention.

The new persona appears in the **Add Agent** panel immediately — no app restart required.

## Persona File Format

A saved persona is a standard BMAD persona markdown file. Example:

```markdown
# Customer Support Triage

## Role
Analyses incoming customer support tickets and routes them to the right team.

## Tools
- Web search
- CRM read access
- Ticket routing API

## Personality
Calm, precise, empathetic. Asks clarifying questions before escalating.
```

## Spawning a Custom Persona

Custom personas appear in the Add Agent panel alongside built-in ones. Spawn them the same way — pick the persona, choose backing CLI and lifecycle, and click **Spawn**.

## Saving as a Reusable Module

When you create a custom persona, you are asked whether to save it as a reusable BMAD module. If you do, the persona file can be exported and installed on another machine or shared with others via `bmad-method install --source <path>`.
