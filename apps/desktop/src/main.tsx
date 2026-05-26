// Entry point for the desktop shell.
// Architecture D-13: this shell hosts Paperclip's React UI in WebView2
// and injects workspace panels (BMad Builder Add-Agent, bus channel view,
// approval prompts, multi-terminal) into Paperclip's named portal slots.
// Story 1.1 spike validated both the createPortal path and the createRoot
// fallback. See docs/spike-report-tauri-webview2.md.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./shell/App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
