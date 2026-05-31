# Troubleshooting

Common issues and their fixes.

## Installation

### Installer hangs or fails

- Ensure you are on a supported OS version (Windows 10/11, macOS 12+, Ubuntu 22.04/24.04 LTS)
- Disable antivirus/firewall temporarily during install if you see blocked file extractions
- If the installer fails partway through, delete the install directory and re-download the `.exe`

### Desktop app does not launch after install

- Check that all prerequisites are met (Node 22.13+, pnpm 11.3+, Rust, Python 3.10+)
- Run the app from a terminal to see error output: `path/to/4nevercompany-os.exe`
- Ensure your graphics drivers are up to date (Tauri uses WebView2 which requires GPU support)

## First Run Wizard

### "API key rejected" on Anthropic step

- Double-check the key at [console.anthropic.com](https://console.anthropic.com/)
- Ensure no extra spaces or newlines when pasting
- If using a workspace API key, confirm it has `api` permission scope

### OAuth callback fails

- Ensure pop-ups are allowed in your browser during the OAuth flow
- If using a corporate network, check that `localhost` callbacks are not blocked
- The callback URL is `http://localhost:8787/callback` by default

## Personas

### Persona pane shows no output / appears stuck

- Click the pane and press Enter to wake the prompt
- If the persona is completely silent, check the persona log at `vault/personas/<persona-id>/log/`
- Right-click → **Restart** to re-spawn the persona process

### Ephemeral persona exits immediately without output

- Check the bus channel for the `task complete` or `task failed` message
- Review the artifact in `vault/projects/<project-id>/reviews/` — the output should be there
- If no artifact appears, the persona likely crashed — check the persona supervisor log

### Claude Code / Antigravity CLI not found

Ensure both CLIs are on the system `PATH`. Run:

```bash
claude --version
agy --version
```

If not found, reinstall:

- Claude Code: `npm install -g @anthropic/claude-code`
- Antigravity CLI: `go install github.com/antigravity/cli/cmd/agy@latest`

## BMAD Workflow

### Workflow stalls at a phase boundary

Hermes may have detected a stall. Look for the stall-detection prompt in the UI. If no progress signal fires for ~5 minutes of bus activity, Hermes will propose next steps.

### Approval gate does not advance on click

- Check that the persona has finished writing its artifact to the vault
- Refresh the UI and try again
- As a fallback, use **Request changes** with empty feedback to force the persona to re-post

### Cannot resume paused workflow

On app reopen, the **Resume workflow?** prompt should appear automatically. If it does not:

1. Open the project in the desktop UI
2. Go to **Settings → Workflows**
3. Find the paused workflow and click **Resume**

## Bus / Channels

### No messages appearing in channel view

- Ensure the bus relay is running: check the Paperclip server status in Settings
- If the relay was restarted, it replays the last 1000 messages to reconnecting subscribers

### Channel view is too noisy

You can filter by persona type or message type using the filter bar above the channel view.

## Vault

### Vault location unavailable

- Network shares and cloud-synced folders (OneDrive, Google Drive, iCloud) can cause file locking issues
- Use a local drive path for the vault (`~/Documents/4neverCompanyOS-Vault` is the default and recommended)
- If you must use a network path, ensure the connection is stable before opening the workspace

### Vault write error

If a persona writes outside its scoped directory, a violation is logged to `vault/personas/<persona-id>/out-of-scope-writes.log`. This does not block the write — it is a best-effort scoping system.

## Crash Recovery

If the desktop app crashes:

1. The Zellij session survives (Zellij is the session manager — the desktop shell wrapping it may crash but Zellij and its panes stay alive)
2. On relaunch, the desktop shell re-attaches to the existing Zellij session
3. All persona processes are intact with scrollback preserved

If a persona process itself crashes, the persona supervisor restarts it automatically. If the restart fails 3 times consecutively, the persona is marked as failed and a banner appears in the UI.
