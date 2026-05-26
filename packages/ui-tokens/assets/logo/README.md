# logo/ — brand mark assets

These PNGs are imported directly by apps/wizard + apps/desktop via Vite's
asset pipeline (`import logoUrl from "@c4n/ui-tokens/assets/logo/monogram.png"`).

## Convention

**Only assets that are actively imported by a consumer should live here.**
Vite bundles every imported asset into each consumer's `dist/` — leaving
dead assets in this folder doesn't bloat the runtime bundles (Vite
tree-shakes), but it does bloat the git repo and every fresh clone.

If you need a brand asset for a new surface (About dialog, app splash,
marketing banner, etc.):

1. Pull the high-resolution master from the 4never Company Design System
   handoff bundle (see [[../../../../../../H:/Agentic Brain/Claude/references/reference-4never-design-system]]
   for provenance + scope-map). The handoff URL is
   `https://api.anthropic.com/v1/design/h/_IVKuKS7zcrzYtYUpyxRRQ`.
2. **Downscale to the appropriate UI size** before adding here. Web-targeted
   PNGs should be ≤ 2x the largest in-product use. The monogram is used at
   76px max → 256x256 is plenty.
3. Use the resize procedure from
   `git log -1 --format=%B 535f108` (PowerShell + System.Drawing +
   HighQualityBicubic), or any equivalent tool.

## Currently here

| File           | Purpose                                 | Used by                                                                    |
| -------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `monogram.png` | 256×256 brand monogram (gold ∞4 lockup) | `apps/wizard` Welcome step + `apps/desktop` TopBar + both apps' `icon.png` |

## Previously here (removed 2026-05-26)

These large brand assets were imported with the v0 design-system landing
but never wired into any consumer. Removed to trim clone size by ~10 MB.
Re-import from the handoff bundle if/when a real consumer needs them.

| File                      | Size   | When likely needed                              |
| ------------------------- | ------ | ----------------------------------------------- |
| `monogram-master.png`     | 1.5 MB | Source for future multi-res icon.ico generation |
| `wordmark.png`            | 750 KB | Marketing surfaces                              |
| `wordmark-lockup.png`     | 5.7 MB | About dialog, splash screen                     |
| `code4never-wordmark.png` | 2.7 MB | Secondary wordmark for marketing                |
