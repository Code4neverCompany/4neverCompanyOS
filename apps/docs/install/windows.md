# Install — Windows

## System Requirements

- Windows 10 or Windows 11 (x64)
- ~2 GB disk space for the installer + runtime
- Internet connection for initial setup
- Anthropic API key (for Dev persona / Claude Code)
- Google account (for Antigravity CLI — optional, needed for Frontend Designer)

## Download

Download the latest `.exe` installer from the [ releases page](https://github.com/Code4neverCompany/4neverCompanyOS/releases).

## Installation

1. Run the downloaded `.exe` installer
2. If prompted by User Account Control, click **Yes**
3. The installer extracts the bundle and sets up the workspace
4. On completion, **4neverCompany OS** launches automatically

The installer sets up:
- Paperclip (control plane + embedded Postgres)
- Hermes Agent
- BMAD Method
- Zellij terminal multiplexer
- Claude Code + Antigravity CLI CLIs

## Verifying the Install

Open a terminal and run:

```bash
claude --version
hermes --version
zellij --version
```

All three should report version numbers without errors.

## Build from Source

If you are building from source rather than using the installer, see [Build from Source](/install/build).

## Next Steps

After installing, run the [First Run Wizard](/first-run/) to configure credentials and your vault location.
