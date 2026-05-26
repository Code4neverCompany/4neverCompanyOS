// First-run wizard entry point.
// Stories landing here:
//   - 1.7: vault location step (this story)
//   - 1.8: Anthropic API key step
//   - 1.9: Claude Code authentication step
//   - 2.1: Antigravity OAuth step (M2)

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Wizard } from "./wizard";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

createRoot(root).render(
  <StrictMode>
    <Wizard />
  </StrictMode>,
);
