# Install — Linux

## System Requirements

- Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (other distributions may work but are not tested)
- ~2 GB disk space
- Internet connection for initial setup
- Anthropic API key (for Dev persona / Claude Code)
- Google account (for Antigravity CLI — optional, needed for Frontend Designer)

## Download

Download the latest AppImage from the [releases page](https://github.com/Code4neverCompany/4neverCompanyOS/releases).

## Installation

1. Make the AppImage executable:

```bash
chmod +x 4nevercompany-os-*.AppImage
```

2. Run the AppImage:

```bash
./4nevercompany-os-*.AppImage
```

On first run, the workspace launches and the first-run wizard appears.

## Dependencies

The AppImage is self-contained but requires:

- A desktop environment (X11 or Wayland)
- D-Bus session bus (standard on desktop Ubuntu)

## Build from Source

If you are building from source, see [Build from Source](/install/build).

## Next Steps

After installing, run the [First Run Wizard](/first-run/) to configure credentials and your vault location.
