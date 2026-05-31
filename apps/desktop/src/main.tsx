// Entry point for the desktop shell.
// Architecture D-13: this shell hosts Paperclip's React UI in WebView2
// and injects workspace panels (BMad Builder Add-Agent, bus channel view,
// approval prompts, multi-terminal) into Paperclip's named portal slots.
// Story 1.1 spike validated both the createPortal path and the createRoot
// fallback. See docs/spike-report-tauri-webview2.md.
//
// Visual baseline (2026-05-26): adopts the @c4n/ui-tokens design system
// (4never HUD aesthetic). The shell renders an AppShell (top bar + side
// rail) around the Paperclip host slot.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@c4n/ui-tokens/styles";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { App } from "./shell/App";
import { ProgressBus } from "@c4n/progress-signal";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

// Story 4.5 (NEVAAA-55): start the Rust story-state watcher and bridge
// its "story-state-changed" Tauri events into ProgressBus so the stall
// detector sees story.state signals.
invoke("start_story_state_watcher").catch((err) => {
  console.error("[main] start_story_state_watcher failed:", err);
});
listen<{ slug: string; status: string }>("story-state-changed", (event) => {
  ProgressBus.emitStoryState(event.payload.slug);
}).catch((err) => {
  console.error("[main] failed to listen on story-state-changed:", err);
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
