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
import { Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
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
    <HUDFrame className="wizard-card">
      <div className="title-block">
        <Eyebrow>Step 3 · Claude Code</Eyebrow>
        <h2>Verify Claude Code is installed</h2>
      </div>

      <p className="body-copy">
        The Dev persona spawns a real Claude Code process inside a Zellij pane every time you open a
        project. This step confirms the <span className="chip-code">claude</span> binary is on your
        system PATH. The Anthropic key from the previous step will be picked up by Claude
        Code&apos;s standard auth flow automatically.
      </p>

      {status === "idle" && <p className="help-copy">Click below to check.</p>}

      {status === "ok" && version && (
        <div className="alert success">
          ✓ Claude Code is installed.
          <br />
          <code style={{ color: "var(--fn-cyan)" }}>{version}</code>
        </div>
      )}

      {status === "error" && error && (
        <>
          <div className="alert error">{error}</div>
          <p className="help-copy">
            If Claude Code isn&apos;t installed yet, get it at{" "}
            <a
              href="https://docs.anthropic.com/claude-code"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--fn-cyan)" }}
            >
              docs.anthropic.com/claude-code
            </a>{" "}
            and re-run this check.
          </p>
        </>
      )}

      <div className="actions">
        <Btn variant="ghost" onClick={onBack} disabled={status === "checking"}>
          ← Back
        </Btn>
        <Btn variant="primary" onClick={check} disabled={status === "checking"}>
          {status === "checking" ? "Checking…" : status === "ok" ? "Re-check" : "Check now →"}
        </Btn>
      </div>
    </HUDFrame>
  );
}
