// Canonical attribution copy (Story 1.19 + OQ-M decision).
// All four attribution surfaces render from this single source:
//   - Settings → About panel (Story 5.x / inline M5)
//   - First-run wizard final screen (Story 1.7+ wizard)
//   - App-launch splash screen (M1 splash)
//   - LICENSES.md at repo root (already exists)
//
// Pinned versions live in ./versions.ts (mirror of docs/pinned-versions.md),
// joined into the structured render via renderAttributionMarkdown() so the
// Settings → About panel can show a version per bundled component (Story 1.19).

import { VERSIONS } from "./versions";

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

/** A bundled entry joined with its pinned version (Story 1.19). */
export type AttributionBundledRow = AttributionEntry & { version: string };

/** Structured attribution for React surfaces (Settings → About panel). */
export type AttributionMarkdown = {
  bundled: AttributionBundledRow[];
  integrated: AttributionEntry[];
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

/**
 * Single-line "Powered by A · B · C …" credit for the app-launch splash
 * and the wizard's compact DoneStep line (Story 1.19). Lists the first
 * `limit` bundled upstreams; appends "· …" when more exist. Never
 * contains a newline.
 */
export function renderAttributionShort(limit = 6): string {
  const names = BUNDLED.map((e) => e.name);
  const shown = names.slice(0, limit);
  const suffix = names.length > limit ? " · …" : "";
  return `Powered by ${shown.join(" · ")}${suffix}`;
}

/**
 * Structured attribution for React surfaces (Settings → About, Story 1.19).
 * Bundled rows are joined with their pinned version from ./versions.ts;
 * integrated rows carry no pinned version (user-installed, varies per
 * machine). `"—"` is a defensive fallback — attribution.test.ts guarantees
 * VERSIONS covers every bundled entry, so it shouldn't surface in practice.
 */
export function renderAttributionMarkdown(): AttributionMarkdown {
  return {
    bundled: BUNDLED.map((e) => ({ ...e, version: VERSIONS[e.name] ?? "—" })),
    integrated: INTEGRATED.map((e) => ({ ...e })),
  };
}
