// Canonical attribution copy (Story 1.19 + OQ-M decision).
// All four attribution surfaces render from this single source:
//   - Settings → About panel (Story 5.x / inline M5)
//   - First-run wizard final screen (Story 1.7+ wizard)
//   - App-launch splash screen (M1 splash)
//   - LICENSES.md at repo root (already exists)
//
// Pinned versions are not embedded here at build time; the UI panels
// pull the live version from docs/pinned-versions.md or the runtime
// `--version` output of each tool to avoid drift.

export type AttributionEntry = {
  /** Display name. */
  name: string;
  /** SPDX-style license tag (or proprietary string). */
  license: string;
  /** Upstream repo / homepage URL. */
  source: string;
  /** Optional copyright holder if required by the license. */
  copyright?: string;
};

/** Tier 1 — bundled with our installer. Permissive licenses. */
export const BUNDLED: readonly AttributionEntry[] = [
  { name: "Paperclip", license: "MIT", source: "https://github.com/paperclipai/paperclip" },
  { name: "Hermes Agent", license: "MIT", source: "https://github.com/NousResearch/hermes-agent" },
  {
    name: "BMAD Method",
    license: "MIT",
    source: "https://github.com/bmad-code-org/BMAD-METHOD",
    copyright: "© 2025 BMad Code, LLC",
  },
  { name: "Zellij", license: "MIT", source: "https://github.com/zellij-org/zellij" },
  { name: "Tauri", license: "Apache-2.0 / MIT", source: "https://github.com/tauri-apps/tauri" },
  { name: "React + React-DOM", license: "MIT", source: "https://github.com/facebook/react" },
  { name: "Vite", license: "MIT", source: "https://github.com/vitejs/vite" },
  { name: "TypeScript", license: "Apache-2.0", source: "https://github.com/microsoft/TypeScript" },
  { name: "Node.js", license: "MIT", source: "https://github.com/nodejs/node" },
  { name: "pnpm", license: "MIT", source: "https://github.com/pnpm/pnpm" },
  { name: "PostgreSQL", license: "PostgreSQL License", source: "https://www.postgresql.org/" },
  {
    name: "Microsoft Edge WebView2 Runtime",
    license: "Microsoft Distribution Agreement",
    source: "https://developer.microsoft.com/microsoft-edge/webview2/",
    copyright: "© Microsoft",
  },
];

/** Tier 2 — integrated tools the user installs via official channels. */
export const INTEGRATED: readonly AttributionEntry[] = [
  {
    name: "Claude Code",
    license: "Anthropic Commercial Terms",
    source: "https://github.com/anthropics/claude-code",
    copyright: "© Anthropic PBC",
  },
  {
    name: "Antigravity CLI",
    license: "Google proprietary (preview)",
    source: "https://codelabs.developers.google.com/getting-started-google-antigravity",
    copyright: "© Google",
  },
  {
    name: "Obsidian",
    license: "Proprietary (personal-use free)",
    source: "https://obsidian.md/",
    copyright: "© Obsidian / Dynalist Inc.",
  },
  { name: "Supermemory", license: "SaaS Terms", source: "https://supermemory.ai/" },
  { name: "GitHub", license: "GitHub Terms", source: "https://github.com/" },
];

/** Render the canonical "Powered by" block as plain text (Settings/About, splash). */
export function renderAttributionText(): string {
  const bundled = BUNDLED.map(
    (e) => `  ${e.name} (${e.license}) — ${e.source}${e.copyright ? `\n    ${e.copyright}` : ""}`,
  ).join("\n");
  const integrated = INTEGRATED.map(
    (e) => `  ${e.name}${e.copyright ? ` (${e.copyright})` : ""} — ${e.source}`,
  ).join("\n");
  return [
    "Powered by:",
    "",
    bundled,
    "",
    "Integrated with:",
    "",
    integrated,
    "",
    "Full license texts in LICENSES.md at the project root.",
  ].join("\n");
}
