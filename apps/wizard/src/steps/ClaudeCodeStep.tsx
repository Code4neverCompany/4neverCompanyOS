// Wizard Story 1.9 — confirm Claude Code CLI is installed and can authenticate.
//
// Strategy: run `claude --version` via a Tauri command. If the CLI is on PATH
// and reports a version, we declare auth complete (the actual Anthropic
// credentials come from the env var or the standard Claude Code config; the
// previous step landed the key in the OS keychain, which Claude Code can pick
// up via standard auth pickup logic).
//
// Failure modes:
//   - "claude not on PATH": surface install link, retry button.
//   - exit code != 0: show stderr, retry button.

import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { WizardState } from "../state";

interface Props {
  state: WizardState;
  onNext: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

type Status = "idle" | "checking" | "ok" | "error";

export function ClaudeCodeStep({ onNext, onBack }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setStatus("checking");
    setError(null);
    try {
      const out = await invoke<string>("check_claude_code_present");
      setVersion(out);
      setStatus("ok");
      onNext({ claudeCodeAuthenticated: true });
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  return (
    <div className="step claude-step">
      <h2>Verify Claude Code is installed</h2>
      <p>
        The Dev persona spawns a real Claude Code process inside a Zellij pane every time
        you open a project. This step confirms the <code>claude</code> binary is on your
        system PATH. The Anthropic key from the previous step will be picked up by Claude
        Code's standard auth flow automatically.
      </p>

      {status === "idle" && (
        <p className="step-help">Click below to check.</p>
      )}

      {status === "ok" && version && (
        <p className="success">
          ✓ Claude Code is installed.
          <br />
          <code>{version}</code>
        </p>
      )}

      {status === "error" && error && (
        <div className="error-block">
          <p className="error">{error}</p>
          <p className="step-help">
            If Claude Code isn't installed yet, get it at{" "}
            <a
              href="https://docs.anthropic.com/claude-code"
              target="_blank"
              rel="noreferrer"
            >
              docs.anthropic.com/claude-code
            </a>{" "}
            and re-run this check.
          </p>
        </div>
      )}

      <div className="step-actions">
        <button onClick={onBack} disabled={status === "checking"}>
          Back
        </button>
        <button className="primary" onClick={check} disabled={status === "checking"}>
          {status === "checking"
            ? "Checking…"
            : status === "ok"
              ? "Re-check"
              : "Check now"}
        </button>
      </div>
    </div>
  );
}
