// Wizard final review step — writes the workspace config and hands off to
// the Done screen.

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { WizardState } from "../state";

interface Props {
  state: WizardState;
  onNext: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export function SummaryStep({ state, onNext, onBack }: Props) {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finalize() {
    setError(null);
    setWriting(true);
    try {
      const written = await invoke<string>("write_config", {
        config: {
          vault_path: state.vaultPath,
          anthropic_authenticated: state.anthropicAuthenticated ?? false,
          claude_code_authenticated: state.claudeCodeAuthenticated ?? false,
        },
      });
      console.info(`config written to: ${written}`);
      onNext({});
    } catch (e) {
      setError(String(e));
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="step summary-step">
      <h2>Review your setup</h2>

      <dl className="summary">
        <dt>Vault location</dt>
        <dd>
          <code>{state.vaultPath ?? "(not set)"}</code>
        </dd>
        <dt>Anthropic key</dt>
        <dd>{state.anthropicAuthenticated ? "✓ Validated and saved" : "✗ Not set"}</dd>
        <dt>Claude Code</dt>
        <dd>{state.claudeCodeAuthenticated ? "✓ Installed and reachable" : "✗ Not verified"}</dd>
      </dl>

      {error && <p className="error">{error}</p>}

      <div className="step-actions">
        <button onClick={onBack} disabled={writing}>
          Back
        </button>
        <button className="primary" onClick={finalize} disabled={writing}>
          {writing ? "Saving…" : "Finish setup"}
        </button>
      </div>
    </div>
  );
}
