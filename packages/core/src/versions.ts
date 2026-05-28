// Story 1.19 — pinned versions for the Settings → About attribution panel.
//
// CANONICAL SOURCE: docs/pinned-versions.md (Story 1.4). This map is a
// hand-maintained mirror of that file's Tier-1 pins, keyed by the
// attribution entry `name` in ./attribution.ts so the two stay joinable.
//
// DISCIPLINE NOTE: when a Tier-1 pin changes in docs/pinned-versions.md,
// update the matching row here in the SAME commit. The attribution.test.ts
// guardrail fails the build if a BUNDLED component has no VERSIONS entry,
// but it CANNOT detect a stale version string — that's on the human
// updating the pin. A build-time scrape of pinned-versions.md is a tracked
// follow-up (Story 1.19 spec § open question 5); hand-maintained for now.
//
// Keys MUST match BUNDLED[].name exactly (attribution.test.ts enforces
// no stray keys + full coverage).

/** Version string per bundled (Tier-1) component. Mirrors docs/pinned-versions.md. */
export const VERSIONS: Record<string, string> = {
  Paperclip: "v2026.525.0",
  "Hermes Agent": "v2026.5.16",
  "BMAD Method": "6.7.1",
  Zellij: "0.44.3",
  Tauri: "2.11.2",
  "React + React-DOM": "19.2.6",
  Vite: "7.3.3",
  TypeScript: "5.8.3",
  "Node.js": "22.13+",
  pnpm: "11.3.0",
  // No independent pin — Paperclip vendors its own Postgres at the pinned
  // Paperclip version; we don't ship a standalone server.
  PostgreSQL: "bundled with Paperclip",
  // Evergreen runtime installed/updated by the OS + WebView2 bootstrapper.
  "Microsoft Edge WebView2 Runtime": "evergreen (system-provided)",
};
