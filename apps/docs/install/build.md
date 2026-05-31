# Build from Source

This page covers building 4neverCompany OS from source when you are not using a pre-built installer.

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 22.13 | Package manager + build tooling |
| pnpm | ≥ 11.3 | Package manager |
| Rust | latest stable | Desktop shell (Tauri) |
| Go | latest stable | Antigravity CLI runtime |
| Python | 3.10+ | Hermes Agent |

Install Node and pnpm first:

```bash
# Node.js (use nvm or your preferred method)
# Verify:
node --version  # must be >= 22.13

# pnpm
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm --version  # must be >= 11.3
```

### API Keys

Obtain the following before building:

- **Anthropic API key** — for Dev persona / Claude Code
- **Google OAuth** — for Antigravity CLI (optional for Frontend Designer)

## Clone and Install

```bash
git clone https://github.com/Code4neverCompany/4neverCompanyOS.git
cd 4neverCompanyOS
pnpm install
```

## Build Commands

### Desktop Shell

```bash
pnpm build:desktop
```

Produces a `.exe` (Windows), `.dmg` (macOS), or AppImage (Linux) in `apps/desktop/src-tauri/target/release/bundle/`.

### Docs Site

```bash
cd apps/docs
pnpm install
pnpm build   # outputs to apps/docs/.vitepress/dist
pnpm dev     # dev server with hot reload
```

### All Packages

```bash
pnpm build
```

## CI

The repo has a CI baseline in `.github/workflows/ci.yml` that runs lint, typecheck, and tests on every push. Build is in `release.yml` (too heavy for per-push runs).

## Next Steps

After building, run the [First Run Wizard](/first-run/) to configure credentials and your vault location.
