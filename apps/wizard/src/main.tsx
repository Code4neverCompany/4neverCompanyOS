// First-run wizard entry point.
// Stories 1.7 (vault location), 1.8 (Anthropic API key), 1.9 (Claude Code OAuth),
// and 2.1 (Antigravity OAuth) flesh this out across M1 + M2.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

createRoot(root).render(
  <StrictMode>
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>4neverCompany OS — Setup</h1>
      <p>Wizard scaffolding. M1 stories will replace this with the real flow.</p>
    </main>
  </StrictMode>,
);
