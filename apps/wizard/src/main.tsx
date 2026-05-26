// First-run wizard entry point.
// Stories landing here:
//   - 1.7: vault location step
//   - 1.8: Anthropic API key step
//   - 1.9: Claude Code authentication step
//   - 2.1: Antigravity OAuth step (M2)
//
// Visual baseline (2026-05-26): adopts the @c4n/ui-tokens design system
// (4never HUD aesthetic — dark, gold corner brackets, electric purple
// wordmark, cyan focus). Wizard logic + step flow is unchanged.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@c4n/ui-tokens/styles";
import "./styles.css";
import { Wizard } from "./wizard";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

createRoot(root).render(
  <StrictMode>
    <Wizard />
  </StrictMode>,
);
