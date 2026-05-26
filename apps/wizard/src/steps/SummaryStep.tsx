// Wizard final review step — writes the workspace config and hands off to
// the Done screen.

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
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
    <HUDFrame className="wizard-card">
      <div className="title-block">
        <Eyebrow>Step 4 · Review</Eyebrow>
        <h2>Review your setup</h2>
      </div>

      <dl className="summary">
        <dt>Vault location</dt>
        <dd className={state.vaultPath ? "" : "muted"}>{state.vaultPath ?? "(not set)"}</dd>

        <dt>Anthropic key</dt>
        <dd>
          {state.anthropicAuthenticated ? (
            <span className="ok">✓ Validated and saved</span>
          ) : (
            <span className="miss">✗ Not set</span>
          )}
        </dd>

        <dt>Claude Code</dt>
        <dd>
          {state.claudeCodeAuthenticated ? (
            <span className="ok">✓ Installed and reachable</span>
          ) : (
            <span className="miss">✗ Not verified</span>
          )}
        </dd>
      </dl>

      {error && <div className="alert error">{error}</div>}

      <div className="actions">
        <Btn variant="ghost" onClick={onBack} disabled={writing}>
          ← Back
        </Btn>
        <Btn variant="primary" onClick={finalize} disabled={writing}>
          {writing ? "Saving…" : "Finish setup →"}
        </Btn>
      </div>
    </HUDFrame>
  );
}
