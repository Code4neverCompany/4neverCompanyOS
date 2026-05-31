# First Run Wizard

The first-run wizard runs automatically on the first launch of 4neverCompany OS. It collects the credentials and configuration needed to operate the workspace.

## Steps

### 1. Welcome

The wizard opens with a welcome screen explaining what will be configured. Click **Get Started**.

### 2. Vault Location

Choose where your Obsidian vault lives on disk. This is where all project artifacts, persona files, and BMAD workflow outputs are stored.

- **Default:** `~/Documents/4neverCompanyOS-Vault`
- Click **Browse** to pick a different location
- The vault is scaffolded automatically with the standard layout on confirmation

### 3. Anthropic API Key

Paste your Anthropic API key to authenticate the Dev persona (Claude Code).

- The key is validated by hitting Anthropic's auth endpoint
- On success, the key is stored in your OS credential manager (not in the workspace config files)
- On failure, a clean error appears with a retry option and a link to [Anthropic docs](https://docs.anthropic.com/)

### 4. Claude Code Authentication

Complete Claude Code's authentication flow:

- If Claude Code uses API-key auth, the key from step 3 is used directly
- If Claude Code uses OAuth, a browser window opens for the OAuth flow
- After completion, verify with `claude auth status` in a terminal

### 5. Antigravity CLI (Optional)

If you want the Frontend Designer persona:

- The wizard launches Google OAuth in your system browser
- After callback, credentials are stored in your OS credential manager
- Verify with `agy auth status`

You can skip this step and configure Antigravity later via **Settings → Credentials**.

### 6. You're All Set

The final screen shows:

- A summary of what was configured
- Attribution for bundled upstream projects (Paperclip, Hermes, BMAD, Antigravity, Claude Code, Zellij, Obsidian)
- A link to the attribution source of truth in `LICENSES.md`

Click **Launch Workspace** to open the main desktop UI.

## Re-running the Wizard

If you need to reconfigure credentials after the first run, open **Settings → Credentials** in the desktop UI.

## Troubleshooting

If the wizard fails on a step, it preserves your progress and lets you retry. Common fixes:

| Problem                | Fix                                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| Anthropic key rejected | Double-check the key at [Anthropic console](https://console.anthropic.com/) |
| OAuth callback failed  | Ensure pop-ups are allowed for the browser                                  |
| Vault location invalid | Pick a directory on a local drive (not a network share)                     |
