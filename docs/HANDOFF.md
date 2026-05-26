# HANDOFF — Read This First

You are Claude Code, opening this project for the first time. This file tells you exactly what to do.

## What this project is

**4neverCompany OS** — a packaged desktop workspace that bundles Paperclip (paperclipai/paperclip), Hermes Agent (NousResearch/hermes-agent), and the BMAD Method (bmad-code-org/BMAD-METHOD) into a single installable product. The strategic vision is in `docs/4neverCompany_OS_Brief.md`. The phased build plan is in `docs/4neverCompany_OS_Build_Plan.md`. Read both before you start. They are the source of truth.

## What we are NOT building

Critical, read carefully. We are **not** reimplementing or forking any of the following — they are dependencies we install and integrate:

- **Paperclip** (paperclipai/paperclip) — agent-team control plane, MIT licensed. We embed it.
- **Hermes Agent** (NousResearch/hermes-agent) — orchestrator. We embed it.
- **BMAD Method** (bmad-code-org/BMAD-METHOD) — methodology. We use it (including for this very project, see below).
- **Antigravity CLI** (`agy`, from Google) — Frontend Designer's CLI backend.
- **Claude Code** — Dev's CLI backend.
- **Zellij** — terminal multiplexer we embed.
- **Obsidian** — local vault, integrated as-is.

If you find yourself writing code that recreates any of these, stop. We integrate; we do not rebuild.

## What we ARE building

The integration layer that makes the above work as a single product: the desktop shell (Tauri or Electron), the installer, the first-run wizard, the BMad Builder "Add Agent" UI panel, the inter-agent message bus, the persona-file-to-tool-config projection, persistent persona lifecycle management, the Obsidian vault layout, the GitHub sync logic, and the Supermemory integration.

## Step 1 — Install BMAD into this project

Before anything else, install BMAD itself. We are going to use BMAD's `greenfield-fullstack` workflow to plan and structure our own project — yes, recursively, because BMAD is what this workspace ships with as its default methodology, and dogfooding it is the right move.

Run from the project root:

```bash
npx bmad-method install
```

The installer is interactive. Answers:

- **AI tool:** Claude Code
- **Modules:** BMM (core methodology) at minimum. BMB (BMad Builder) is also recommended since we'll be designing BMB integrations later.
- **Project path:** this directory.

If the interactive flow is unavailable in your session, the non-interactive form is:

```bash
npx bmad-method install --modules bmm --tools claude-code --yes
```

Verify the install by checking that a `bmad/` (or `.bmad/`) directory exists at the project root with persona files (`analyst.md`, `pm.md`, `architect.md`, etc.).

## Step 2 — Refine the existing brief through the Analyst persona

Normally, `greenfield-fullstack` starts with the Analyst persona interrogating a vague idea to produce a project brief. We already have a brief (`docs/4neverCompany_OS_Brief.md` at v0.6). So the Analyst's job is **refinement and validation**, not discovery.

Load the Analyst persona by following the BMAD-generated instructions (typically: open `bmad/agents/analyst.md` or run a BMAD-provided command). When the Analyst is active, give it this instruction:

> A complete project brief already exists at `docs/4neverCompany_OS_Brief.md`. Read it in full. Treat it as authoritative on vision, architecture, and scope. Your task is to:
>
> 1. Validate it against BMAD's expected brief format and structure.
> 2. Surface any gaps that would block the PM stage (missing user personas, undefined success metrics, ambiguous scope boundaries).
> 3. Produce the official BMAD-format brief artifact in the location BMAD expects, drawing all content from the existing brief and only adding what's needed to fill BMAD's required fields.
> 4. List open questions for the user before handing off to the PM persona.

Do not let the Analyst rewrite the strategic decisions in the brief. Personas, lifecycle model, fixed-vs-dynamic agents, methodology choice, tech stack — all locked. The Analyst is reformatting and gap-filling, not redesigning.

## Step 3 — Run the rest of the greenfield-fullstack workflow

Once the Analyst's brief artifact is approved by the user, proceed through the standard BMAD workflow:

1. **PM persona** — produces the PRD from the brief. Cross-reference `docs/4neverCompany_OS_Build_Plan.md` — the milestone structure (M0–M5) is the source of truth for phasing and should inform the PRD's release plan.
2. **Architect persona** — produces architecture docs. The brief already specifies the architectural model in detail (§3 of the brief). The Architect's job is to expand it into BMAD-format architecture artifacts, not to redesign it.
3. **Scrum Master persona** — produces story files. Stories should map to the milestone breakdown in the build plan. M1 stories first.
4. **Dev + QA personas** — execute stories. Dev work begins on M1 stories: the walking skeleton (installer, Paperclip + Hermes integration, embedded Zellij, one fixed Dev agent in a terminal).

At every handoff between personas, **pause and ask the user to approve**. BMAD is human-in-the-loop by design; don't auto-advance.

## First-session success criteria

You're done with the first session when **all** of the following are true:

- BMAD is installed in this project and verified working.
- The Analyst has produced a BMAD-format brief artifact and the user has approved it.
- The list of open questions for the PM stage has been raised with the user and answered (or explicitly deferred).
- The next session has a clear starting point: "the PM persona picks up the approved brief and produces the PRD."

Do not try to complete the entire workflow in one session. The full Analyst → PM → Architect → SM → Dev → QA loop is days of work, not hours.

## Things you will need to ask the user about

These are decisions the brief and build plan deliberately defer, and BMAD will surface them. Be prepared:

- **M0 decisions** (per the build plan): Tauri vs. Electron, exact upstream version pins, monorepo vs. multi-repo. The Architect persona will need answers here.
- **User personas for the PRD.** The brief assumes the user is a developer or small-team lead, but the PM persona will want this stated explicitly.
- **Success metrics.** The brief says "usable v1 in 6–7 months" but doesn't define what "usable" means in measurable terms. The PM will want concrete acceptance criteria.
- **Budget and team size.** The build plan assumes 2–3 engineers; confirm with the user.
- **License confirmation.** The build plan flags a license audit as M0 work. Confirm the user has bandwidth or wants to defer to a later session.

## What not to do

- Do not start writing implementation code before the Architect and SM stages produce stories. Tempting; wrong.
- Do not modify `docs/4neverCompany_OS_Brief.md` or `docs/4neverCompany_OS_Build_Plan.md` directly. If something needs to change, raise it with the user and produce a new version.
- Do not reinstall or re-version BMAD without checking with the user — version pinning is part of M0.
- Do not skip the user-approval gates at BMAD handoffs.

## Project directory layout (expected after M0)

```
4nevercompany-os/
├── docs/
│   ├── 4neverCompany_OS_Brief.md        ← source of truth (vision)
│   ├── 4neverCompany_OS_Build_Plan.md   ← source of truth (phasing)
│   └── HANDOFF.md                        ← this file
├── bmad/                                  ← created by `npx bmad-method install`
│   ├── agents/
│   └── workflows/
├── .bmad-artifacts/                       ← BMAD produces these as personas run
│   ├── brief.md
│   ├── prd.md
│   ├── architecture.md
│   └── stories/
├── .git/
└── README.md                              ← write once Architect stage is done
```

If your install of BMAD uses different directory names, follow the BMAD convention — don't fight it.

---

Begin by reading the brief and build plan in full. Then run Step 1.
