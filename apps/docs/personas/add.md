# Adding a Persona

The **Add Agent** panel exposes the full BMAD persona library plus any custom personas you have defined.

## How to Add

1. Click **+ Add Agent** in the sidebar or the BMad Builder panel
2. You see a list of available personas:
   - Built-in BMAD personas: Analyst, PM, Architect, SM, QA, UX Designer, Tech Writer, Builder, Security Reviewer
   - Custom personas you have created
3. Pick the persona you want
4. Configure the spawn:
   - **Backing CLI** — Claude Code (default) or Antigravity CLI (`agy`)
   - **Model** — pick from available models for the chosen CLI
   - **Lifecycle** — Persistent or Ephemeral (required; there is no default)
5. Click **Spawn**

The persona spawns and appears in the multi-terminal view.

## Persistent Personas

A persistent persona:

- Gets its own Zellij pane, labeled with the persona type
- Gets a vault directory at `vault/personas/<persona-id>/`
- Has a bus identity (`agent:<persona-type>:<uuid>`) and can post/subscribe
- Persists across desktop-app restarts
- Can be dismissed via the right-click menu on its pane

## Ephemeral Personas

An ephemeral persona:

- Runs immediately without allocating a pane (unless you watch it in the channel view)
- Writes its output as an artifact in `vault/projects/<project-id>/reviews/`
- Posts a final `task complete` message to the bus
- Exits cleanly — zero orphan processes, no vault directory created

## Hermes-Initiated Spawn

During a BMAD workflow, Hermes may propose spawning a persona mid-project. For example, a code change touching `auth/` might trigger a proposal to spawn a Security Reviewer.

When Hermes proposes a spawn:

- An approval prompt appears in the UI
- You can **Approve**, **Override** (change CLI/lifecycle/persona type), or **Veto** the proposal
- No persona spawns until you approve

## Promoting an Ephemeral to Persistent

If you have spawned the same ephemeral persona 3+ times in one project, Hermes prompts you to promote it to persistent — or save it as a custom persona module for reuse.
