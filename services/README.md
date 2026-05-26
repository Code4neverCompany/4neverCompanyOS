# services/

Vendored upstreams pinned at the tags listed in [`../docs/pinned-versions.md`](../docs/pinned-versions.md). These directories are populated by M0 work — currently each is empty.

| Subdirectory | Upstream | Pinned tag (at M0 start) | License |
|---|---|---|---|
| `paperclip/` | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | `v2026.525.0` | MIT |
| `hermes/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | `v2026.5.16` | MIT |
| `bmad-method/` | already consumed via `bmad-method@6.7.1` npm dep in root `package.json`; no vendored copy here | n/a | MIT |

## Why vendored

Architecture D-10 isolates workspace state in workspace SQLite so we don't fight Paperclip's schema during upstream rebases. The vendored copies in `services/` let us pin known-good revs and apply targeted patches during the quarterly rebase window without depending on upstream's CI being green at any specific moment.

## Rebase rhythm

Per OQ-J: quarterly rebase window. Next: **August 2026 (Q3)**. Each rebase appends a change-log entry to [`../docs/pinned-versions.md`](../docs/pinned-versions.md).

## Contribution-back

Per OQ-M: changes to vendored upstreams that are *general-purpose* are offered as PRs to the upstream repo before being carried in-tree. Maintaining a fork is the exception, not the default.
