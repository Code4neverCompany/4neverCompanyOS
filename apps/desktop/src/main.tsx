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
//
// Observability (NEVAAA-OBS-PERF): wires the structured logger +
// ProgressBus bridges that the workflow engine subscribes to. The
// `vault-artifact-changed` Tauri event is bridged to ProgressBus so the
// workflow engine can advance phases off notify events instead of
// polling the vault.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@c4n/ui-tokens/styles";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { App } from "./shell/App";
import { ProgressBus } from "@c4n/progress-signal";
import { createLogger, startSpan } from "@c4n/observability";
import { startTelemetryConsumer } from "@c4n/telemetry";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

const log = createLogger("@c4n/desktop");
const bootSpan = startSpan("desktop-boot", "@c4n/desktop");

// Story 4.5 (NEVAAA-55): start the Rust story-state watcher and bridge
// its "story-state-changed" Tauri events into ProgressBus so the stall
// detector sees story.state signals.
invoke("start_story_state_watcher").catch((err) => {
  log.error("start_story_state_watcher failed", { err: String(err) });
});
listen<{ slug: string; status: string }>("story-state-changed", (event) => {
  ProgressBus.emitStoryState(event.payload.slug);
}).catch((err) => {
  log.error("failed to listen on story-state-changed", { err: String(err) });
});

// NEVAAA-OBS-PERF: bridge vault-artifact-changed Tauri events (fired by
// the platform-fs notify watcher in the Rust sidecar) into ProgressBus so
// the workflow engine can drop its 3s vault-polling setInterval in favor
// of push-based phase advancement.
listen<{ path: string }>("vault-artifact-changed", (event) => {
  ProgressBus.emitArtifact(event.payload.path);
}).catch((err) => {
  log.error("failed to listen on vault-artifact-changed", { err: String(err) });
});

// NEVAAA-OBS-PERF: start the per-persona telemetry consumer. The
// consumer tails `vault/personas/<id>/log/<date>.jsonl` and emits
// running aggregates. It is started here (not in a panel) so the data
// stream is alive for any panel that subscribes; the consumer itself
// owns no panel — it just exposes `latestAggregate(personaId)` for
// future UI hooks.
startTelemetryConsumer({
  vaultDir: ".", // resolved at runtime by the consumer from the engine
  onError: (err) => log.error("telemetry consumer error", { err: String(err) }),
});

bootSpan.end();
log.info("desktop shell boot complete");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
